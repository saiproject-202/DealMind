// EarnKaro link conversion — converts plain store URLs into commission-earning links
// Docs: https://earnkaro.com (Dashboard → API)
// Add to .env: EARNKARO_API_KEY=your_key_here

const EARNKARO_API = 'https://ekaro-api.affiliaters.in/api/converter/public'

interface EarnKaroResponse {
  success: number
  data?: string   // converted tracking URL
  message?: string
}

/**
 * Converts a plain product URL (Amazon, Flipkart, Myntra, etc.)
 * into a commission-earning EarnKaro tracking link.
 *
 * Falls back to the original URL if:
 *   - No API key configured
 *   - EarnKaro API call fails
 *   - Store isn't supported by EarnKaro
 */
export async function convertToEarnKaroLink(storeUrl: string): Promise<{
  url: string
  converted: boolean
  reason?: string
}> {
  const apiKey = process.env.EARNKARO_API_KEY

  if (!apiKey) {
    console.log('💰 EarnKaro: no API key configured — using plain URL (no commission)')
    return { url: storeUrl, converted: false, reason: 'EARNKARO_API_KEY is not set' }
  }

  try {
    const res = await fetch(EARNKARO_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey,
      },
      body: JSON.stringify({ deal: storeUrl }),
      // EarnKaro responds in under a second for supported stores, but can take
      // up to ~30s before reporting an unsupported store — give it real room.
      signal: AbortSignal.timeout(25000),
    })

    const data = await res.json() as EarnKaroResponse

    // Quirk: EarnKaro returns success:1 even for unsupported stores, with a
    // human-readable error sentence sitting in `data` instead of a URL — so
    // a truthy `data.data` alone isn't proof of a real tracking link.
    const isRealUrl = typeof data.data === 'string' && /^https?:\/\//i.test(data.data)

    if (data.success === 1 && isRealUrl) {
      console.log(`💰 EarnKaro: converted link successfully`)
      return { url: data.data as string, converted: true }
    } else {
      const reason = (data.success === 1 ? data.data : data.message) || `unexpected response (HTTP ${res.status})`
      console.log(`💰 EarnKaro: conversion failed (${reason}) — using plain URL`)
      return { url: storeUrl, converted: false, reason }
    }
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError'
    console.error('💰 EarnKaro: API error —', err)
    return {
      url: storeUrl,
      converted: false,
      reason: timedOut ? 'EarnKaro took too long to respond (>25s)' : (err instanceof Error ? err.message : 'network error'),
    }
  }
}