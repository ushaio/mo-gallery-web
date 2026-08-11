import { Fragment, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Database,
  Eye,
  EyeOff,
  Globe,
  HardDrive,
  Hash,
  KeyRound,
  Loader2,
  Lock,
  Moon,
  Server,
  ShieldCheck,
  Sparkles,
  Sun,
  TriangleAlert,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { CompleteSetup, Login } from '../../wailsjs/go/main/App'
import { useAuth } from '@/contexts/AuthContext'
import { getErrorMessage } from '@/lib/auth-errors'
import { usePreferences } from '@/store/preferences'
import { t } from '@/lib/i18n'

export interface SetupState {
  completed: boolean
  database: {
    host: string
    port: number
    user: string
    password?: string
    password_configured?: boolean
    dbname: string
    sslmode: string
  }
  api: {
    base_url: string
    login_url: string
    jwt_secret: string
    jwt_configured?: boolean
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
  database: { host: 'localhost', port: 5432, user: 'postgres', password: '', password_configured: false, dbname: 'mo_gallery', sslmode: 'disable' },
  api: { base_url: '', login_url: '', jwt_secret: '', jwt_configured: false, remember_login: false, saved_username: '', password_configured: false },
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
  const [database, setDatabase] = useState({ ...fallbackState.database, ...initialState.database })
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
    eyebrow: '首次启动', title: '欢迎使用 MO Gallery', body: '花一分钟配置连接信息。数据库和云端登录都可以稍后在设置中修改。',
    database: '配置数据库', databaseBody: '用于云端内容索引。没有数据库也可以直接使用离线资源库。', connection: '配置连接', connectionBody: '填写 MO Gallery Web 服务地址和 JWT Secret。', login: '登录信息', loginBody: '输入管理员账号，验证成功后将直接进入 MO Gallery。', next: '下一步', back: '上一步',
    finish: '验证并进入', skip: '使用离线功能', optional: '可选', required: '必填',
    host: '主机', port: '端口', user: '用户名', password: '密码', dbname: '数据库名', sslmode: 'SSL 模式',
    server: '服务地址', jwt: 'JWT Secret', loginUsername: '管理员用户名', loginPassword: '管理员密码', rememberLogin: '记住登录（加密存储）',
    saved: '正在验证...', saveError: '保存失败，请重试', loginError: '登录验证失败，请检查连接和登录信息', secretSaved: '已保存，留空则继续沿用',
    stepLabel: (current: number, total: number) => `步骤 ${current} / ${total}`,
    brandPoints: [
      { icon: Database, text: '云端图库索引与同步' },
      { icon: HardDrive, text: '本地原图资源库，离线可用' },
      { icon: Sparkles, text: 'AI 助手工作台' },
    ],
  } : {
    eyebrow: 'FIRST RUN', title: 'Welcome to MO Gallery', body: 'Take a minute to configure your connections. You can change them later in Settings.',
    database: 'Configure database', databaseBody: 'Used for cloud content indexes. You can still use the offline library without one.', connection: 'Configure connection', connectionBody: 'Add the MO Gallery Web server URL and JWT Secret.', login: 'Sign-in details', loginBody: 'Enter the administrator account. A successful verification opens MO Gallery directly.', next: 'Continue', back: 'Back',
    finish: 'Verify and enter', skip: 'Use offline features', optional: 'Optional', required: 'Required',
    host: 'Host', port: 'Port', user: 'User', password: 'Password', dbname: 'Database name', sslmode: 'SSL mode',
    server: 'Server URL', jwt: 'JWT Secret', loginUsername: 'Administrator username', loginPassword: 'Administrator password', rememberLogin: 'Remember login (encrypted)',
    saved: 'Verifying...', saveError: 'Could not save setup. Try again.', loginError: 'Sign-in verification failed. Check the connection and credentials.', secretSaved: 'Saved. Leave blank to keep the current value.',
    stepLabel: (current: number, total: number) => `Step ${current} / ${total}`,
    brandPoints: [
      { icon: Database, text: 'Cloud gallery indexes and sync' },
      { icon: HardDrive, text: 'Local library, fully offline' },
      { icon: Sparkles, text: 'AI assistant workspace' },
    ],
  }, [zh])

  const steps = [
    { icon: Database, title: copy.database },
    { icon: Globe, title: copy.connection },
    { icon: UserRound, title: copy.login },
  ]
  const stepBodies = [copy.databaseBody, copy.connectionBody, copy.loginBody]
  const StepIcon = steps[step].icon

  const completedState = (offlineOnly = false): SetupState => ({
    completed: true,
    database: {
      host: database.host,
      port: database.port,
      user: database.user,
      password: '',
      password_configured: database.password_configured || Boolean(database.password),
      dbname: database.dbname,
      sslmode: database.sslmode,
    },
    api: {
      base_url: api.base_url,
      login_url: api.login_url,
      jwt_secret: '',
      jwt_configured: api.jwt_configured || Boolean(api.jwt_secret.trim()),
      remember_login: offlineOnly ? api.remember_login : credentials.rememberLogin,
      saved_username: offlineOnly ? api.saved_username : credentials.rememberLogin ? credentials.username : '',
      password_configured: offlineOnly ? api.password_configured : credentials.rememberLogin,
    },
  })

  const useOffline = async () => {
    setSaving(true)
    setError('')
    try {
      await CompleteSetup({ database, api, offline_only: true })
      onComplete(completedState(true))
      navigate('/library?source=local', { replace: true })
    } catch {
      setError(copy.saveError)
    } finally {
      setSaving(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setError('')
    if (step < steps.length - 1) {
      setStep((current) => current + 1)
      return
    }

    void (async () => {
      setSaving(true)
      try {
        const server = api.login_url.trim() || api.base_url.trim()
        const result = await Login(server, credentials.username, credentials.password, api.jwt_secret, credentials.rememberLogin)
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
        await CompleteSetup({ database, api: setupApi, offline_only: false })
        onComplete(completedState())
        login(result.token, result.user)
        navigate('/overview', { replace: true })
      } catch (cause: unknown) {
        setError(getErrorMessage(cause) || copy.loginError)
      } finally {
        setSaving(false)
      }
    })()
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
            {copy.brandPoints.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <Icon className="h-4 w-4 shrink-0 text-[#d4af37]" />
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[10px] uppercase tracking-[0.3em] text-white/30">
          MO Gallery Desktop
        </p>
      </aside>

      {/* 向导面板 */}
      <main className="relative flex min-w-0 flex-1 flex-col overflow-y-auto">
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

        <div className="mx-auto flex w-full max-w-xl flex-1 animate-fade-up flex-col px-6 pb-12 pt-8 lg:pt-0">
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

          {/* 步骤表单卡片 */}
          <form onSubmit={submit} className="my-auto overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            {/* 卡片头部 */}
            <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-5">
              <div className="flex items-start gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <StepIcon className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-serif text-lg font-medium leading-tight">{steps[step].title}</h2>
                  <p className="mt-0.5 max-w-md text-xs leading-5 text-muted-foreground">{stepBodies[step]}</p>
                </div>
              </div>
              <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground/70">
                {copy.stepLabel(step + 1, steps.length)}
              </span>
            </div>

            {/* 表单主体 */}
            <div className="px-6 py-6">
              {step === 0 ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {field(copy.host, database.host, (value) => setDatabase((current) => ({ ...current, host: value })), { icon: Server, required: true })}
                  {field(copy.port, database.port, (value) => setDatabase((current) => ({ ...current, port: Number(value) || 0 })), { icon: Hash, type: 'number', required: true })}
                  {field(copy.user, database.user, (value) => setDatabase((current) => ({ ...current, user: value })), { icon: UserRound, required: true })}
                  <SecretInput label={copy.password} value={database.password || ''} onChange={(value) => setDatabase((current) => ({ ...current, password: value }))} language={language} placeholder={database.password_configured ? copy.secretSaved : undefined} disabled={saving} icon={KeyRound} />
                  {field(copy.dbname, database.dbname, (value) => setDatabase((current) => ({ ...current, dbname: value })), { icon: Database, required: true })}
                  {field(copy.sslmode, database.sslmode, (value) => setDatabase((current) => ({ ...current, sslmode: value })), { icon: ShieldCheck, placeholder: 'disable' })}
                </div>
              ) : step === 1 ? (
                <div className="space-y-4">
                  {field(copy.server, api.login_url || api.base_url, (value) => setApi((current) => ({ ...current, base_url: value, login_url: value })), { icon: Globe, placeholder: 'https://gallery.example.com', required: true, autoComplete: 'url' })}
                  <SecretInput label={copy.jwt} value={api.jwt_secret} onChange={(value) => setApi((current) => ({ ...current, jwt_secret: value }))} language={language} placeholder={api.jwt_configured ? copy.secretSaved : undefined} disabled={saving} icon={KeyRound} required={!api.jwt_configured} autoComplete="off" />
                </div>
              ) : (
                <div className="space-y-4">
                  {field(copy.loginUsername, credentials.username, (value) => setCredentials((current) => ({ ...current, username: value })), { icon: UserRound, required: true, autoComplete: 'username' })}
                  <SecretInput label={copy.loginPassword} value={credentials.password} onChange={(value) => setCredentials((current) => ({ ...current, password: value }))} language={language} disabled={saving} icon={Lock} required autoComplete="current-password" />
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

              {/* 操作区 */}
              <div className="mt-6 flex items-center justify-end gap-2 border-t border-border pt-5">
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
            </div>
          </form>

          <button
            type="button"
            onClick={() => void useOffline()}
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
