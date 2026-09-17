// Trust Compute Engine — recalculates every user's trust level,
// accuracy, and savings-generated from real event data. Also awards
// achievement badges. Runs weekly + once at startup.
//
// KEY PRINCIPLE (same as points ledger in M4): these are DERIVED
// values recomputed from source tables, never hand-edited. If data
// looks wrong, fix the source events and re-run — never patch the cache.

import prisma from './prisma'

async function computeUserStats(userId: string) {
  const coupons = await prisma.coupon.findMany({
    where: { creatorId: userId },
    select: { id: true, status: true },
  })

  const verifiedCount = coupons.filter(c =>
    ['verified', 'trending', 'expiring_soon'].includes(c.status)
  ).length

  // Accuracy is derived from the SAME weighted signal that drives coupon
  // confidence (coupon-confidence.ts) — active reports only, weighted by
  // reporter trust/age — not raw report counts. This is the authoritative
  // reconciliation the real-time nudgePendingTrust() above only estimates.
  const couponIds = coupons.map(c => c.id)
  const reports = couponIds.length > 0
    ? await prisma.couponReport.findMany({
        where: { couponId: { in: couponIds }, isActive: true },
        select: { type: true, weight: true },
      })
    : []

  let successWeight = 0
  let failWeight     = 0
  for (const r of reports) {
    if (r.type === 'worked') successWeight += r.weight
    else failWeight += r.weight // failed | expired | fake all count against accuracy
  }
  const accuracyPct = (successWeight + failWeight) > 0
    ? successWeight / (successWeight + failWeight)
    : 0

  // Raw counts (unweighted) — kept only for the achievement thresholds
  // below, which care about volume of activity, not weighted accuracy.
  const totalSuccess = reports.filter(r => r.type === 'worked').length
  const totalFail     = reports.length - totalSuccess

  // Savings generated — attributed via affiliate_conversions.couponId
  // (field exists since M5, populated once conversions reference a
  // coupon — naturally grows as the coupon economy activates)
  const conversions = couponIds.length > 0
    ? await prisma.affiliateConversion.findMany({
        where: { couponId: { in: couponIds }, status: 'confirmed' },
        select: { orderValue: true, commissionAmount: true },
      })
    : []

  // v1 approximation: "savings" = order value the buyer spent through
  // this creator's coupon (a fuller discount-amount calc comes once
  // coupons store a discountValue field — noted for a future milestone)
  const savingsGenerated = conversions.reduce((sum, c) => sum + Number(c.orderValue), 0)

  return { verifiedCount, accuracyPct, savingsGenerated, totalSuccess, totalFail }
}

async function assignLevel(userId: string, verifiedCount: number, accuracyPct: number) {
  const levels = await prisma.contributorLevel.findMany({ orderBy: { levelNumber: 'desc' } })

  // Highest level whose thresholds are met (levels sorted descending)
  const earned = levels.find(l => verifiedCount >= l.minVerified && accuracyPct >= l.minAccuracy)
    || levels[levels.length - 1] // fallback to lowest (Explorer)

  await prisma.user.update({
    where: { id: userId },
    data:  { levelId: earned?.id },
  })

  return earned
}

async function awardBadgeIfEligible(userId: string, slug: string) {
  const badge = await prisma.badge.findUnique({ where: { slug } })
  if (!badge) return false

  const existing = await prisma.userBadge.findUnique({
    where: { userId_badgeId: { userId, badgeId: badge.id } },
  })
  if (existing) return false // already has it

  await prisma.userBadge.create({ data: { userId, badgeId: badge.id } })
  console.log(`  🏆 Awarded "${badge.name}" to user ${userId}`)
  return true
}

async function checkAchievements(userId: string, stats: {
  verifiedCount: number; accuracyPct: number; totalSuccess: number; totalFail: number
}) {
  if (stats.verifiedCount >= 1)   await awardBadgeIfEligible(userId, 'first_verified')
  if (stats.verifiedCount >= 5)   await awardBadgeIfEligible(userId, 'contributor_5')
  if (stats.verifiedCount >= 25 && stats.accuracyPct >= 0.8)  await awardBadgeIfEligible(userId, 'trusted_25')
  if (stats.verifiedCount >= 100 && stats.accuracyPct >= 0.9) await awardBadgeIfEligible(userId, 'verified_creator')

  const totalReports = stats.totalSuccess + stats.totalFail
  if (totalReports >= 10 && stats.accuracyPct >= 0.95) await awardBadgeIfEligible(userId, 'accuracy_master')
}

/**
 * Real-time trust SIGNAL, not a real trust update — nudges the pending
 * delta only. User.trustScore itself is written exclusively by the weekly
 * runTrustCompute() reconciliation below, so trust can never drift from
 * the source-of-truth report ledger no matter how many nudges land
 * in between. Called synchronously from the report route so contributors
 * see *something* move immediately, honestly labeled as provisional.
 */
export async function nudgePendingTrust(userId: string, delta: number): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data:  { pendingTrustDelta: { increment: delta } },
  })
}

export async function runTrustCompute() {
  console.log('🎖 Trust compute: running...')

  try {
    // Only compute for users who have submitted at least one coupon
    // (no wasted work on users with zero contribution history)
    const activeCreators = await prisma.coupon.findMany({
      select: { creatorId: true },
      distinct: ['creatorId'],
    })

    let processed = 0
    for (const { creatorId } of activeCreators) {
      const stats = await computeUserStats(creatorId)

      await prisma.user.update({
        where: { id: creatorId },
        data: {
          trustScore:        stats.accuracyPct,       // feeds M7's report-weighting directly
          savingsGenerated:  stats.savingsGenerated,
          pendingTrustDelta: 0, // reconciled — the real-time nudges since last run are now baked into trustScore itself
        },
      })

      await assignLevel(creatorId, stats.verifiedCount, stats.accuracyPct)
      await checkAchievements(creatorId, stats)

      processed++
    }

    console.log(`🎖 Trust compute: done (${processed} creator(s) processed)`)
  } catch (err) {
    console.error('Trust compute failed:', err)
  }
}

export function startTrustCompute() {
  console.log('🎖 Trust compute: started (runs weekly)')
  runTrustCompute() // once at startup
  setInterval(runTrustCompute, 7 * 24 * 60 * 60 * 1000) // then weekly
}