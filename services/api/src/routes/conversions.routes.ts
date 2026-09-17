import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import prisma from '../lib/prisma'
import { requireAdmin } from './admin-auth.routes'
import { randomUUID } from 'crypto'

// ── Parses EarnKaro's typical CSV export format ────────────────
// Expected columns (EarnKaro's actual export column names vary —
// this handles the common ones; extend the map if yours differ):
//   Order Date, Store, Order ID, Sale Amount, Commission, Status
interface CsvRow {
  orderDate?: string
  store?: string
  orderId?: string
  saleAmount?: string
  commission?: string
  status?: string
}

function parseCsv(text: string): CsvRow[] {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
  const rows: CsvRow[] = []

  const findCol = (candidates: string[]) =>
    headers.findIndex(h => candidates.some(c => h.includes(c)))

  const dateIdx   = findCol(['date'])
  const storeIdx  = findCol(['store', 'merchant'])
  const orderIdx  = findCol(['order id', 'order_id', 'orderid'])
  const saleIdx   = findCol(['sale', 'order value', 'order amount'])
  const commIdx   = findCol(['commission', 'earning'])
  const statusIdx = findCol(['status'])

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''))
    if (cols.length < 2) continue

    rows.push({
      orderDate:  dateIdx   >= 0 ? cols[dateIdx]   : undefined,
      store:      storeIdx  >= 0 ? cols[storeIdx]  : undefined,
      orderId:    orderIdx  >= 0 ? cols[orderIdx]  : undefined,
      saleAmount: saleIdx   >= 0 ? cols[saleIdx]   : undefined,
      commission: commIdx   >= 0 ? cols[commIdx]   : undefined,
      status:     statusIdx >= 0 ? cols[statusIdx] : undefined,
    })
  }

  return rows
}

function cleanAmount(raw?: string): number {
  if (!raw) return 0
  const num = parseFloat(raw.replace(/[₹,\s]/g, ''))
  return isNaN(num) ? 0 : num
}

export default async function conversionsRoutes(server: FastifyInstance) {

  // ── POST /api/admin/conversions/import ───────────────────────
  server.post('/conversions/import', { onRequest: [requireAdmin] }, async (request, reply) => {
    const schema = z.object({ csvText: z.string().min(10) })
    const result = schema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ error: 'CSV content is required.' })
    }

    const rows = parseCsv(result.data.csvText)
    if (rows.length === 0) {
      return reply.status(400).send({ error: 'Could not parse any rows. Check the CSV format.' })
    }

    const importBatchId = randomUUID()
    let imported = 0
    let matched  = 0
    let skipped  = 0

    for (const row of rows) {
      const orderValue       = cleanAmount(row.saleAmount)
      const commissionAmount = cleanAmount(row.commission)

      if (orderValue === 0 && commissionAmount === 0) {
        skipped++
        continue
      }

      // Skip if this exact order was already imported (dedup by orderId)
      if (row.orderId) {
        const exists = await prisma.affiliateConversion.findFirst({
          where: { orderId: row.orderId },
        })
        if (exists) { skipped++; continue }
      }

      // Try to match to a real click: same store, closest click in time
      // within a 30-day window before the order date (typical browse-to-buy gap)
      let matchedClick: { id: string; userId: string | null; listingId: string } | null = null

      if (row.store && row.orderDate) {
        const orderDate = new Date(row.orderDate)
        if (!isNaN(orderDate.getTime())) {
          const windowStart = new Date(orderDate.getTime() - 30 * 24 * 60 * 60 * 1000)

          const candidate = await prisma.affiliateClick.findFirst({
            where: {
              store:     { name: { contains: row.store, mode: 'insensitive' } },
              clickedAt: { gte: windowStart, lte: orderDate },
            },
            orderBy: { clickedAt: 'desc' }, // closest click before the order
          })

          if (candidate) {
            matchedClick = {
              id: candidate.id,
              userId: candidate.userId,
              listingId: candidate.listingId,
            }
          }
        }
      }

      const status = (row.status || '').toLowerCase().includes('reject') ? 'rejected'
        : (row.status || '').toLowerCase().includes('confirm') ? 'confirmed'
        : 'pending'

      const conversion = await prisma.affiliateConversion.create({
        data: {
          clickId:          matchedClick?.id || null,
          listingId:        matchedClick?.listingId || null,
          userId:           matchedClick?.userId || null,
          orderId:          row.orderId || null,
          orderValue:       orderValue,
          commissionAmount: commissionAmount,
          status,
          source:           'earnkaro',
          rawRow:           row as any,
          importBatchId,
        },
      })

      // If matched to a real user + confirmed, create purchase history
      if (matchedClick?.userId && status === 'confirmed') {
        await prisma.purchaseHistory.create({
          data: {
            userId:       matchedClick.userId,
            conversionId: conversion.id,
            listingId:    matchedClick.listingId,
            orderValue:   orderValue,
            savings:      0, // computed later once we track original vs paid price
          },
        })
        matched++
      }

      imported++
    }

    return reply.send({
      success: true,
      importBatchId,
      summary: {
        totalRows: rows.length,
        imported,
        matchedToUsers: matched,
        skipped,
      },
      message: `Imported ${imported} conversion(s), ${matched} matched to real users.`,
    })
  })

  // ── GET /api/admin/conversions ────────────────────────────────
  server.get('/conversions', { onRequest: [requireAdmin] }, async (request, reply) => {
    const { page = '1', limit = '30' } = request.query as Record<string, string>
    const skip = (Number(page) - 1) * Number(limit)

    const [conversions, total, totals] = await Promise.all([
      prisma.affiliateConversion.findMany({
        skip, take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { phone: true, displayName: true } } },
      }),
      prisma.affiliateConversion.count(),
      prisma.affiliateConversion.aggregate({
        _sum: { commissionAmount: true, orderValue: true },
        where: { status: 'confirmed' },
      }),
    ])

    return reply.send({
      conversions,
      total,
      page: Number(page),
      totalCommission: totals._sum.commissionAmount || 0,
      totalOrderValue: totals._sum.orderValue || 0,
    })
  })
}