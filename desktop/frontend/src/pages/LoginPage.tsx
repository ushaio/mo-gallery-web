import { useState, useEffect, useMemo } from 'react'
import { Globe, Moon, ShieldCheck, Sun } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { OfficialAuthForm } from '@/components/auth/OfficialAuthForm'
import { AuthBrandPanel } from '@/components/layout/AuthBrandPanel'
import { usePreferences } from '@/store/preferences'
import { t } from '@/lib/i18n'

export function LoginPage() {
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light')
  const { language, theme, accent, setTheme, setLanguage } = usePreferences()
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
    welcome: t('admin.official_welcome', language),
    headingLogin: t('admin.official_heading', language),
    subtitleLogin: t('admin.official_subtitle', language),
    footer: t('admin.login_footer', language),
  }), [language])

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
            <p className="mt-1 text-xs text-muted-foreground">{copy.subtitleLogin}</p>
          </div>

          {/* 宽屏标题 */}
          <div className="mb-8 hidden lg:block">
            <p className="text-[10px] font-medium uppercase tracking-[0.3em] text-muted-foreground">
              {copy.welcome}
            </p>
            <h1 className="mt-2 font-serif text-3xl font-light tracking-tight">
              {copy.headingLogin}
            </h1>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {copy.subtitleLogin}
            </p>
          </div>

          <OfficialAuthForm onSuccess={() => navigate('/', { replace: true })} />

          <p className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            {copy.footer}
          </p>
        </div>
      </main>
    </div>
  )
}
