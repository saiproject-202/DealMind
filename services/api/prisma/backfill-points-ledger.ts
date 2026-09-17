// ONE-TIME migration script for Milestone 4.
// Backfills a ledger entry for every user's CURRENT points balance,
// so the ledger and the cached users.points agree from day one.
//
// Usage: npx tsx prisma/backfill-points-ledger.ts
// Safe to run more than once — it skips users who already have
// ledger history (idempotent).

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  console.log('\n📊 DealMind — Points Ledger Backfill\n')

  const users = await prisma.user.findMany({
    select: { id: true, phone: true, points: true },
  })

  console.log(`Found ${users.length} user(s) to check...\n`)

  let backfilled = 0
  let skipped = 0

  for (const user of users) {
    const existingEntries = await prisma.contributorPointsLog.count({
      where: { userId: user.id },
    })

    if (existingEntries > 0) {
      skipped++
      continue
    }

    if (user.points === 0) {
      skipped++
      continue // nothing to backfill for zero-balance users
    }

    await prisma.contributorPointsLog.create({
      data: {
        userId: user.id,
        amount: user.points,
        reason: 'admin_adjustment',
        refId:  'backfill_migration_m4',
      },
    })

    console.log(`  ✅ ${user.phone}: backfilled ${user.points} points`)
    backfilled++
  }

  console.log(`\n✅ Done. Backfilled: ${backfilled}, Skipped (already had history or zero balance): ${skipped}\n`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())