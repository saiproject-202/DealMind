// Run this ONCE to create your first admin account.
// Usage: npx tsx prisma/seed-admin.ts

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import readline from 'readline'

const prisma = new PrismaClient()

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const ask = (q: string): Promise<string> => new Promise(res => rl.question(q, res))

async function main() {
  console.log('\n🔐  Create your first DealMind admin account\n')

  const email = await ask('Admin email: ')
  const password = await ask('Admin password (min 6 chars): ')

  if (password.length < 6) {
    console.log('❌  Password must be at least 6 characters.')
    process.exit(1)
  }

  const existing = await prisma.adminUser.findUnique({ where: { email } })
  if (existing) {
    console.log('❌  An admin with this email already exists.')
    process.exit(1)
  }

  const passwordHash = await bcrypt.hash(password, 10)

  const admin = await prisma.adminUser.create({
    data: { email, passwordHash, role: 'super', isActive: true },
  })

  console.log(`\n✅  Admin account created!`)
  console.log(`📧  Email: ${admin.email}`)
  console.log(`👑  Role: ${admin.role}`)
  console.log(`\nYou can now log in at the admin panel.\n`)

  rl.close()
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})