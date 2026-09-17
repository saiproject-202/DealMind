// Run once to seed all default categories
// Usage: npx tsx prisma/seed-categories.ts

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const CATEGORIES = [
  { name: "Mobiles",          slug: "mobiles",          icon: "📱" },
  { name: "Laptops",          slug: "laptops",          icon: "💻" },
  { name: "Electronics",      slug: "electronics",      icon: "🔌" },
  { name: "Audio",            slug: "audio",            icon: "🎧" },
  { name: "Smart Watches",    slug: "smart-watches",    icon: "⌚" },
  { name: "Home Appliances",  slug: "home-appliances",  icon: "🏠" },
  { name: "Kitchen",          slug: "kitchen",          icon: "🍳" },
  { name: "Fashion",          slug: "fashion",          icon: "👗" },
  { name: "Beauty",           slug: "beauty",           icon: "💄" },
  { name: "Sports",           slug: "sports",           icon: "🏋️" },
  { name: "Books",            slug: "books",            icon: "📚" },
  { name: "Toys",             slug: "toys",             icon: "🧸" },
  { name: "Furniture",        slug: "furniture",        icon: "🛋️" },
]

async function main() {
  console.log('\n📦  Seeding categories...\n')

  for (const cat of CATEGORIES) {
    const existing = await prisma.category.findUnique({ where: { slug: cat.slug } })
    if (existing) {
      console.log(`  ⏭  Skipped (already exists): ${cat.name}`)
      continue
    }
    await prisma.category.create({ data: cat })
    console.log(`  ✅  Created: ${cat.name}`)
  }

  console.log(`\n🎉  Done! ${CATEGORIES.length} categories ready.\n`)
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})