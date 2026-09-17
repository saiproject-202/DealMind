import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAdmin } from './admin-auth.routes'
import { askClaude, parseJsonFromClaude, currentModel } from '../lib/claude'
import { fetchProductPage } from '../lib/fetchPage'

// Looks for og:image / twitter:image meta tags specifically, rather than
// relying on Claude to spot a URL inside the generic META blob — much more
// reliable since these tags are how e-commerce sites declare "the" product photo.
function extractOgImage(html: string): string | null {
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
  ]
  for (const re of patterns) {
    const match = html.match(re)
    if (match?.[1]) return match[1]
  }

  // Amazon doesn't set og:image at all — its main product photo lives in
  // #landingImage's data-a-dynamic-image attribute, a JSON map of
  // {url: [width, height]} for every size Amazon has generated.
  const dynamicImage = html.match(/id=["']landingImage["'][^>]*data-a-dynamic-image=["']([^"']+)["']/i)
    || html.match(/data-a-dynamic-image=["']([^"']+)["'][^>]*id=["']landingImage["']/i)
  if (dynamicImage?.[1]) {
    try {
      const decoded = dynamicImage[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')
      const urls = Object.keys(JSON.parse(decoded))
      if (urls[0]) return urls[0]
    } catch {
      // malformed attribute — fall through to null
    }
  }

  return null
}

// Most e-commerce sites embed exact schema.org Product/Offer/AggregateRating
// data in a <script type="application/ld+json"> block — pulling numbers from
// there is far more reliable than asking the model to eyeball them out of
// scraped text, which is prone to picking up unrelated numbers on the page.
interface JsonLdFacts {
  currentPrice?: number
  originalPrice?: number
  rating?: number
  reviewCount?: number
}

function extractJsonLd(html: string): JsonLdFacts {
  const facts: JsonLdFacts = {}
  const blockRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m
  while ((m = blockRegex.exec(html)) !== null) {
    let parsed: unknown
    try {
      parsed = JSON.parse(m[1].trim())
    } catch {
      continue
    }

    const candidates: any[] = Array.isArray(parsed) ? parsed
      : (parsed as any)?.['@graph'] ? (parsed as any)['@graph']
      : [parsed]

    for (const node of candidates) {
      const type = node?.['@type']
      const isProduct = type === 'Product' || (Array.isArray(type) && type.includes('Product'))
      if (!isProduct) continue

      const offer = Array.isArray(node.offers) ? node.offers[0] : node.offers
      if (offer) {
        const price = Number(offer.price ?? offer.lowPrice)
        const highPrice = Number(offer.highPrice)
        if (!Number.isNaN(price) && price > 0) facts.currentPrice = price
        if (!Number.isNaN(highPrice) && highPrice > 0) facts.originalPrice = highPrice
      }

      const agg = node.aggregateRating
      if (agg) {
        const rating = Number(agg.ratingValue)
        const reviewCount = Number(agg.reviewCount ?? agg.ratingCount)
        if (!Number.isNaN(rating) && rating > 0) facts.rating = Math.round(rating * 10) / 10
        if (!Number.isNaN(reviewCount) && reviewCount > 0) facts.reviewCount = reviewCount
      }
    }
  }
  return facts
}

// Fallback for facts schema.org didn't cover (e.g. Myntra puts MRP in its
// own `window.__myx` state blob, not in the ld+json Product/Offer). Scans
// raw HTML for common inline-JSON key names used for these fields across
// e-commerce sites. Best-effort — admin still reviews before submitting.
function extractEmbeddedFacts(html: string, facts: JsonLdFacts, asin?: string | null): void {
  const firstMatch = (re: RegExp): number | undefined => {
    const m = html.match(re)
    if (!m) return undefined
    const n = Number(m[1])
    return !Number.isNaN(n) && n > 0 ? n : undefined
  }

  if (!facts.currentPrice) {
    facts.currentPrice = firstMatch(/"(?:discountedPrice|sellingPrice|offerPrice|salePrice)"\s*:\s*"?([\d.]+)"?/i)
  }
  if (!facts.originalPrice) {
    facts.originalPrice = firstMatch(/"(?:mrp|listPrice|originalPrice|strikePrice|maximumRetailPrice)"\s*:\s*"?([\d.]+)"?/i)
  }
  if (!facts.rating) {
    const rating = firstMatch(/"(?:averageRating|avgRating|ratingValue)"\s*:\s*"?([\d.]+)"?/i)
    // Sites sometimes embed the raw backend float (e.g. 4.352608583911591) —
    // round to 1 decimal, matching how ratings are normally displayed.
    if (rating !== undefined) facts.rating = Math.round(rating * 10) / 10
  }
  if (!facts.reviewCount) {
    facts.reviewCount = firstMatch(/"(?:reviewCount|totalRatings|ratingsCount|totalCount)"\s*:\s*"?(\d+)"?/i)
  }

  // Amazon's page is riddled with OTHER products' data too — related-item
  // carousels and sponsored listings embed their own "M.R.P."-shaped price
  // blobs and ad-tracking URLs, several of which coincidentally carry a
  // matching-looking price for the wrong ASIN. A bare text-proximity match
  // (or even matching this product's own ASIN against an ad-tracking URL —
  // tried first, dropped after it turned out Amazon reuses the same ASIN in
  // that blob for both the current price AND a stale MRP at different spots)
  // silently returns whichever the wrong one, with no way to tell from the
  // match alone. The one place a real MRP is unambiguous is the
  // recommendations widget's per-item JSON, which bundles rating + review
  // count + fullPrice (MRP) together under the SAME "asin" key in one
  // object — matching all three at once and requiring the asin to agree
  // rules out cross-product contamination, instead of trusting proximity.
  if (asin) {
    const q = String.raw`\\&quot;` // HTML entity-encodes this blob's escaped quotes as \&quot;
    const bundled = html.match(new RegExp(
      `${q}rating${q}:([\\d.]+),${q}count${q}:(\\d+),${q}asin${q}:${q}${asin}${q}[\\s\\S]{0,300}?${q}fullPrice${q}:(\\d+)`
    ))
    if (bundled) {
      if (!facts.rating) facts.rating = Math.round(Number(bundled[1]) * 10) / 10
      if (!facts.reviewCount) facts.reviewCount = Number(bundled[2])
      if (!facts.originalPrice) facts.originalPrice = Number(bundled[3])
    }
  }
  if (!facts.originalPrice) {
    const m = html.match(/M\.R\.P[.:]*\s*<\/span>\s*<span[^>]*>\s*₹[\s\S]{0,40}?([\d,]+(?:\.\d+)?)/i)
      || html.match(/data-a-strike=["']true["'][\s\S]{0,200}?a-offscreen["'][^>]*>\s*₹\s*([\d,]+(?:\.\d+)?)/i)
    if (m) {
      const n = Number(m[1].replace(/,/g, ''))
      if (!Number.isNaN(n) && n > 0) facts.originalPrice = n
    }
  }
  if (!facts.rating) {
    const m = html.match(/([\d.]+)\s+out of 5 stars/i)
    if (m) {
      const n = Number(m[1])
      if (!Number.isNaN(n) && n > 0) facts.rating = Math.round(n * 10) / 10
    }
  }
  if (!facts.reviewCount) {
    // Amazon's actual markup: <span id="acrCustomerReviewText" aria-label="667 Reviews">(667)</span>
    const m = html.match(/id=["']acrCustomerReviewText["'][^>]*aria-label=["'](\d[\d,]*)\s*Reviews?["']/i)
      || html.match(/id=["']acrCustomerReviewText["'][^>]*>\s*\(?([\d,]+)\)?\s*</i)
    if (m) {
      const n = Number(m[1].replace(/,/g, ''))
      if (!Number.isNaN(n) && n > 0) facts.reviewCount = n
    }
  }
}

// Myntra's size selector isn't in the visible/stripped page text the AI
// sees at all — it's a per-SKU array embedded in a <script> block
// ({"skuId":...,"styleId":...,"label":"8","available":true}, one entry per
// buyable size), which extractRelevantText() strips out along with every
// other <script> tag. Same regex-over-raw-HTML approach as the facts above,
// just for the one site whose size data lives nowhere else.
function extractMyntraSizes(html: string): string[] {
  const re = /"skuId":\d+,"styleId":\d+,"action":"[^"]*","label":"([^"]+)"[^}]*?"available":(true|false)/g
  const sizes = new Set<string>()
  let m
  while ((m = re.exec(html)) !== null) {
    if (m[2] === 'true') sizes.add(m[1])
  }
  return [...sizes]
}

// Amazon exposes its variant-selector dropdown (color/size/configuration)
// as a plain (non-escaped) inline JSON blob for the twister widget —
// "variationValues" : { "<dimension_symbol>": ["value1","value2",...] } —
// paired with human-readable labels for each symbol in "dimensionKeys".
// Products with only one buyable option (no dropdown at all) simply won't
// have this blob, which is normal, not a bug.
const AMAZON_DIMENSION_LABELS: Record<string, string> = {
  color_name: 'Color', style_name: 'Style', size_name: 'Size',
  pattern_name: 'Pattern', configuration: 'Configuration',
  capacity_name: 'Capacity', flavor_name: 'Flavor',
}
function extractAmazonVariants(html: string): { type: string; values: string[] }[] {
  const m = html.match(/"variationValues"\s*:\s*(\{[^}]*\})/)
  if (!m) return []
  let parsed: Record<string, string[]>
  try {
    parsed = JSON.parse(m[1])
  } catch {
    return []
  }
  return Object.entries(parsed)
    .filter(([, values]) => Array.isArray(values) && values.length > 1) // a dropdown with only 1 option isn't a real "choice"
    .map(([symbol, values]) => ({
      type: AMAZON_DIMENSION_LABELS[symbol] || symbol,
      values: [...new Set(values)],
    }))
}

// Weaker fallback models tend to default to the broad "Electronics" bucket
// even when a more specific category is right there in the prompt's allowed
// list (e.g. calling a pair of earbuds "Electronics" instead of "Audio") —
// a keyword check against the product name is far more reliable than
// hoping the model picks the specific option over the generic one. Ordered
// most-specific-first; only overrides when the AI's answer was the generic
// "Electronics" catch-all, never a different specific category it chose deliberately.
const CATEGORY_KEYWORDS: [string, RegExp][] = [
  ['Audio', /\b(earbuds?|earphones?|headphones?|neckband|soundbar|bluetooth speaker|wireless speaker|tws)\b/i],
  ['Mobiles', /\b(smartphone|5g phone|\bphone\b)\b/i],
  ['Laptops', /\b(laptop|notebook|macbook|chromebook)\b/i],
  ['Smart Watches', /\b(smartwatch|smart watch|fitness band)\b/i],
]
function inferCategoryFromName(name: string | undefined, aiSuggested: string | undefined | null): string | undefined {
  if (!name) return undefined
  if (aiSuggested && aiSuggested.toLowerCase() !== 'electronics') return undefined
  for (const [category, re] of CATEGORY_KEYWORDS) {
    if (re.test(name)) return category
  }
  return undefined
}

function extractRelevantText(html: string): string {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  const title = titleMatch ? titleMatch[1].trim() : ''

  const metas: string[] = []
  const metaRegex = /<meta[^>]+(?:content|property)="([^"]{10,})"[^>]*>/gi
  let m
  while ((m = metaRegex.exec(html)) !== null) {
    metas.push(m[1].replace(/\\n/g, ' ').trim())
  }

  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return [
    `TITLE: ${title}`,
    `META: ${metas.slice(0, 30).join(' | ')}`,
    `CONTENT: ${stripped.slice(0, 6000)}`,
  ].join('\n\n')
}

export default async function adminExtractRoutes(server: FastifyInstance) {

  // ── GET /api/admin/model — shows which Claude model is active
  server.get('/model', { onRequest: [requireAdmin] }, async (_req, reply) => {
    return reply.send({
      model: currentModel(),
      note: 'Change GROQ_MODEL in .env to switch models — no code changes needed. Falls back automatically to a secondary model if the primary is rate-limited.',
    })
  })

  // ── POST /api/admin/extract-product ─────────────────────────
  server.post('/extract-product', { onRequest: [requireAdmin] }, async (request, reply) => {
    const schema = z.object({ url: z.string().url() })
    const result = schema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ error: 'A valid product URL is required.' })
    }

    const { url } = result.data

    const fetched = await fetchProductPage(url)
    if ('error' in fetched) {
      const messages: Record<string, string> = {
        not_found: 'That page returned a 404 (Page Not Found). Check the URL is complete — it should include the product ID (e.g. /dp/B0XXXXXXX for Amazon).',
        'redirect loop detected': 'This link redirects in a loop and never reaches a page. Try pasting the direct product link instead.',
        'redirect with no destination': 'This link redirects but points nowhere. Try pasting the direct product link instead.',
        'too many redirects': 'This link redirects too many times to follow. Try pasting the direct product link instead.',
        'fetch failed': 'Could not fetch this URL. Try pasting the direct product link.',
      }
      return reply.status(422).send({
        error: messages[fetched.error] || `That page returned an error (${fetched.error}). Try pasting the direct product link.`,
      })
    }
    const { html, finalUrl } = fetched

    if (!html || html.length < 500) {
      return reply.status(422).send({ error: 'Page returned empty content.' })
    }

    const pageText = extractRelevantText(html)
    // A real product page's stripped text runs into the thousands of chars;
    // anything this short is almost always a bot-detection/interstitial page
    // (e.g. Amazon's "automated access" block) rather than the real listing.
    if (pageText.length < 400) {
      return reply.status(422).send({
        error: "Couldn't read this page's content — the store may be blocking automated requests. Please fill in details manually.",
      })
    }
    // Pulled directly via regex, not asked of Claude — Claude only ever sees
    // stripped text, not raw HTML, so it can't reliably find an <img> or
    // og:image tag itself. og:image is how virtually every e-commerce site
    // declares its canonical product photo.
    const imageUrl = extractOgImage(html)
    const jsonLd = extractJsonLd(html)
    const asinMatch = finalUrl.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/)
    extractEmbeddedFacts(html, jsonLd, asinMatch?.[1])

    try {
      const raw = await askClaude(`
Extract product details from this e-commerce page. Return ONLY valid JSON, no explanation.
If a value isn't clearly present in the text below, use null for it — never guess, estimate, or invent a number.
{
  "name": "full product name with variant/storage/color",
  "brand": "brand name or null",
  "currentPrice": number in INR or null,
  "originalPrice": number in INR or null,
  "rating": number 0-5 or null,
  "reviewCount": number or null,
  "description": "1-2 sentence summary",
  "suggestedCategory": "one of: Mobiles/Laptops/Electronics/Audio/Smart Watches/Home Appliances/Kitchen/Fashion/Beauty/Sports/Books/Toys/Furniture",
  "overview": ["4-8 short scannable bullet points of product highlights/features — material, fit, key specs, use case. Different wording from the description, not a repeat of it. Empty array if not enough info."],
  "specifications": { "Brand, Material, Fit, Pattern, Capacity, etc — whichever 4-10 key/value pairs are relevant to THIS product's category. Empty object if not enough info.": "" },
  "variants": [{ "type": "Color, Size, Storage, RAM, Capacity, etc — only types that ACTUALLY have multiple selectable options shown on this specific page (e.g. a size chart, color swatches). Omit entirely if the page only shows one fixed option or none.", "values": ["each distinct option found, e.g. \"Black\", \"M\", \"128GB\""] }]
}

${pageText}`)

      const extracted = parseJsonFromClaude(raw)

      // Structured data from the page itself beats the model's reading of
      // scraped text — override whenever schema.org gave us a real number.
      if (jsonLd.currentPrice)  extracted.currentPrice  = jsonLd.currentPrice
      if (jsonLd.originalPrice) extracted.originalPrice = jsonLd.originalPrice
      if (jsonLd.rating)        extracted.rating        = jsonLd.rating
      if (jsonLd.reviewCount)   extracted.reviewCount   = jsonLd.reviewCount

      // Myntra sizes live only in raw <script> JSON the AI never sees —
      // add them (or replace whatever guess the AI made for "Size").
      const myntraSizes = extractMyntraSizes(html)
      if (myntraSizes.length > 1) {
        const variants = Array.isArray(extracted.variants) ? extracted.variants as { type: string; values: string[] }[] : []
        const withoutSize = variants.filter((v) => v.type?.toLowerCase() !== 'size')
        extracted.variants = [...withoutSize, { type: 'Size', values: myntraSizes }]
      }

      // Same idea for Amazon's variant dropdown (color/configuration/etc) —
      // it's plain JSON in the raw HTML, not visible in the stripped text
      // Claude reads, so the AI alone can never see it and just leaves
      // variants empty for anything Amazon-sourced that has real options.
      const amazonVariants = extractAmazonVariants(html)
      if (amazonVariants.length) {
        const existing = Array.isArray(extracted.variants) ? extracted.variants as { type: string; values: string[] }[] : []
        const amazonTypes = new Set(amazonVariants.map((v) => v.type.toLowerCase()))
        const keptExisting = existing.filter((v) => !amazonTypes.has(v.type?.toLowerCase()))
        extracted.variants = [...keptExisting, ...amazonVariants]
      }

      // Correct a generic "Electronics" guess to a more specific category
      // (Audio, Mobiles, Laptops, Smart Watches) when the product name
      // clearly says so — see inferCategoryFromName for why this can't be
      // left to the AI alone on weaker fallback models.
      const inferredCategory = inferCategoryFromName(
        typeof extracted.name === 'string' ? extracted.name : undefined,
        typeof extracted.suggestedCategory === 'string' ? extracted.suggestedCategory : undefined
      )
      if (inferredCategory) extracted.suggestedCategory = inferredCategory

      // The AI sometimes just echoes the prompt's own placeholder text back
      // instead of writing real content (seen from a weaker fallback model)
      // — catch and null it out rather than saving literal instruction text
      // as if it were a real product description. A different failure mode
      // from the same root cause: instead of writing anything at all, the
      // model copies a chunk of the page's own site-navigation chrome
      // ("Delivering to <city>", the category mega-menu list, etc) that
      // happened to be near the product info in the scraped text.
      const NON_DESCRIPTION_PATTERNS = [
        /^\d-\d sentence summary$/i,
        /delivering to .{0,40} update location/i,
        /select the department you want to search in/i,
        /skip to main content/i,
      ]
      if (typeof extracted.description === 'string' && NON_DESCRIPTION_PATTERNS.some((re) => re.test(extracted.description as string))) {
        extracted.description = null
      }

      // MRP/original price can never be lower than the current selling
      // price — when the page's structured data and scraped text disagree
      // (e.g. a stale JSON-LD price next to a live discounted price), swap
      // rather than silently keep an impossible "original < current" pair.
      if (extracted.originalPrice && extracted.currentPrice && extracted.originalPrice < extracted.currentPrice) {
        const swapped = extracted.originalPrice
        extracted.originalPrice = extracted.currentPrice
        extracted.currentPrice = swapped
      }

      if (!extracted.name && !extracted.currentPrice) {
        return reply.status(422).send({
          error: "Couldn't read this page's content — the store may be blocking automated requests. Please fill in details manually.",
        })
      }
      if (imageUrl) extracted.imageUrl = imageUrl
      return reply.send({ success: true, finalUrl, extracted, model: currentModel() })
    } catch (err: any) {
      const detail: string = err?.message || ''
      if (detail.includes('401') || /invalid_api_key|invalid api key/i.test(detail)) {
        return reply.status(502).send({
          error: 'AI extraction is unavailable: the Groq API key is missing or invalid. Please fill in details manually, or check GROQ_API_KEY.',
          detail,
        })
      }
      if (detail.includes('429') || /rate.?limit/i.test(detail)) {
        return reply.status(502).send({
          error: 'AI extraction is temporarily rate-limited. Please try again shortly, or fill in details manually.',
          detail,
        })
      }
      return reply.status(422).send({
        error: 'Could not find product details on this page. Please fill in details manually.',
        detail,
      })
    }
  })
}