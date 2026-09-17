import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import prisma from '../lib/prisma'
import { askClaude, parseJsonFromClaude } from '../lib/claude'

// ── Simple regex fallback parser ──────────────────────────────
// Used when Claude fails — ensures alerts ALWAYS get saved
function simpleParser(rawNote: string): Record<string, unknown> {
  const lower = rawNote.toLowerCase()

  // Extract price (₹20,000 or 20000 or 20k)
  const priceMatch = rawNote.match(/₹\s*([\d,]+)k?|(\d[\d,]+)\s*k\b/i)
  let threshold: number | undefined
  if (priceMatch) {
    const raw = (priceMatch[1] || priceMatch[2]).replace(/,/g, '')
    threshold = rawNote.toLowerCase().includes('k') && !priceMatch[1]
      ? parseInt(raw) * 1000
      : parseInt(raw)
  }

  // Determine condition
  let condition = 'price_below'
  if (lower.includes('launch') || lower.includes('new model') || lower.includes('release')) condition = 'new_launch'
  else if (lower.includes('stock') || lower.includes('available')) condition = 'back_in_stock'
  else if (lower.includes('coupon') || lower.includes('promo') || lower.includes('code')) condition = 'coupon_available'
  else if (lower.includes('drop') || lower.includes('decrease') || lower.includes('reduce')) condition = 'price_drop'

  // Extract stores
  const stores: string[] = []
  if (lower.includes('amazon'))   stores.push('Amazon')
  if (lower.includes('flipkart')) stores.push('Flipkart')
  if (lower.includes('myntra'))   stores.push('Myntra')
  if (stores.length === 0)        stores.push('any')

  // Build product name (remove common trigger words)
  const product = rawNote
    .replace(/notify me|when|goes below|drops below|drops to|alert me|tell me|watch|track/gi, '')
    .replace(/₹[\d,]+k?|[\d,]+k?\s*rupees?/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)

  return {
    product,
    condition,
    threshold,
    currency:    'INR',
    stores,
    features:    [],
    description: `Alert when ${product} ${condition === 'price_below' ? `drops below ₹${threshold?.toLocaleString('en-IN') || 'your target'}` : condition.replace('_', ' ')}`,
    parsedBy:    'fallback',
  }
}

// ── Claude NL parser ──────────────────────────────────────────
async function parseCartNote(rawNote: string): Promise<Record<string, unknown>> {
  try {
    const raw = await askClaude(`
Parse this shopping alert for an Indian e-commerce platform. Return ONLY valid JSON:
{
  "product": "product name to search for",
  "brand": "brand or null",
  "category": "Mobiles/Laptops/Electronics/Audio/Smart Watches/Home Appliances/Kitchen/Fashion/Beauty/Sports/Books/Toys/Furniture or null",
  "condition": "price_below" or "price_drop" or "new_launch" or "back_in_stock" or "coupon_available",
  "threshold": price in INR as number or null,
  "dropPercent": discount percentage as number or null,
  "currency": "INR",
  "stores": ["any"] or ["Amazon","Flipkart"] etc,
  "features": [] or ["AMOLED","GPS"] etc,
  "description": "1 sentence summary of what triggers this alert",
  "parsedBy": "claude"
}

User's alert: "${rawNote}"`, 600)

    return parseJsonFromClaude(raw)
  } catch {
    // Claude failed → use simple parser as fallback
    console.log('CartNote: Claude parse failed, using fallback parser')
    return simpleParser(rawNote)
  }
}

// ── Duration to expiry date ───────────────────────────────────
function monthsToExpiry(months: number): Date {
  const d = new Date()
  d.setMonth(d.getMonth() + months)
  return d
}

