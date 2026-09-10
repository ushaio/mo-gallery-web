import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Eye, EyeOff, Globe, Loader2, Lock, TriangleAlert, UserRound } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { getErrorMessage } from '@/lib/auth-errors'
import { usePreferences } from '@/store/preferences'
import { t } from '@/lib/i18n'
import { Login, GetApiConfig } from '../../../wailsjs/go/main/App'
import { configuredLoginUrl, type SavedAuthConfig } from '@/lib/auth-config'

const CONFIG_RETRY_DELAYS_MS = [0, 300, 900, 1800]

interface WebConnectPanelProps {
  /** 连接成功（AuthContext 已写入 web 会话）后的回调 */
  onConnected?: () => void
  /** 自动补全用户名/密码（设置页重连时不回填已存密码可关掉） */
  prefillCredentials?: boolean
}

/**
 * 连接自建 web 站点的表单：服务器/管理员登录地址 + 账号密码。
 * 供首次向导第二步、/connect 重连页、设置页站点连接复用。
 */
export function WebConnectPanel({ onConnected, prefillCredentials = true }: WebConnectPanelProps) {
  const [server, setServer] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [rememberLogin, setRememberLogin] = useState(false)
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const { language } = usePreferences()
  const zh = language === 'zh'

  // 恢复上次使用的服务器地址和保存的凭据。开发模式下 React 可能先于
  // Wails bridge 恢复，按间隔重试而不是只调用一次。
  useEffect(() => {
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | undefined

    const applyConfig = (config: SavedAuthConfig) => {
      if (cancelled) return
      const configServer = configuredLoginUrl(config)
      // 仅当配置里确实有值时覆盖，避免空值冲掉已输入内容
      if (configServer) setServer(configServer)
      setRememberLogin(Boolean(config.remember_login))
      if (prefillCredentials && config.remember_login) {
        setUsername((current) => current || config.saved_username || '')
        setPassword((current) => current || config.saved_password || '')
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
  }, [prefillCredentials])

  const copy = useMemo(() => zh ? {
    server: t('admin.server_address', language),
    serverHint: t('admin.server_address_hint', language),
    username: t('admin.login_username', language),
    password: t('admin.login_password', language),
    remember: t('admin.remember_login', language),
    submit: t('admin.connect_site', language),
    secretSaved: zh ? '已保存，留空则继续沿用' : 'Saved. Leave blank to keep the current value.',
    failed: t('admin.loginFailed', language),
  } : {
    server: t('admin.server_address', language),
    serverHint: t('admin.server_address_hint', language),
    username: t('admin.login_username', language),
    password: t('admin.login_password', language),
    remember: t('admin.remember_login', language),
    submit: t('admin.connect_site', language),
    secretSaved: 'Saved. Leave blank to keep the current value.',
    failed: t('admin.loginFailed', language),
  }, [zh, language])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await Login(server, username, password, rememberLogin)
      if (result?.token) {
        login(result.token, result.user)
        onConnected?.()
      } else {
        setError(copy.failed)
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err) || copy.failed)
    } finally {
      setLoading(false)
    }
  }

  const inputClassName = 'w-full rounded-lg border border-border bg-card py-2.5 pl-10 pr-3.5 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground/40 focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60'
  const passwordInputClassName = inputClassName.replace('pr-3.5', 'pr-10')

  return (
    <form onSubmit={handleSubmit} className="space-y-5" aria-busy={loading}>
      {/* 服务器或管理员登录地址 */}
      <div>
        <label htmlFor="connect-server" className="mb-1.5 block text-xs font-medium text-muted-foreground">
          {copy.server}
        </label>
        <div className="relative">
          <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
          <input
            id="connect-server"
            type="url"
            value={server}
            onChange={(e) => {
              setServer(e.target.value)
              setError('')
            }}
            disabled={loading}
            required
            autoComplete="url"
            placeholder="https://gallery.example.com/login/private"
            className={inputClassName}
          />
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground/70">{copy.serverHint}</p>
      </div>

      {/* 用户名 */}
      <div>
        <label htmlFor="connect-username" className="mb-1.5 block text-xs font-medium text-muted-foreground">
          {copy.username}
        </label>
        <div className="relative">
          <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
          <input
            id="connect-username"
            type="text"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value)
              setError('')
            }}
            disabled={loading}
            required
            autoComplete="username"
            className={inputClassName}
          />
        </div>
      </div>

      {/* 密码 */}
      <div>
        <label htmlFor="connect-password" className="mb-1.5 block text-xs font-medium text-muted-foreground">
          {copy.password}
        </label>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
          <input
            id="connect-password"
            type={passwordVisible ? 'text' : 'password'}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              setError('')
            }}
            disabled={loading}
            required
            autoComplete="current-password"
            className={passwordInputClassName}
          />
          <button
            type="button"
            onClick={() => setPasswordVisible((v) => !v)}
            aria-label={zh ? (passwordVisible ? '隐藏' : '显示') : passwordVisible ? 'Hide' : 'Show'}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
          >
            {passwordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* 记住登录 */}
      <label htmlFor="connect-remember" className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          id="connect-remember"
          checked={rememberLogin}
          onChange={(e) => setRememberLogin(e.target.checked)}
          disabled={loading}
          className="h-4 w-4 cursor-pointer rounded border-border"
          style={{ accentColor: 'var(--primary)' }}
        />
        {copy.remember}
      </label>

      {error && (
        <div
          role="alert"
          aria-live="polite"
          className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="group flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {copy.submit}
      </button>
    </form>
  )
}
