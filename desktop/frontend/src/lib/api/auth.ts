import { apiRequest, apiRequestData } from './core'
import type { LoginRequest, LoginResponse, LinuxDoBinding } from './types'

export async function login(data: LoginRequest): Promise<LoginResponse> {
  const envelope = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(data),
  })
  if (!('token' in envelope) || typeof envelope.token !== 'string') {
    throw new Error('Unexpected login response (missing token)')
  }
  const user = 'user' in envelope && envelope.user ? envelope.user as LoginResponse['user'] : { username: data.username }
  return { token: envelope.token, user }
}

export async function getLinuxDoAuthUrl(): Promise<{ url: string; state: string }> {
  return apiRequestData<{ url: string; state: string }>('/api/auth/linuxdo')
}

export async function loginWithLinuxDo(code: string): Promise<LoginResponse> {
  const envelope = await apiRequest('/api/auth/linuxdo/callback', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
  if (!('token' in envelope) || typeof envelope.token !== 'string') {
    throw new Error('Unexpected OAuth response (missing token)')
  }
  const user = 'user' in envelope && envelope.user ? envelope.user as LoginResponse['user'] : { username: 'user' }
  return { token: envelope.token, user }
}

export async function isLinuxDoEnabled(): Promise<boolean> {
  try {
    const result = await apiRequestData<{ enabled: boolean }>('/api/auth/linuxdo/enabled')
    return result.enabled
  } catch {
    return false
  }
}

export async function getLinuxDoBinding(token: string): Promise<LinuxDoBinding | null> {
  const result = await apiRequestData<{ binding: LinuxDoBinding | null }>('/api/auth/linuxdo/binding', {}, token)
  return result.binding
}

export async function bindLinuxDoAccount(token: string, code: string): Promise<LinuxDoBinding> {
  const envelope = await apiRequest('/api/auth/linuxdo/bind', {
    method: 'POST',
    body: JSON.stringify({ code }),
  }, token)
  if (!('binding' in envelope)) {
    throw new Error('Unexpected response (missing binding)')
  }
  return (envelope as { binding: LinuxDoBinding }).binding
}

export async function unbindLinuxDoAccount(token: string): Promise<void> {
  await apiRequest('/api/auth/linuxdo/bind', {
    method: 'DELETE',
  }, token)
}