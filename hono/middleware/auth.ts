import 'server-only'
import { Context, Next } from 'hono'
import { verifyToken, JwtPayload } from '~/server/lib/jwt'

export type AuthVariables = {
  user: JwtPayload
}

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization')

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const token = authHeader.substring(7)

  try {
    const payload = verifyToken(token)
    c.set('user', payload)
    await next()
  } catch (error) {
    return c.json({ error: 'Invalid token' }, 401)
  }
}
