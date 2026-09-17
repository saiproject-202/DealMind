import { FastifyInstance } from 'fastify'
import prisma from '../lib/prisma'

export default async function wishlistRoutes(server: FastifyInstance) {

  // ── GET /api/wishlist — list saved products ───────────────────
  server.get('/', { onRequest: [(server as any).authenticate] }, async (request, reply) => {
    const { userId } = request.user as { userId: string }

    const saved = await prisma.savedProduct.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        listing: {
          include: { product: true, store: true },
        },
      },
    })

    const items = saved.map(s => ({
      savedAt:       s.createdAt,
      listingId:     s.listing.id,
      name:          s.listing.product.name,
      brand:         s.listing.product.brand,
      currentPrice:  s.listing.currentPrice,
      originalPrice: s.listing.originalPrice,
      discountPct:   s.listing.discountPct,
      store:         s.listing.store.name,
      isAvailable:   s.listing.isAvailable,
    }))

    return reply.send({ items, total: items.length })
  })

  // ── POST /api/wishlist/:listingId — add ───────────────────────
  server.post('/:listingId', { onRequest: [(server as any).authenticate] }, async (request, reply) => {
    const { listingId } = request.params as { listingId: string }
    const { userId } = request.user as { userId: string }

    const listing = await prisma.productListing.findUnique({ where: { id: listingId } })
    if (!listing) return reply.status(404).send({ error: 'Product not found.' })

    // Idempotent — upsert so double-tapping never errors or duplicates
    await prisma.savedProduct.upsert({
      where:  { userId_listingId: { userId, listingId } },
      update: {},
      create: { userId, listingId },
    })

    return reply.send({ success: true, wishlisted: true })
  })

  // ── DELETE /api/wishlist/:listingId — remove ───────────────────
  server.delete('/:listingId', { onRequest: [(server as any).authenticate] }, async (request, reply) => {
    const { listingId } = request.params as { listingId: string }
    const { userId } = request.user as { userId: string }

    await prisma.savedProduct.deleteMany({ where: { userId, listingId } })
    return reply.send({ success: true, wishlisted: false })
  })

  // ── GET /api/wishlist/:listingId/status — check if saved ──────
  server.get('/:listingId/status', { onRequest: [(server as any).authenticate] }, async (request, reply) => {
    const { listingId } = request.params as { listingId: string }
    const { userId } = request.user as { userId: string }

    const exists = await prisma.savedProduct.findUnique({
      where: { userId_listingId: { userId, listingId } },
    })

    return reply.send({ wishlisted: !!exists })
  })
}