// Reset an admin's password directly via CLI — no email service required.
// Usage: npx tsx prisma/reset-admin-password.ts

import * as readline from 'readline'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const ask = (q: string): Promise<string> => new Promise(res => rl.question(q, res))

async function main() {
  console.log('\n🔑 DealMind Admin — Password Reset\n')

  const email = await ask('Admin email: ')
  const admin = await prisma.adminUser.findUnique({ where: { email } })

  if (!admin) {
    console.log(`❌ No admin found with email: ${email}`)
    rl.close()
    process.exit(1)
  }

  const newPassword = await ask('New password (min 8 characters): ')
  if (newPassword.length < 8) {
    console.log('❌ Password must be at least 8 characters.')
    rl.close()
    process.exit(1)
  }

  const passwordHash = await bcrypt.hash(newPassword, 10)
  await prisma.adminUser.update({
    where: { email },
    data: { passwordHash },
  })

  console.log(`\n✅ Password reset for ${email}\n`)
  console.log('You can now log in to the admin panel with the new password.\n')

  rl.close()
}

main().catch(console.error).finally(() => prisma.$disconnect())