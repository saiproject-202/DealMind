// Price Refresh Worker — daily cron that keeps price_history alive.
// Batched to control Claude API cost and avoid hammering merchant sites.

import prisma from '../lib/prisma'
import { refreshListingPrice } from '../lib/price-refresh'

const BATCH_SIZE = 30 // listings refreshed per run — tune based on your Claude budget

export async function runPriceRefresh() {
  console.log('💹 Price refresh: running...')

  try {
    // Oldest-synced listings first — fair rotation, everything gets
    // refreshed eventually even with a small daily batch
    const listings = await prisma.productListing.findMany({
      where: { isAvailable: true },
      orderBy: { lastSyncedAt: 'asc' },
      take: BATCH_SIZE,
      select: { id: true },
    })

    let changed = 0
    for (const listing of listings) {
      const result = await refreshListingPrice(listing.id)
      if (result.priceChanged) changed++
      // Small delay between requests — polite to merchant servers
      await new Promise(r => setTimeout(r, 1500))
    }

    console.log(`💹 Price refresh: done (${listings.length} checked, ${changed} price(s) changed)`)
  } catch (err) {
    console.error('Price refresh worker failed:', err)
  }
}

export function startPriceRefresh() {
  console.log('💹 Price refresh: started (runs daily)')
  runPriceRefresh() // once at startup
  setInterval(runPriceRefresh, 24 * 60 * 60 * 1000)
}