export default async function cartnotesRoutes(server: FastifyInstance) {

  // ── POST /api/cartnotes ──────────────────────────────────────
  server.post('/', { onRequest: [(server as any).authenticate] }, async (request, reply) => {
    const schema = z.object({
      rawNote:        z.string().min(5).max(500),
      mode:           z.enum(['alert', 'assistant']).default('alert'),
      durationMonths: z.number().min(1).max(24).optional(),
    })
    const result = schema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ error: 'Please write a valid alert (at least 5 characters).' })
    }

    const { userId }                      = request.user as { userId: string }
    const { rawNote, mode, durationMonths } = result.data

    let parsedRule: Record<string, unknown> = {}
    if (mode === 'alert') {
      parsedRule = await parseCartNote(rawNote) // never throws now
    }

    const expiresAt = durationMonths ? monthsToExpiry(durationMonths) : null

    const cartnote = await prisma.cartNote.create({
      data: {
        userId,
        rawNote,
        parsedRule:  parsedRule as any,
        mode,
        status:      'active',
        matchCount:  0,
        expiresAt,
      },
    })

    const durationLabel = durationMonths
      ? durationMonths >= 12
        ? `${Math.floor(durationMonths / 12)} year${durationMonths >= 24 ? 's' : ''}`
        : `${durationMonths} month${durationMonths > 1 ? 's' : ''}`
      : null

    return reply.status(201).send({
      success:  true,
      cartnote,
      parsedRule,
      duration: durationLabel,
      message:  durationLabel
        ? `Alert set for ${durationLabel}! ${parsedRule.description || rawNote}`
        : `Alert set! ${parsedRule.description || rawNote}`,
    })
  })

  // ── GET /api/cartnotes ───────────────────────────────────────
  server.get('/', { onRequest: [(server as any).authenticate] }, async (request, reply) => {
    const { userId } = request.user as { userId: string }

    const cartnotes = await prisma.cartNote.findMany({
      where:   { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        matches: { orderBy: { matchedAt: 'desc' }, take: 1 },
      },
    })

    return reply.send({ cartnotes, total: cartnotes.length })
  })

  // ── DELETE /api/cartnotes/:id ────────────────────────────────
  server.delete('/:id', { onRequest: [(server as any).authenticate] }, async (request, reply) => {
    const { id }     = request.params as { id: string }
    const { userId } = request.user as { userId: string }
    await prisma.cartNote.deleteMany({ where: { id, userId } })
    return reply.send({ success: true })
  })

  // ── POST /api/cartnotes/:id/reset ────────────────────────────
  server.post('/:id/reset', { onRequest: [(server as any).authenticate] }, async (request, reply) => {
    const { id }     = request.params as { id: string }
    const { userId } = request.user as { userId: string }
    await prisma.cartNote.updateMany({
      where: { id, userId },
      data:  { status: 'active', lastCheckedAt: null },
    })
    return reply.send({ success: true })
  })

  // ── POST /api/cartnotes/assistant — Mode 2: AI chat ─────────
  server.post('/assistant', { onRequest: [(server as any).authenticate] }, async (request, reply) => {
    const schema = z.object({
      message: z.string().min(2).max(1000),
      history: z.array(z.object({
        role:    z.enum(['user', 'assistant']),
        content: z.string(),
      })).optional(),
    })
    const result = schema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ error: 'Invalid message.' })
    }

    const { message, history = [] } = result.data

    const historyText = history
      .slice(-6)
      .map(h => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`)
      .join('\n')

    try {
      // The model's training data has its own cutoff, which is unrelated to
      // (and can lag well behind) the real "today" — without being told the
      // actual date, it reasons from its cutoff as if that were now (e.g.
      // calling an already-released phone "not out yet"). This doesn't fix
      // the model's underlying knowledge gap for genuinely recent launches/
      // prices, but it stops the more misleading failure of confidently
      // asserting the wrong release status for something old enough that
      // the model should know about it.
      const today = new Date().toISOString().slice(0, 10)
      const response = await askClaude(`
You are DealMind's AI Shopping Assistant for Indian e-commerce.
Today's date is ${today}. Reason about release dates, prices, and "is this out yet" questions relative to THIS date, not your training cutoff — if a product's known release date is before today, treat it as already released, even if you're not fully certain of specs or price.
You ONLY answer shopping-related questions. For anything unrelated, politely redirect.
You help with: product comparisons, recommendations, specifications, buy timing advice, alternatives.
Keep responses concise (3-5 sentences). Use ₹ for Indian prices. Be specific and practical.
If asked about a specific recent/upcoming product's exact price or specs and you're not confident your information is current, say so plainly instead of guessing a number.

${historyText ? `Previous conversation:\n${historyText}\n` : ''}
User: ${message}
Assistant:`, 500)

      return reply.send({ success: true, response })
    } catch (err: any) {
      return reply.status(500).send({
        error: 'AI assistant is temporarily unavailable. Please try again.',
        detail: err?.message,
      })
    }
  })
}