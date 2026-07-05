import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { AUTH_ERROR_MESSAGE_KEY, getErrorMessage } from '@/lib/auth-errors'
import { usePreferences } from '@/store/preferences'
import { t } from '@/lib/i18n'

const SERVER_KEY = 'mo-gallery-server'

export function LoginPage() {
  const [server, setServer] = useState('')
  const [jwtSecret, setJwtSecret] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [rememberLogin, setRememberLogin] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const { language } = usePreferences()
  const navigate = useNavigate()

  // 恢复上次使用的服务器地址和保存的凭据
  useEffect(() => {
    const saved = localStorage.getItem(SERVER_KEY)
    if (saved) setServer(saved)

    ;(async () => {
      try {
        const config = await (window as any).go.main.App.GetApiConfig()
        if (config?.base_url) setServer(config.base_url)
        if (config?.jwt_secret) setJwtSecret(config.jwt_secret)
        if (config?.remember_login) {
          setRememberLogin(true)
          if (config?.saved_username) setUsername(config.saved_username)
          if (config?.saved_password) setPassword(config.saved_password)
        }
      } catch {
        // 登录页仍允许手动填写配置。
      }
    })()

    const authError = sessionStorage.getItem(AUTH_ERROR_MESSAGE_KEY)
    if (authError) {
      setError(authError)
      sessionStorage.removeItem(AUTH_ERROR_MESSAGE_KEY)
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await (window as any).go.main.App.Login(server, username, password, jwtSecret, rememberLogin)
      if (result?.token) {
        // 保存服务器地址
        localStorage.setItem(SERVER_KEY, result.server || server)
        login(result.token, result.user)
        navigate('/', { replace: true })
      } else {
        setError(t('admin.loginFailed', language))
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err) || t('admin.loginFailed', language))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center h-screen w-screen"
      style={{ backgroundColor: 'var(--background)' }}>
      <div className="w-full max-w-sm px-8">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center text-xl font-bold"
            style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
            M
          </div>
          <h1 className="text-xl font-semibold">MO Gallery Desktop</h1>
          <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>
            {t('admin.login', language)}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 服务器地址 */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-foreground)' }}>
              服务器地址
            </label>
            <input
              type="url"
              value={server}
              onChange={(e) => setServer(e.target.value)}
              placeholder="http://localhost:3000"
              className="w-full px-3 py-2 text-sm rounded-md border outline-none transition-colors focus:ring-1"
              style={{
                backgroundColor: 'var(--card)',
                borderColor: 'var(--border)',
                color: 'var(--foreground)',
              }}
              autoFocus
              required
            />
          </div>

          {/* JWT Secret */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-foreground)' }}>
              JWT Secret
            </label>
            <input
              type="password"
              value={jwtSecret}
              onChange={(e) => setJwtSecret(e.target.value)}
              placeholder="与 Web 端 JWT_SECRET 保持一致"
              className="w-full px-3 py-2 text-sm rounded-md border outline-none transition-colors focus:ring-1"
              style={{
                backgroundColor: 'var(--card)',
                borderColor: 'var(--border)',
                color: 'var(--foreground)',
              }}
              required
            />
          </div>

          {/* 用户名 */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-foreground)' }}>
              {t('admin.username', language)}
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-md border outline-none transition-colors focus:ring-1"
              style={{
                backgroundColor: 'var(--card)',
                borderColor: 'var(--border)',
                color: 'var(--foreground)',
              }}
              required
            />
          </div>

          {/* 密码 */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted-foreground)' }}>
              {t('admin.password', language)}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-md border outline-none transition-colors focus:ring-1"
              style={{
                backgroundColor: 'var(--card)',
                borderColor: 'var(--border)',
                color: 'var(--foreground)',
              }}
              required
            />
          </div>

          {/* 记住登录 */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="remember-login"
              checked={rememberLogin}
              onChange={(e) => setRememberLogin(e.target.checked)}
              className="w-4 h-4 rounded border cursor-pointer"
              style={{ borderColor: 'var(--border)' }}
            />
            <label htmlFor="remember-login" className="text-xs cursor-pointer" style={{ color: 'var(--muted-foreground)' }}>
              记住登录（加密存储）
            </label>
          </div>

          {error && (
            <p className="text-xs" style={{ color: 'var(--destructive)' }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 text-sm font-medium rounded-md transition-opacity disabled:opacity-50"
            style={{
              backgroundColor: 'var(--primary)',
              color: 'var(--primary-foreground)',
            }}
          >
            {loading ? '...' : t('admin.loginButton', language)}
          </button>
        </form>

        <p className="text-[11px] text-center mt-6" style={{ color: 'var(--muted-foreground)' }}>
          连接到 MO Gallery Web 后端进行身份验证
        </p>
      </div>
    </div>
  )
}
