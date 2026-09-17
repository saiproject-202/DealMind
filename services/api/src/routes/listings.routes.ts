import { FastifyInstance } from 'fastify'
import prisma from '../lib/prisma'

export default async function listingsRoutes(server: FastifyInstance) {

  // ── GET /api/listings/:id — full product detail (public) ──────
  server.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }

    const listing = await prisma.productListing.findUnique({
      where: { id },
      include: {
        product: { include: { category: true, variants: { orderBy: { sortOrder: 'asc' } } } },
        store: true,
      },
    })

    if (!listing) return reply.status(404).send({ error: 'Product not found.' })

    // Group flat ProductVariant rows into { "Color": ["Black","Blue"], "Size": [...] }
    // for the frontend to render as selector rows, one per type.
    const variants: Record<string, string[]> = {}
    for (const v of listing.product.variants) {
      (variants[v.type] ??= []).push(v.value)
    }

    // AI-generated Overview + Specifications, produced once at Auto Extract
    // time (see admin-extract.routes.ts) and stored on Product.specifications
    // as { overview: string[], specs: Record<string,string> }. Manually-added
    // products simply have this null — frontend falls back to `description`.
    const specData = listing.product.specifications as { overview?: string[]; specs?: Record<string, string> } | null
    const overview = specData?.overview || []
    const specs    = specData?.specs || {}

    // ── Similar products ──────────────────────────────────────────
    // Same category is the hard filter (a mismatch there makes everything
    // else irrelevant); everything past that is a weighted score so the
    // ranking favors same-brand, similarly-priced, similarly-discounted,
    // similarly-rated items over a random same-category grab-bag.
    const price    = Number(listing.currentPrice)
    const discount = Number(listing.discountPct || 0)
    const rating   = listing.rating ? Number(listing.rating) : null

    const candidates = await prisma.productListing.findMany({
      where: {
        isAvailable: true,
        productId: { not: listing.productId },
        product: { categoryId: listing.product.categoryId, status: { not: 'removed' } },
      },
      include: { product: { include: { category: true } }, store: true },
      take: 100, // score in-memory over a bounded candidate set, not the whole table
    })

    const scored = candidates.map((c) => {
      let score = 0
      if (c.product.brand && c.product.brand === listing.product.brand) score += 40
      const cPrice = Number(c.currentPrice)
      const priceDiffPct = Math.min(1, Math.abs(cPrice - price) / (price || 1))
      score += 30 * (1 - priceDiffPct)
      const cDiscount = Number(c.discountPct || 0)
      score += 20 * (1 - Math.min(1, Math.abs(cDiscount - discount) / 100))
      if (rating !== null && c.rating) {
        score += 10 * (1 - Math.min(1, Math.abs(Number(c.rating) - rating) / 5))
      }
      return { c, score }
    })

    const similar = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(({ c }) => ({
        id:            c.id,
        name:          c.product.name,
        brand:         c.product.brand,
        image:         c.product.images?.[0] || null,
        currentPrice:  c.currentPrice,
        originalPrice: c.originalPrice,
        discountPct:   c.discountPct,
        rating:        c.rating,
        reviewCount:   c.reviewCount,
        store:         c.store.name,
        category:      c.product.category?.name,
      }))

    // Full price history for the chart — this is now meaningfully
    // populated thanks to the M10 daily refresh cron
    const priceHistory = await prisma.priceHistory.findMany({
      where: { listingId: id },
      orderBy: { recordedAt: 'asc' },
      select: { price: true, recordedAt: true },
    })

    // Coupons for this product (same match logic as M10's CartNote widget) —
    // confidenceScore feeds the AI Verdict's "community confidence" signal.
    const matchedCoupons = await prisma.coupon.findMany({
      where: {
        status: { in: ['verified', 'trending', 'expiring_soon'] },
        rawText: { contains: listing.product.name.slice(0, 30), mode: 'insensitive' },
      },
      select: { confidenceScore: true },
    })
    const couponCount = matchedCoupons.length

    // Optional: is this user wishlisting it / did they buy it before
    let isWishlisted = false
    let previousSavings: number | null = null

    try {
      const auth = request.headers.authorization
      if (auth?.startsWith('Bearer ')) {
        const payload = server.jwt.verify(auth.replace('Bearer ', '')) as { userId: string }

        const saved = await prisma.savedProduct.findUnique({
          where: { userId_listingId: { userId: payload.userId, listingId: id } },
        })
        isWishlisted = !!saved

        const purchase = await prisma.purchaseHistory.findFirst({
          where: { userId: payload.userId, listingId: id },
          orderBy: { createdAt: 'desc' },
        })
        if (purchase) previousSavings = Number(purchase.savings)
      }
    } catch { /* not authenticated — fine, defaults stand */ }

    // ── DealMind AI Verdict ──────────────────────────────────────
    // Deterministic, transparent scoring out of 10 — not a live LLM call
    // (would add latency/cost to every page view for no real benefit here;
    // same reasoning the web app's AIAnalysisCard already uses). Every
    // point traces back to real data: discount size, where the current
    // price sits versus its own history, store reliability, and coupon/
    // community signals. Four components, each capped so they sum to 10.
    const signals: string[] = []

    // 1) Discount strength — up to 3 pts
    let discountScore = 0
    if (discount >= 50)      { discountScore = 3; signals.push('Genuine deal — steep discount') }
    else if (discount >= 30) { discountScore = 2; signals.push('Solid discount') }
    else if (discount >= 15) { discountScore = 1 }

    // 2) Where current price sits in its own history — up to 3 pts.
    // No history yet → neutral half-credit rather than penalizing new listings.
    let historyScore = 1.5
    const histPrices = priceHistory.map(p => Number(p.price))
    if (histPrices.length >= 2) {
      const histMin = Math.min(...histPrices)
      const histMax = Math.max(...histPrices)
      const histAvg = histPrices.reduce((a, b) => a + b, 0) / histPrices.length
      const spanDays = Math.round(
        (new Date(priceHistory[priceHistory.length - 1].recordedAt).getTime() - new Date(priceHistory[0].recordedAt).getTime())
        / 86400000
      )
      if (price <= histMin) {
        historyScore = 3
        signals.push(`Lowest price in ${spanDays || 1} days`)
        signals.push('Price likely to increase soon')
      } else if (price <= histMin + (histMax - histMin) * 0.1) {
        historyScore = 2.5
        signals.push('Near the lowest recorded price')
      } else if (price <= histAvg) {
        historyScore = 1.5
        signals.push('Below its average price')
      } else {
        historyScore = 0.5
        signals.push('Price may drop further — above recent average')
      }
    }

    // 3) Store reliability — up to 2 pts
    let trustScore = listing.store.isActive ? 1 : 0
    if (listing.store.isActive) signals.push('Trusted seller')
    if (rating !== null) trustScore += rating >= 4 ? 1 : rating >= 3 ? 0.5 : 0
    else trustScore += 0.5

    // 4) Community confidence — coupon confidence if we have matched
    // coupons, else a review-count-based proxy — up to 2 pts
    let communityScore = 0
    let communityConfidencePct: number | null = null
    if (matchedCoupons.length > 0) {
      communityConfidencePct = Math.round(
        matchedCoupons.reduce((sum, c) => sum + c.confidenceScore, 0) / matchedCoupons.length
      )
      communityScore = (communityConfidencePct / 100) * 2
      signals.push(`Community confidence: ${communityConfidencePct}%`)
    } else if (listing.reviewCount) {
      communityScore = listing.reviewCount >= 1000 ? 1 : listing.reviewCount >= 100 ? 0.5 : 0
    }
    if (couponCount > 0) signals.push(`${couponCount} coupon${couponCount > 1 ? 's' : ''} available`)

    const verdictScore = Math.round((discountScore + historyScore + trustScore + communityScore) * 10) / 10
    const recommendation =
      verdictScore >= 7.5 ? 'BUY_NOW' :
      verdictScore >= 4.5 ? 'WAIT' : 'CONSIDER_ALTERNATIVES'

    const verdict = { score: verdictScore, recommendation, signals }

    return reply.send({
      listing: {
        id:            listing.id,
        name:          listing.product.name,
        brand:         listing.product.brand,
        image:         listing.product.images?.[0] || null,
        description:   listing.product.description,
        category:      listing.product.category?.name,
        currentPrice:  listing.currentPrice,
        originalPrice: listing.originalPrice,
        discountPct:   listing.discountPct,
        couponCode:    listing.couponCode,
        rating:        listing.rating,
        reviewCount:   listing.reviewCount,
        isAvailable:   listing.isAvailable,
        store:         listing.store.name,
        storeUrl:      listing.storeUrl,
        variants,
        overview,
        specs,
      },
      priceHistory,
      couponCount,
      isWishlisted,
      previousSavings,
      similar,
      verdict,
    })
  })
}