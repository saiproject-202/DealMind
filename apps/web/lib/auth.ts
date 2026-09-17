// Token + user storage helpers — single source of truth for auth state.
// Keys are versioned so a future storage change can migrate cleanly.

const TOKEN_KEY   = 'dm_token'
const REFRESH_KEY = 'dm_refresh_token'
const USER_KEY    = 'dm_user'

// ── Tokens ────────────────────────────────────────────────────
export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(REFRESH_KEY)
}

export function saveTokens(token: string, refreshToken?: string) {
  localStorage.setItem(TOKEN_KEY, token)
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken)
}

export function clearTokens() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_KEY)
  localStorage.removeItem(USER_KEY)
}

// ── User ──────────────────────────────────────────────────────
export interface StoredUser {
  id: string
  phone?: string
  displayName?: string | null
  [key: string]: unknown
}

export function getUser(): StoredUser | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

export function saveUser(user: StoredUser) {
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}