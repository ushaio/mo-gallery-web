import { Fragment, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Globe,
  Loader2,
  Moon,
  Sun,
  TriangleAlert,
  UserRound,
  Unplug,
  type LucideIcon,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { CompleteSetup, GetApiConfig } from '../../wailsjs/go/main/App'
import { AuthBrandPanel } from '@/components/layout/AuthBrandPanel'
import { OfficialAuthForm } from '@/components/auth/OfficialAuthForm'
import { WebConnectPanel } from '@/components/auth/WebConnectPanel'
import { useOfficialAuth } from '@/contexts/OfficialAuthContext'
import { useAuth } from '@/contexts/AuthContext'
import { usePreferences } from '@/store/preferences'
import { t } from '@/lib/i18n'

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

export function SetupPage({ initialState, onComplete }: Props) {
  const navigate = useNavigate()
  const { user: officialUser } = useOfficialAuth()
  const { isAuthenticated: siteConnected } = useAuth()
  const { language, theme, accent, setTheme, setLanguage } = usePreferences()
  const zh = language === 'zh'
  const [step, setStep] = useState(0)
  const [api, setApi] = useState({ ...fallbackState.api, ...initialState.api })
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
      root.dataset.accent = accent
    }
    applyTheme()

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      mq.addEventListener('change', applyTheme)
      return () => mq.removeEventListener('change', applyTheme)
    }
  }, [theme, accent])

  const copy = useMemo(() => zh ? {
    eyebrow: '首次启动', title: '欢迎使用 Emulsion',
    body: '登录官方账号后即可使用。可选择性连接你的自建站点，未连接时本地功能照常可用。',
    officialStep: '官方账号', siteStep: '连接站点', next: '下一步', back: '上一步',
    finish: '完成并进入', skip: '暂不连接站点', optional: '可选',
    officialLoggedIn: '已登录官方账号', siteConnected: '已连接站点', required: '必填',
    saving: '正在保存...', saveError: '保存失败，请重试',
    stepLabel: (current: number, total: number) => `步骤 ${current} / ${total}`,
  } : {
    eyebrow: 'FIRST RUN', title: 'Welcome to Emulsion',
    body: 'Sign in with your official account to continue. Connecting your self-hosted site is optional — local features work without it.',
    officialStep: 'Official account', siteStep: 'Connect site', next: 'Continue', back: 'Back',
    finish: 'Finish and enter', skip: 'Skip for now', optional: 'Optional',
    officialLoggedIn: 'Signed in', siteConnected: 'Site connected', required: 'Required',
    saving: 'Saving...', saveError: 'Could not save setup. Try again.',
    stepLabel: (current: number, total: number) => `Step ${current} / ${total}`,
  }, [zh])

  const steps = [
    { icon: UserRound, title: copy.officialStep },
    { icon: Globe, title: copy.siteStep },
  ]
  const StepIcon = steps[step].icon

  const finishSetup = async (offlineOnly: boolean) => {
    setSaving(true)
    setError('')
    try {
      // 站点凭据已由 Login 绑定持久化，这里只负责标记向导完成；
      // 不回传 api 字段，避免空 login_url 触发地址校验失败。
      await CompleteSetup({ offline_only: offlineOnly })
      onComplete({
        completed: true,
        api: {
          base_url: api.base_url,
          login_url: api.login_url,
          remember_login: api.remember_login,
          saved_username: api.saved_username,
          password_configured: api.password_configured,
        },
      })
      // 落点由 App 的 / 路由决定：已连接站点 → /home，未连接 → 本地资源库
      navigate('/', { replace: true })
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
    // 第二步提交：站点已在 WebConnectPanel 中连接成功，这里仅完成向导
    void finishSetup(false)
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
                E
              </div>
              <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-muted-foreground">{copy.eyebrow}</p>
              <h1 className="mt-1.5 font-serif text-2xl font-medium tracking-tight">Emulsion</h1>
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
                officialUser ? (
                  <div className="flex flex-col items-start gap-3 rounded-lg border border-border bg-card px-4 py-3.5">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Check className="h-4 w-4 text-primary" />
                      {copy.officialLoggedIn}
                    </div>
                    <p className="text-xs text-muted-foreground">{officialUser.username}</p>
                  </div>
                ) : (
                  <OfficialAuthForm onSuccess={() => undefined} />
                )
              ) : (
                <div className="space-y-4">
                  {siteConnected ? (
                    <div className="flex flex-col items-start gap-3 rounded-lg border border-border bg-card px-4 py-3.5">
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <Check className="h-4 w-4 text-primary" />
                        {copy.siteConnected}
                      </div>
                      <p className="text-xs text-muted-foreground">{api.login_url || api.base_url}</p>
                    </div>
                  ) : (
                    <WebConnectPanel onConnected={() => {
                      // Login 已持久化站点配置，刷新本地展示用状态
                      void GetApiConfig().then((config) => {
                        const saved = config as unknown as SetupState['api'] | null
                        if (saved) {
                          setApi((current) => ({ ...current, base_url: saved.base_url || '', login_url: saved.login_url || '' }))
                        }
                      }).catch(() => undefined)
                    }} />
                  )}
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
              {step === 0 && (
                <button
                  type="submit"
                  disabled={saving || !officialUser}
                  className="group flex h-10 items-center gap-2 rounded-lg bg-primary px-5 text-xs font-medium text-primary-foreground transition-all hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />}
                  {saving ? copy.saving : copy.next}
                </button>
              )}
              {step === steps.length - 1 && !siteConnected && (
                <button
                  type="button"
                  onClick={() => void finishSetup(true)}
                  disabled={saving}
                  className="group flex h-10 items-center gap-2 rounded-lg bg-primary px-5 text-xs font-medium text-primary-foreground transition-all hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unplug className="h-3.5 w-3.5" />}
                  {saving ? copy.saving : copy.skip}
                </button>
              )}
              {step === steps.length - 1 && siteConnected && (
                <button
                  type="submit"
                  disabled={saving}
                  className="group flex h-10 items-center gap-2 rounded-lg bg-primary px-5 text-xs font-medium text-primary-foreground transition-all hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  {saving ? copy.saving : copy.finish}
                </button>
              )}
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}
