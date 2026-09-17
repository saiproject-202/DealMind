import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import prisma from '../lib/prisma'
import { reviewCoupon, normalizeHash } from '../lib/coupon-ai'
import { recomputeConfidence, getReportWeight, isTrustedWeight } from '../lib/coupon-confidence'
import { awardPoints } from '../lib/points'
import { nudgePendingTrust } from '../lib/trust-compute'

const SPAM_REJECT_THRESHOLD = 0.75
const FAKE_REJECT_THRESHOLD = 0.75

export default async function couponsRoutes(server: FastifyInstance) {

  // ── POST /api/coupons — submit (unchanged from M6) ───────────
  server.post('/', { onRequest: [(server as any).authenticate] }, async (request, reply) => {
    const schema = z.object({
      code:        z.string().min(2).max(50).trim(),
      merchant:    z.string().min(2).max(50).trim(),
      merchantUrl: z.string().url().optional(),
      rawText:     z.string().min(5).max(1000),
      // Contributor's own choice — AI only suggests (see coupon-ai.ts), never decides.
      couponType:  z.enum(['REUSABLE', 'SINGLE_USE']).optional(),
    })
    const result = schema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ error: 'Coupon code, merchant, and description are required.' })
    }

    const { userId } = request.user as { userId: string }
    const { code, merchant, merchantUrl, rawText, couponType } = result.data
    const normalizedHash = normalizeHash(code, merchant)

    const existing = await prisma.coupon.findUnique({ where: { normalizedHash } })
    if (existing) {
      return reply.status(409).send({ error: `This coupon already exists (status: ${existing.status}).`, existingId: existing.id })
    }

    // Resolve the typed/selected platform name to a real Store record so
    // other users can reliably filter/see "which platform this code is for" —
    // storeId already existed on the schema but was never actually populated here.
    const store = await prisma.store.findFirst({ where: { name: { equals: merchant, mode: 'insensitive' } } })

    const aiResult = await reviewCoupon(rawText, merchant)
    const finalCouponType = couponType ?? aiResult.suggestedCouponType

    if (aiResult.spamScore >= SPAM_REJECT_THRESHOLD || aiResult.fakeScore >= FAKE_REJECT_THRESHOLD) {
      const coupon = await prisma.coupon.create({
        data: { code, merchantUrl, rawText, creatorId: userId, storeId: store?.id, normalizedHash, status: 'rejected', couponType: finalCouponType, aiExtracted: aiResult as any, aiExplanations: aiResult.explanations as any, confidenceScore: 0, expiresAt: aiResult.expiryDate ? new Date(aiResult.expiryDate) : null },
        include: { store: true },
      })
      return reply.status(201).send({ success: false, coupon, message: 'Coupon was rejected by AI review (likely spam or fake).' })
    }

    const coupon = await prisma.coupon.create({
      data: { code, merchantUrl, rawText, creatorId: userId, storeId: store?.id, normalizedHash, status: 'pending_verification', couponType: finalCouponType, aiExtracted: aiResult as any, aiExplanations: aiResult.explanations as any, confidenceScore: 0, expiresAt: aiResult.expiryDate ? new Date(aiResult.expiryDate) : null },
      include: { store: true },
    })

    return reply.status(201).send({ success: true, coupon, message: 'Coupon submitted! It will appear once community verification begins.' })
  })

  // ── GET /api/coupons — browse (unchanged from M6) ────────────
  server.get('/', async (request, reply) => {
    const { status, merchant } = request.query as { status?: string; merchant?: string }
    const visibleStatuses = ['pending_verification', 'verified', 'trending', 'expiring_soon']

    const coupons = await prisma.coupon.findMany({
      where: {
        status: status && visibleStatuses.includes(status) ? status : { in: visibleStatuses },
        ...(merchant ? { rawText: { contains: merchant, mode: 'insensitive' } } : {}),
      },
      orderBy: [{ confidenceScore: 'desc' }, { createdAt: 'desc' }],
      take: 50,
      select: {
        id: true, code: true, rawText: true, status: true,
        confidenceScore: true, aiExplanations: true, expiresAt: true,
        couponType: true, redeemedAt: true,
        revealCount: true, successCount: true, failCount: true, createdAt: true,
        creator: { select: { displayName: true, phone: true } },
        store: { select: { name: true } },
      },
    })

    return reply.send({ coupons, total: coupons.length })
  })

  // ── GET /api/coupons/:id — detail (unchanged from M6) ────────
  server.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const coupon = await prisma.coupon.findUnique({
      where: { id },
      include: {
        creator: { select: { displayName: true, phone: true, trustScore: true } },
        reports: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    })
    if (!coupon) return reply.status(404).send({ error: 'Coupon not found.' })
    return reply.send({ coupon })
  })

  // ── GET /api/coupons/:id/my-report — has the caller already voted? ──
  server.get('/:id/my-report', { onRequest: [(server as any).authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { userId } = request.user as { userId: string }

    const report = await prisma.couponReport.findFirst({
      where: { couponId: id, userId, isActive: true },
      select: { type: true, createdAt: true },
    })
    return reply.send({ report: report || null })
  })

  // ── POST /api/coupons/:id/reveal — NEW in M7 ─────────────────
  server.post('/:id/reveal', { onRequest: [(server as any).authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { userId } = request.user as { userId: string }

    const coupon = await prisma.coupon.findUnique({ where: { id } })
    if (!coupon) return reply.status(404).send({ error: 'Coupon not found.' })
    if (coupon.status === 'rejected' || coupon.status === 'flagged') {
      return reply.status(403).send({ error: 'This coupon is not available.' })
    }

    // Free reveal in v1 — no points cost, no escrow. Log for analytics
    // and to power "X people revealed this" social proof.
    await prisma.$transaction([
      prisma.couponReveal.create({
        data: { couponId: id, userId, pointsSpent: 0, escrowState: 'released' },
      }),
      prisma.coupon.update({
        where: { id },
        data:  { revealCount: { increment: 1 } },
      }),
    ])

    return reply.send({
      success: true,
      code: coupon.code,
      message: 'Coupon revealed! Let us know if it works after you try it.',
    })
  })

  // ── POST /api/coupons/:id/report — NEW in M7 ─────────────────
  server.post('/:id/report', { onRequest: [(server as any).authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { userId } = request.user as { userId: string }

    const schema = z.object({
      type: z.enum(['worked', 'failed', 'expired', 'fake']),
    })
    const result = schema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ error: 'Report type must be worked, failed, expired, or fake.' })
    }

    const coupon = await prisma.coupon.findUnique({ where: { id } })
    if (!coupon) return reply.status(404).send({ error: 'Coupon not found.' })

    // Creators can't report their own coupons — closes the easiest gaming vector
    if (coupon.creatorId === userId) {
      return reply.status(403).send({ error: "You can't report your own coupon submission." })
    }

    // One ACTIVE vote per user per coupon — locked until an admin resets it.
    // Old votes are never overwritten or deleted, only ever superseded.
    const existingActive = await prisma.couponReport.findFirst({
      where: { couponId: id, userId, isActive: true },
    })
    if (existingActive) {
      return reply.status(409).send({
        error: "You've already voted on this coupon. Ask an admin to reset it if this was a mistake.",
      })
    }

    const type   = result.data.type
    const weight = await getReportWeight(userId, false) // conversionId proof added in M9+
    const trusted = isTrustedWeight(weight)

    // Single-use coupons can be retired for everyone by one trusted "worked"
    // confirmation — no report-count threshold, just the same trust bar
    // used everywhere else in this file.
    const retiresSingleUse = type === 'worked' && trusted && coupon.couponType === 'SINGLE_USE'

    await prisma.$transaction(async (tx) => {
      await tx.couponReport.create({ data: { couponId: id, userId, type, weight } })

      if (type === 'worked') {
        await tx.coupon.update({ where: { id }, data: { successCount: { increment: 1 } } })
      } else if (type === 'failed') {
        await tx.coupon.update({ where: { id }, data: { failCount: { increment: 1 } } })
      }

      if (retiresSingleUse) {
        await tx.coupon.update({ where: { id }, data: { redeemedAt: new Date(), status: 'expired' } })
      }
    })

    // Recompute confidence immediately — event-driven, not cron-based.
    // Reads the coupon fresh, so a just-set 'expired' status (above) is
    // preserved rather than overwritten (recomputeConfidence only ever
    // transitions pending_verification <-> verified, or flags).
    const { confidence, status } = await recomputeConfidence(id)

    // Contributor rewards — points ledger + a real-time trust SIGNAL only.
    // The authoritative trustScore is still written exclusively by the
    // weekly trust-compute reconciliation; this just nudges a provisional
    // delta so contributors see something move immediately.
    if (trusted) {
      await awardPoints(userId, Math.max(1, Math.round(2 * weight)), 'coupon_report_reward', id)

      if (type === 'worked') {
        await awardPoints(coupon.creatorId, Math.round(5 * weight), 'coupon_confirmed_worked', id)
        await nudgePendingTrust(coupon.creatorId, weight * 0.05)
      } else if (type === 'failed' || type === 'expired' || type === 'fake') {
        await nudgePendingTrust(coupon.creatorId, -weight * 0.05)
      }
    }

    return reply.send({
      success: true,
      confidence,
      status,
      message: retiresSingleUse
        ? '✅ Confirmed — this single-use coupon is now marked redeemed for everyone.'
        : status === 'verified'
        ? '✅ This coupon just crossed the verified threshold!'
        : status === 'flagged'
        ? '⚠ This coupon has been flagged for review based on community reports.'
        : 'Thanks for reporting! Confidence updated.',
    })
  })
}