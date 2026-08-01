import { useState, useEffect, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  BookOpen,
  Eye,
  EyeOff,
  Globe,
  Images,
  KeyRound,
  Loader2,
  Lock,
  Moon,
  Server,
  ShieldCheck,
  Sparkles,
  Sun,
  TriangleAlert,
  User,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { AUTH_ERROR_MESSAGE_KEY, getErrorMessage } from '@/lib/auth-errors'
import { usePreferences } from '@/store/preferences'
import { t } from '@/lib/i18n'
import { GetApiConfig, Login } from '../../wailsjs/go/main/App'

const SERVER_KEY = 'mo-gallery-server'
const CONFIG_RETRY_DELAYS_MS = [0, 300, 900, 1800]

// GetApiConfig 返回结构（对应 Go 侧 App.GetApiConfig 的 map[string]interface{}）
interface SavedConfig {
  base_url?: string
  login_url?: string
  jwt_secret?: string
  remember_login?: boolean
  saved_username?: string
  saved_password?: string
}

interface SecretFieldProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  language: 'zh' | 'en'
  autoFocus?: boolean
  mono?: boolean
}

function SecretField({ id, label, value, onChange, placeholder, language, autoFocus, mono }: SecretFieldProps) {
  const [visible, setVisible] = useState(false)
  const visibilityLabel = language === 'zh' ? (visible ? '隐藏' : '显示') : visible ? 'Hide' : 'Show'

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <div className="relative">
        <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          required
          autoComplete="off"
          aria-label={label}
          className={`w-full rounded-lg border border-border bg-card py-2.5 pl-10 pr-10 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground/40 focus:border-primary focus:ring-2 focus:ring-primary/20 ${
            mono ? 'font-mono' : ''
          }`}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visibilityLabel}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}

export function LoginPage() {
  const [server, setServer] = useState('')
  const [jwtSecret, setJwtSecret] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [rememberLogin, setRememberLogin] = useState(false)
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [error, setError] = useState('')
  const [authNotice, setAuthNotice] = useState('')
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

    const saved = localStorage.getItem(SERVER_KEY)
    if (saved) setServer(saved)

    const applyConfig = (config: SavedConfig) => {
      if (cancelled) return
      const configServer = config.login_url || config.base_url
      // 仅当配置里确实有值时覆盖，避免空值冲掉 localStorage 恢复的 server
      if (configServer) setServer(configServer)
      if (config.jwt_secret) setJwtSecret(config.jwt_secret)
      setRememberLogin(Boolean(config.remember_login))
      if (config.remember_login) {
        setUsername(config.saved_username || '')
        setPassword(config.saved_password || '')
      }
    }

    const restoreConfig = async (attempt: number) => {
      try {
        const config = (await GetApiConfig()) as SavedConfig | null
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

    const authError = sessionStorage.getItem(AUTH_ERROR_MESSAGE_KEY)
    if (authError) {
      setAuthNotice(authError)
      sessionStorage.removeItem(AUTH_ERROR_MESSAGE_KEY)
    }

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
      const result = await Login(server, username, password, jwtSecret, rememberLogin)
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

  const toggleTheme = () => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
  const toggleLanguage = () => setLanguage(language === 'zh' ? 'en' : 'zh')

  const noticeHeading = authNotice.includes('管理员登录入口')
    ? t('admin.login_notice_changed', language)
    : t('admin.login_notice_expired', language)

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* 品牌面板：窄窗口下隐藏 */}
      <aside className="relative hidden w-[46%] shrink-0 flex-col justify-between overflow-hidden bg-[#0d0d10] p-10 text-white lg:flex">
        {/* 背景氛围：金色光晕 + 细密网点 */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(60% 45% at 85% 8%, rgba(212,175,55,0.22), transparent 70%), radial-gradient(50% 40% at 8% 92%, rgba(212,175,55,0.10), transparent 70%), radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)',
            backgroundSize: '100% 100%, 100% 100%, 26px 26px',
          }}
        />

        <div className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#d4af37] font-serif text-lg font-bold text-black">
            M
          </div>
          <div>
            <p className="font-serif text-lg font-medium tracking-wide">MO Gallery</p>
            <p className="text-[10px] uppercase tracking-[0.3em] text-white/40">Desktop</p>
          </div>
        </div>

        <div className="relative max-w-md">
          <p className="mb-5 font-serif text-3xl font-light leading-snug tracking-tight text-white/90">
            {t('admin.brand_tagline', language)}
          </p>
          <ul className="space-y-3.5 text-sm text-white/55">
            <li className="flex items-center gap-3">
              <Images className="h-4 w-4 text-[#d4af37]" />
              {t('admin.local_library', language)}
            </li>
            <li className="flex items-center gap-3">
              <BookOpen className="h-4 w-4 text-[#d4af37]" />
              {t('admin.page_photo_journal', language)}
            </li>
            <li className="flex items-center gap-3">
              <Sparkles className="h-4 w-4 text-[#d4af37]" />
              {t('admin.page_ai_assistant', language)}
            </li>
          </ul>
        </div>

        <p className="relative text-[10px] uppercase tracking-[0.3em] text-white/30">
          MO Gallery Desktop
        </p>
      </aside>

      {/* 表单面板 */}
      <main className="relative flex min-w-0 flex-1 items-center justify-center overflow-y-auto px-6 py-12">
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

        <div className="w-full max-w-sm animate-fade-up">
          {/* 移动端/窄窗口的品牌头部 */}
          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <div
              className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl font-serif text-xl font-bold"
              style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}
            >
              M
            </div>
            <h1 className="font-serif text-2xl font-medium tracking-tight">MO Gallery</h1>
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
                {t('admin.server_address', language)}
              </label>
              <div className="relative">
                <Server className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
                <input
                  id="server"
                  type="text"
                  inputMode="url"
                  value={server}
                  onChange={(e) => {
                    setServer(e.target.value)
                    clearError()
                  }}
                  placeholder={t('admin.server_address_hint', language)}
                  disabled={loading}
                  required
                  autoFocus
                  autoComplete="url"
                  className="w-full rounded-lg border border-border bg-card py-2.5 pl-10 pr-3.5 font-mono text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground/40 focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                />
              </div>
            </div>

            <SecretField
              id="jwt-secret"
              label={t('admin.jwt_secret', language)}
              value={jwtSecret}
              onChange={(v) => {
                setJwtSecret(v)
                clearError()
              }}
              placeholder={t('admin.jwt_secret_hint', language)}
              language={language}
              mono
            />

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
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="remember-login"
                checked={rememberLogin}
                onChange={(e) => setRememberLogin(e.target.checked)}
                disabled={loading}
                className="h-4 w-4 cursor-pointer rounded border-border"
                style={{ accentColor: 'var(--primary)' }}
              />
              <label htmlFor="remember-login" className="cursor-pointer text-xs text-muted-foreground">
                {t('admin.remember_login', language)}
              </label>
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

          <p className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            {t('admin.login_footer', language)}
          </p>
        </div>
      </main>
    </div>
  )
}
