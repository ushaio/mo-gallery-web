function getApiBase(): string {
  const base = process.env.NEXT_PUBLIC_API_URL
  if (!base) {
    throw new Error('Missing NEXT_PUBLIC_API_URL (external backend base URL)')
  }
  return base.replace(/\/+$/, '')
}

function buildApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${getApiBase()}${normalizedPath}`
}

export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  token: string
  user: {
    id: string
    email: string
    name: string | null
  }
}

export interface ApiError {
  error: string
}

export async function login(data: LoginRequest): Promise<LoginResponse> {
  const res = await fetch(buildApiUrl('/api/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

  if (!res.ok) {
    const error: ApiError = await res.json()
    throw new Error(error.error || 'Login failed')
  }

  return res.json()
}

export async function register(data: LoginRequest & { name?: string }) {
  const res = await fetch(buildApiUrl('/api/auth/register'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

  if (!res.ok) {
    const error: ApiError = await res.json()
    throw new Error(error.error || 'Registration failed')
  }

  return res.json()
}
