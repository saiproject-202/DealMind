import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import prisma from '../lib/prisma'
import { askClaude, parseJsonFromClaude } from '../lib/claude'
import { awardPoints } from '../lib/points'
import { computeHomepageSections } from '../lib/homepageSections'

// ── Extract product ID from URL ───────────────────────────────
function extractProductId(url: string): string | null {
  // Amazon ASIN: /dp/B0XXXXXXXX or /gp/product/XXXXXXXXXX
  const amazon = url.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/)?.[1]
  if (amazon) return `amazon:${amazon}`

  // Flipkart: /p/itmXXXXXXXX
  const flipkart = url.match(/\/p\/(itm[a-zA-Z0-9]+)/)?.[1]
  if (flipkart) return `flipkart:${flipkart}`

  // Myntra: /buy/category/product/number
  const myntra = url.match(/myntr(?:a\.com|\.it)[\s\S]*?\/(\d{7,})/)?.[1]
  if (myntra) return `myntra:${myntra}`

  return null
}

// ── Check duplicate submissions ────────────────────────────────
async function checkDuplicate(url: string): Promise<{ count: number; productId: string | null }> {
  const productId = extractProductId(url)

  if (productId) {
    // Count submissions with this product ID in URL
    const idPart = productId.split(':')[1]
    const count = await prisma.dealSubmission.count({
      where: {
        rawContent: { contains: idPart },
        status: { not: 'rejected' },
      },
    })
    return { count, productId }
  }

  // Fallback: exact URL match
  const count = await prisma.dealSubmission.count({
    where: {
      rawContent: url,
      status: { not: 'rejected' },
    },
  })
  return { count, productId: null }
}

// ── Extract from URL using Claude ─────────────────────────────
async function extractFromUrl(url: string): Promise<{ data: Record<string, unknown> | null; confidence: number }> {
  if (!process.env.GROQ_API_KEY) return { data: null, confidence: 0 }

  try {
    const pageRes = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-IN,en;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    })

    const html = await pageRes.text()
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    const title = titleMatch ? titleMatch[1] : ''
    const stripped = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .slice(0, 5000)

    // og:image is how e-commerce sites declare their canonical product photo —
    // pulled via regex against the raw HTML, not asked of Claude (which only
    // sees the stripped text above, so it can't find an <img> tag itself).
    const ogImageMatch =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
    const imageUrl = ogImageMatch?.[1] || null

    const raw = await askClaude(`
Extract product details from this Indian e-commerce page. Return ONLY valid JSON:
{
  "name": "full product name",
  "brand": "brand or null",
  "currentPrice": number in INR,
  "originalPrice": number in INR,
  "rating": number or null,
  "reviewCount": number or null,
  "description": "1 sentence",
  "category": "Mobiles/Laptops/Electronics/Audio/Smart Watches/Home Appliances/Kitchen/Fashion/Beauty/Sports/Books/Toys/Furniture",
  "confidence": number between 0 and 1 (how confident you are in the extraction)
}
TITLE: ${title}
CONTENT: ${stripped}`)

    const data = parseJsonFromClaude(raw)
    if (imageUrl) data.imageUrl = imageUrl
    const confidence = typeof data.confidence === 'number' ? data.confidence : 0.7
    return { data, confidence }
  } catch {
    return { data: null, confidence: 0 }
  }
}

// ── Should this submission be auto-approved? ──────────────────
async function checkAutoApprove(
  userId: string,
  confidence: number,
  storeUrl: string
): Promise<{ autoApprove: boolean; reason: string }> {
  // Check if it's from a trusted store (Amazon/Flipkart)
  const trustedDomains = ['amazon.in', 'flipkart.com', 'myntra.com']
  const isTrustedStore = trustedDomains.some(d => storeUrl.includes(d))

  // Get user trust score
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { trustScore: true, points: true },
  })
  const trustScore = user ? Number(user.trustScore) : 0
  const points     = user?.points || 0

  // Auto-approve conditions:
  // High confidence + trusted store + established contributor
  if (confidence >= 0.88 && isTrustedStore && trustScore >= 0.6 && points >= 50) {
    return { autoApprove: true, reason: `High confidence (${confidence}), trusted store, established contributor` }
  }

  // Very high confidence + trusted store (even new user)
  if (confidence >= 0.93 && isTrustedStore) {
    return { autoApprove: true, reason: `Very high confidence (${confidence}) from trusted store` }
  }

  return { autoApprove: false, reason: 'Manual review required' }
}

