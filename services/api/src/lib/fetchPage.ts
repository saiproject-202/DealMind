// Hardened page-fetching pipeline — shared by admin-extract.routes.ts (AI
// Auto Extract) and price-refresh.ts (daily worker) so both go through the
// exact same reliable path instead of two implementations drifting apart.
import * as https from 'node:https'
import * as http from 'node:http'

export const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-IN,en;q=0.9',
}

// Flipkart's and AJIO's bot walls need the fuller "real browser" header set
// (sec-ch-ua, sec-fetch-*, upgrade-insecure-requests) to let a plain product
// page through — confirmed 403 on every attempt without them, and confirmed
// fixed (200, real page) with them on both sites. But those SAME extra
// headers trip Amazon's bot detection instead (returns 200 with its generic
// "Amazon.in" interstitial page, not the real product) — so this can't be
// one global header set. Chosen per-domain in headersFor() below.
//
// Meesho was also tested and remains 403 even with this richer set — its
// bot wall appears to need more than header spoofing (likely a JS
// challenge), which a raw HTTP client can't clear. That would need a
// headless-browser fetch path, a bigger change than this header fix.
const RICH_BROWSER_HEADERS = {
  ...FETCH_HEADERS,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Encoding': 'identity',
  'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
  'sec-fetch-user': '?1',
  'upgrade-insecure-requests': '1',
}

function headersFor(url: string): Record<string, string> {
  try {
    const host = new URL(url).hostname
    if (/flipkart\.com$|fkrt\.co$|fkrt\.it$|ajio\.com$/.test(host)) return RICH_BROWSER_HEADERS
  } catch {
    // fall through to default
  }
  return FETCH_HEADERS
}

// Affiliate/URL-shortener links (EarnKaro, Cuelinks, bit.ly, ...) often chain
// through several redirects, and one hop in the middle may itself block bare
// server-side fetches (bot detection) — but the real destination is usually
// sitting right there in that hop's own query string (?dl=, ?url=, ?u=...).
// Pulling it out lets us skip the blocked hop entirely instead of failing.
export function findEmbeddedUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    for (const value of parsed.searchParams.values()) {
      const candidate = /^https?:\/\//i.test(value) ? value : decodeURIComponent(value)
      if (/^https?:\/\//i.test(candidate)) return candidate
    }
  } catch {
    // not a valid URL / not encoded — nothing to extract
  }
  return null
}

// Node's built-in `fetch` (undici) gets a distinct TLS/HTTP fingerprint that
// some sites' bot detection (observed on Amazon) blocks even with identical
// headers — while Node's legacy `https`/`http` client sails through. So page
// fetches go through this raw client instead of `fetch`.
function rawGetOnce(url: string): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https:') ? https : http
    // `agent: false` forces a brand-new TCP+TLS connection per request rather
    // than reusing a pooled one — some bot walls (observed on Flipkart) seem
    // to flag probabilistically per-connection, so a fresh handshake gives a
    // fresh chance rather than inheriting a possibly-flagged reused socket.
    const req = lib.get(url, { headers: headersFor(url), timeout: 10000, agent: false }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve({
        status: res.statusCode || 0,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf-8'),
      }))
    })
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', reject)
  })
}

// Some bot walls appear to block probabilistically rather than deterministically
// (e.g. Flipkart let a fresh one-off request through while rejecting others with
// identical headers) — one retry recovers most of those without much added latency.
async function rawGet(url: string): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  const first = await rawGetOnce(url)
  if (first.status >= 200 && first.status < 300) return first
  if ([301, 302, 303, 307, 308, 404].includes(first.status)) return first
  try {
    return await rawGetOnce(url)
  } catch {
    return first
  }
}

export type FetchPageResult = { html: string; finalUrl: string } | { error: string }

// Resolves any URL down to real page HTML — no domain allowlist. Follows
// redirects manually (rather than `redirect: 'follow'`) so that a blocked or
// dead hop can be recovered from via findEmbeddedUrl() instead of failing
// the whole chain.
export async function fetchProductPage(startUrl: string): Promise<FetchPageResult> {
  let url = startUrl
  const visited = new Set<string>()

  for (let hop = 0; hop < 6; hop++) {
    if (visited.has(url)) return { error: 'redirect loop detected' }
    visited.add(url)

    try {
      const res = await rawGet(url)

      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const location = res.headers.location
        if (!location) return { error: 'redirect with no destination' }
        const nextUrl = new URL(location, url).toString()
        url = findEmbeddedUrl(nextUrl) || nextUrl
        continue
      }

      if (res.status === 404) return { error: 'not_found' }
      if (res.status < 200 || res.status >= 300) {
        // This hop refused us (often bot detection) — see if it was itself
        // just a redirector carrying the real destination in its own query string.
        const embedded = findEmbeddedUrl(url)
        if (embedded && embedded !== url) { url = embedded; continue }
        return { error: `HTTP ${res.status}` }
      }

      return { html: res.body, finalUrl: url }
    } catch {
      const embedded = findEmbeddedUrl(url)
      if (embedded && embedded !== url) { url = embedded; continue }
      return { error: 'fetch failed' }
    }
  }
  return { error: 'too many redirects' }
}
