// ONE-TIME seed for Milestone 9 — populates the trust ladder and
// first 5 achievement badges. Safe to re-run (upserts, no duplicates).
// Usage: npx tsx prisma/seed-levels-badges.ts

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const LEVELS = [
  { name: 'Explorer',        levelNumber: 1, minVerified: 0,   minAccuracy: 0,    perks: null },
  { name: 'Contributor',     levelNumber: 2, minVerified: 5,   minAccuracy: 0.6,  perks: 'Badge unlocked' },
  { name: 'Trusted',         levelNumber: 3, minVerified: 25,  minAccuracy: 0.8,  perks: 'Priority review queue' },
  { name: 'Verified Creator',levelNumber: 4, minVerified: 100, minAccuracy: 0.9,  perks: 'Badge + boosted visibility' },
  { name: 'Elite',           levelNumber: 5, minVerified: 250, minAccuracy: 0.9,  perks: 'Homepage feature eligibility' },
]

const BADGES = [
  { slug: 'first_verified',    name: 'First Verified',     description: 'Your first coupon reached verified status', icon: '🌱' },
  { slug: 'contributor_5',     name: 'Contributor',        description: '5 verified coupons',                        icon: '⭐' },
  { slug: 'trusted_25',        name: 'Trusted',            description: '25 verified coupons, 80%+ accuracy',        icon: '🛡️' },
  { slug: 'verified_creator',  name: 'Verified Creator',   description: '100 verified coupons, 90%+ accuracy',       icon: '👑' },
  { slug: 'accuracy_master',   name: 'Accuracy Master',    description: '95%+ accuracy across 10+ coupons',          icon: '🎯' },
]

async function main() {
  console.log('\n🏆 Seeding trust levels + badges...\n')

  for (const level of LEVELS) {
    await prisma.contributorLevel.upsert({
      where:  { levelNumber: level.levelNumber },
      update: level,
      create: level,
    })
    console.log(`  ✅ Level: ${level.name}`)
  }

  for (const badge of BADGES) {
    await prisma.badge.upsert({
      where:  { slug: badge.slug },
      update: badge,
      create: badge,
    })
    console.log(`  ✅ Badge: ${badge.name}`)
  }

  console.log('\n✅ Done.\n')
}

main().catch(console.error).finally(() => prisma.$disconnect())
