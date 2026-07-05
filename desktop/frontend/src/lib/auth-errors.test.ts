import { getErrorMessage } from './auth-errors'

const message = getErrorMessage({ message: 'Token 签名无效，请检查 JWT 密钥配置后重新登录' })

if (message !== 'Token 签名无效，请检查 JWT 密钥配置后重新登录') {
  throw new Error(`Expected object message to be preserved, got ${message}`)
}
