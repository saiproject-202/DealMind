// apiFetch — drop-in replacement for fetch() for ALL DealMind API calls.
//
//   Before:  fetch("http://localhost:4001/api/cartnotes", { headers: { Authorization: `Bearer ${getToken()}` } })
//   After:   apiFetch("/api/cartnotes")
//
// What it does automatically:
//   1. Prefixes the API base URL (from NEXT_PUBLIC_API_URL env)
//   2. Attaches the access token
//   3. On 401 → silently refreshes the token → retries the request ONCE
//   4. If refresh fails → clears auth → redirects to /login

import { getToken, getRefreshToken, saveTokens, clearTokens } from './auth'

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001'

// Prevent multiple simultaneous refresh calls (e.g. 3 components hit 401
// at once) — they all await the SAME refresh promise.
let refreshPromise: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    const refreshToken = getRefreshToken()
    if (!refreshToken) return null

    try {
      const res = await fetch(`${API_URL}/api/auth/refresh`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ refreshToken }),
      })
      const data = await res.json()
      if (data.success && data.token) {
        saveTokens(data.token) // refresh token stays as-is
        return data.token as string
      }
      return null
    } catch {
      return null
    } finally {
      // allow future refreshes after this one settles
      setTimeout(() => { refreshPromise = null }, 0)
    }
  })()

  return refreshPromise
}

interface ApiFetchOptions extends RequestInit {
  /** set false for public endpoints (search, homepage) — skips token entirely */
  auth?: boolean
}

export async function apiFetch(
  path: string,
  options: ApiFetchOptions = {}
): Promise<Response> {
  const { auth = true, headers: customHeaders, ...rest } = options

  const buildHeaders = (token: string | null): HeadersInit => ({
    // Only send Content-Type: application/json when there's an actual body —
    // Fastify rejects a JSON content-type on an empty body with a 400
    // (FST_ERR_CTP_EMPTY_JSON_BODY), which broke every body-less POST/PUT/DELETE
    // call (wishlist toggle, notification read, coupon reveal, cartnote delete).
    ...(rest.body ? { 'Content-Type': 'application/json' } : {}),
    ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
    ...(customHeaders || {}),
  })

  const url = path.startsWith('http') ? path : `${API_URL}${path}`

  // First attempt
  let res = await fetch(url, { ...rest, headers: buildHeaders(getToken()) })

  // 401 on an authenticated call → try silent refresh + single retry
  if (res.status === 401 && auth) {
    const newToken = await refreshAccessToken()

    if (newToken) {
      res = await fetch(url, { ...rest, headers: buildHeaders(newToken) })
    }

    // Still 401 (or refresh failed) → session truly dead
    if (res.status === 401) {
      clearTokens()
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.href = '/login'
      }
    }
  }

  return res
}