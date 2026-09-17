import jwt from 'jsonwebtoken'

const ADMIN_SECRET = process.env.ADMIN_JWT_SECRET || 'fallback_admin_secret_change_this'

export interface AdminTokenPayload {
  adminId: string
  email: string
  role: string
}

export function signAdminToken(payload: AdminTokenPayload): string {
  return jwt.sign(payload, ADMIN_SECRET, { expiresIn: '8h' })
}

export function verifyAdminToken(token: string): AdminTokenPayload {
  return jwt.verify(token, ADMIN_SECRET) as AdminTokenPayload
}