// Coupon Lifecycle Automation — runs daily (+ once at startup).
// Moves coupons through: VERIFIED → TRENDING → EXPIRING_SOON → EXPIRED → ARCHIVED
// FLAGGED coupons are never touched here — they wait for admin review.

import prisma from '../lib/prisma'

const TRENDING_VELOCITY_THRESHOLD = 5   // reveals in 24h to qualify as trending
const EXPIRING_SOON_WINDOW_MS     = 72 * 60 * 60 * 1000  // 72 hours
const ARCHIVE_AFTER_MS            = 30 * 24 * 60 * 60 * 1000 // 30 days after expiry

export async function runCouponLifecycle() {
  const now = new Date()
  console.log('🎟 Coupon lifecycle: running sweep...')

  try {
    // ── 1. VERIFIED → TRENDING (velocity-based promotion) ────────
    const verifiedCoupons = await prisma.coupon.findMany({
      where: { status: 'verified' },
      select: { id: true },
    })

    let trendingCount = 0
    for (const c of verifiedCoupons) {
      const recentReveals = await prisma.couponReveal.count({
        where: {
          couponId: c.id,
          revealedAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        },
      })
      if (recentReveals >= TRENDING_VELOCITY_THRESHOLD) {
        await prisma.coupon.update({ where: { id: c.id }, data: { status: 'trending' } })
        trendingCount++
      }
    }

    // ── 2. VERIFIED | TRENDING → EXPIRING_SOON ────────────────────
    const expiringSoonResult = await prisma.coupon.updateMany({
      where: {
        status: { in: ['verified', 'trending'] },
        expiresAt: { lte: new Date(now.getTime() + EXPIRING_SOON_WINDOW_MS), gt: now },
      },
      data: { status: 'expiring_soon' },
    })

    // ── 3. Any active state → EXPIRED (expiry date has passed) ────
    const expiredResult = await prisma.coupon.updateMany({
      where: {
        status: { in: ['pending_verification', 'verified', 'trending', 'expiring_soon'] },
        expiresAt: { lte: now },
      },
      data: { status: 'expired' },
    })

    // ── 4. EXPIRED → ARCHIVED (30+ days past expiry) ──────────────
    const archivedResult = await prisma.coupon.updateMany({
      where: {
        status: 'expired',
        expiresAt: { lte: new Date(now.getTime() - ARCHIVE_AFTER_MS) },
      },
      data: { status: 'archived' },
    })

    console.log(
      `🎟 Coupon lifecycle: ${trendingCount} → trending, ` +
      `${expiringSoonResult.count} → expiring_soon, ` +
      `${expiredResult.count} → expired, ` +
      `${archivedResult.count} → archived`
    )
  } catch (err) {
    console.error('Coupon lifecycle sweep failed:', err)
  }
}

export function startCouponLifecycle() {
  console.log('🎟 Coupon lifecycle: started (runs daily)')
  runCouponLifecycle() // run once immediately on startup
  setInterval(runCouponLifecycle, 24 * 60 * 60 * 1000) // then every 24h
}