import { Fragment, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Globe,
  HardDrive,
  Loader2,
  Lock,
  Moon,
  Sun,
  TriangleAlert,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { CompleteSetup, Login } from '../../wailsjs/go/main/App'
import { AuthBrandPanel } from '@/components/layout/AuthBrandPanel'
import { useAuth } from '@/contexts/AuthContext'
import { getErrorMessage } from '@/lib/auth-errors'
import { usePreferences } from '@/store/preferences'
import { configuredLoginUrl } from '@/lib/auth-config'

export interface SetupState {
  completed: boolean
  api: {
    base_url: string
    login_url: string
    remember_login: boolean
    saved_username?: string
    password_configured?: boolean
  }
}

interface Props {
  initialState: SetupState
  onComplete: (state: SetupState) => void
}

const fallbackState: SetupState = {
  completed: false,
  api: { base_url: '', login_url: '', remember_login: false, saved_username: '', password_configured: false },
}

interface SecretInputProps {
  label: string
  value: string
  onChange: (value: string) => void
  language: 'zh' | 'en'
  placeholder?: string
  disabled?: boolean
  icon?: LucideIcon
  required?: boolean
  autoComplete?: string
}

function SecretInput({ label, value, onChange, language, placeholder, disabled, icon: Icon, required, autoComplete }: SecretInputProps) {
  const [visible, setVisible] = useState(false)
  const visibilityLabel = language === 'zh' ? (visible ? '隐藏' : '显示') : visible ? 'Hide' : 'Show'

  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      <span className="relative block">
        {Icon && <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />}
        <input type={visible ? 'text' : 'password'} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} disabled={disabled} required={required} autoComplete={autoComplete}
          className={`w-full rounded-lg border border-border bg-background px-3 py-2.5 pr-10 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60 [&::-ms-clear]:hidden [&::-ms-reveal]:hidden ${Icon ? 'pl-10' : ''}`} />
        <button type="button" onClick={() => setVisible((current) => !current)} disabled={disabled} aria-label={visibilityLabel}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50">
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </span>
    </label>
  )
}

