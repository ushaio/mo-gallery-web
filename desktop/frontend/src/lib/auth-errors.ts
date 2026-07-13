export const AUTH_ERROR_MESSAGE_KEY = 'mo-gallery-auth-error'
export const AUTH_FAILURE_EVENT = 'mo-gallery:auth-failure'

export const AUTH_ERROR_MESSAGE = '登录状态已失效，请重新登录。'

export function getAuthErrorMessage(error: unknown): string {
  const message = getErrorMessage(error)
  if (
    message.includes('ADMIN_LOGIN_GATE_CHANGED')
    || message.toLowerCase().includes('administrator login url has changed')
  ) {
    return '管理员登录入口已变更，请使用新的完整管理员登录地址重新登录。'
  }
  if (message.includes('签名无效') || message.includes('JWT 密钥')) {
    return 'Token 签名无效，请检查 JWT 密钥配置后重新登录。'
  }
  if (message.includes('过期') || message.toLowerCase().includes('expired')) {
    return '登录已过期，请重新登录。'
  }
  return AUTH_ERROR_MESSAGE
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message) return message
  }
  return '请求失败'
}

export function isAuthError(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const candidate = error as {
      name?: unknown
      status?: unknown
      code?: unknown
    }
    if (
      candidate.name === 'ApiUnauthorizedError'
      || candidate.status === 401
      || candidate.code === 'ADMIN_LOGIN_GATE_CHANGED'
    ) {
      return true
    }
  }

  const message = getErrorMessage(error).toLowerCase()
  return message.includes('登录已失效')
    || message.includes('登录状态已失效')
    || message.includes('登录已过期')
    || message.includes('401')
    || message.includes('unauthorized')
    || message.includes('invalid token')
    || message.includes('administrator login url has changed')
    || message.includes('token 已过期')
    || message.includes('jwt')
}

export function reportAuthFailure(error: unknown) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(AUTH_FAILURE_EVENT, { detail: error }))
}
