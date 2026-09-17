// Computes the DealMind homepage sections — extracted from deals.routes.ts
// so admin.routes.ts (the "Live Deals" dashboard stat + its drill-down) can
// reuse the exact same eligibility/ranking logic instead of a second,
// disconnected metric drifting out of sync with what customers actually see.
import prisma from './prisma'

export async function computeHomepageSections(limit = 10) {
  const LIMIT = Math.min(Math.max(1, limit), 100)
  const now = new Date()
  const DAY_MS = 24 * 60 * 60 * 1000

  const baseInclude = {
    product: { include: { category: true } },
    store: true,
  }

  const toCard = (l: any) => ({
    id:            l.id,
    productId:     l.productId,
    name:          l.product.name,
    brand:         l.product.brand,
    image:         l.product.images?.[0] || null,
    category:      l.product.category.name,
    currentPrice:  Number(l.currentPrice),
    originalPrice: l.originalPrice != null ? Number(l.originalPrice) : Number(l.currentPrice),
    discountPct:   Number(l.discountPct || 0),
    rating:        l.rating ? Number(l.rating) : null,
    reviewCount:   l.reviewCount,
    couponCode:    l.couponCode,
    store:         l.store.name,
    affiliateUrl:  l.affiliateUrl || l.storeUrl,
    storeUrl:      l.storeUrl,
  })

  // ── 1. Biggest Price Drops Today ──────────────────────────
  const priceDropWindow = new Date(now.getTime() - 7 * DAY_MS)
  const listingsForPriceDrops = await prisma.productListing.findMany({
    where: { isAvailable: true },
    include: { ...baseInclude, priceHistory: { orderBy: { recordedAt: 'desc' }, take: 2 } },
  })
  const priceDrops = listingsForPriceDrops
    .map((l) => {
      const [latest, prev] = l.priceHistory
      if (!latest || !prev) return null
      if (latest.recordedAt < priceDropWindow) return null
      const latestPrice = Number(latest.price)
      const prevPrice = Number(prev.price)
      if (prevPrice <= latestPrice) return null
      const dropPct = ((prevPrice - latestPrice) / prevPrice) * 100
      if (dropPct >= 95) return null
      return { listing: l, dropPct }
    })
    .filter((x): x is { listing: typeof listingsForPriceDrops[0]; dropPct: number } => x !== null)
    .sort((a, b) => b.dropPct - a.dropPct)
    .slice(0, LIMIT)
    .map((x) => toCard(x.listing))

  // ── 2. Trending Right Now ─────────────────────────────────
  const trendWindow = new Date(now.getTime() - 7 * DAY_MS)
  const [recentClicks, recentSaves] = await Promise.all([
    prisma.affiliateClick.findMany({ where: { clickedAt: { gte: trendWindow } }, select: { listingId: true, clickedAt: true } }),
    prisma.savedProduct.findMany({ where: { createdAt: { gte: trendWindow } }, select: { listingId: true, createdAt: true } }),
  ])
  const trendScores = new Map<string, number>()
  const addTrendScore = (listingId: string, at: Date, weight: number) => {
    const ageDays = (now.getTime() - at.getTime()) / DAY_MS
    const recency = Math.max(0, 1 - ageDays / 7)
    trendScores.set(listingId, (trendScores.get(listingId) || 0) + weight * recency)
  }
  for (const c of recentClicks) addTrendScore(c.listingId, c.clickedAt, 1)
  for (const s of recentSaves) addTrendScore(s.listingId, s.createdAt, 2)

  let trending: ReturnType<typeof toCard>[] = []
  if (trendScores.size > 0) {
    const topIds = [...trendScores.entries()].sort((a, b) => b[1] - a[1]).slice(0, LIMIT).map(([id]) => id)
    const trendingListings = await prisma.productListing.findMany({ where: { id: { in: topIds }, isAvailable: true }, include: baseInclude })
    const byId = new Map(trendingListings.map((l) => [l.id, l]))
    trending = topIds.map((id) => byId.get(id)).filter((l): l is NonNullable<typeof l> => !!l).map(toCard)
  }

  // ── 3. Most Sold Products ─────────────────────────────────
  const confirmedConversions = await prisma.affiliateConversion.groupBy({
    by: ['listingId'],
    where: { status: 'confirmed', listingId: { not: null } },
    _count: { id: true },
  })
  let mostSold: ReturnType<typeof toCard>[] = []
  if (confirmedConversions.length > 0) {
    const ranked = confirmedConversions
      .filter((c) => c.listingId)
      .sort((a, b) => b._count.id - a._count.id)
      .slice(0, LIMIT)
    const ids = ranked.map((c) => c.listingId as string)
    const soldListings = await prisma.productListing.findMany({ where: { id: { in: ids }, isAvailable: true }, include: baseInclude })
    const byId = new Map(soldListings.map((l) => [l.id, l]))
    mostSold = ids.map((id) => byId.get(id)).filter((l): l is NonNullable<typeof l> => !!l).map(toCard)
  }

  // ── 4. Best Value Products ────────────────────────────────
  const valueCandidates = await prisma.productListing.findMany({
    where: { isAvailable: true, discountPct: { gt: 0 } },
    include: { ...baseInclude, priceHistory: { orderBy: { recordedAt: 'asc' } } },
  })
  const verifiedCoupons = await prisma.coupon.findMany({
    where: { status: 'verified', storeId: { not: null } },
    select: { storeId: true, confidenceScore: true },
  })
  const bestCouponConfidenceByStore = new Map<string, number>()
  for (const c of verifiedCoupons) {
    if (!c.storeId) continue
    const cur = bestCouponConfidenceByStore.get(c.storeId) || 0
    if (c.confidenceScore > cur) bestCouponConfidenceByStore.set(c.storeId, c.confidenceScore)
  }

  const valueScore = (l: typeof valueCandidates[0]) => {
    const discountPct = Number(l.discountPct || 0)
    const rating = l.rating ? Number(l.rating) : null
    const current = Number(l.currentPrice)
    const prices = [...l.priceHistory.map((h) => Number(h.price)), current]
    const min = Math.min(...prices)
    const max = Math.max(...prices)

    const discountScore = (Math.min(discountPct, 80) / 80) * 35
    const ratingScore = rating ? (rating / 5) * 25 : 0
    const historyPositionScore = max > min ? (1 - (current - min) / (max - min)) * 20 : 0
    const storeTrustScore = l.store.isActive ? 10 : 0
    const couponScore = ((bestCouponConfidenceByStore.get(l.storeId) || 0) / 100) * 10

    return discountScore + ratingScore + historyPositionScore + storeTrustScore + couponScore
  }

  const scoredValueCandidates = valueCandidates.map((l) => ({ listing: l, score: valueScore(l) }))
  const bestValue = [...scoredValueCandidates]
    .sort((a, b) => b.score - a.score)
    .slice(0, LIMIT)
    .map((x) => toCard(x.listing))

  // ── 5. New Launches ────────────────────────────────────────
  const newLaunchWindow = new Date(now.getTime() - 48 * 60 * 60 * 1000)
  const newLaunchListings = await prisma.productListing.findMany({
    where: { isAvailable: true, createdAt: { gte: newLaunchWindow } },
    include: baseInclude,
    orderBy: { createdAt: 'desc' },
    take: LIMIT,
  })
  const newLaunches = newLaunchListings.map(toCard)

  // ── 6. Best Coupon Deals ──────────────────────────────────
  const verifiedCouponsRanked = await prisma.coupon.findMany({
    where: { status: 'verified', storeId: { not: null } },
    orderBy: { confidenceScore: 'desc' },
    select: { code: true, storeId: true, confidenceScore: true },
  })
  let couponDeals: ReturnType<typeof toCard>[] = []
  if (verifiedCouponsRanked.length > 0) {
    const bestPerStore = new Map<string, { code: string; confidenceScore: number }>()
    for (const c of verifiedCouponsRanked) {
      if (!c.storeId || bestPerStore.has(c.storeId)) continue
      bestPerStore.set(c.storeId, { code: c.code, confidenceScore: c.confidenceScore })
    }
    const couponListings = await prisma.productListing.findMany({
      where: { isAvailable: true, storeId: { in: [...bestPerStore.keys()] } },
      include: baseInclude,
    })
    couponDeals = couponListings
      .map((l) => ({ listing: l, best: bestPerStore.get(l.storeId)! }))
      .sort((a, b) => b.best.confidenceScore - a.best.confidenceScore)
      .slice(0, LIMIT)
      .map((x) => ({ ...toCard(x.listing), couponCode: x.best.code }))
  }

  // ── 7. Hidden Gems ────────────────────────────────────────
  const [allClicks, allSaves] = await Promise.all([
    prisma.affiliateClick.groupBy({ by: ['listingId'], _count: { id: true } }),
    prisma.savedProduct.groupBy({ by: ['listingId'], _count: { id: true } }),
  ])
  const allTimeEngagement = new Map<string, number>()
  for (const c of allClicks) allTimeEngagement.set(c.listingId, (allTimeEngagement.get(c.listingId) || 0) + c._count.id)
  for (const s of allSaves) allTimeEngagement.set(s.listingId, (allTimeEngagement.get(s.listingId) || 0) + s._count.id)

  const HIDDEN_GEM_MIN_SCORE = 40
  const HIDDEN_GEM_MAX_ENGAGEMENT = 1
  const hiddenGems = scoredValueCandidates
    .filter((x) => x.score >= HIDDEN_GEM_MIN_SCORE && (allTimeEngagement.get(x.listing.id) || 0) <= HIDDEN_GEM_MAX_ENGAGEMENT)
    .sort((a, b) => b.score - a.score)
    .slice(0, LIMIT)
    .map((x) => toCard(x.listing))

  // ── 8 & 9. AI Recommended / Seasonal — no genuine signal exists yet ──
  const aiRecommended: ReturnType<typeof toCard>[] = []
  const seasonal: ReturnType<typeof toCard>[] = []

  return {
    priceDrops, couponDeals, trending, mostSold, bestValue,
    hiddenGems, aiRecommended, newLaunches, seasonal,
  }
}
