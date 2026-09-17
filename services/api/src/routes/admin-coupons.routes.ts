import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import prisma from '../lib/prisma'
import { requireAdmin } from './admin-auth.routes'

export default async function adminCouponsRoutes(server: FastifyInstance) {

  // ── GET /api/admin/coupons — full list incl. flagged/rejected ─
  server.get('/coupons', { onRequest: [requireAdmin] }, async (request, reply) => {
    const { status } = request.query as { status?: string }

    const coupons = await prisma.coupon.findMany({
      where: status ? { status } : {},
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 100,
      include: {
        creator: { select: { displayName: true, phone: true, trustScore: true } },
        reports: true,
      },
    })

    const counts = await prisma.coupon.groupBy({
      by: ['status'],
      _count: { status: true },
    })

    return reply.send({
      coupons,
      total: coupons.length,
      counts: Object.fromEntries(counts.map(c => [c.status, c._count.status])),
    })
  })

  // ── PUT /api/admin/coupons/:id/status — manual override ──────
  server.put('/coupons/:id/status', { onRequest: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const schema = z.object({
      status: z.enum(['verified', 'pending_verification', 'rejected', 'archived']),
      note:   z.string().optional(),
    })
    const result = schema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ error: 'Invalid status value.' })
    }

    const coupon = await prisma.coupon.update({
      where: { id },
      data:  { status: result.data.status },
    })

    return reply.send({
      success: true,
      coupon,
      message: `Coupon manually set to "${result.data.status}".`,
    })
  })

  // ── DELETE /api/admin/coupons/:id — hard delete (spam cleanup) ─
  server.delete('/coupons/:id', { onRequest: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await prisma.coupon.delete({ where: { id } }).catch(() => {})
    return reply.send({ success: true })
  })
}