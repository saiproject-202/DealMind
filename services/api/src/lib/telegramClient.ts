// Shared gramJS client — one real connection reused by both the monitoring
// worker (telegram-worker.ts) and the admin "add channel" route, so joining
// a channel doesn't require spinning up a second connection under the same
// account.
let clientPromise: Promise<any> | null = null

export async function getTelegramClient(): Promise<any | null> {
  const apiId   = process.env.TELEGRAM_API_ID
  const apiHash = process.env.TELEGRAM_API_HASH
  const session = process.env.TELEGRAM_SESSION
  if (!apiId || !apiHash || !session) return null

  if (!clientPromise) {
    clientPromise = (async () => {
      const { TelegramClient } = await import('telegram')
      const { StringSession }  = await import('telegram/sessions/index.js')
      const client = new TelegramClient(
        new StringSession(session),
        Number(apiId),
        apiHash,
        { connectionRetries: 5, autoReconnect: true }
      )
      await client.connect()
      return client
    })().catch((err) => {
      clientPromise = null // let the next call retry instead of caching a rejected promise forever
      throw err
    })
  }
  return clientPromise
}

// Being able to resolve a public channel's username (getEntity) does NOT
// mean this account receives live updates from it — gramJS's NewMessage
// event only fires for chats/channels the account has actually joined.
// This is why the worker could run indefinitely and never see a single
// real post despite valid credentials and valid channel usernames.
export async function joinChannel(username: string): Promise<{ joined: boolean; error?: string }> {
  const client = await getTelegramClient().catch((err) => {
    throw new Error(`Could not connect to Telegram: ${err?.message || err}`)
  })
  if (!client) return { joined: false, error: 'Telegram credentials not configured (TELEGRAM_API_ID/HASH/SESSION).' }

  try {
    const { Api } = await import('telegram')
    await client.invoke(new Api.channels.JoinChannel({ channel: username }))
    return { joined: true }
  } catch (err: any) {
    const message: string = err?.errorMessage || err?.message || String(err)
    if (/ALREADY_PARTICIPANT/i.test(message)) return { joined: true }
    return { joined: false, error: message }
  }
}
