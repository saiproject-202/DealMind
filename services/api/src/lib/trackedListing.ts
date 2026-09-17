import prisma from './prisma'
import { convertToEarnKaroLink } from './earnkaro'

// Domain/short-link patterns for every store DealMind currently tracks —
// checked against the actual storeUrl. Short links (myntr.in, amzn.to,
// fkrt.co, ajiio.co) matter as much as the full domain since Telegram posts
// almost always use the shortened form, never the full myntra.com/flipkart.com.
const STORE_URL_PATTERNS: [string, RegExp][] = [
  ['Amazon', /amazon\.|amzn\.to/i],
  ['Flipkart', /flipkart\.|fkrt\.(co|it)/i],
  ['Myntra', /myntra\.|myntr\.(in|it)/i],
  ['AJIO', /ajio\.|ajiio\./i],
  ['Meesho', /meesho\./i],
]

// Resolves which Store row a deal belongs to. Prefers the AI-extracted
// `ex.store` field (e.g. "Myntra") when present — it's already reliable and
// avoids re-deriving from the URL at all. Falls back to matching the actual
// storeUrl against every known store's domains/short-links, not just
// Amazon/Flipkart/Myntra — the previous version silently defaulted every
// unrecognized domain (AJIO, Meesho, and even myntr.in/amzn.to short links)
// to Amazon, which is why non-Amazon deals never showed their real store.
async function resolveStore(ex: Record<string, any>, storeUrl: string) {
  if (typeof ex.store === 'string' && ex.store.trim()) {
    const byName = await prisma.store.findFirst({ where: { name: { equals: ex.store.trim(), mode: 'insensitive' } } })
    if (byName) return byName
  }
  const matchedName = STORE_URL_PATTERNS.find(([, re]) => re.test(storeUrl))?.[0]
  if (matchedName) {
    const byUrl = await prisma.store.findFirst({ where: { name: matchedName } })
    if (byUrl) return byUrl
  }
  return prisma.store.findFirst({ where: { isActive: true } })
}

export type TrackedListingResult =
  | { outcome: 'created'; deal: { id: string; listingId: string } }
  | { outcome: 'duplicate'; existingListingId: string; existingProductName: string }
  | { outcome: 'unresolvable' } // couldn't find a store or category to file it under

// Turns AI-extracted deal data (from a user submission, a Telegram post, or
// an auto-approved trusted-channel post — same shape either way:
// name/brand/currentPrice/originalPrice/store/category/...) into a real
// tracked Product + ProductListing + PriceHistory seed row + live Deal.
// This is "entering the price tracking queue" — from here the daily
// price-refresh worker picks it up automatically since it just queries
// isAvailable listings, no separate queue table needed.
export async function createTrackedListing(params: {
  ex: Record<string, any>
  storeUrl: string
  sourceType: string
  submittedBy?: string | null
  // Admin who approved it — omit/null for the worker's automatic
  // trusted-channel approval, where no human reviewed it.
  approvedBy?: string | null
  fallbackTitle: string
}): Promise<TrackedListingResult> {
  const { ex, storeUrl, sourceType, submittedBy, approvedBy, fallbackTitle } = params

  // Same product, same store, already tracked (common with deal-alert
  // channels re-sharing a listing, or a resubmitted URL) — checked by exact
  // store URL match against any live listing, before either of the two
  // network calls below, so a duplicate costs nothing but one DB read.
  const duplicate = await prisma.productListing.findFirst({
    where: { storeUrl, isAvailable: true },
    include: { product: { select: { name: true } } },
  })
  if (duplicate) {
    return { outcome: 'duplicate', existingListingId: duplicate.id, existingProductName: duplicate.product.name }
  }

  // Network call, deliberately done outside any DB transaction — EarnKaro
  // can take up to ~25s (see earnkaro.ts), and running that inside a Prisma
  // transaction would hold rows locked / risk the transaction's own timeout
  // for no reason. Falls back to the plain URL automatically if conversion
  // fails (same contract the admin form's Generate button already relies on)
  // — this replaces the old behavior of just copying storeUrl into
  // affiliateUrl, which meant Telegram/community deals earned zero
  // commission on every click even after being approved.
  const { url: affiliateUrl } = await convertToEarnKaroLink(storeUrl)

  const store = await resolveStore(ex, storeUrl)

  let category = await prisma.category.findFirst({
    where: { name: { contains: ex.category || 'Electronics', mode: 'insensitive' } },
  })
  if (!category) category = await prisma.category.findFirst()

  if (!store || !category) return { outcome: 'unresolvable' }

  // A missing/zero currentPrice means extraction found no real single price
  // to track — most often because the URL is a category/search/listing page
  // (e.g. a Telegram "70% off on Brand X" post linking to a whole brand
  // page, not one product) rather than a genuine single-product deal.
  // Silently defaulting to 0 previously created a "$0, 100% off" phantom
  // product with nothing real behind it — reject it instead.
  if (!ex.currentPrice || Number(ex.currentPrice) <= 0) return { outcome: 'unresolvable' }

  const currentPrice = Number(ex.currentPrice)
  const originalPrice = Number(ex.originalPrice) || currentPrice
  const discountPct = originalPrice > currentPrice
    ? Math.round(((originalPrice - currentPrice) / originalPrice) * 100) : 0

  // Pure DB writes only from here — safe and fast inside a transaction.
  const deal = await prisma.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: { name: ex.name || fallbackTitle, brand: ex.brand, categoryId: category!.id, images: ex.imageUrl ? [ex.imageUrl] : [], description: ex.description, sourceType, status: 'active' },
    })

    const listing = await tx.productListing.create({
      data: { productId: product.id, storeId: store!.id, currentPrice, originalPrice, discountPct, storeUrl, affiliateUrl, couponCode: ex.couponCode, rating: ex.rating, reviewCount: ex.reviewCount, isAvailable: true, lastSyncedAt: new Date() },
    })

    await tx.priceHistory.create({ data: { listingId: listing.id, price: currentPrice, recordedAt: new Date() } })

    return tx.deal.create({
      data: { listingId: listing.id, title: ex.name || fallbackTitle, dealType: 'price_drop', sourceType, submittedBy: submittedBy || null, status: 'live', approvedBy: approvedBy || null, approvedAt: new Date(), pointsAwarded: submittedBy ? 10 : null },
    })
  })

  return { outcome: 'created', deal: { id: deal.id, listingId: deal.listingId } }
}
