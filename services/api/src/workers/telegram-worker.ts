// Telegram channel monitoring worker
// Connects to trusted channels, extracts deals via Claude, queues for approval

import prisma from '../lib/prisma'
import { askClaude, parseJsonFromClaude } from '../lib/claude'
import { createTrackedListing } from '../lib/trackedListing'
import { getTelegramClient, joinChannel } from '../lib/telegramClient'

// Confidence floor for auto-approval — same bar the AUTO-APPROVE CANDIDATE
// label already used to flag these, just now actually acted on instead of
// only labeled and left pending.
const AUTO_APPROVE_CONFIDENCE = 0.88

// A channel whose invalid-URL rate crosses this (over a large enough sample)
// gets its auto-approval paused — not disabled, not stopped from importing.
const INVALID_URL_PAUSE_THRESHOLD = 0.5
const MIN_SAMPLE_SIZE_FOR_PAUSE = 10

// ── Store URL validation ────────────────────────────────────────
// Three states, not a single boolean allowlist check — VALID/INVALID are
// evidence-based (proven during the link.amazon investigation: real store
// domains that actually convert vs. a confirmed-dead domain), UNKNOWN is
// everything else. Keeping these as plain arrays (not enum logic baked into
// the validator) means adding/removing a domain later is a one-line edit,
// not a code change.
const KNOWN_VALID_DOMAINS = [
  'amazon.in', 'amazon.com', 'flipkart.com', 'myntra.com', 'ajio.com', 'meesho.com',
  'amzn.to', 'fkrt.co', 'myntr.in', 'ajiio.co', 'bilty.co',
]
const KNOWN_INVALID_DOMAINS = [
  'link.amazon', // confirmed dead — proven via raw Telegram message-entity inspection: no hidden URL exists, direct fetch 404s
]

type UrlValidation = { status: 'valid' | 'invalid' | 'unknown'; domain: string | null; reason: string }

function validateStoreUrl(url: string | null | undefined): UrlValidation {
  if (!url) return { status: 'invalid', domain: null, reason: 'No store URL was extracted from the post.' }

  let domain: string
  try {
    domain = new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return { status: 'invalid', domain: null, reason: `"${url}" is not a well-formed URL.` }
  }

  if (KNOWN_INVALID_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) {
    return { status: 'invalid', domain, reason: `Domain "${domain}" is confirmed invalid (known dead/malformed link pattern).` }
  }
  if (KNOWN_VALID_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) {
    return { status: 'valid', domain, reason: `Domain "${domain}" is a known, verified store/shortener domain.` }
  }
  return { status: 'unknown', domain, reason: `Domain "${domain}" is not yet on the known-valid or known-invalid list.` }
}

let isRunning = false

// ── Extract deal from Telegram post text ──────────────────────
async function extractDeal(text: string): Promise<{
  data: Record<string, unknown>;
  confidence: number;
} | null> {
  try {
    const raw = await askClaude(`
You are a deal extraction AI for an Indian shopping platform.
Analyze this Telegram post and extract deal information.
Return ONLY valid JSON — nothing else:
{
  "isDeal": true if this is a product deal, false if news/spam/unrelated,
  "name": "product name or null",
  "brand": "brand name or null",
  "currentPrice": number in INR or null,
  "originalPrice": number in INR or null,
  "discountPct": discount percentage number or null,
  "couponCode": "coupon code if present or null",
  "storeUrl": "any product URL found in text or null",
  "store": "Amazon/Flipkart/Myntra/AJIO/Meesho or null",
  "description": "1 sentence product summary",
  "category": "Mobiles/Laptops/Electronics/Audio/Smart Watches/Home Appliances/Kitchen/Fashion/Beauty/Sports/Books/Toys/Furniture or null",
  "confidence": number 0 to 1 (how confident this is a real deal with accurate data)
}

TELEGRAM POST TEXT:
${text.slice(0, 3000)}`, 800)

    const data = parseJsonFromClaude(raw)

    // Filter out non-deals
    if (!data.isDeal) return null

    const confidence = typeof data.confidence === 'number' ? data.confidence : 0.5
    return { data, confidence }
  } catch {
    return null
  }
}

