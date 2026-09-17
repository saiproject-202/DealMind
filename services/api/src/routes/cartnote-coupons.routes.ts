import { FastifyInstance } from 'fastify'
import prisma from '../lib/prisma'

// Extends the CartNote system with coupon convergence — separate
// file to avoid bloating the existing cartnotes.routes.ts (M6 rule:
// reuse and extend, but keep each file focused).
export default async function cartnoteCouponsRoutes(server: FastifyInstance) {

  // ── GET /api/cartnotes/:id/coupons ────────────────────────────
  server.get('/:id/coupons', { onRequest: [(server as any).authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { userId } = request.user as { userId: string }

    const note = await prisma.cartNote.findFirst({ where: { id, userId } })
    if (!note) return reply.status(404).send({ error: 'CartNote not found.' })

    const rule = note.parsedRule as { product?: string; brand?: string; category?: string } | null
    if (!rule?.product && !rule?.category) {
      return reply.send({ coupons: [], total: 0 })
    }

    const visibleStatuses = ['verified', 'trending', 'expiring_soon']

    // Match coupons whose rawText mentions the tracked product/brand/category
    // (simple contains-match — Typesense in a later milestone would rank better)
    const searchTerm = rule.product || rule.category || ''

    const coupons = await prisma.coupon.findMany({
      where: {
        status: { in: visibleStatuses },
        rawText: { contains: searchTerm.slice(0, 40), mode: 'insensitive' },
      },
      orderBy: { confidenceScore: 'desc' },
      take: 5,
      select: {
        id: true, code: true, rawText: true, confidenceScore: true, status: true,
      },
    })

    return reply.send({ coupons, total: coupons.length });
  })
}