import 'dotenv/config'

// ─── Sentry — must initialize BEFORE anything else ───────────
import * as Sentry from '@sentry/node'

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 0.1, // 10% performance sampling — free-tier friendly
  })
}

import Fastify, { FastifyRequest, FastifyReply } from 'fastify'
import cors      from '@fastify/cors'
import jwt       from '@fastify/jwt'
import cookie    from '@fastify/cookie'
import rateLimit from '@fastify/rate-limit'

import authRoutes              from './routes/auth.routes'
import adminAuthRoutes         from './routes/admin-auth.routes'
import adminRoutes             from './routes/admin.routes'
import adminExtractRoutes      from './routes/admin-extract.routes'
import dealsRoutes             from './routes/deals.routes'
import affiliateRoutes,
       { affiliateStatsRoutes } from './routes/affiliate.routes'
import cartnotesRoutes          from './routes/cartnotes.routes'
import notificationsRoutes      from './routes/notifications.routes'
import searchRoutes             from './routes/search.routes'
import { startTelegramWorker }  from './workers/telegram-worker'
import { startCartNoteMatcher } from './workers/cartnote-matcher'
import conversionsRoutes        from './routes/conversions.routes'
import couponsRoutes            from './routes/coupons.routes'
import adminCouponsRoutes       from './routes/admin-coupons.routes'
import { startCouponLifecycle } from './workers/coupon-lifecycle'
import leaderboardRoutes        from './routes/leaderboard.routes'
import { startTrustCompute }    from './lib/trust-compute'
import cartnoteCouponsRoutes    from './routes/cartnote-coupons.routes'
import { startPriceRefresh }    from './workers/price-refresh-worker'
import wishlistRoutes           from './routes/wishlist.routes'
import listingsRoutes           from './routes/listings.routes'


const server = Fastify({
  logger: { transport: { target:'pino-pretty', options:{ colorize:true } } }
})

// Attach Sentry's Fastify error capture (no-op if DSN not set)
if (process.env.SENTRY_DSN) {
  Sentry.setupFastifyErrorHandler(server)
}

// ─── CORS — env-driven allowlist ─────────────────────────────
// Production:  ALLOWED_ORIGINS="https://dealmind.vercel.app,https://dealmind-admin.vercel.app"
// Development: unset → permissive (localhost apps just work)
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)

const isProduction = process.env.NODE_ENV === 'production'

if (isProduction && allowedOrigins.length === 0) {
  console.warn('⚠️  PRODUCTION with no ALLOWED_ORIGINS set — CORS is wide open. Set ALLOWED_ORIGINS in env!')
}

server.register(cors, {
  origin: isProduction && allowedOrigins.length > 0 ? allowedOrigins : true,
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'],
})

// ─── Rate limiting (from M1) ─────────────────────────────────
server.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
  errorResponseBuilder: () => ({
    error: 'Too many requests. Please slow down and try again shortly.',
  }),
})

server.register(jwt,    { secret: process.env.JWT_SECRET    || 'fallback_secret_change_this' })
server.register(cookie, { secret: process.env.COOKIE_SECRET || 'dealmind_cookie_secret_2025' })

server.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
  try { await request.jwtVerify() } catch (err) { reply.send(err) }
})

server.get('/health', async () => ({
  status: 'ok',
  app: 'DealMind API',
  sentry: !!process.env.SENTRY_DSN,
  corsMode: isProduction && allowedOrigins.length > 0 ? 'allowlist' : 'permissive',
  timestamp: new Date().toISOString(),
}))

// Deliberate-error endpoint for verifying Sentry capture.
// Only exists when Sentry is configured; remove after M3 test if you like.
if (process.env.SENTRY_DSN) {
  server.get('/debug-sentry', async () => {
    throw new Error('M3 test error — if you see this in Sentry, capture works!')
  })
}

// ─── Routes ──────────────────────────────────────────────────
server.register(authRoutes,           { prefix: '/api/auth'          })
server.register(adminAuthRoutes,      { prefix: '/api/admin'         })
server.register(adminRoutes,          { prefix: '/api/admin'         })
server.register(adminCouponsRoutes,   { prefix: '/api/admin'         })
server.register(conversionsRoutes,    { prefix: '/api/admin'         })
server.register(couponsRoutes,        { prefix: '/api/coupons'       })
server.register(adminExtractRoutes,   { prefix: '/api/admin'         })
server.register(dealsRoutes,          { prefix: '/api/deals'         })
server.register(affiliateRoutes,      { prefix: '/go'                })
server.register(affiliateStatsRoutes, { prefix: '/api/affiliate'     })
server.register(cartnotesRoutes,      { prefix: '/api/cartnotes'     })
server.register(notificationsRoutes,  { prefix: '/api/notifications' })
server.register(searchRoutes,         { prefix: '/api/search'        })
server.register(leaderboardRoutes,    { prefix: '/api/leaderboard'   })
server.register(cartnoteCouponsRoutes,{ prefix: '/api/cartnotes'     })
server.register(wishlistRoutes,       { prefix: '/api/wishlist'      })
server.register(listingsRoutes,       { prefix: '/api/listings'      })

const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3001
    await server.listen({ port, host: '0.0.0.0' })
    console.log(`\n🚀 DealMind API → http://localhost:${port}`)
    console.log(`🛡  Rate limiting active`)
    console.log(`📡 Sentry: ${process.env.SENTRY_DSN ? 'connected' : 'not configured (set SENTRY_DSN)'}`)
    console.log(`🌐 CORS: ${isProduction && allowedOrigins.length > 0 ? allowedOrigins.join(', ') : 'permissive (dev)'}\n`)
    startTelegramWorker().catch(console.error)
    startCartNoteMatcher()
    startCouponLifecycle()
    startTrustCompute()
    startPriceRefresh()
  } catch (err) {
    server.log.error(err)
    process.exit(1)
  }
}
start()