// ── Process a single Telegram post ────────────────────────────
export async function processPost(
  channelId: string,
  messageId: bigint,
  text: string,
  mediaUrls: string[],
  postedAt: Date
) {
  // Skip if already processed
  const existing = await prisma.telegramPost.findFirst({
    where: { channelId, messageId },
  })
  if (existing) return

  const channel = await prisma.telegramChannel.findUnique({ where: { id: channelId } })
  if (!channel?.isActive) return

  console.log(`  📩 Processing from @${channel.channelUsername}: "${text.slice(0, 60)}..."`)

  // Extract deal
  const extracted = await extractDeal(text)
  const ex = (extracted?.data || {}) as Record<string, any>

  // Store-URL validity is a separate signal from "is this a real deal" —
  // a confident, well-written post can still point at a dead/malformed
  // link (proven case: link.amazon). Cap confidence hard enough that an
  // invalid/unverified URL can never cross the auto-approve bar on its own,
  // without discarding the AI's read on the deal itself.
  const urlCheck = extracted ? validateStoreUrl(ex.storeUrl) : null
  const effectiveConfidence = extracted
    ? (urlCheck!.status === 'valid' ? extracted.confidence : Math.min(extracted.confidence, 0.3))
    : 0

  // Persist the validation result alongside the extraction — feeds the
  // per-channel quality metrics without needing a separate table.
  const extractedWithValidation = extracted
    ? { ...ex, urlValidationStatus: urlCheck!.status, urlValidationReason: urlCheck!.reason }
    : null

  // Save post to DB
  const post = await prisma.telegramPost.create({
    data: {
      channelId,
      messageId,
      rawText: text,
      mediaUrls,
      aiExtracted:     extractedWithValidation as any,
      confidenceScore: extracted?.confidence  || 0,
      processStatus:   extracted ? 'extracted' : 'no_deal',
      postedAt,
      processedAt:     new Date(),
    },
  })

  if (!extracted) {
    console.log(`  ⏭ Not a deal — skipped`)
    return
  }

  const { confidence } = extracted

  const qualifiesForAutoApproval =
    channel.isTrusted &&
    !channel.autoApproveDisabledReason &&
    effectiveConfidence >= AUTO_APPROVE_CONFIDENCE &&
    urlCheck!.status === 'valid'
  const priority = qualifiesForAutoApproval ? 1 : 2

  // Trusted channel + high confidence + an actual, validated product link —
  // skip the pending queue entirely and go straight to a live, tracked deal.
  // Anything short of that (untrusted channel, low confidence, invalid/
  // unverified URL, or auto-approval paused for this channel) still goes
  // through manual review same as before.
  if (qualifiesForAutoApproval && ex.storeUrl) {
    const result = await createTrackedListing({
      ex, storeUrl: ex.storeUrl, sourceType: 'telegram', fallbackTitle: 'Telegram Deal',
    })

    await prisma.telegramChannel.update({ where: { id: channelId }, data: { lastSyncedAt: new Date() } })

    if (result.outcome === 'created') {
      // Still logged in the queue (pre-approved) so it's visible in the
      // admin's history/audit trail, not just silently created.
      await prisma.approvalQueue.create({
        data: {
          queueType: 'telegram', referenceId: post.id, priority: 1, status: 'approved', dealId: result.deal.id,
          reviewedAt: new Date(),
          adminNotes: `🤖 Auto-approved — trusted channel @${channel.channelUsername}, ${(confidence * 100).toFixed(0)}% confidence`,
        },
      })
      await prisma.telegramPost.update({ where: { id: post.id }, data: { dealId: result.deal.id, processStatus: 'approved' } })
      console.log(`  🤖 Auto-approved and now tracking (confidence: ${(confidence * 100).toFixed(0)}%)`)
      await updateChannelAutoApprovalHealth(channelId)
      return
    }

    if (result.outcome === 'duplicate') {
      await prisma.approvalQueue.create({
        data: {
          queueType: 'telegram', referenceId: post.id, priority: 1, status: 'approved',
          reviewedAt: new Date(),
          adminNotes: `🔁 Duplicate — already tracking "${result.existingProductName}" from this store URL. No new listing created.`,
        },
      })
      await prisma.telegramPost.update({ where: { id: post.id }, data: { processStatus: 'approved' } })
      console.log(`  🔁 Duplicate of an already-tracked listing — skipped`)
      await updateChannelAutoApprovalHealth(channelId)
      return
    }

    console.log(`  ⚠ Auto-approval qualified but couldn't resolve a store/category — falling back to manual review`)
  }

  // Add to approval queue for manual review — reason states exactly why
  // this didn't auto-approve, so the admin isn't guessing.
  const reasonParts: string[] = []
  if (!channel.isTrusted) reasonParts.push('channel is not trusted')
  if (channel.autoApproveDisabledReason) reasonParts.push(`auto-approval paused for this channel (${channel.autoApproveDisabledReason})`)
  if (urlCheck!.status !== 'valid') reasonParts.push(urlCheck!.reason)
  if (urlCheck!.status === 'valid' && effectiveConfidence < AUTO_APPROVE_CONFIDENCE) reasonParts.push(`confidence ${(confidence * 100).toFixed(0)}% below the ${(AUTO_APPROVE_CONFIDENCE * 100).toFixed(0)}% auto-approve bar`)
  const reason = reasonParts.length ? reasonParts.join('; ') : 'did not meet auto-approval criteria'

  await prisma.approvalQueue.create({
    data: {
      queueType:   'telegram',
      referenceId: post.id,
      priority,
      status:      'pending',
      adminNotes:  `Telegram deal from @${channel.channelUsername} — ${(confidence * 100).toFixed(0)}% confidence. Held for manual review: ${reason}`,
    },
  })

  // Update last sync time
  await prisma.telegramChannel.update({
    where: { id: channelId },
    data: { lastSyncedAt: new Date() },
  })

  console.log(`  ✅ Queued for review (confidence: ${(confidence * 100).toFixed(0)}%, priority: ${priority}) — ${reason}`)
  await updateChannelAutoApprovalHealth(channelId)
}

