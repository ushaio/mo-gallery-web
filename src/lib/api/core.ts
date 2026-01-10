function getApiBase(): string {
  // In integrated mode, API is served from the same origin
  // NEXT_PUBLIC_API_URL is optional for external backend
  const base = process.env.NEXT_PUBLIC_API_URL
  if (base) {
    return base.replace(/\/+$/, '')
  }
  // Default to same origin (integrated backend)
  return ''
}

export function buildApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const base = getApiBase()
  return base ? `${base}${normalizedPath}` : normalizedPath
}

export class ApiUnauthorizedError extends Error {
  readonly status = 401
  constructor(message = 'Unauthorized') {
    super(message)
    this.name = 'ApiUnauthorizedError'
  }
}

type ApiEnvelope<T> =
  | { success: true; data: T; meta?: unknown }
  | { success: true; token: string }
  | { success: true }
  | { success: false; message?: string; error?: string }

export function extractErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const anyPayload = payload as Record<string, unknown>
  const message = anyPayload.message
  if (typeof message === 'string' && message.trim()) return message
  const error = anyPayload.error
  if (typeof error === 'string' && error.trim()) return error
  return null
}

async function readJsonSafe(res: Response): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    return null
  }
}

export async function apiRequest(
  path: string,
  init: RequestInit = {},
  token?: string | null,
): Promise<ApiEnvelope<unknown>> {
  const headers = new Headers(init.headers)
  const hasBody = init.body !== undefined && init.body !== null
  if (hasBody && !headers.has('Content-Type') && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(buildApiUrl(path), { ...init, headers })
  const payload = await readJsonSafe(res)

  if (res.status === 401) {
    throw new ApiUnauthorizedError(extractErrorMessage(payload) ?? 'Token invalid or expired')
  }
  if (!res.ok) {
    throw new Error(extractErrorMessage(payload) ?? `Request failed (${res.status})`)
  }

  if (payload && typeof payload === 'object' && 'success' in payload) {
    const envelope = payload as ApiEnvelope<unknown>
    if ('success' in envelope && envelope.success === false) {
      throw new Error(extractErrorMessage(payload) ?? 'Request failed')
    }
    return envelope
  }

  return { success: true, data: payload }
}

export async function apiRequestData<T>(
  path: string,
  init: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const envelope = await apiRequest(path, init, token)
  if (!('data' in envelope)) {
    throw new Error('Unexpected API response (missing data)')
  }
  return envelope.data as T
}

export async function apiRequestWithMeta<T, M>(
  path: string,
  init: RequestInit = {},
  token?: string | null,
): Promise<{ data: T; meta: M }> {
  const envelope = await apiRequest(path, init, token)
  if (!('data' in envelope)) {
    throw new Error('Unexpected API response (missing data)')
  }
  const meta = 'meta' in envelope ? envelope.meta as M : {} as M
  return { data: envelope.data as T, meta }
}

export function buildQuery(params: Record<string, string | number | undefined | null>): string {
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    searchParams.set(key, String(value))
  }
  const query = searchParams.toString()
  return query ? `?${query}` : ''
}

export function resolveAssetUrl(assetPath: string, cdnDomain?: string): string {
  if (/^https?:\/\//i.test(assetPath)) return assetPath
  const normalizedPath = assetPath.startsWith('/') ? assetPath : `/${assetPath}`

  const cdn = cdnDomain?.trim()
  if (cdn) return `${cdn.replace(/\/+$/, '')}${normalizedPath}`

  const base = getApiBase()
  return base ? `${base}${normalizedPath}` : normalizedPath
}