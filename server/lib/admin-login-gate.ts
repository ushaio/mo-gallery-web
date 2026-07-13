import { createHmac, timingSafeEqual } from 'node:crypto'

const ADMIN_GATE_VERSION_PREFIX = 'mo-gallery:admin-login-gate:v1\0'

function normalizeSlug(value: string | undefined): string {
  return value?.trim().replace(/^\/+|\/+$/g, '') ?? ''
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim()
  if (!secret) {
    throw new Error('JWT_SECRET is required')
  }
  return secret
}

export function getAdminLoginSlug(): string {
  return normalizeSlug(
    process.env.ADMIN_LOGIN_URL || process.env.NEXT_PUBLIC_ADMIN_LOGIN_URL,
  )
}

export function isAdminLoginGateEnabled(): boolean {
  return getAdminLoginSlug().length > 0
}

export function verifyAdminLoginSlug(candidate: unknown): boolean {
  const configured = getAdminLoginSlug()
  if (!configured) return true
  if (typeof candidate !== 'string') return false

  const normalizedCandidate = normalizeSlug(candidate)
  const expectedBuffer = Buffer.from(configured)
  const candidateBuffer = Buffer.from(normalizedCandidate)

  return expectedBuffer.length === candidateBuffer.length
    && timingSafeEqual(expectedBuffer, candidateBuffer)
}

export function getAdminGateVersion(): string | undefined {
  const slug = getAdminLoginSlug()
  if (!slug) return undefined

  return createHmac('sha256', getJwtSecret())
    .update(`${ADMIN_GATE_VERSION_PREFIX}${slug}`)
    .digest('base64url')
}

export function isAdminGateVersionCurrent(version: unknown): boolean {
  const expected = getAdminGateVersion()
  if (!expected) return true
  if (typeof version !== 'string') return false

  const expectedBuffer = Buffer.from(expected)
  const versionBuffer = Buffer.from(version)

  return expectedBuffer.length === versionBuffer.length
    && timingSafeEqual(expectedBuffer, versionBuffer)
}
