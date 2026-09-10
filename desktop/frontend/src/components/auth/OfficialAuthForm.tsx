import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  ArrowRight,
  ChevronDown,
  Eye,
  EyeOff,
  Globe,
  Loader2,
  Lock,
  TriangleAlert,
  User,
} from 'lucide-react'
import { useOfficialAuth, type OfficialUser } from '@/contexts/OfficialAuthContext'
import { getErrorMessage } from '@/lib/auth-errors'
import { usePreferences } from '@/store/preferences'
import { t } from '@/lib/i18n'
import { OfficialLogin, OfficialRegister } from '../../../wailsjs/go/main/App'

// 与 official 站注册规则保持一致：字母/数字/下划线/中文/连字符，2-32 位
const USERNAME_PATTERN = /^[\w\u4e00-\u9fa5-]{2,32}$/

export type OfficialAuthMode = 'login' | 'register'

interface OfficialAuthFormProps {
  /** 登录/注册成功（officialLogin 已写入上下文）后的回调 */
  onSuccess: (user: OfficialUser) => void
  /** 是否显示 登录/注册 切换链接（向导内可关闭，只保留登录） */
  showModeSwitch?: boolean
  initialMode?: OfficialAuthMode
}

export function OfficialAuthForm({ onSuccess, showModeSwitch = true, initialMode = 'login' }: OfficialAuthFormProps) {
  const [mode, setMode] = useState<OfficialAuthMode>(initialMode)
  const [server, setServer] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [rememberLogin, setRememberLogin] = useState(true)
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login: officialLogin, baseUrl } = useOfficialAuth()
  const { language } = usePreferences()
  const zh = language === 'zh'

  // 官方服务器地址默认值：优先取已配置地址，否则回退 localhost:3001
  useEffect(() => {
    setServer((current) => current || baseUrl || 'http://localhost:3001')
  }, [baseUrl])

  const copy = useMemo(() => zh ? {
    switchToRegister: t('admin.official_switch_register', language),
    switchToLogin: t('admin.official_switch_login', language),
    username: t('admin.username', language),
    usernameHint: t('admin.official_username_hint', language),
    password: t('admin.password', language),
    passwordHint: t('admin.official_password_hint', language),
    confirmPassword: t('admin.confirm_password', language),
    passwordMismatch: t('admin.password_mismatch', language),
    serverAddress: t('admin.official_server_address', language),
    advanced: t('admin.advanced_options', language),
    remember: t('admin.remember_login', language),
    submitLogin: t('admin.loginButton', language),
    submitRegister: t('admin.registerButton', language),
    show: '显示',
    hide: '隐藏',
    failed: t('admin.loginFailed', language),
  } : {
    switchToRegister: t('admin.official_switch_register', language),
    switchToLogin: t('admin.official_switch_login', language),
    username: t('admin.username', language),
    usernameHint: t('admin.official_username_hint', language),
    password: t('admin.password', language),
    passwordHint: t('admin.official_password_hint', language),
    confirmPassword: t('admin.confirm_password', language),
    passwordMismatch: t('admin.password_mismatch', language),
    serverAddress: t('admin.official_server_address', language),
    advanced: t('admin.advanced_options', language),
    remember: t('admin.remember_login', language),
    submitLogin: t('admin.loginButton', language),
    submitRegister: t('admin.registerButton', language),
    show: 'Hide',
    hide: 'Show',
    failed: t('admin.loginFailed', language),
  }, [zh, language])

  const clearError = () => setError('')

  const validateRegister = (): string => {
    if (!USERNAME_PATTERN.test(username.trim())) {
      return copy.usernameHint
    }
    if (password.length < 6 || password.length > 128) {
      return copy.passwordHint
    }
    if (password !== confirmPassword) {
      return copy.passwordMismatch
    }
    return ''
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (mode === 'register') {
      const validationError = validateRegister()
      if (validationError) {
        setError(validationError)
        return
      }
    }

    setLoading(true)
    try {
      const result = mode === 'login'
        ? await OfficialLogin(server, username, password, rememberLogin)
        : await OfficialRegister(server, username, password)
      if (result?.token && result?.user) {
        officialLogin(result.user)
        onSuccess(result.user)
      } else {
        setError(copy.failed)
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err) || copy.failed)
    } finally {
      setLoading(false)
    }
  }

  const switchMode = (next: OfficialAuthMode) => {
    setMode(next)
    setError('')
  }

  const inputClassName = 'w-full rounded-lg border border-border bg-card py-2.5 pl-10 pr-3.5 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground/40 focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60'
  const passwordInputClassName = inputClassName.replace('pr-3.5', 'pr-10')

  return (
    <div>
      <form onSubmit={handleSubmit} className="space-y-5" aria-busy={loading}>
        {/* 用户名 */}
        <div>
          <label htmlFor="official-username" className="mb-1.5 block text-xs font-medium text-muted-foreground">
            {copy.username}
          </label>
          <div className="relative">
            <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
            <input
              id="official-username"
              type="text"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value)
                clearError()
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
          <label htmlFor="official-password" className="mb-1.5 block text-xs font-medium text-muted-foreground">
            {copy.password}
          </label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
            <input
              id="official-password"
              type={passwordVisible ? 'text' : 'password'}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                clearError()
              }}
              disabled={loading}
              required
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              className={passwordInputClassName}
            />
            <button
              type="button"
              onClick={() => setPasswordVisible((v) => !v)}
              aria-label={passwordVisible ? copy.hide : copy.show}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
            >
              {passwordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* 注册：确认密码 */}
        {mode === 'register' && (
          <div>
            <label htmlFor="official-confirm-password" className="mb-1.5 block text-xs font-medium text-muted-foreground">
              {copy.confirmPassword}
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
              <input
                id="official-confirm-password"
                type={passwordVisible ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value)
                  clearError()
                }}
                disabled={loading}
                required
                autoComplete="new-password"
                className={passwordInputClassName}
              />
            </div>
          </div>
        )}

        {/* 高级：官方服务器地址 */}
        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
            {copy.advanced}
          </button>
          {showAdvanced && (
            <div className="mt-2 space-y-1.5">
              <div className="relative">
                <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
                <input
                  id="official-server"
                  type="url"
                  value={server}
                  onChange={(e) => {
                    setServer(e.target.value)
                    clearError()
                  }}
                  disabled={loading}
                  required
                  autoComplete="url"
                  placeholder="http://localhost:3001"
                  className={inputClassName}
                />
              </div>
              <p className="text-[11px] text-muted-foreground/70">{copy.serverAddress}</p>
            </div>
          )}
        </div>

        {/* 记住登录（仅登录模式） */}
        {mode === 'login' && (
          <label htmlFor="official-remember" className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              id="official-remember"
              checked={rememberLogin}
              onChange={(e) => setRememberLogin(e.target.checked)}
              disabled={loading}
              className="h-4 w-4 cursor-pointer rounded border-border"
              style={{ accentColor: 'var(--primary)' }}
            />
            {copy.remember}
          </label>
        )}

        {/* 错误提示（紧贴主按钮，与连接站点表单一致） */}
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
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {mode === 'login' ? copy.submitLogin : copy.submitRegister}
            </>
          ) : (
            <>
              {mode === 'login' ? copy.submitLogin : copy.submitRegister}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </>
          )}
        </button>
      </form>

      {showModeSwitch && (
        <button
          type="button"
          onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
          disabled={loading}
          className="mt-5 w-full text-center text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
        >
          {mode === 'login' ? copy.switchToRegister : copy.switchToLogin}
        </button>
      )}
    </div>
  )
}
