import prisma from '../lib/prisma'
import { askClaude } from '../lib/claude'

interface ParsedRule {
  product?:    string
  brand?:      string
  category?:  string
  condition?:  'price_below' | 'price_drop' | 'new_launch' | 'back_in_stock' | 'coupon_available'
  threshold?:  number
  dropPercent?: number
  stores?:     string[]
}

// ── Check if a listing matches the CartNote rule ───────────────
function checkCondition(rule: ParsedRule, listing: any): { matched: boolean; reason: string } {
  const price         = Number(listing.currentPrice)
  const originalPrice = Number(listing.originalPrice) || price

  switch (rule.condition) {
    case 'price_below':
      if (rule.threshold && price <= rule.threshold) {
        return { matched: true, reason: `₹${price.toLocaleString('en-IN')} is now below your ₹${rule.threshold.toLocaleString('en-IN')} target!` }
      }
      break
    case 'price_drop':
      if (rule.dropPercent && originalPrice > 0) {
        const actualDrop = ((originalPrice - price) / originalPrice) * 100
        if (actualDrop >= rule.dropPercent) {
          return { matched: true, reason: `Price dropped ${actualDrop.toFixed(0)}% to ₹${price.toLocaleString('en-IN')}!` }
        }
      }
      break
    case 'coupon_available':
      if (listing.couponCode) {
        return { matched: true, reason: `Coupon available: ${listing.couponCode}` }
      }
      break
    case 'back_in_stock':
      if (listing.isAvailable) {
        return { matched: true, reason: `Back in stock at ₹${price.toLocaleString('en-IN')}!` }
      }
      break
  }
  return { matched: false, reason: '' }
}

// ── AI analysis when CartNote expires without a match ──────────
async function generateExpiryAnalysis(note: { rawNote: string; parsedRule: any; expiresAt: Date | null }): Promise<string> {
  const rule = note.parsedRule as ParsedRule
  const today = new Date()
  const month = today.toLocaleString('en-IN', { month: 'long' })

  // Figure out how many months the alert ran
  const durationLabel = note.expiresAt ? (() => {
    const created = new Date(note.expiresAt.getTime())
    const diffMonths = Math.round((note.expiresAt.getTime() - today.getTime()) / (30 * 24 * 60 * 60 * 1000))
    return `${Math.abs(diffMonths)} months`
  })() : 'an extended period'

  try {
    const analysis = await askClaude(`
You are DealMind's AI analyst for Indian e-commerce.

A user was tracking this product for ${durationLabel} but no price drop was found:
Product: "${note.rawNote}"
Category: ${rule.category || 'unknown'}
Price target: ${rule.threshold ? '₹' + rule.threshold.toLocaleString('en-IN') : 'any drop'}
Current month: ${month}

Write a helpful 3-4 sentence response that:
1. Briefly acknowledges the tracking period ended without a match
2. Predicts WHEN a price drop is likely (mention specific Indian sale events if relevant: Big Billion Days, Great Indian Festival, Flipkart Big Sale, Myntra EORS, Diwali Sale, Republic Day Sale, Independence Day Sale, etc.)
3. Suggests they either wait or consider similar products in the same category/range
4. Keep it conversational, helpful, and specific to India

Do NOT mention that you're an AI or reference any internal system. Just give the advice naturally.`, 400)

    return analysis
  } catch {
    // Fallback message when Claude is unavailable
    const upcomingSales = getSaleRecommendation(today)
    return `Your ${durationLabel} tracking period for "${rule.product || 'this product'}" has ended. ${upcomingSales} Consider setting a new alert when the sale approaches, or explore similar products in the same category.`
  }
}

function getSaleRecommendation(date: Date): string {
  const month = date.getMonth() // 0-indexed
  const events: Record<number, string> = {
    0:  'Republic Day sales (Jan 26) are just around the corner — great time for electronics deals.',
    1:  'Valentine\'s Day deals are coming in February — good for fashion and accessories.',
    2:  'Holi sales typically bring good discounts in March.',
    5:  'Mid-year sales often happen in June — watch for Flipkart and Amazon offers.',
    7:  'Independence Day sales (Aug 15) bring heavy discounts — expect good deals soon.',
    8:  'The Big Billion Days and Great Indian Festival (Oct-Nov) are approaching — the biggest sale season of the year!',
    9:  'Diwali sale season is here — Big Billion Days and Great Indian Festival typically run in October.',
    10: 'Post-Diwali sales and early winter clearances are active.',
    11: 'Year-end clearance sales in December are a great time to find deals.',
  }
  return events[month] || 'Keep an eye out for upcoming festival sales on Flipkart and Amazon.'
}

