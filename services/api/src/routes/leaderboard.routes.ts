import { FastifyInstance } from 'fastify'
import prisma from '../lib/prisma'

export default async function leaderboardRoutes(server: FastifyInstance) {

  // ── GET /api/leaderboard — public ranking ────────────────────
  server.get('/', async (request, reply) => {
    const { limit = '25' } = request.query as { limit?: string }

    const users = await prisma.user.findMany({
      where: { savingsGenerated: { gt: 0 } },
      orderBy: { savingsGenerated: 'desc' },
      take: Number(limit),
      select: {
        id: true, displayName: true, phone: true,
        trustScore: true, savingsGenerated: true,
        level: { select: { name: true, levelNumber: true } },
        _count: { select: { coupons: true } },
        userBadges: { include: { badge: true } },
      },
    })

    const ranked = users.map((u, i) => ({
      rank:             i + 1,
      displayName:      u.displayName || `User ${u.phone.slice(-4)}`,
      level:            u.level?.name || 'Explorer',
      levelNumber:      u.level?.levelNumber || 1,
      accuracyPct:      Math.round(Number(u.trustScore) * 100),
      savingsGenerated: Number(u.savingsGenerated),
      couponsSubmitted: u._count.coupons,
      badges:           u.userBadges.map(b => ({ icon: b.badge.icon, name: b.badge.name })),
    }))

    return reply.send({ leaderboard: ranked })
  })
}
