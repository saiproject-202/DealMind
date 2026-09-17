// Price Refresh — re-fetches a listing's store page and asks Claude
// to extract the current price. Only writes a new price_history row
// when the price actually changed (avoids flooding the chart with
// duplicate identical points).

import prisma from './prisma'
import { askClaude, parseJsonFromClaude } from './claude'
import { fetchProductPage } from './fetchPage'

interface PriceExtraction {
  currentPrice: number | null
  isAvailable:  boolean
}

async function fetchAndExtractPrice(url: string): Promise<PriceExtraction | null> {
  try {
    // Same hardened fetch pipeline as AI Auto Extract — node:https instead
    // of undici (avoids Amazon's fingerprint block), redirect-chain
    // resolution with embedded-URL fallback, one retry on transient blocks.
    const fetched = await fetchProductPage(url)
    if ('error' in fetched) return null

    const html = fetched.html
    // Strip tags/scripts to keep the Claude prompt small and cheap —
    // we only need the price, not full page structure.
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .slice(0, 6000) // first 6000 chars usually contains price + availability

    const raw = await askClaude(`
Extract the current selling price from this Indian e-commerce product page text.
Return ONLY valid JSON:
{
  "currentPrice": price in INR as a plain number (no symbols/commas), or null if not found,
  "isAvailable": true if the product appears in stock, false if "out of stock" / "currently unavailable" is mentioned
}

Page text: ${text}`, 200)

    const parsed = parseJsonFromClaude(raw)
    return {
      currentPrice: typeof parsed.currentPrice === 'number' ? parsed.currentPrice : null,
      isAvailable:  parsed.isAvailable !== false,
    }
  } catch (err) {
    console.error(`Price refresh fetch failed for ${url}:`, (err as Error).message)
    return null
  }
}

/**
 * Refreshes one listing's price. Returns whether the price changed.
 */
export async function refreshListingPrice(listingId: string): Promise<{
  refreshed: boolean
  priceChanged: boolean
  newPrice?: number
}> {
  const listing = await prisma.productListing.findUnique({ where: { id: listingId } })
  if (!listing) return { refreshed: false, priceChanged: false }

  const extraction = await fetchAndExtractPrice(listing.storeUrl)

  // Always bump lastSyncedAt even on failure — prevents this listing
  // from being picked first again immediately (fair rotation)
  await prisma.productListing.update({
    where: { id: listingId },
    data:  { lastSyncedAt: new Date() },
  })

  if (!extraction || extraction.currentPrice === null) {
    return { refreshed: false, priceChanged: false }
  }

  const oldPrice = Number(listing.currentPrice)
  const newPrice = extraction.currentPrice
  const priceChanged = Math.abs(oldPrice - newPrice) >= 1 // ignore sub-rupee noise

  if (priceChanged) {
    await prisma.$transaction([
      prisma.productListing.update({
        where: { id: listingId },
        data:  { currentPrice: newPrice, isAvailable: extraction.isAvailable },
      }),
      prisma.priceHistory.create({
        data: { listingId, price: newPrice, recordedAt: new Date() },
      }),
    ])
  } else if (extraction.isAvailable !== listing.isAvailable) {
    // Availability changed even if price didn't — still worth recording
    await prisma.productListing.update({
      where: { id: listingId },
      data:  { isAvailable: extraction.isAvailable },
    })
  }

  return { refreshed: true, priceChanged, newPrice }
}