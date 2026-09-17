import { FastifyInstance } from 'fastify'
import prisma from '../lib/prisma'

export default async function searchRoutes(server: FastifyInstance) {

  // ── GET /api/search?q=... ───────────────────────────────────
  server.get('/', async (request, reply) => {
    const { q } = request.query as { q?: string }

    if (!q || q.trim().length < 2) {
      return reply.send({ results: [], total: 0 })
    }

    const query = q.trim()

    const listings = await prisma.productListing.findMany({
      where: {
        isAvailable: true,
        OR: [
          { product: { name:  { contains: query, mode: 'insensitive' } } },
          { product: { brand: { contains: query, mode: 'insensitive' } } },
        ],
      },
      include: {
        product: { include: { category: true } },
        store:   true,
      },
      orderBy: { discountPct: 'desc' },
      take: 20,
    })

    const results = listings.map(l => ({
      id:            l.id,
      name:          l.product.name,
      brand:         l.product.brand,
      currentPrice:  l.currentPrice,
      originalPrice: l.originalPrice,
      discountPct:   l.discountPct,
      rating:        l.rating,
      store:         l.store.name,
      category:      l.product.category?.name,
      couponCode:    l.couponCode,
    }))

    return reply.send({ results, total: results.length, query })
  })
}