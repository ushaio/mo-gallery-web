import { useState, useEffect, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Eye,
  EyeOff,
  Globe,
  HardDrive,
  Loader2,
  Lock,
  Moon,
  ShieldCheck,
  Sun,
  TriangleAlert,
  User,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { AuthBrandPanel } from '@/components/layout/AuthBrandPanel'
import { AUTH_ERROR_MESSAGE_KEY, getErrorMessage } from '@/lib/auth-errors'
import { usePreferences } from '@/store/preferences'
import { t } from '@/lib/i18n'
import { GetApiConfig, Login } from '../../wailsjs/go/main/App'
import { configuredLoginUrl, type SavedAuthConfig } from '@/lib/auth-config'

const CONFIG_RETRY_DELAYS_MS = [0, 300, 900, 1800]

export function LoginPage() {
  const [server, setServer] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [rememberLogin, setRememberLogin] = useState(false)
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [error, setError] = useState('')
  const [authNotice] = useState(() => {
    const message = sessionStorage.getItem(AUTH_ERROR_MESSAGE_KEY) || ''
    sessionStorage.removeItem(AUTH_ERROR_MESSAGE_KEY)
    return message
  })
  const [loading, setLoading] = useState(false)
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light')
  const { login } = useAuth()
  const { language, theme, setTheme, setLanguage } = usePreferences()
  const navigate = useNavigate()

  // 登录页独立应用主题（AdminLayout 只覆盖登录后的页面）
  useEffect(() => {
    const applyTheme = () => {
      const root = document.documentElement
      root.classList.remove('light', 'dark')
      const next =
        theme === 'system'
          ? window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light'
          : theme
      setResolvedTheme(next)
      root.classList.add(next)
    }
    applyTheme()

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      mq.addEventListener('change', applyTheme)
      return () => mq.removeEventListener('change', applyTheme)
    }
  }, [theme])

  // 恢复上次使用的服务器地址和保存的凭据。开发模式全量刷新时，
  // React 可能先于 Wails bridge 恢复，因此按间隔重试，而不是连续调用两次。
  useEffect(() => {
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | undefined

    const applyConfig = (config: SavedAuthConfig) => {
      if (cancelled) return
      const configServer = configuredLoginUrl(config)
      // 仅当配置里确实有值时覆盖，避免空值冲掉 localStorage 恢复的 server
      if (configServer) setServer(configServer)
      setRememberLogin(Boolean(config.remember_login))
      if (config.remember_login) {
        setUsername(config.saved_username || '')
        setPassword(config.saved_password || '')
      }
    }

    const restoreConfig = async (attempt: number) => {
      try {
        const config = (await GetApiConfig()) as SavedAuthConfig | null
        if (cancelled) return
        if (config && Object.keys(config).length > 0) {
          applyConfig(config)
          return
        }
      } catch {
        if (cancelled) return
      }

      const nextAttempt = attempt + 1
      if (nextAttempt >= CONFIG_RETRY_DELAYS_MS.length) return
      retryTimer = setTimeout(() => {
        void restoreConfig(nextAttempt)
      }, CONFIG_RETRY_DELAYS_MS[nextAttempt])
    }

    void restoreConfig(0)

    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [])

  const clearError = () => setError('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await Login(server, username, password, rememberLogin)
      if (result?.token) {
        // 保存服务器地址
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

  const toggleTheme = () => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
  const toggleLanguage = () => setLanguage(language === 'zh' ? 'en' : 'zh')

  const noticeHeading = authNotice.includes('管理员登录入口')
    ? t('admin.login_notice_changed', language)
    : t('admin.login_notice_expired', language)

  return (
    <div className="flex h-full w-full overflow-hidden bg-background text-foreground">
      <AuthBrandPanel language={language} />

      {/* 表单面板 */}
      <main className="relative flex min-w-0 flex-1 items-center justify-center overflow-y-auto px-6 py-12" style={{ scrollbarGutter: 'stable' }}>
        {/* 顶部快捷操作 */}
        <div className="absolute right-5 top-5 flex items-center gap-2">
          <button
            type="button"
            onClick={toggleLanguage}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            aria-label="Switch language"
          >
            <Globe className="h-3.5 w-3.5" />
            {language === 'zh' ? 'EN' : '中文'}
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            aria-label="Toggle theme"
          >
            {resolvedTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>

        <div className="w-full max-w-sm">
          {/* 移动端/窄窗口的品牌头部 */}
          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <div
              className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl font-serif text-xl font-bold"
              style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}
            >
              E
            </div>
            <h1 className="font-serif text-2xl font-medium tracking-tight">Emulsion</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('admin.login_subtitle', language)}
            </p>
          </div>

          {/* 宽屏标题 */}
          <div className="mb-8 hidden lg:block">
            <p className="text-[10px] font-medium uppercase tracking-[0.3em] text-muted-foreground">
              {t('admin.login_welcome', language)}
            </p>
            <h1 className="mt-2 font-serif text-3xl font-light tracking-tight">
              {t('admin.login_heading', language)}
            </h1>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {t('admin.login_subtitle', language)}
            </p>
          </div>

          {authNotice && (
            <div
              role="alert"
              className="mb-5 rounded-lg border px-4 py-3 text-sm"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--warning, #d97706) 10%, transparent)',
                borderColor: 'color-mix(in srgb, var(--warning, #d97706) 35%, transparent)',
              }}
            >
              <p className="mb-1 flex items-center gap-1.5 font-medium">
                <TriangleAlert className="h-4 w-4 shrink-0" style={{ color: 'var(--warning, #d97706)' }} />
                {noticeHeading}
              </p>
              <p className="text-xs leading-5 text-muted-foreground">{authNotice}</p>
            </div>
          )}

          {error && (
            <div
              role="alert"
              aria-live="polite"
              className="mb-5 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
            >
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5" aria-busy={loading}>
            {/* 服务器或管理员登录地址 */}
            <div>
              <label htmlFor="server" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                {language === 'zh' ? '服务器或管理员登录地址' : 'Server or administrator login URL'}
              </label>
              <div className="relative">
                <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
                <input
                  id="server"
                  type="url"
                  value={server}
                  onChange={(e) => {
                    setServer(e.target.value)
                    clearError()
                  }}
                  disabled={loading}
                  required
                  autoComplete="url"
                  placeholder="https://gallery.example.com/login/private"
                  className="w-full rounded-lg border border-border bg-card py-2.5 pl-10 pr-3.5 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground/40 focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                />
              </div>
            </div>

            {/* 用户名 */}
            <div>
              <label htmlFor="username" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                {t('admin.username', language)}
              </label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value)
                    clearError()
                  }}
                  disabled={loading}
                  required
                  autoComplete="username"
                  className="w-full rounded-lg border border-border bg-card py-2.5 pl-10 pr-3.5 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground/40 focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                />
              </div>
            </div>

            {/* 密码 */}
            <div>
              <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                {t('admin.password', language)}
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
                <input
                  id="password"
                  type={passwordVisible ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    clearError()
                  }}
                  disabled={loading}
                  required
                  autoComplete="current-password"
                  className="w-full rounded-lg border border-border bg-card py-2.5 pl-10 pr-10 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground/40 focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => setPasswordVisible((v) => !v)}
                  aria-label={language === 'zh' ? (passwordVisible ? '隐藏' : '显示') : passwordVisible ? 'Hide' : 'Show'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
                >
                  {passwordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* 记住登录 */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label htmlFor="remember-login" className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  id="remember-login"
                  checked={rememberLogin}
                  onChange={(e) => setRememberLogin(e.target.checked)}
                  disabled={loading}
                  className="h-4 w-4 cursor-pointer rounded border-border"
                  style={{ accentColor: 'var(--primary)' }}
                />
                {t('admin.remember_login', language)}
              </label>
              <button
                type="button"
                onClick={() => navigate('/setup')}
                disabled={loading}
                className="text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline disabled:opacity-50"
              >
                {language === 'zh' ? '修改服务器配置' : 'Edit connection settings'}
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="group flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('admin.loginButton', language)}
                </>
              ) : (
                <>
                  {t('admin.loginButton', language)}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[10px] uppercase text-muted-foreground">{language === 'zh' ? '或' : 'or'}</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <button
            type="button"
            onClick={() => navigate('/library?source=local', { replace: true })}
            disabled={loading}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border bg-card text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
          >
            <HardDrive className="h-4 w-4" />
            {t('admin.use_offline', language)}
          </button>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            {t('admin.login_footer', language)}
          </p>
        </div>
      </main>
    </div>
  )
}
