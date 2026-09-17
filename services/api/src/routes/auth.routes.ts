import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { createHash } from 'crypto'
import prisma from '../lib/prisma'
import { sendOtp } from '../lib/sms'

// ── Helpers ───────────────────────────────────────────────────
function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

function hashCode(code: string): string {
  // SHA-256 — if the DB ever leaks, live OTP codes don't
  return createHash('sha256').update(code).digest('hex')
}

const OTP_TTL_MS        = 5 * 60 * 1000   // code valid 5 minutes
const SEND_WINDOW_MS    = 15 * 60 * 1000  // rate window
const MAX_SENDS_PER_WIN = 3               // max 3 OTPs per phone / 15 min
const MAX_ATTEMPTS      = 5               // max wrong guesses per code

export default async function authRoutes(server: FastifyInstance) {

  // ── POST /api/auth/send-otp ──────────────────────────────────
  server.post('/send-otp', async (request, reply) => {
    const schema = z.object({ phone: z.string().min(10).max(13) })
    const result = schema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ error: 'Please enter a valid 10-digit mobile number.' })
    }

    const { phone } = result.data

    // Opportunistic cleanup: purge rows older than 1 day
    prisma.otpRequest.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    }).catch(() => {})

    // Per-phone send limit (DB-backed → survives restarts, works multi-instance)
    const recentSends = await prisma.otpRequest.count({
      where: { phone, createdAt: { gte: new Date(Date.now() - SEND_WINDOW_MS) } },
    })
    if (recentSends >= MAX_SENDS_PER_WIN) {
      return reply.status(429).send({
        error: 'Too many OTP requests. Please wait 15 minutes and try again.',
      })
    }

    const code = generateOtp()

    await prisma.otpRequest.create({
      data: {
        phone,
        codeHash:  hashCode(code),
        attempts:  0,
        verified:  false,
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
      },
    })

    const smsSent   = await sendOtp(phone, code)
    const hasApiKey = !!process.env.FAST2SMS_API_KEY

    return reply.send({
      success: true,
      message: smsSent
        ? 'OTP sent to your mobile number.'
        : hasApiKey
          ? 'Could not send SMS right now — OTP generated. Check server terminal.'
          : 'OTP generated. Check server terminal (SMS not configured).',
      dev_otp:  !smsSent ? code : undefined,
      dev_note: !smsSent
        ? (hasApiKey
            ? 'SMS delivery failed — check server logs for the Fast2SMS error.'
            : 'Add FAST2SMS_API_KEY to .env to send real SMS')
        : undefined,
    })
  })

  // ── POST /api/auth/verify-otp ────────────────────────────────
  server.post('/verify-otp', async (request, reply) => {
    const schema = z.object({
      phone: z.string().min(10).max(13),
      code:  z.string().length(6),
    })
    const result = schema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ error: 'Phone number and 6-digit OTP are required.' })
    }

    const { phone, code } = result.data

    // Latest unverified, unexpired OTP for this phone
    const otpRow = await prisma.otpRequest.findFirst({
      where: {
        phone,
        verified:  false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    })

    if (!otpRow) {
      return reply.status(400).send({ error: 'No valid OTP found. Please request a new one.' })
    }

    if (otpRow.attempts >= MAX_ATTEMPTS) {
      return reply.status(400).send({ error: 'Too many failed attempts. Please request a new OTP.' })
    }

    if (otpRow.codeHash !== hashCode(code)) {
      // Persist the failed attempt — survives restarts
      const updated = await prisma.otpRequest.update({
        where: { id: otpRow.id },
        data:  { attempts: { increment: 1 } },
      })
      return reply.status(400).send({
        error: `Incorrect OTP. ${Math.max(0, MAX_ATTEMPTS - updated.attempts)} attempt(s) remaining.`,
      })
    }

    // Success — mark verified (single-use), invalidate any siblings
    await prisma.otpRequest.update({
      where: { id: otpRow.id },
      data:  { verified: true },
    })
    await prisma.otpRequest.updateMany({
      where: { phone, verified: false },
      data:  { expiresAt: new Date() }, // expire leftovers immediately
    })

    // Find or create user (unchanged logic)
    let user = await prisma.user.findUnique({ where: { phone } })
    const isNewUser = !user

    if (!user) {
      user = await prisma.user.create({ data: { phone, isVerified: true } })
    } else {
      user = await prisma.user.update({ where: { id: user.id }, data: { isVerified: true } })
    }

    const token = server.jwt.sign(
      { userId: user.id, phone: user.phone },
      { expiresIn: '15m' }
    )
    const refreshToken = server.jwt.sign(
      { userId: user.id, type: 'refresh' },
      { expiresIn: '30d' }
    )

    return reply.send({
      success:   true,
      message:   isNewUser ? 'Account created successfully!' : 'Login successful!',
      isNewUser,
      token,
      refreshToken,
      user: {
        id:          user.id,
        phone:       user.phone,
        displayName: user.displayName,
        isVerified:  user.isVerified,
        points:      user.points,
      },
    })
  })

  // ── GET /api/auth/me ─────────────────────────────────────────
  server.get('/me', {
    onRequest: [(server as any).authenticate],
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string }

    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: {
        id: true, phone: true, displayName: true, avatarUrl: true,
        isVerified: true, points: true, trustScore: true,
        createdAt: true, level: true,
      },
    })

    if (!user) return reply.status(404).send({ error: 'User not found.' })
    return reply.send({ user })
  })

  // ── POST /api/auth/refresh ───────────────────────────────────
  server.post('/refresh', async (request, reply) => {
    const schema = z.object({ refreshToken: z.string() })
    const result = schema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ error: 'Refresh token required.' })
    }

    try {
      const payload = server.jwt.verify(result.data.refreshToken) as {
        userId: string; type: string
      }
      if (payload.type !== 'refresh') {
        return reply.status(401).send({ error: 'Invalid token type.' })
      }

      const user = await prisma.user.findUnique({ where: { id: payload.userId } })
      if (!user) return reply.status(401).send({ error: 'User not found.' })

      const newToken = server.jwt.sign(
        { userId: user.id, phone: user.phone },
        { expiresIn: '15m' }
      )
      return reply.send({ success: true, token: newToken })
    } catch {
      return reply.status(401).send({ error: 'Invalid or expired refresh token.' })
    }
  })

  // ── PUT /api/auth/profile ────────────────────────────────────
  server.put('/profile', {
    onRequest: [(server as any).authenticate],
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string }

    const schema = z.object({
      displayName: z.string().min(2).max(50).trim(),
    })
    const result = schema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ error: 'Name must be between 2 and 50 characters.' })
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data:  { displayName: result.data.displayName },
    })

    return reply.send({
      success: true,
      user: {
        id:          user.id,
        phone:       user.phone,
        displayName: user.displayName,
        points:      user.points,
        isVerified:  user.isVerified,
      },
    })
  })

  // ── POST /api/auth/logout ────────────────────────────────────
  server.post('/logout', {
    onRequest: [(server as any).authenticate],
  }, async (_request, reply) => {
    return reply.send({ success: true, message: 'Logged out successfully.' })
  })
}