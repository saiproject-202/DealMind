import { FastifyInstance } from 'fastify'
import prisma from '../lib/prisma'

export default async function affiliateRoutes(server: FastifyInstance) {

  // ── GET /:listingId ─────────────────────────────────────────
  // Registered under prefix /go → full path becomes /go/:listingId
  // THE money endpoint — every "View Deal" click flows through here
  //
  // Revenue model:
  //   Click → logged for analytics (affiliate_clicks table)
  //   Purchase → EarnKaro reports confirmed order (affiliate_conversions table)
  //   Commission paid → only on confirmed purchases after return window
  //
  server.get('/:listingId', async (request, reply) => {
    const { listingId } = request.params as { listingId: string }

    // Try to read user ID from JWT (optional — works for anonymous too)
    let userId: string | null = null
    try {
      const auth = request.headers.authorization
      if (auth?.startsWith('Bearer ')) {
        const payload = server.jwt.verify(auth.replace('Bearer ', '')) as { userId: string }
        userId = payload.userId
      }
    } catch { /* anonymous click is fine */ }

    // Session ID from cookie (tracks anonymous users across sessions)
    let sessionId = (request.cookies as any)?.dm_session as string
    if (!sessionId) {
      sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
      reply.setCookie('dm_session', sessionId, {
        maxAge: 60 * 60 * 24 * 30, // 30 days
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
      })
    }

    // Fetch listing + store + product name — a malformed id (e.g. mock-data
    // placeholder ids like "1") fails Prisma's UUID validation before it can
    // even query, so treat that the same as "not found" rather than a 500.
    const listing = await prisma.productListing.findUnique({
      where: { id: listingId },
      include: {
        store:   true,
        product: { select: { name: true } },
      },
    }).catch(() => null)

    if (!listing) {
      return reply.status(404).send({ error: 'Product listing not found.' })
    }

    // Use affiliate URL if set, otherwise fall back to direct store URL
    const destinationUrl = listing.affiliateUrl || listing.storeUrl

    // Determine traffic source from HTTP referer
    const referer = request.headers.referer || ''
    const sourcePage =
      referer.includes('/product/') ? 'product_page' :
      referer.includes('/search')   ? 'search'        :
      referer.includes('cartnote')  ? 'cartnote'      :
      referer.includes('/submit')   ? 'submit_page'   :
      referer                       ? 'homepage'      : 'direct'

    // Log click asynchronously — does NOT block the redirect
    prisma.affiliateClick.create({
      data: {
        listingId,
        dealId:    null,
        userId,
        sessionId,
        storeId:   listing.storeId,
        sourcePage,
        clickedAt: new Date(),
      },
    })
    .then(() => {
      // Also bump click count on any live deal for this listing
      prisma.deal.updateMany({
        where:  { listingId, status: 'live' },
        data:   { clickCount: { increment: 1 } },
      }).catch(() => {})
    })
    .catch(console.error)

    console.log(`💰 Click → ${listing.product.name} via ${listing.store.name} (source: ${sourcePage})`)

    // 302 redirect to affiliate URL — user never sees this step
    return reply.redirect(destinationUrl, 302)
  })

  // ── GET /product/:productId ─────────────────────────────────
  // Redirect to best available listing for a product
  server.get('/product/:productId', async (request, reply) => {
    const { productId } = request.params as { productId: string }

    const listing = await prisma.productListing.findFirst({
      where:   { productId, isAvailable: true },
      orderBy: { discountPct: 'desc' }, // pick highest discount
    })

    if (!listing) {
      return reply.status(404).send({ error: 'No listing available for this product.' })
    }

    return reply.redirect(`/go/${listing.id}`, 302)
  })
}

// ── Separate export for admin stats (registered under /api/affiliate)
export async function affiliateStatsRoutes(server: FastifyInstance) {

  // ── GET /api/affiliate/stats ─────────────────────────────────
  server.get('/stats', async (_req, reply) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const [totalClicks, todayClicks, topListings] = await Promise.all([
      prisma.affiliateClick.count(),
      prisma.affiliateClick.count({ where: { clickedAt: { gte: today } } }),
      prisma.affiliateClick.groupBy({
        by:       ['listingId'],
        _count:   { listingId: true },
        orderBy:  { _count: { listingId: 'desc' } },
        take:     10,
      }),
    ])

    // Enrich top listings with product names
    const enriched = await Promise.all(
      topListings.map(async (item) => {
        const listing = await prisma.productListing.findUnique({
          where:   { id: item.listingId },
          include: { product: { select: { name: true } }, store: true },
        })
        return {
          listingId:  item.listingId,
          clicks:     item._count.listingId,
          product:    listing?.product.name || 'Unknown',
          store:      listing?.store.name   || 'Unknown',
          affiliateUrl: listing?.affiliateUrl || listing?.storeUrl || '',
        }
      })
    )

    return reply.send({
      totalClicks,
      todayClicks,
      topListings: enriched,
      note: 'Clicks ≠ revenue. Revenue comes from confirmed purchases via EarnKaro after return window.',
    })
  })
}