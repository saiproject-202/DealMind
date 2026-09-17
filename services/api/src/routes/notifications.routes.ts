import { FastifyInstance } from 'fastify'
import prisma from '../lib/prisma'

export default async function notificationsRoutes(server: FastifyInstance) {

  // ── GET /api/notifications ──────────────────────────────────
  server.get('/', { onRequest: [(server as any).authenticate] }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { limit = '20' } = request.query as { limit?: string }

    const notifications = await prisma.notification.findMany({
      where:   { userId },
      orderBy: { createdAt: 'desc' },
      take:    Number(limit),
    })

    const unreadCount = await prisma.notification.count({
      where: { userId, isRead: false },
    })

    return reply.send({ notifications, unreadCount })
  })

  // ── PUT /api/notifications/:id/read ─────────────────────────
  server.put('/:id/read', { onRequest: [(server as any).authenticate] }, async (request, reply) => {
    const { id }     = request.params as { id: string }
    const { userId } = request.user as { userId: string }

    await prisma.notification.updateMany({
      where: { id, userId },
      data:  { isRead: true },
    })
    return reply.send({ success: true })
  })

  // ── PUT /api/notifications/read-all ─────────────────────────
  server.put('/read-all', { onRequest: [(server as any).authenticate] }, async (request, reply) => {
    const { userId } = request.user as { userId: string }

    await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data:  { isRead: true },
    })
    return reply.send({ success: true })
  })

  // ── DELETE /api/notifications/:id ───────────────────────────
  server.delete('/:id', { onRequest: [(server as any).authenticate] }, async (request, reply) => {
    const { id }     = request.params as { id: string }
    const { userId } = request.user as { userId: string }

    await prisma.notification.deleteMany({ where: { id, userId } })
    return reply.send({ success: true })
  })
}