export default async function dealsRoutes(server: FastifyInstance) {

  // ── POST /api/deals/submit ────────────────────────────────────
  server.post('/submit', {
    onRequest: [(server as any).authenticate],
  }, async (request, reply) => {
    const schema = z.object({
      submissionType: z.enum(['link', 'screenshot', 'coupon']),
      rawContent:     z.string().optional(),
      mediaUrls:      z.array(z.string()).optional(),
      notes:          z.string().optional(),
    })

    const result = schema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ error: 'Invalid submission data.' })
    }

    const { userId } = request.user as { userId: string }
    const { submissionType, rawContent, mediaUrls, notes } = result.data

    // ── Duplicate check (max 5 per product) ───────────────────
    if (submissionType === 'link' && rawContent) {
      const { count, productId } = await checkDuplicate(rawContent)

      if (count >= 5) {
        return reply.status(409).send({
          error: `This product has already been submitted ${count} times. We limit duplicate submissions to keep the platform fresh.`,
          duplicateCount: count,
          productId,
        })
      }

      if (count > 0) {
        // Warn but allow (under 5)
        console.log(`ℹ️  Duplicate warning: ${count} existing submission(s) for this product`)
      }
    }

    // ── AI extraction for links ───────────────────────────────
    let aiExtracted: Record<string, unknown> | null = null
    let confidenceScore = 0

    if (submissionType === 'link' && rawContent) {
      const { data, confidence } = await extractFromUrl(rawContent)
      aiExtracted = data
      confidenceScore = confidence
    }

    // ── Save submission ───────────────────────────────────────
    const submission = await prisma.dealSubmission.create({
      data: {
        userId,
        submissionType,
        rawContent:      rawContent || null,
        mediaUrls:       mediaUrls  || [],
        aiExtracted:     aiExtracted as any,
        confidenceScore,
        status:          'pending',
      },
    })

    // ── Auto-approve check ────────────────────────────────────
    let autoApproved = false
    let autoApproveReason = ''

    if (submissionType === 'link' && rawContent && confidenceScore > 0) {
      const { autoApprove, reason } = await checkAutoApprove(userId, confidenceScore, rawContent)
      autoApproved = autoApprove
      autoApproveReason = reason
    }

    // ── Add to approval queue ────────────────────────────────
    await prisma.approvalQueue.create({
      data: {
        queueType:   'deal',
        referenceId: submission.id,
        priority:    autoApproved ? 1 : 2, // auto-approve candidates get priority 1
        status:      'pending',
        adminNotes:  autoApproved
          ? `⚡ AUTO-APPROVE CANDIDATE: ${autoApproveReason}`
          : `Confidence: ${(confidenceScore * 100).toFixed(0)}%`,
      },
    })

    // ── Award small points for submitting ─────────────────────
    await awardPoints(
      userId,
      2,
      "deal_submitted",
      submission.id
    );


    return reply.status(201).send({
      success: true,
      message: autoApproved
        ? '⚡ Great find! Your deal looks excellent — it\'s in the fast-track queue!'
        : 'Deal submitted! Our team will review it shortly.',
      submissionId:    submission.id,
      confidenceScore: (confidenceScore * 100).toFixed(0) + '%',
      fastTrack:       autoApproved,
      pointsEarned:    2,
      aiPreview: aiExtracted ? {
        name:         aiExtracted.name,
        currentPrice: aiExtracted.currentPrice,
        category:     aiExtracted.category,
      } : null,
    })
  })

  // ── GET /api/deals/my-submissions ────────────────────────────
  server.get('/my-submissions', {
    onRequest: [(server as any).authenticate],
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const submissions = await prisma.dealSubmission.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
    return reply.send({ submissions })
  })


  // ── GET /api/deals/homepage ───────────────────────────────────
  // Every section has a real eligibility condition against real data and
  // returns [] when nothing qualifies — the frontend (SectionRow) hides a
  // section entirely on an empty array. Logic lives in lib/homepageSections
  // so the admin dashboard's "Live Deals" stat can reuse the exact same
  // computation instead of drifting out of sync with a second metric.
  server.get('/homepage', async (req, reply) => {
    // Optional ?limit=N — the homepage rows use the default (10), while the
    // "View all" destination page asks for a bigger cap on the one section
    // it's showing in full, without needing a separate endpoint/query.
    const requestedLimit = Number((req.query as Record<string, string>)?.limit)
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : 10
    const sections = await computeHomepageSections(limit)
    return reply.send({ sections })
  })
}