export function SetupPage({ initialState, onComplete }: Props) {
  const navigate = useNavigate()
  const { login } = useAuth()
  const { language, theme, setTheme, setLanguage } = usePreferences()
  const zh = language === 'zh'
  const [step, setStep] = useState(0)
  const [api, setApi] = useState({ ...fallbackState.api, ...initialState.api, password: '' })
  const [credentials, setCredentials] = useState({
    username: initialState.api.saved_username || '',
    password: '',
    rememberLogin: initialState.api.remember_login,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light')

  // 引导页独立应用主题（AdminLayout 只覆盖登录后的页面）
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

  const copy = useMemo(() => zh ? {
    eyebrow: '首次启动', title: '欢迎使用 MO Gallery', body: '花一分钟配置云端连接。业务数据由服务端统一管理，本地功能可离线使用。',
    connection: '配置连接', login: '登录信息', next: '下一步', back: '上一步',
    finish: '验证并进入', skip: '使用离线功能', optional: '可选', required: '必填',
    server: '服务地址', loginUsername: '管理员用户名', loginPassword: '管理员密码', rememberLogin: '记住登录（加密存储）',
    saved: '正在验证...', saveError: '保存失败，请重试', loginError: '登录验证失败，请检查连接和登录信息', secretSaved: '已保存，留空则继续沿用',
    stepLabel: (current: number, total: number) => `步骤 ${current} / ${total}`,
  } : {
    eyebrow: 'FIRST RUN', title: 'Welcome to MO Gallery', body: 'Connect to your server. Cloud data stays server-managed while local features remain available offline.',
    connection: 'Configure connection', login: 'Sign-in details', next: 'Continue', back: 'Back',
    finish: 'Verify and enter', skip: 'Use offline features', optional: 'Optional', required: 'Required',
    server: 'Server URL', loginUsername: 'Administrator username', loginPassword: 'Administrator password', rememberLogin: 'Remember login (encrypted)',
    saved: 'Verifying...', saveError: 'Could not save setup. Try again.', loginError: 'Sign-in verification failed. Check the connection and credentials.', secretSaved: 'Saved. Leave blank to keep the current value.',
    stepLabel: (current: number, total: number) => `Step ${current} / ${total}`,
  }, [zh])

  const steps = [
    { icon: Globe, title: copy.connection },
    { icon: UserRound, title: copy.login },
  ]
  const StepIcon = steps[step].icon

  const completedState = (offlineOnly = false): SetupState => ({
    completed: true,
    api: {
      base_url: api.base_url,
      login_url: api.login_url,
      remember_login: offlineOnly ? api.remember_login : credentials.rememberLogin,
      saved_username: offlineOnly ? api.saved_username : credentials.rememberLogin ? credentials.username : '',
      password_configured: offlineOnly ? api.password_configured : credentials.rememberLogin,
    },
  })

  const handleUseOffline = async () => {
    setSaving(true)
    setError('')
    try {
      await CompleteSetup({ api, offline_only: true })
      onComplete(completedState(true))
      navigate('/library?source=local', { replace: true })
    } catch {
      setError(copy.saveError)
    } finally {
      setSaving(false)
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')

    if (step < steps.length - 1) {
      setStep((current) => current + 1)
      return
    }

    setSaving(true)
    try {
    const server = configuredLoginUrl(api)
      const result = await Login(server, credentials.username, credentials.password, credentials.rememberLogin)
      if (!result?.token) {
        setError(copy.loginError)
        return
      }

      const setupApi = {
        ...api,
        remember_login: credentials.rememberLogin,
        saved_username: credentials.rememberLogin ? credentials.username : '',
        password: credentials.rememberLogin ? credentials.password : '',
      }
      await CompleteSetup({ api: setupApi, offline_only: false })
      onComplete(completedState())
      login(result.token, result.user)
      navigate('/overview', { replace: true })
    } catch (cause: unknown) {
      setError(getErrorMessage(cause) || copy.loginError)
    } finally {
      setSaving(false)
    }
  }

  const field = (label: string, value: string | number, onChange: (value: string) => void, options?: { type?: string; required?: boolean; placeholder?: string; icon?: LucideIcon; autoComplete?: string }) => {
    const Icon = options?.icon
    return (
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
        <span className="relative block">
          {Icon && <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />}
          <input type={options?.type || 'text'} value={value} required={options?.required} placeholder={options?.placeholder} autoComplete={options?.autoComplete} onChange={(event) => onChange(event.target.value)} disabled={saving}
            className={`w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60 ${Icon ? 'pl-10' : ''}`} />
        </span>
      </label>
    )
  }

  const toggleTheme = () => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
  const toggleLanguage = () => setLanguage(language === 'zh' ? 'en' : 'zh')

  return (
    <div className="flex h-full w-full overflow-hidden bg-background text-foreground">
      <AuthBrandPanel language={language} />

      {/* 向导面板 */}
      <main className="relative flex min-w-0 flex-1 flex-col overflow-y-auto" style={{ scrollbarGutter: 'stable' }}>
        {/* 顶部快捷操作 */}
        <div className="absolute right-5 top-5 z-10 flex items-center gap-2">
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

        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col px-6 pb-12 pt-8 lg:pt-0">
          {/* 步骤头部：桌面端固定高度区域，头部在其中下移；表单居中区域不随头部偏移变化 */}
          <div className="flex shrink-0 flex-col justify-end lg:h-44 lg:pb-9">
            {/* 窄窗口品牌头部 */}
            <div className="mb-8 flex flex-col items-center text-center lg:hidden">
              <div
                className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl font-serif text-xl font-bold"
                style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}
              >
                M
              </div>
              <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-muted-foreground">{copy.eyebrow}</p>
              <h1 className="mt-1.5 font-serif text-2xl font-medium tracking-tight">MO Gallery</h1>
              <p className="mt-1.5 max-w-sm text-xs leading-5 text-muted-foreground">{copy.body}</p>
            </div>

            {/* 连接式步骤指示器 */}
            <div className="mb-8 flex items-center gap-3 lg:mb-0" aria-label={zh ? '引导步骤' : 'Setup steps'}>
              {steps.map(({ icon: Icon, title }, index) => {
                const isActive = step === index
                const isDone = step > index
                return (
                  <Fragment key={title}>
                    {index > 0 && <div aria-hidden="true" className={`h-px flex-1 rounded-full transition-colors ${isDone ? 'bg-primary/50' : 'bg-border'}`} />}
                    <div className={`flex items-center gap-2.5 ${isActive ? 'opacity-100' : isDone ? 'opacity-90' : 'opacity-60'}`}>
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-all ${
                          isActive
                            ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                            : isDone
                              ? 'border-primary/60 bg-primary/10 text-primary'
                              : 'border-border bg-card text-muted-foreground'
                        }`}
                      >
                        {isDone ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                      </div>
                      <span className={`text-xs font-medium ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>{title}</span>
                    </div>
                  </Fragment>
                )
              })}
            </div>
          </div>

          <form onSubmit={submit} className="my-auto">
            <div className="flex items-center justify-between gap-4 sm:min-h-[72px]">
              <div className="flex items-center gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <StepIcon className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-serif text-2xl font-light leading-tight">{steps[step].title}</h2>
                </div>
              </div>
              <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground/70">
                {copy.stepLabel(step + 1, steps.length)}
              </span>
            </div>

            <div className="mt-7 sm:min-h-[252px]">
              {step === 0 ? (
                <div className="space-y-4">
                  {field(copy.server, api.login_url, (value) => setApi((current) => ({ ...current, login_url: value })), { icon: Globe, placeholder: 'https://gallery.example.com/login/private', required: true, autoComplete: 'url' })}
                </div>
              ) : (
                <div className="space-y-4">
                  {field(copy.loginUsername, credentials.username, (value) => setCredentials((current) => ({ ...current, username: value })), { icon: UserRound, required: true, autoComplete: 'username' })}
                  <SecretInput label={copy.loginPassword} value={credentials.password} onChange={(value) => setCredentials((current) => ({ ...current, password: value }))} language={language} placeholder={api.password_configured ? copy.secretSaved : undefined} disabled={saving} icon={Lock} required={!api.password_configured} autoComplete="current-password" />
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={credentials.rememberLogin}
                      onChange={(event) => setCredentials((current) => ({ ...current, rememberLogin: event.target.checked }))}
                      disabled={saving}
                      className="h-4 w-4 cursor-pointer rounded border-border"
                      style={{ accentColor: 'var(--primary)' }}
                    />
                    {copy.rememberLogin}
                  </label>
                </div>
              )}

              {error && (
                <p role="alert" className="mt-4 flex items-center gap-1.5 text-xs text-destructive">
                  <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
                  {error}
                </p>
              )}
            </div>

            {/* 操作区 */}
            <div className="mt-7 flex items-center justify-end gap-2">
              {step > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setError('')
                    setStep((current) => current - 1)
                  }}
                  disabled={saving}
                  className="flex h-10 items-center gap-1.5 rounded-lg border border-border bg-background px-4 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  {copy.back}
                </button>
              )}
              <button
                type="submit"
                disabled={saving}
                className="group flex h-10 items-center gap-2 rounded-lg bg-primary px-5 text-xs font-medium text-primary-foreground transition-all hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : step < steps.length - 1 ? (
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                {saving ? copy.saved : step < steps.length - 1 ? copy.next : copy.finish}
              </button>
            </div>
          </form>

          <button
            type="button"
            onClick={() => void handleUseOffline()}
            disabled={saving}
            className="group mx-auto mt-5 flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            <HardDrive className="h-4 w-4 text-muted-foreground/60 transition-colors group-hover:text-foreground" />
            {copy.skip}
          </button>
        </div>
      </main>
    </div>
  )
}
