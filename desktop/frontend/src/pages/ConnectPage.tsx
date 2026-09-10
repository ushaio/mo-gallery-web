import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Globe, Moon, Sun, TriangleAlert, Unplug } from 'lucide-react'
import { WebConnectPanel } from '@/components/auth/WebConnectPanel'
import { AuthBrandPanel } from '@/components/layout/AuthBrandPanel'
import { useAuth } from '@/contexts/AuthContext'
import { AUTH_ERROR_MESSAGE_KEY } from '@/lib/auth-errors'
import { usePreferences } from '@/store/preferences'
import { t } from '@/lib/i18n'
import { DisconnectSite } from '../../wailsjs/go/main/App'

/**
 * 站点连接/重连页：官方登录后可随时连接自建 web 站点；
 * web 会话失效时 AuthContext 会引导到这里重新连接。
 * 与登录页共用品牌面板布局，连接是可选步骤，可随时跳过。
 */
export function ConnectPage() {
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light')
  const { language, theme, accent, setTheme, setLanguage } = usePreferences()
  const navigate = useNavigate()
  const { isAuthenticated, user, logout } = useAuth()
  const [authNotice] = useState(() => {
    const message = sessionStorage.getItem(AUTH_ERROR_MESSAGE_KEY) || ''
    sessionStorage.removeItem(AUTH_ERROR_MESSAGE_KEY)
    return message
  })

  // 连接页独立应用主题（AdminLayout 只覆盖登录后的页面）
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

  const copy = useMemo(() => ({
    eyebrow: t('admin.connect_site', language),
    heading: t('admin.connect_heading', language),
    subtitle: t('admin.connect_subtitle', language),
    connected: t('admin.site_connected', language),
    disconnect: t('admin.disconnect_site', language),
    skip: t('admin.connect_skip', language),
    enter: t('admin.connect_enter', language),
  }), [language])

  const handleDisconnect = async () => {
    await DisconnectSite().catch(() => undefined)
    logout()
  }

  // 落点由 App 的 / 路由决定：已连接站点 → /home，未连接 → 本地资源库
  const skip = () => navigate('/', { replace: true })

  const toggleTheme = () => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
  const toggleLanguage = () => setLanguage(language === 'zh' ? 'en' : 'zh')

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
            <p className="mt-1 text-xs text-muted-foreground">{copy.subtitle}</p>
          </div>

          {/* 宽屏标题 */}
          <div className="mb-8 hidden lg:block">
            <p className="text-[10px] font-medium uppercase tracking-[0.3em] text-muted-foreground">
              {copy.eyebrow}
            </p>
            <h1 className="mt-2 font-serif text-3xl font-light tracking-tight">
              {copy.heading}
            </h1>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {copy.subtitle}
            </p>
          </div>

          {authNotice && (
            <div
              role="alert"
              className="mb-6 flex items-start gap-2 rounded-lg border px-4 py-3 text-sm"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--warning, #d97706) 10%, transparent)',
                borderColor: 'color-mix(in srgb, var(--warning, #d97706) 35%, transparent)',
              }}
            >
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--warning, #d97706)' }} />
              <span>{authNotice}</span>
            </div>
          )}

          {isAuthenticated ? (
            <div className="space-y-5">
              <div className="flex flex-col items-start gap-3 rounded-lg border border-border bg-card px-4 py-3.5">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Check className="h-4 w-4 text-primary" />
                  {copy.connected}
                </div>
                {user?.username && <p className="text-xs text-muted-foreground">{user.username}</p>}
              </div>
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={skip}
                  className="flex h-10 items-center rounded-lg bg-primary px-5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  {copy.enter}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDisconnect()}
                  className="flex h-10 items-center gap-1.5 rounded-lg border border-destructive/40 px-4 text-xs font-medium text-destructive transition-colors hover:bg-destructive/5"
                >
                  <Unplug className="h-3.5 w-3.5" />
                  {copy.disconnect}
                </button>
              </div>
            </div>
          ) : (
            <>
              <WebConnectPanel onConnected={skip} />
              <button
                type="button"
                onClick={skip}
                className="mt-5 w-full text-center text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {copy.skip}
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
