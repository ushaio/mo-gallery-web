import { z } from 'zod'

const AUTH_SESSION_TTL_MS = 10 * 60 * 1000

const AUTH_OAUTH_STATE_KEY = 'auth:oauth:state'
const AUTH_RETURN_URL_KEY = 'auth:return-url'
const AUTH_ADMIN_BIND_KEY = 'auth:linuxdo:admin-bind'

const LEGACY_OAUTH_STATE_KEY = 'linuxdo_oauth_state'
const LEGACY_RETURN_URL_KEY = 'login_return_url'
const LEGACY_ADMIN_BIND_KEY = 'linuxdo_admin_bind'
const LEGACY_ADMIN_BIND_RETURN_URL_KEY = 'linuxdo_bind_return_url'

const expiringStringSchema = z.object({
  value: z.string(),
  expiresAt: z.number(),
})

const adminBindSessionSchema = z.object({
  value: z.object({
    returnUrl: z.string().optional(),
  }),
  expiresAt: z.number(),
})

export interface AdminBindSession {
  returnUrl?: string
}

function getSessionStorage() {
  if (typeof window === 'undefined') return null
  return window.sessionStorage
}

function getExpiresAt(ttlMs = AUTH_SESSION_TTL_MS) {
  return Date.now() + ttlMs
}

function normalizeInternalReturnUrl(value: string | null | undefined, fallback: string) {
  if (!value) return fallback

  if (value.startsWith('/') && !value.startsWith('//')) {
    return value
  }

  if (typeof window === 'undefined') return fallback

  try {
    const url = new URL(value, window.location.origin)
    if (url.origin !== window.location.origin) return fallback
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return fallback
  }
}

function setExpiringString(key: string, value: string, ttlMs?: number) {
  const storage = getSessionStorage()
  if (!storage) return false

  try {
    storage.setItem(key, JSON.stringify({ value, expiresAt: getExpiresAt(ttlMs) }))
    return true
  } catch {
    return false
  }
}

function consumeLegacyString(key: string) {
  const storage = getSessionStorage()
  if (!storage) return null

  try {
    const value = storage.getItem(key)
    storage.removeItem(key)
    return value
  } catch {
    return null
  }
}

function consumeExpiringString(key: string, legacyKeys: string[] = []) {
  const storage = getSessionStorage()
  if (!storage) return null

  try {
    const raw = storage.getItem(key)
    storage.removeItem(key)

    if (raw) {
      const parsed = expiringStringSchema.safeParse(JSON.parse(raw))
      if (parsed.success && parsed.data.expiresAt >= Date.now()) {
        return parsed.data.value
      }
    }
  } catch {}

  for (const legacyKey of legacyKeys) {
    const legacyValue = consumeLegacyString(legacyKey)
    if (legacyValue) return legacyValue
  }

  return null
}

export function setOAuthState(state: string) {
  return setExpiringString(AUTH_OAUTH_STATE_KEY, state)
}

export function consumeOAuthState() {
  return consumeExpiringString(AUTH_OAUTH_STATE_KEY, [LEGACY_OAUTH_STATE_KEY])
}

export function setLoginReturnUrl(returnUrl: string) {
  return setExpiringString(AUTH_RETURN_URL_KEY, normalizeInternalReturnUrl(returnUrl, '/'))
}

export function consumeLoginReturnUrl(fallback = '/') {
  const value = consumeExpiringString(AUTH_RETURN_URL_KEY, [LEGACY_RETURN_URL_KEY])
  return normalizeInternalReturnUrl(value, fallback)
}

export function setAdminBindSession(returnUrl: string) {
  const storage = getSessionStorage()
  if (!storage) return false

  try {
    storage.setItem(
      AUTH_ADMIN_BIND_KEY,
      JSON.stringify({
        value: {
          returnUrl: normalizeInternalReturnUrl(returnUrl, '/admin/settings'),
        },
        expiresAt: getExpiresAt(),
      })
    )
    return true
  } catch {
    return false
  }
}

export function consumeAdminBindSession(): AdminBindSession | null {
  const storage = getSessionStorage()
  if (!storage) return null

  try {
    const raw = storage.getItem(AUTH_ADMIN_BIND_KEY)
    storage.removeItem(AUTH_ADMIN_BIND_KEY)

    if (raw) {
      const parsed = adminBindSessionSchema.safeParse(JSON.parse(raw))
      if (parsed.success && parsed.data.expiresAt >= Date.now()) {
        return {
          returnUrl: normalizeInternalReturnUrl(parsed.data.value.returnUrl, '/admin/settings'),
        }
      }
    }
  } catch {}

  const legacyEnabled = consumeLegacyString(LEGACY_ADMIN_BIND_KEY) === 'true'
  const legacyReturnUrl = consumeLegacyString(LEGACY_ADMIN_BIND_RETURN_URL_KEY)

  if (!legacyEnabled) return null

  return {
    returnUrl: normalizeInternalReturnUrl(legacyReturnUrl, '/admin/settings'),
  }
}
