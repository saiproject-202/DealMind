// Run ONCE to generate your Telegram session string
// Usage: npx tsx prisma/setup-telegram-session.ts
//
// You need:
// 1. Telegram API ID and Hash from https://my.telegram.org
// 2. Your phone number
// 3. OTP sent to your Telegram app
//
// After running, copy the SESSION string to your .env file

import * as readline from 'readline'

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const ask = (q: string): Promise<string> => new Promise(res => rl.question(q, res))

async function main() {
  console.log('\n📱 DealMind — Telegram Session Setup\n')
  console.log('This runs ONCE and generates a session string you save in .env\n')

  const apiIdStr  = process.env.TELEGRAM_API_ID  || await ask('Telegram API ID (from my.telegram.org): ')
  const apiHash   = process.env.TELEGRAM_API_HASH || await ask('Telegram API Hash: ')
  const apiId     = Number(apiIdStr)

  if (!apiId || !apiHash) {
    console.log('❌ API ID and Hash are required.')
    process.exit(1)
  }

  try {
    // Dynamic import to avoid issues if telegram is not installed
    const { TelegramClient } = await import('telegram')
    const { StringSession }  = await import('telegram/sessions/index.js')

    const client = new TelegramClient(new StringSession(''), apiId, apiHash, {
      connectionRetries: 3,
    })

    await client.start({
      phoneNumber: async () => {
        return await ask('Your phone number with country code (e.g. +919876543210): ')
      },
      password: async () => {
        return await ask('2FA password (press Enter if none): ')
      },
      phoneCode: async () => {
        return await ask('OTP code sent to your Telegram app: ')
      },
      onError: (err: Error) => {
        console.error('Telegram error:', err.message)
      },
    })

    const sessionString = client.session.save() as unknown as string

    console.log('\n✅ Session generated!\n')
    console.log('═══════════════════════════════════════')
    console.log('Add this to your services/api/.env:\n')
    console.log(`TELEGRAM_SESSION=${sessionString}`)
    console.log('═══════════════════════════════════════\n')
    console.log('⚠️  Keep this secret — it gives access to your Telegram account!\n')

    await client.disconnect()
  } catch (err: any) {
    if (err.code === 'MODULE_NOT_FOUND') {
      console.log('\n❌ gramjs not installed. Run this first:\n')
      console.log('   cd services/api && pnpm add telegram\n')
    } else {
      console.error('Error:', err)
    }
  }

  rl.close()
}

main()