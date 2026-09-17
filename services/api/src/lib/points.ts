// Points Ledger — the ONLY way points should ever move in DealMind.
//
// Never do this again:
//   await prisma.user.update({ data: { points: { increment: 10 } } })
//
// Always do this instead:
//   await awardPoints(userId, 10, 'deal_approved', dealId)
//
// Why: direct increments have no audit trail and can drift from reality
// (double-clicks, retries, race conditions). The ledger is append-only
// and immutable — users.points becomes a CACHE that can always be
// recomputed from it, never a value trusted on its own.

import prisma from './prisma'

export type PointsReason =
  | 'deal_submitted'
  | 'deal_approved'
  | 'deal_trending'
  | 'deal_top_of_day'
  | 'coupon_submitted'
  | 'coupon_verified'
  | 'coupon_confirmed_worked'  // contributor reward — a trusted user confirmed their coupon worked
  | 'coupon_report_reward'    // verifier reward — a trusted user reported an outcome on someone else's coupon
  | 'referral_bonus'
  | 'admin_adjustment'
  | 'admin_deduction'

/**
 * Awards (or deducts, with a negative amount) points to a user.
 * Writes an immutable ledger row, then syncs the cached users.points.
 * Returns the user's new balance.
 */
export async function awardPoints(
  userId: string,
  amount: number,
  reason: PointsReason,
  dealId?: string
): Promise<number> {
  if (amount === 0) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { points: true } })
    return user?.points || 0
  }

  return prisma.$transaction(async (tx) => {
    // 1. Write the immutable ledger entry — this is the source of truth
    await tx.contributorPointsLog.create({
      data: { userId, amount, reason, dealId },
    })

    // 2. Recompute true balance from the full ledger
    const agg = await tx.contributorPointsLog.aggregate({
      where: { userId },
      _sum:  { amount: true },
    })
    const newBalance = agg._sum.amount || 0

    // 3. Sync the cache (fast reads elsewhere don't need to SUM every time)
    await tx.user.update({
      where: { id: userId },
      data:  { points: newBalance },
    })

    return newBalance
  })
}

/**
 * Verifies a user's cached points match their ledger.
 * Returns true if in sync, false if drifted (shouldn't happen, but
 * useful as a health-check / admin tool).
 */
export async function verifyPointsIntegrity(userId: string): Promise<{
  cached: number
  actual: number
  inSync: boolean
}> {
  const [user, agg] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { points: true } }),
    prisma.contributorPointsLog.aggregate({ where: { userId }, _sum: { amount: true } }),
  ])

  const cached = user?.points || 0
  const actual = agg._sum.amount || 0

  return { cached, actual, inSync: cached === actual }
}

/**
 * Gets a user's recent points history (for a future "Points Activity" UI).
 */
export async function getPointsHistory(userId: string, limit = 20) {
  return prisma.contributorPointsLog.findMany({
    where:   { userId },
    orderBy: { createdAt: 'desc' },
    take:    limit,
  })
}