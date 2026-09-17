import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import prisma from '../lib/prisma'
import { requireAdmin } from './admin-auth.routes'
import { convertToEarnKaroLink } from '../lib/earnkaro'
import { awardPoints } from "../lib/points";
import { recomputeConfidence } from '../lib/coupon-confidence'
import { createTrackedListing } from '../lib/trackedListing'
import { joinChannel } from '../lib/telegramClient'
import { importChannelHistory } from '../workers/telegram-worker'
import { computeHomepageSections } from '../lib/homepageSections'

export default async function adminRoutes(server: FastifyInstance) {

  // ── GET /api/admin/stats ─────────────────────────────────────
  server.get('/stats', { onRequest: [requireAdmin] }, async (_req, reply) => {
    const [totalUsers, totalProducts, totalDeals, pendingQueue, totalClicks, homepageSections] =
      await Promise.all([
        prisma.user.count(),
        // Match the Products page's own count exactly — excluding
        // soft-deleted (status: 'removed') rows. Previously counted
        // everything, so this drifted from what the Products page showed
        // any time a product was removed (e.g. 331 here vs 291 there).
        prisma.product.count({ where: { status: { not: 'removed' } } }),
        prisma.deal.count({ where: { status: 'live' } }),
        prisma.approvalQueue.count({ where: { status: 'pending' } }),
        prisma.affiliateClick.count(),
        computeHomepageSections(100),
      ])
    // "Live Deals" now means exactly what a customer sees on the homepage
    // right now — the union of every section's genuinely-qualifying
    // products — not the disconnected Deal-table count (totalDeals, kept
    // below for anything else still reading it).
    const liveOnHomepageIds = new Set<string>()
    for (const key in homepageSections) {
      for (const p of (homepageSections as Record<string, { id: string }[]>)[key]) liveOnHomepageIds.add(p.id)
    }
    return reply.send({
      stats: {
        totalUsers, totalProducts, totalDeals, pendingQueue, totalClicks,
        totalRevenue: 0, liveOnHomepage: liveOnHomepageIds.size,
      },
    })
  })

  // ── STORES ───────────────────────────────────────────────────
  server.get('/stores', { onRequest: [requireAdmin] }, async (_req, reply) => {
    const stores = await prisma.store.findMany({ orderBy: { name: 'asc' } })
    return reply.send({ stores })
  })

  server.post('/stores', { onRequest: [requireAdmin] }, async (request, reply) => {
    const schema = z.object({
      name: z.string().min(1), baseUrl: z.string().url(),
      affiliateNetwork: z.string().default('earnkaro'),
      affiliateTag: z.string().optional(), logoUrl: z.string().optional(),
    })
    const r = schema.safeParse(request.body)
    if (!r.success) return reply.status(400).send({ error: 'Invalid store data.' })
    const store = await prisma.store.create({ data: { ...r.data, isActive: true } })
    return reply.send({ success: true, store })
  })

  server.put('/stores/:id', { onRequest: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const schema = z.object({ affiliateTag: z.string().optional(), affiliateNetwork: z.string().optional(), isActive: z.boolean().optional() })
    const r = schema.safeParse(request.body)
    if (!r.success) return reply.status(400).send({ error: 'Invalid data.' })
    const store = await prisma.store.update({ where: { id }, data: r.data })
    return reply.send({ success: true, store })
  })

    server.delete('/stores/:id', { onRequest: [requireAdmin] }, async (request, reply) => {
      const { id } = request.params as { id: string }
      try {
        await prisma.store.delete({ where: { id } })
        return reply.send({ success: true })
      } catch (err: any) {
        if (err?.code === 'P2025') {
          return reply.status(404).send({ error: 'Store not found.' })
        }
        return reply.status(500).send({ error: 'Failed to delete store.' })
      }
    })

  // ── GET /api/admin/earnkaro-status — presence check only, never exposes the key
  server.get('/earnkaro-status', { onRequest: [requireAdmin] }, async (_req, reply) => {
    return reply.send({ configured: !!process.env.EARNKARO_API_KEY })
  })

  // ── POST /api/admin/coupons/:couponId/reports/:userId/reset ──
  // Lets a user vote again on a coupon by soft-invalidating their prior
  // active report(s) — rows are flipped isActive:false, never deleted,
  // so the full vote history stays intact for fraud analytics.
  server.post('/coupons/:couponId/reports/:userId/reset', { onRequest: [requireAdmin] }, async (request, reply) => {
    const { couponId, userId } = request.params as { couponId: string; userId: string }
    const { adminId } = (request as any).admin

    const result = await prisma.couponReport.updateMany({
      where: { couponId, userId, isActive: true },
      data:  { isActive: false, resetByAdminId: adminId, resetAt: new Date() },
    })
    if (result.count === 0) {
      return reply.status(404).send({ error: 'No active vote found for this user on this coupon.' })
    }

    const { confidence, status } = await recomputeConfidence(couponId)
    return reply.send({ success: true, confidence, status })
  })


  // ── PRODUCTS ─────────────────────────────────────────────────
  // take: 50 is a page-size cap for the admin list view, not the real
  // catalog size — total is returned separately so the UI can say
  // "showing 50 of 288" instead of silently implying only 50 exist.
  server.get('/products', { onRequest: [requireAdmin] }, async (_req, reply) => {
    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where: { status: { not: 'removed' } },
        include: { category: true, listings: { include: { store: true } } },
        orderBy: { createdAt: 'desc' }, take: 50,
      }),
      prisma.product.count({ where: { status: { not: 'removed' } } }),
    ])
    return reply.send({ products, total })
  })

  // ── GET /api/admin/products/:id ─────────────────────────────────
  // Full detail view for the admin product-detail/edit page — includes
  // category, all listings (with store), and variants.
  server.get('/products/:id', { onRequest: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        listings: { include: { store: true }, orderBy: { createdAt: 'asc' } },
        variants: { orderBy: { sortOrder: 'asc' } },
      },
    })
    if (!product) return reply.status(404).send({ error: 'Product not found.' })
    return reply.send({ product })
  })

  // ── PATCH /api/admin/products/:id ───────────────────────────────
  // Full edit — used by the product-detail page's manual-correction form
  // and by "Re-extract" (which pre-fills the same form with fresh AI data,
  // then the admin reviews and submits through this same endpoint).
  server.patch('/products/:id', { onRequest: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const schema = z.object({
      name: z.string().min(2).optional(), brand: z.string().nullable().optional(),
      categoryId: z.string().uuid().optional(), description: z.string().nullable().optional(),
      imageUrl: z.string().url().optional(),
      variants: z.array(z.object({ type: z.string().min(1), values: z.array(z.string().min(1)) })).optional(),
      // Primary listing (listings[0]) fields
      listingId: z.string().uuid().optional(),
      currentPrice: z.number().positive().optional(), originalPrice: z.number().positive().nullable().optional(),
      storeUrl: z.string().url().optional(), affiliateUrl: z.string().url().nullable().optional(),
      rating: z.number().min(0).max(5).nullable().optional(), reviewCount: z.number().int().nonnegative().nullable().optional(),
    })
    const r = schema.safeParse(request.body)
    if (!r.success) return reply.status(400).send({ error: 'Invalid product data.', details: r.error.issues })
    const d = r.data

    const existing = await prisma.product.findUnique({ where: { id }, include: { listings: true } })
    if (!existing) return reply.status(404).send({ error: 'Product not found.' })

    const product = await prisma.$transaction(async (tx) => {
      const prod = await tx.product.update({
        where: { id },
        data: {
          name: d.name, brand: d.brand === null ? null : d.brand,
          categoryId: d.categoryId, description: d.description === null ? null : d.description,
          images: d.imageUrl ? [d.imageUrl] : undefined,
        },
      })

      if (d.variants) {
        await tx.productVariant.deleteMany({ where: { productId: id } })
        const rows = d.variants.flatMap((v, typeIdx) =>
          v.values.map((value, valueIdx) => ({
            productId: id, type: v.type, value, sortOrder: typeIdx * 100 + valueIdx,
          }))
        )
        if (rows.length) await tx.productVariant.createMany({ data: rows, skipDuplicates: true })
      }

      const listingId = d.listingId || existing.listings[0]?.id
      if (listingId) {
        const listingUpdate: Record<string, any> = {}
        if (d.currentPrice !== undefined) listingUpdate.currentPrice = d.currentPrice
        if (d.originalPrice !== undefined) listingUpdate.originalPrice = d.originalPrice
        if (d.storeUrl !== undefined) listingUpdate.storeUrl = d.storeUrl
        if (d.affiliateUrl !== undefined) listingUpdate.affiliateUrl = d.affiliateUrl
        if (d.rating !== undefined) listingUpdate.rating = d.rating
        if (d.reviewCount !== undefined) listingUpdate.reviewCount = d.reviewCount

        if (d.currentPrice !== undefined || d.originalPrice !== undefined) {
          const current = d.currentPrice ?? Number(existing.listings.find((l) => l.id === listingId)?.currentPrice)
          const original = d.originalPrice ?? Number(existing.listings.find((l) => l.id === listingId)?.originalPrice)
          if (original && current) listingUpdate.discountPct = Math.round(((original - current) / original) * 100)
        }

        if (Object.keys(listingUpdate).length > 0) {
          await tx.productListing.update({ where: { id: listingId }, data: listingUpdate })
        }
        if (d.currentPrice !== undefined) {
          await tx.priceHistory.create({ data: { listingId, price: d.currentPrice, recordedAt: new Date() } })
        }
      }

      return prod
    })

    const full = await prisma.product.findUnique({
      where: { id: product.id },
      include: { category: true, listings: { include: { store: true } }, variants: { orderBy: { sortOrder: 'asc' } } },
    })
    return reply.send({ success: true, product: full })
  })

  // ── DELETE /api/admin/products/:id ──────────────────────────────
  // Soft delete: ProductListing is referenced by affiliate clicks/conversions/
  // purchase history with no cascade rule, so a hard delete would violate FK
  // constraints and destroy real revenue history. Instead we mark the product
  // removed and hide its listings — /api/deals/homepage already filters on
  // isAvailable, so this alone takes it off the homepage immediately.
  server.delete('/products/:id', { onRequest: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const product = await prisma.$transaction(async (tx) => {
      const prod = await tx.product.update({
        where: { id },
        data: { status: 'removed' },
      })
      await tx.productListing.updateMany({
        where: { productId: id },
        data: { isAvailable: false },
      })
      return prod
    }).catch(() => null)

    if (!product) return reply.status(404).send({ error: 'Product not found.' })
    return reply.send({ success: true })
  })

  server.post('/products', { onRequest: [requireAdmin] }, async (request, reply) => {
    const schema = z.object({
      name: z.string().min(2), brand: z.string().optional(),
      categoryId: z.string().uuid(), storeId: z.string().uuid(),
      currentPrice: z.number().positive(), originalPrice: z.number().positive(),
      storeUrl: z.string().url(), affiliateUrl: z.string().optional(),
      couponCode: z.string().optional(), rating: z.number().min(0).max(5).optional(),
      reviewCount: z.number().optional(), description: z.string().optional(),
      imageUrl: z.string().url().optional(),
      // e.g. [{ type: "Color", values: ["Black","Blue"] }, { type: "Size", values: ["S","M","L"] }]
      variants: z.array(z.object({ type: z.string().min(1), values: z.array(z.string().min(1)) })).optional(),
      // AI-generated Overview bullets + Specifications table, produced once
      // at Auto Extract time and stored — avoids re-asking the AI on every
      // product-page view. Manually-added products simply omit this; the
      // product page falls back to the plain description.
      overview: z.array(z.string()).optional(),
      specs: z.record(z.string(), z.string()).optional(),
    })
    const r = schema.safeParse(request.body)
    if (!r.success) return reply.status(400).send({ error: 'Invalid product data.', details: r.error.issues })
    const d = r.data

    const hasOverviewOrSpecs = (d.overview && d.overview.length > 0) || (d.specs && Object.keys(d.specs).length > 0)

    const product = await prisma.$transaction(async (tx) => {
      const prod = await tx.product.create({
        data: {
          name: d.name, brand: d.brand, categoryId: d.categoryId,
          images: d.imageUrl ? [d.imageUrl] : [], description: d.description,
          sourceType: 'admin', status: 'active',
          specifications: hasOverviewOrSpecs ? { overview: d.overview || [], specs: d.specs || {} } : undefined,
        },
      })
      const discountPct = Math.round(((d.originalPrice - d.currentPrice) / d.originalPrice) * 100)
      const listing = await tx.productListing.create({
        data: { productId: prod.id, storeId: d.storeId, currentPrice: d.currentPrice, originalPrice: d.originalPrice, discountPct, storeUrl: d.storeUrl, affiliateUrl: d.affiliateUrl || d.storeUrl, couponCode: d.couponCode, rating: d.rating, reviewCount: d.reviewCount, isAvailable: true, lastSyncedAt: new Date() },
      })
      await tx.priceHistory.create({ data: { listingId: listing.id, price: d.currentPrice, recordedAt: new Date() } })

      if (d.variants?.length) {
        const rows = d.variants.flatMap((v, typeIdx) =>
          v.values.map((value, valueIdx) => ({
            productId: prod.id, type: v.type, value, sortOrder: typeIdx * 100 + valueIdx,
          }))
        )
        if (rows.length) await tx.productVariant.createMany({ data: rows, skipDuplicates: true })
      }

      return prod
    })
    return reply.status(201).send({ success: true, product })
  })

  // ── POST /api/admin/generate-affiliate-link ────────────────────
  // Manually convert a plain store URL into an EarnKaro commission link —
  // used by the "Generate" button next to the affiliate link field.
  server.post('/generate-affiliate-link', { onRequest: [requireAdmin] }, async (request, reply) => {
    const schema = z.object({ url: z.string().url() })
    const r = schema.safeParse(request.body)
    if (!r.success) return reply.status(400).send({ error: 'A valid store URL is required.' })

    const { url, converted, reason } = await convertToEarnKaroLink(r.data.url)
    if (!converted) {
      return reply.status(502).send({
        error: `Could not generate an EarnKaro link (${reason || 'unknown reason'}). Check your EARNKARO_API_KEY is valid.`,
      })
    }
    return reply.send({ success: true, affiliateUrl: url })
  })

  // ── PATCH /api/admin/listings/:id/affiliate-url ─────────────────
  // Saves an affiliate link onto an existing listing — used by the
  // Products page's "Missing Affiliate Link" quick-fix modal.
  server.patch('/listings/:id/affiliate-url', { onRequest: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const schema = z.object({ affiliateUrl: z.string().url() })
    const r = schema.safeParse(request.body)
    if (!r.success) return reply.status(400).send({ error: 'A valid affiliate URL is required.' })

    const listing = await prisma.productListing.update({
      where: { id },
      data: { affiliateUrl: r.data.affiliateUrl },
    }).catch(() => null)

    if (!listing) return reply.status(404).send({ error: 'Listing not found.' })
    return reply.send({ success: true, listing })
  })

  // ── CATEGORIES ───────────────────────────────────────────────
  server.get('/categories', { onRequest: [requireAdmin] }, async (_req, reply) => {
    const categories = await prisma.category.findMany({ orderBy: { name: 'asc' } })
    return reply.send({ categories })
  })

  server.post('/categories', { onRequest: [requireAdmin] }, async (request, reply) => {
    const schema = z.object({ name: z.string().min(1), slug: z.string().min(1), icon: z.string().optional(), parentId: z.string().optional() })
    const r = schema.safeParse(request.body)
    if (!r.success) return reply.status(400).send({ error: 'Invalid category data.' })
    const category = await prisma.category.create({ data: r.data })
    return reply.send({ success: true, category })
  })

  // ── PATCH /api/admin/categories/:id/variant-types ───────────────
  // Sets which variant types (Color, Size, Storage, ...) apply to products
  // in this category — drives the dynamic fields on the Add Product form.
  server.patch('/categories/:id/variant-types', { onRequest: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const schema = z.object({ variantTypes: z.array(z.string().min(1)) })
    const r = schema.safeParse(request.body)
    if (!r.success) return reply.status(400).send({ error: 'variantTypes must be an array of strings.' })

    const category = await prisma.category.update({
      where: { id },
      data: { variantTypes: r.data.variantTypes },
    }).catch(() => null)

    if (!category) return reply.status(404).send({ error: 'Category not found.' })
    return reply.send({ success: true, category })
  })

  // ── USERS ────────────────────────────────────────────────────
  server.get('/users', { onRequest: [requireAdmin] }, async (request, reply) => {
    const { page = '1', limit = '20' } = request.query as Record<string, string>
    const skip = (Number(page) - 1) * Number(limit)
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        skip, take: Number(limit), orderBy: { createdAt: 'desc' },
        select: { id: true, phone: true, displayName: true, points: true, isVerified: true, createdAt: true, level: true, _count: { select: { deals: true, cartnotes: true } } },
      }),
      prisma.user.count(),
    ])
    return reply.send({ users, total, page: Number(page), limit: Number(limit) })
  })

  // ── APPROVAL QUEUE ───────────────────────────────────────────
  server.get('/queue', { onRequest: [requireAdmin] }, async (_req, reply) => {
    const rawQueue = await prisma.approvalQueue.findMany({
      where: { status: 'pending' },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      include: {
        deal: { include: { listing: { include: { product: true, store: true } } } },
      },
    })

    // Enrich with submission data (community) or post data (telegram) — the
    // admin UI needs structured channel/timestamp info, not just adminNotes
    // text, to build per-source tabs and per-channel filtering.
    const queue = await Promise.all(rawQueue.map(async (item) => {
      if (item.queueType === 'deal' && !item.dealId && item.referenceId) {
        const submission = await prisma.dealSubmission.findUnique({
          where: { id: item.referenceId },
          include: { user: { select: { id: true, phone: true, displayName: true, points: true, trustScore:
            true, isVerified: true, createdAt: true, level: true,
            _count: { select: { deals: true, cartnotes: true } },
          } } },
        })
        return { ...item, submission, telegramPost: null }
      }
      if (item.queueType === 'telegram' && !item.dealId && item.referenceId) {
        // messageId is a BigInt (Fastify's JSON serializer can't handle
        // those) — select explicit fields rather than the whole record.
        const telegramPost = await prisma.telegramPost.findUnique({
          where: { id: item.referenceId },
          select: {
            id: true, rawText: true, aiExtracted: true, confidenceScore: true, postedAt: true,
            channel: { select: { channelUsername: true, displayName: true } },
          },
        })
        return { ...item, submission: null, telegramPost }
      }
      return { ...item, submission: null, telegramPost: null }
    }))

    return reply.send({ queue, total: queue.length })
  })

  // ── APPROVE ──────────────────────────────────────────────────
  server.put('/queue/:id/approve', { onRequest: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const admin = (request as any).admin

    const queueItem = await prisma.approvalQueue.findUnique({ where: { id } })
    if (!queueItem) return reply.status(404).send({ error: 'Queue item not found.' })

    // Handle community deal submission
    if (queueItem.queueType === 'deal' && !queueItem.dealId && queueItem.referenceId) {
      const submission = await prisma.dealSubmission.findUnique({ where: { id: queueItem.referenceId } })

      if (submission?.aiExtracted && submission.submissionType === 'link') {
        const ex = submission.aiExtracted as Record<string, any>
        const storeUrl = submission.rawContent || ''

        const result = await createTrackedListing({
          ex, storeUrl, sourceType: 'community', submittedBy: submission.userId, approvedBy: admin.adminId, fallbackTitle: 'Community Deal',
        })

        if (result.outcome === 'duplicate') {
          await prisma.approvalQueue.update({ where: { id }, data: { status: 'approved', reviewedBy: admin.adminId, reviewedAt: new Date() } })
          await prisma.dealSubmission.update({ where: { id: submission.id }, data: { status: 'approved' } })
          return reply.send({ success: true, message: `Already tracking "${result.existingProductName}" from this store URL — not creating a duplicate.` })
        }

        if (result.outcome === 'created') {
          const { deal } = result
          await prisma.approvalQueue.update({ where: { id }, data: { status: 'approved', dealId: deal.id, reviewedBy: admin.adminId, reviewedAt: new Date() } })
          await prisma.dealSubmission.update({ where: { id: submission.id }, data: { status: 'approved', dealId: deal.id } })
          // Award points: +8 more (already got +2 for submitting = total 10)
          await awardPoints(submission.userId, 10, "deal_approved", deal.id)
          return reply.send({ success: true, message: 'Deal approved and published! User awarded 10 points.' })
        }

        // outcome === 'unresolvable' — no store/category match, or no real
        // price to track (e.g. a category/search-page link rather than a
        // genuine single-product deal). Marking it "approved" with no
        // explanation would look like it worked when nothing was created.
        if (result.outcome === 'unresolvable') {
          return reply.status(422).send({
            error: 'Could not create a tracked product — no valid store, category, or usable price was found. This link may point to a search/category page rather than a single product. Fix it manually or reject this submission.',
          })
        }
      }

      // Fallback: just mark as approved
      await prisma.approvalQueue.update({ where: { id }, data: { status: 'approved', reviewedBy: admin.adminId, reviewedAt: new Date() } })
      await prisma.dealSubmission.update({ where: { id: queueItem.referenceId }, data: { status: 'approved' } })
      return reply.send({ success: true, message: 'Approved.' })
    }

    // Handle Telegram-sourced deal — previously fell through this whole
    // handler doing nothing at all (queueType never matched 'deal', and
    // dealId is never set for Telegram posts), so approving one silently
    // never created a product, listing, or price history row.
    if (queueItem.queueType === 'telegram' && !queueItem.dealId && queueItem.referenceId) {
      const post = await prisma.telegramPost.findUnique({ where: { id: queueItem.referenceId } })

      if (post?.aiExtracted) {
        const ex = post.aiExtracted as Record<string, any>
        const storeUrl = ex.storeUrl || ''

        if (storeUrl) {
          const result = await createTrackedListing({
            ex, storeUrl, sourceType: 'telegram', approvedBy: admin.adminId, fallbackTitle: 'Telegram Deal',
          })

          if (result.outcome === 'duplicate') {
            await prisma.approvalQueue.update({ where: { id }, data: { status: 'approved', reviewedBy: admin.adminId, reviewedAt: new Date() } })
            await prisma.telegramPost.update({ where: { id: post.id }, data: { processStatus: 'approved' } })
            return reply.send({ success: true, message: `Already tracking "${result.existingProductName}" from this store URL — not creating a duplicate.` })
          }

          if (result.outcome === 'created') {
            const { deal } = result
            await prisma.approvalQueue.update({ where: { id }, data: { status: 'approved', dealId: deal.id, reviewedBy: admin.adminId, reviewedAt: new Date() } })
            await prisma.telegramPost.update({ where: { id: post.id }, data: { dealId: deal.id, processStatus: 'approved' } })
            return reply.send({ success: true, message: 'Telegram deal approved and now tracked.' })
          }

          // outcome === 'unresolvable' — same as above: don't mark this
          // "approved" when nothing was actually created. Most common cause:
          // the post's link is a category/search page (e.g. "70% off Brand X
          // Clothing" linking to a whole brand listing), which has no single
          // real price to track no matter how many times extraction retries.
          if (result.outcome === 'unresolvable') {
            return reply.status(422).send({
              error: 'Could not create a tracked product — no valid store/category/price was found. This is often a category or search-page link rather than one specific product. Reject this post, or fix it manually if it should be a real product.',
            })
          }
        }
      }

      // No usable store URL / extraction — can't create a trackable listing
      await prisma.approvalQueue.update({ where: { id }, data: { status: 'approved', reviewedBy: admin.adminId, reviewedAt: new Date() } })
      await prisma.telegramPost.update({ where: { id: queueItem.referenceId }, data: { processStatus: 'approved' } }).catch(() => {})
      return reply.send({ success: true, message: 'Approved (no product URL found — nothing to track).' })
    }

    // Handle existing deal approval
    if (queueItem.dealId) {
      await prisma.$transaction(async (tx) => {
        await tx.approvalQueue.update({ where: { id }, data: { status: 'approved', reviewedBy: admin.adminId, reviewedAt: new Date() } })
        await tx.deal.update({ where: { id: queueItem.dealId! }, data: { status: 'live', approvedBy: admin.adminId, approvedAt: new Date() } })
      })
      return reply.send({ success: true, message: 'Deal approved and published.' })
    }

    return reply.send({ success: true, message: 'Marked as approved.' })
  })

  // ── REJECT ───────────────────────────────────────────────────
  server.put('/queue/:id/reject', { onRequest: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const admin = (request as any).admin
    const { reason } = request.body as { reason?: string }

    const item = await prisma.approvalQueue.update({
      where: { id },
      data: { status: 'rejected', reviewedBy: admin.adminId, reviewedAt: new Date(), adminNotes: reason || '' },
    })

    if (item.queueType === 'deal' && item.referenceId) {
      await prisma.dealSubmission.update({ where: { id: item.referenceId }, data: { status: 'rejected' } }).catch(() => {})
    }

    return reply.send({ success: true, message: 'Deal rejected.' })
  })

  // ── TELEGRAM CHANNELS ────────────────────────────────────────
  server.get('/telegram/channels', { onRequest: [requireAdmin] }, async (_req, reply) => {
    const channels = await prisma.telegramChannel.findMany({ where: { deletedAt: null }, orderBy: { createdAt: 'desc' } })

    // Quality metrics computed live from real TelegramPost/Deal/Listing data
    // every call — no separate aggregate table to keep in sync or go stale.
    const enriched = await Promise.all(channels.map(async (ch) => {
      const posts = await prisma.telegramPost.findMany({ where: { channelId: ch.id } })
      const totalPosts = posts.length
      const extractedPosts = posts.filter((p) => p.processStatus !== 'no_deal' && p.aiExtracted)
      const rejectedPosts = posts.filter((p) => p.processStatus === 'no_deal')
      // Posts imported before URL validation existed have no urlValidationStatus
      // field at all — exclude them from valid/invalid % rather than let
      // "field absent" silently count as either bucket.
      const validatedPosts = extractedPosts.filter((p) => typeof (p.aiExtracted as any)?.urlValidationStatus === 'string')
      const validUrlPosts = validatedPosts.filter((p) => (p.aiExtracted as any)?.urlValidationStatus === 'valid')
      const invalidUrlPosts = validatedPosts.filter((p) => (p.aiExtracted as any)?.urlValidationStatus !== 'valid')
      const approvedPosts = posts.filter((p) => p.dealId)

      const dealIds = approvedPosts.map((p) => p.dealId!).filter(Boolean)
      const deals = dealIds.length ? await prisma.deal.findMany({ where: { id: { in: dealIds } }, include: { listing: true } }) : []
      const convertedDeals = deals.filter((d) => d.listing.affiliateUrl !== d.listing.storeUrl)

      const pct = (n: number, d: number) => d > 0 ? Math.round((n / d) * 100) : null

      return {
        ...ch,
        stats: {
          totalPosts,
          validUrlPct: pct(validUrlPosts.length, validatedPosts.length),
          invalidUrlPct: pct(invalidUrlPosts.length, validatedPosts.length),
          affiliateConversionPct: pct(convertedDeals.length, deals.length),
          approvalPct: pct(approvedPosts.length, extractedPosts.length),
          rejectionPct: pct(rejectedPosts.length, totalPosts),
          productsCreated: deals.length,
        },
      }
    }))

    return reply.send({ channels: enriched })
  })

  // ── PATCH /telegram/channels/:id/auto-approval ──────────────────
  // Manual override for the auto-pause system — lets the admin force
  // auto-approval back on for a channel (or force it off), independent of
  // the automatic invalid-URL-rate check in updateChannelAutoApprovalHealth().
  server.patch('/telegram/channels/:id/auto-approval', { onRequest: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const schema = z.object({ enabled: z.boolean() })
    const r = schema.safeParse(request.body)
    if (!r.success) return reply.status(400).send({ error: 'enabled (boolean) is required.' })

    const channel = await prisma.telegramChannel.update({
      where: { id },
      data: { autoApproveDisabledReason: r.data.enabled ? null : 'Manually paused by admin' },
    }).catch(() => null)

    if (!channel) return reply.status(404).send({ error: 'Channel not found.' })
    return reply.send({ success: true, channel })
  })

  server.post('/telegram/channels', { onRequest: [requireAdmin] }, async (request, reply) => {
    const schema = z.object({
      channelUsername: z.string().min(1),
      displayName: z.string().optional(),
      isTrusted: z.boolean().default(false),
      // How many past messages to backfill on add — matches the
      // "Historical Sync: 100 / 500 / 1000 / Entire channel" style picker.
      // Default 500: enough for a real dataset without hammering Telegram/Groq.
      historyLimit: z.number().int().positive().max(5000).default(500),
    })
    const r = schema.safeParse(request.body)
    if (!r.success) return reply.status(400).send({ error: 'Channel username required.' })
    const admin = (request as any).admin

    const existing = await prisma.telegramChannel.findFirst({ where: { channelUsername: r.data.channelUsername } })
    if (existing && !existing.deletedAt) return reply.status(409).send({ error: 'Channel already added.' })

    // A previously soft-deleted channel with this username is reactivated
    // on the SAME row (same id) instead of creating a new one — that's what
    // keeps its whole TelegramPost history/stats attached and visible again,
    // rather than orphaning it under a row nothing points to anymore.
    const channel = existing
      ? await prisma.telegramChannel.update({
          where: { id: existing.id },
          data: {
            deletedAt: null, isActive: true,
            displayName: r.data.displayName ?? existing.displayName,
            isTrusted: r.data.isTrusted, addedBy: admin.adminId,
          },
        })
      : await prisma.telegramChannel.create({
          data: { channelUsername: r.data.channelUsername, displayName: r.data.displayName, isTrusted: r.data.isTrusted, isActive: true, addedBy: admin.adminId },
        })

    // Resolving a username isn't enough to receive live posts from it — the
    // worker's account has to actually join the channel. Do that now instead
    // of waiting for the next full worker restart, and surface it if it fails
    // (e.g. typo'd/nonexistent username) so the admin knows immediately.
    const joinResult = await joinChannel(r.data.channelUsername).catch((err) => ({ joined: false, error: err?.message || 'join failed' }))

    // Backfill runs in the background — hundreds of messages each needing a
    // Groq call would badly exceed an HTTP request's lifetime. The admin sees
    // progress via the channel's growing post count / lastSyncedAt.
    if (joinResult.joined) {
      importChannelHistory(channel.id, r.data.historyLimit).catch((err) =>
        console.error(`Historical import failed for @${channel.channelUsername}:`, err)
      )
    }

    return reply.send({
      success: true,
      channel,
      joined: joinResult.joined,
      joinWarning: joinResult.joined ? undefined : `Added, but couldn't join the channel on Telegram: ${joinResult.error}. It won't receive live posts until this is resolved.`,
      historyImportStarted: joinResult.joined,
    })
  })

  // ── POST /telegram/channels/:id/sync-history ────────────────────
  // Manual (re-)backfill for a channel already added — same background
  // pattern as the auto-trigger on add.
  server.post('/telegram/channels/:id/sync-history', { onRequest: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const schema = z.object({ limit: z.number().int().positive().max(5000).default(500) })
    const r = schema.safeParse(request.body)
    if (!r.success) return reply.status(400).send({ error: 'Invalid limit.' })

    const channel = await prisma.telegramChannel.findUnique({ where: { id } })
    if (!channel) return reply.status(404).send({ error: 'Channel not found.' })

    importChannelHistory(id, r.data.limit).catch((err) =>
      console.error(`Historical import failed for @${channel.channelUsername}:`, err)
    )

    return reply.send({ success: true, message: `Historical sync started (up to ${r.data.limit} messages). Check back shortly — this runs in the background.` })
  })

  server.put('/telegram/channels/:id', { onRequest: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const schema = z.object({ isActive: z.boolean().optional(), isTrusted: z.boolean().optional(), displayName: z.string().optional() })
    const r = schema.safeParse(request.body)
    if (!r.success) return reply.status(400).send({ error: 'Invalid data.' })
    const channel = await prisma.telegramChannel.update({ where: { id }, data: r.data })
    return reply.send({ success: true, channel })
  })

  // Soft delete — TelegramPost rows carry a required (non-cascading) FK to
  // this channel, so a hard delete previously failed outright (500) for any
  // channel with real import history, e.g. tech24deals' 488 posts. This
  // just hides the channel; its posts/stats stay intact, and re-adding the
  // same @username reactivates this row rather than losing that history.
  server.delete('/telegram/channels/:id', { onRequest: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const channel = await prisma.telegramChannel.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    }).catch(() => null)
    if (!channel) return reply.status(404).send({ error: 'Channel not found.' })
    return reply.send({ success: true })
  })
}