// ── Main matcher function ──────────────────────────────────────
export async function runCartNoteMatcher() {
  try {
    // 1. Check expired notes first
    const expiredNotes = await prisma.cartNote.findMany({
      where: { status: 'active', expiresAt: { lte: new Date() } },
    })

    for (const note of expiredNotes) {
      console.log(`📋 CartNote expired: "${note.rawNote.slice(0, 50)}..."`)

      const analysis = await generateExpiryAnalysis({
        rawNote:   note.rawNote,
        parsedRule: note.parsedRule,
        expiresAt: note.expiresAt,
      })

      await prisma.notification.create({
        data: {
          userId: note.userId,
          type:   'cartnote_expired',
          title:  '📋 CartNote™ Update',
          body:   analysis,
          data:   { cartnoteId: note.id, type: 'expiry_analysis' } as any,
          isRead: false,
        },
      })

      await prisma.cartNote.update({
        where: { id: note.id },
        data:  { status: 'expired' },
      })

      console.log(`  ✅ Expiry analysis sent to user`)
    }

    // 2. Check active notes for matches
    const activeNotes = await prisma.cartNote.findMany({
      where: { status: 'active', mode: 'alert' },
    })

    if (activeNotes.length === 0) return
    console.log(`📋 CartNote matcher: checking ${activeNotes.length} active alert(s)...`)

    for (const note of activeNotes) {
      const rule = note.parsedRule as ParsedRule
      if (!rule?.product && !rule?.category) continue

      const productWhere: any = {}
      if (rule.product) productWhere.name = { contains: rule.product, mode: 'insensitive' }
      if (rule.brand)   productWhere.brand = { contains: rule.brand, mode: 'insensitive' }
      if (rule.category) productWhere.category = { is: { name: { contains: rule.category, mode: 'insensitive' } } }

      const listingWhere: any = { isAvailable: true, product: productWhere }
      if (rule.stores?.length && !rule.stores.includes('any')) {
        listingWhere.store = { name: { in: rule.stores } }
      }

      const listings = await prisma.productListing.findMany({
        where:   listingWhere,
        include: { product: { select: { name: true, brand: true } }, store: { select: { name: true } } },
        take:    5,
      })

      for (const listing of listings) {
        const { matched, reason } = checkCondition(rule, listing)
        if (!matched) continue

        const existing = await prisma.cartNoteMatch.findFirst({
          where: { cartnoteId: note.id, listingId: listing.id },
        })
        if (existing) continue

        await prisma.cartNoteMatch.create({
          data: {
            cartnoteId:  note.id,
            listingId:   listing.id,
            matchedPrice: listing.currentPrice as any,
            matchReason: reason,
            isNotified:  false,
            matchedAt:   new Date(),
          },
        })

        await prisma.notification.create({
          data: {
            userId: note.userId,
            type:   'cartnote_match',
            title:  `🎯 CartNote™ Alert: ${(listing.product as any).name.slice(0, 40)}`,
            body:   reason,
            data:   { cartnoteId: note.id, listingId: listing.id } as any,
            isRead: false,
          },
        })

        await prisma.cartNote.update({
          where: { id: note.id },
          data:  { matchCount: { increment: 1 }, lastCheckedAt: new Date(), status: 'triggered' },
        })

        console.log(`  ✅ Match: "${note.rawNote.slice(0, 40)}" → ${(listing.product as any).name} — ${reason}`)
      }

      await prisma.cartNote.update({ where: { id: note.id }, data: { lastCheckedAt: new Date() } })
    }

    console.log(`📋 CartNote matcher: done`)
  } catch (err) {
    console.error('CartNote matcher error:', err)
  }
}

export function startCartNoteMatcher() {
  console.log('📋 CartNote matcher: started (checks every 15 minutes)')
  runCartNoteMatcher()
  setInterval(runCartNoteMatcher, 15 * 60 * 1000)
}