// ── Pause (not disable) auto-approval for a consistently-bad channel ──
// Posts keep importing, keep getting AI-analyzed, and keep getting queued
// for manual review no matter what this decides — it only ever gates the
// auto-approval shortcut in processPost() above. Recovers automatically if
// the channel's quality improves later, but only clears a reason this
// function itself set (the "Auto-paused:" prefix) — never overrides an
// admin's own manual pause.
export async function updateChannelAutoApprovalHealth(channelId: string) {
  const allPosts = await prisma.telegramPost.findMany({
    where: { channelId, aiExtracted: { not: null } },
    select: { aiExtracted: true },
  })
  // Only posts that actually went through URL validation count — posts
  // imported before this feature existed have no urlValidationStatus field
  // at all, and including them would silently dilute the invalid rate with
  // data that was never checked in the first place.
  const posts = allPosts.filter((p) => typeof (p.aiExtracted as any)?.urlValidationStatus === 'string')
  if (posts.length < MIN_SAMPLE_SIZE_FOR_PAUSE) return

  const invalidCount = posts.filter((p) => (p.aiExtracted as any)?.urlValidationStatus === 'invalid').length
  const invalidRate = invalidCount / posts.length

  const channel = await prisma.telegramChannel.findUnique({ where: { id: channelId } })
  if (!channel) return

  const isAutoPaused = channel.autoApproveDisabledReason?.startsWith('Auto-paused:')

  if (invalidRate > INVALID_URL_PAUSE_THRESHOLD && !channel.autoApproveDisabledReason) {
    const reason = `Auto-paused: ${Math.round(invalidRate * 100)}% invalid store URLs over ${posts.length} posts`
    await prisma.telegramChannel.update({ where: { id: channelId }, data: { autoApproveDisabledReason: reason } })
    console.log(`  ⛔ Auto-approval paused for @${channel.channelUsername}: ${reason}`)
  } else if (invalidRate <= INVALID_URL_PAUSE_THRESHOLD && isAutoPaused) {
    await prisma.telegramChannel.update({ where: { id: channelId }, data: { autoApproveDisabledReason: null } })
    console.log(`  ✅ Auto-approval re-enabled for @${channel.channelUsername} — invalid URL rate recovered to ${Math.round(invalidRate * 100)}%`)
  }
}

// ── Historical backfill for a newly (or re-)joined channel ─────
// The live NewMessage listener only ever sees messages posted after the
// worker started listening — a channel joined today with 3,000 existing
// posts would otherwise have all of that history permanently ignored.
// This runs every historical message through the exact same pipeline as a
// live message (extractDeal -> confidence -> auto-approve/queue), and
// relies on processPost()'s own (channelId, messageId) dedup check so this
// can safely be re-run or overlap with the live listener without ever
// double-processing a message.
export async function importChannelHistory(
  channelDbId: string,
  limit = 500
): Promise<{ scanned: number; processed: number; skipped: number }> {
  const channel = await prisma.telegramChannel.findUnique({ where: { id: channelDbId } })
  if (!channel) return { scanned: 0, processed: 0, skipped: 0 }

  const client = await getTelegramClient()
  if (!client) return { scanned: 0, processed: 0, skipped: 0 }

  console.log(`📜 Importing up to ${limit} historical messages from @${channel.channelUsername}...`)

  const entity = await client.getEntity(channel.channelUsername)
  const messages = await client.getMessages(entity, { limit })

  // getMessages returns newest-first; process oldest-first so PriceHistory
  // and duplicate-detection see the same chronological order a live feed would.
  const ordered = [...messages].reverse()

  let processed = 0
  let skipped = 0
  for (const message of ordered) {
    const text = (message as any).message || (message as any).text || ''
    if (text.length < 15) { skipped++; continue }

    const before = await prisma.telegramPost.count({ where: { channelId: channel.id, messageId: BigInt(message.id) } })
    if (before > 0) { skipped++; continue } // already imported/seen live — processPost would skip anyway, this just avoids the AI call

    const postedAt = (message as any).date ? new Date((message as any).date * 1000) : new Date()
    await processPost(channel.id, BigInt(message.id), text, [], postedAt)
    processed++

    // Same politeness delay pattern as the price-refresh worker — don't
    // hammer Groq or Telegram across potentially hundreds of messages.
    await new Promise((r) => setTimeout(r, 1500))
  }

  console.log(`📜 Historical import done for @${channel.channelUsername}: ${ordered.length} scanned, ${processed} processed, ${skipped} skipped`)
  return { scanned: ordered.length, processed, skipped }
}

