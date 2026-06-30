export const AUTH_ERROR_MESSAGE_KEY = 'mo-gallery-auth-error'

export const AUTH_ERROR_MESSAGE = '登录状态已失效，请重新登录。'

export function getAuthErrorMessage(error: unknown): string {
  const message = getErrorMessage(error)
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
  return '请求失败'
}

export function isAuthError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase()
  return message.includes('登录已失效')
    || message.includes('登录状态已失效')
    || message.includes('登录已过期')
    || message.includes('401')
    || message.includes('unauthorized')
    || message.includes('invalid token')
    || message.includes('token 已过期')
    || message.includes('jwt')
}
