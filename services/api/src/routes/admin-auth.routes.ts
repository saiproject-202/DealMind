import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import prisma from '../lib/prisma'
import { signAdminToken, verifyAdminToken } from '../lib/adminAuth'

// Middleware to protect admin routes
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Admin authentication required.' })
  }
  try {
    const token = authHeader.replace('Bearer ', '')
    const payload = verifyAdminToken(token)
    ;(request as any).admin = payload
  } catch {
    return reply.status(401).send({ error: 'Invalid or expired admin session.' })
  }
}

export default async function adminAuthRoutes(server: FastifyInstance) {

  // ── POST /api/admin/login ──────────────────────────────────
  server.post('/login', async (request, reply) => {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(6),
    })
    const result = schema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ error: 'Valid email and password are required.' })
    }

    const { email, password } = result.data

    const admin = await prisma.adminUser.findUnique({ where: { email } })
    if (!admin || !admin.isActive) {
      return reply.status(401).send({ error: 'Invalid email or password.' })
    }

    const validPassword = await bcrypt.compare(password, admin.passwordHash)
    if (!validPassword) {
      return reply.status(401).send({ error: 'Invalid email or password.' })
    }

    // Update last login
    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    })

    const token = signAdminToken({
      adminId: admin.id,
      email: admin.email,
      role: admin.role,
    })

    return reply.send({
      success: true,
      token,
      admin: {
        id: admin.id,
        email: admin.email,
        role: admin.role,
      },
    })
  })

  // ── GET /api/admin/me  (protected) ─────────────────────────
  server.get('/me', { onRequest: [requireAdmin] }, async (request, reply) => {
    const { adminId } = (request as any).admin

    const admin = await prisma.adminUser.findUnique({
      where: { id: adminId },
      select: { id: true, email: true, role: true, isActive: true, createdAt: true },
    })

    if (!admin) {
      return reply.status(404).send({ error: 'Admin not found.' })
    }

    return reply.send({ admin })
  })
}