// ── Main worker start function ─────────────────────────────────
export async function startTelegramWorker() {
  const apiId   = process.env.TELEGRAM_API_ID
  const apiHash = process.env.TELEGRAM_API_HASH
  const session = process.env.TELEGRAM_SESSION

  if (!apiId || !apiHash || !session) {
    console.log('📱 Telegram worker: credentials not configured — skipping')
    console.log('   Set TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_SESSION in .env to enable')
    return
  }

  if (isRunning) return
  isRunning = true

  try {
    const { NewMessage } = await import('telegram/events/index.js')

    const client = await getTelegramClient()
    if (!client) throw new Error('Telegram client unavailable')
    console.log('📱 Telegram worker connected and listening...')

    // Load active channels from DB
    const channels = await prisma.telegramChannel.findMany({
      where: { isActive: true },
    })
    console.log(`👂 Monitoring ${channels.length} channel(s)`)

    // Resolving a public channel's username is NOT the same as receiving
    // live updates from it — gramJS only delivers NewMessage events for
    // chats/channels this account has actually joined. Without this, the
    // worker can run indefinitely and never see a single real post even
    // with perfectly valid credentials and channel usernames.
    const neverSynced: typeof channels = []
    for (const ch of channels) {
      const result = await joinChannel(ch.channelUsername)
      if (result.joined) {
        console.log(`  ✓ Joined/already in @${ch.channelUsername}`)
        if (!ch.lastSyncedAt) neverSynced.push(ch)
      } else {
        console.log(`  ✗ Could not join @${ch.channelUsername}: ${result.error}`)
      }
    }

    // Channels that existed before this join-on-startup fix (or were added
    // some other way) never got their history backfilled either — catch
    // those up too. Runs after the live listener is wired below so new
    // messages aren't missed while backfill works through the old ones;
    // sequential (not parallel) across channels to keep Groq load predictable.
    if (neverSynced.length > 0) {
      console.log(`📜 ${neverSynced.length} channel(s) never synced — backfilling history in background...`)
      ;(async () => {
        for (const ch of neverSynced) {
          await importChannelHistory(ch.id, 500).catch((err) =>
            console.error(`Historical import failed for @${ch.channelUsername}:`, err)
          )
        }
      })()
    }

    // Store channel IDs for quick lookup
    const channelMap = new Map<string, typeof channels[0]>()
    for (const ch of channels) {
      if (ch.channelId) channelMap.set(ch.channelId.toString(), ch)
    }

    // Listen for new messages
    client.addEventHandler(async (event: any) => {
      try {
        const message = event.message
        if (!message) return

        const text = message.text || message.message || ''
        if (text.length < 15) return // too short to be a deal

        const chatId = event.chatId?.toString()
        if (!chatId) return

        // Find matching channel by Telegram ID or check all active channels
        let channel = channelMap.get(chatId)

        // If not in map, try to match by username
        if (!channel) {
          const chat = event.message?.chat
          const username = chat?.username
          if (username) {
            channel = channels.find(c =>
              c.channelUsername.toLowerCase() === username.toLowerCase()
            )
            // Cache it
            if (channel && chat.id) {
              channelMap.set(chat.id.toString(), channel)
              // Update channelId in DB for future fast lookup
              await prisma.telegramChannel.update({
                where: { id: channel.id },
                data: { channelId: BigInt(chat.id) },
              }).catch(() => {})
            }
          }
        }

        if (!channel) return // not a channel we monitor

        const messageId = BigInt(message.id)
        const postedAt  = message.date ? new Date(message.date * 1000) : new Date()

        await processPost(channel.id, messageId, text, [], postedAt)
      } catch (err) {
        console.error('Telegram worker handler error:', err)
      }
    }, new NewMessage({}))

  } catch (err: any) {
    isRunning = false
    if (err?.code === 'MODULE_NOT_FOUND' || err?.message?.includes('Cannot find module')) {
      console.log('📱 Telegram worker: gramjs not installed')
      console.log('   Run: cd services/api && pnpm add telegram')
    } else {
      console.error('📱 Telegram worker failed:', err?.message || err)
    }
  }
}