import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const STATE_TTL_MS = 10 * 60 * 1000

function getSecret(): string {
  const secret = process.env.JWT_SECRET?.trim()
  if (!secret) throw new Error('JWT_SECRET is required')
  return secret
}

function sign(value: string): string {
  return createHmac('sha256', getSecret()).update(value).digest('base64url')
}

export function createOAuthState(now = Date.now()): string {
  const value = `${now}.${randomBytes(24).toString('base64url')}`
  return `${value}.${sign(value)}`
}

export function verifyOAuthState(state: unknown, now = Date.now()): boolean {
  if (typeof state !== 'string') return false
  const parts = state.split('.')
  if (parts.length !== 3) return false

  const [timestamp, nonce, signature] = parts
  const issuedAt = Number(timestamp)
  if (!Number.isSafeInteger(issuedAt) || issuedAt > now || now - issuedAt > STATE_TTL_MS) {
    return false
  }
  if (!nonce || !signature) return false

  const expected = Buffer.from(sign(`${timestamp}.${nonce}`))
  const actual = Buffer.from(signature)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
