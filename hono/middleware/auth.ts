import 'server-only'
import { Context, Next } from 'hono'
import { verifyToken, JwtPayload } from '~/server/lib/jwt'
import { isAdminGateVersionCurrent } from '~/server/lib/admin-login-gate'

export type AuthVariables = {
  user: JwtPayload
}

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization')

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({
      code: 'AUTH_REQUIRED',
      error: 'Authentication required',
    }, 401)
  }

  const token = authHeader.substring(7)
  let payload: JwtPayload

  try {
    payload = verifyToken(token)
  } catch {
    return c.json({
      code: 'TOKEN_INVALID',
      error: 'Your session is invalid or has expired',
    }, 401)
  }

  if (payload.isAdmin !== true) {
    return c.json({
      code: 'ADMIN_REQUIRED',
      error: 'Administrator access required',
    }, 401)
  }

  if (!isAdminGateVersionCurrent(payload.adminGateVersion)) {
    return c.json({
      code: 'ADMIN_LOGIN_GATE_CHANGED',
      error: 'Administrator login URL has changed; sign in again using the new URL',
    }, 401)
  }

  c.set('user', payload)
  await next()
}
