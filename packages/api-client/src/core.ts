export interface ApiRuntime {
  getBaseUrl?: () => string
  onUnauthorized?: (error: ApiUnauthorizedError) => void
  onRequestCompleted?: (path: string, method: string) => void
}

let runtime: ApiRuntime = {}

export function configureApiRuntime(nextRuntime: ApiRuntime): void {
  runtime = { ...runtime, ...nextRuntime }
}

export function notifyApiUnauthorized(error: ApiUnauthorizedError): void {
  runtime.onUnauthorized?.(error)
}

export function notifyApiRequestCompleted(path: string, method = 'GET'): void {
  runtime.onRequestCompleted?.(path, method)
}

function getApiBase(): string {
  if (runtime.getBaseUrl) return runtime.getBaseUrl().replace(/\/+$/, '')

  const globalScope = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> }
  }
  const server = globalScope.localStorage?.getItem('mo-gallery-server')
  if (server) return server.replace(/\/+$/, '')

  const configuredBase = globalScope.process?.env?.NEXT_PUBLIC_API_URL
  return configuredBase ? configuredBase.replace(/\/+$/, '') : ''
}

export function buildApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const base = getApiBase()
  return base ? `${base}${normalizedPath}` : normalizedPath
}

export class ApiUnauthorizedError extends Error {
  readonly status = 401

  constructor(message = 'Unauthorized', readonly code?: string) {
    super(message)
    this.name = 'ApiUnauthorizedError'
  }
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'ApiRequestError'
  }
}

export type ApiEnvelope<T> =
  | { success: true; data: T; meta?: unknown }
  | { success: true; token: string; user?: unknown }
  | { success: true; binding?: unknown }
  | { success: true }
  | { success: false; message?: string; error?: string; code?: string }

export function extractErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const candidate = payload as Record<string, unknown>
  const message = candidate.message
  if (typeof message === 'string' && message.trim()) return message
  const error = candidate.error
  if (typeof error === 'string' && error.trim()) return error
  return null
}

export function extractErrorCode(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined
  const code = (payload as Record<string, unknown>).code
  return typeof code === 'string' && code.trim() ? code : undefined
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
    const error = new ApiUnauthorizedError(
      extractErrorMessage(payload) ?? 'Token invalid or expired',
      extractErrorCode(payload),
    )
    if (token) notifyApiUnauthorized(error)
    throw error
  }
  if (!res.ok) {
    throw new ApiRequestError(
      extractErrorMessage(payload) ?? `Request failed (${res.status})`,
      res.status,
      extractErrorCode(payload),
    )
  }

  if (payload && typeof payload === 'object' && 'success' in payload) {
    const envelope = payload as ApiEnvelope<unknown>
    if (envelope.success === false) {
      throw new ApiRequestError(extractErrorMessage(payload) ?? 'Request failed', res.status, extractErrorCode(payload))
    }
    notifyApiRequestCompleted(path, init.method ?? 'GET')
    return envelope
  }

  notifyApiRequestCompleted(path, init.method ?? 'GET')
  return { success: true, data: payload }
}

export async function apiRequestData<T>(
  path: string,
  init: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const envelope = await apiRequest(path, init, token)
  if (!('data' in envelope)) throw new Error('Unexpected API response (missing data)')
  return envelope.data as T
}

export async function apiRequestWithMeta<T, M>(
  path: string,
  init: RequestInit = {},
  token?: string | null,
): Promise<{ data: T; meta: M }> {
  const envelope = await apiRequest(path, init, token)
  if (!('data' in envelope)) throw new Error('Unexpected API response (missing data)')
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

export function resolveAssetUrl(assetPath: string | null | undefined, cdnDomain?: string): string {
  // Storage-backed photos can legitimately have no public URL (for example,
  // while a private or desktop-only source is not available to the web app).
  // Keep URL consumers render-safe instead of letting a null value reach
  // String.prototype.startsWith.
  if (!assetPath) return ''
  if (/^(https?:|data:|blob:)/i.test(assetPath)) return assetPath
  const normalizedPath = assetPath.startsWith('/') ? assetPath : `/${assetPath}`
  const cdn = cdnDomain?.trim()
  if (cdn) return `${cdn.replace(/\/+$/, '')}${normalizedPath}`
  const base = getApiBase()
  return base ? `${base}${normalizedPath}` : normalizedPath
}
