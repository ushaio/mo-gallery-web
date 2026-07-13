const AUTH_FAILURE_STORAGE_KEY = 'auth:failure'
const AUTH_FAILURE_EVENT = 'mo-gallery:auth-failure'
const AUTH_FAILURE_TTL_MS = 5 * 60 * 1000

export interface AuthFailure {
  code?: string
  message: string
}

interface StoredAuthFailure extends AuthFailure {
  expiresAt: number
}

let authFailurePending = false

function getSessionStorage() {
  if (typeof window === 'undefined') return null
  return window.sessionStorage
}

export function reportAuthFailure(failure: AuthFailure) {
  if (typeof window === 'undefined' || authFailurePending) return

  authFailurePending = true
  const storedFailure: StoredAuthFailure = {
    ...failure,
    expiresAt: Date.now() + AUTH_FAILURE_TTL_MS,
  }

  try {
    getSessionStorage()?.setItem(AUTH_FAILURE_STORAGE_KEY, JSON.stringify(storedFailure))
  } catch {}

  window.dispatchEvent(new CustomEvent<AuthFailure>(AUTH_FAILURE_EVENT, {
    detail: failure,
  }))
}

export function consumeAuthFailure(): AuthFailure | null {
  const storage = getSessionStorage()
  authFailurePending = false
  if (!storage) return null

  try {
    const raw = storage.getItem(AUTH_FAILURE_STORAGE_KEY)
    storage.removeItem(AUTH_FAILURE_STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as Partial<StoredAuthFailure>
    if (
      typeof parsed.message !== 'string'
      || typeof parsed.expiresAt !== 'number'
      || parsed.expiresAt < Date.now()
    ) {
      return null
    }

    return {
      code: typeof parsed.code === 'string' ? parsed.code : undefined,
      message: parsed.message,
    }
  } catch {
    return null
  }
}

export function subscribeAuthFailure(listener: (failure: AuthFailure) => void) {
  if (typeof window === 'undefined') return () => {}

  const handleFailure = (event: Event) => {
    listener((event as CustomEvent<AuthFailure>).detail)
  }

  window.addEventListener(AUTH_FAILURE_EVENT, handleFailure)
  return () => window.removeEventListener(AUTH_FAILURE_EVENT, handleFailure)
}

export function isAuthFailurePending() {
  return authFailurePending
}
