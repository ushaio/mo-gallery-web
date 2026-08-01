import { useState, useRef, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Image, LibraryBig, BookOpen, Film, Upload, BookMarked,
  BookImage, Bot, HardDrive, Settings, Users, LogOut,
  Sun, Moon, Monitor, Globe, Check, ChevronDown,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { usePreferences } from '@/store/preferences'
import { t } from '@/lib/i18n'
import { GetApiConfig, GetSettings } from '../../../wailsjs/go/main/App'
import { BrowserOpenURL } from '../../../wailsjs/runtime/runtime'

const navItems = [
  { path: '/overview', icon: LayoutDashboard, key: 'admin.overview' },
  { path: '/photos', icon: Image, key: 'admin.library' },
  { path: '/local-library', icon: LibraryBig, key: 'admin.local_library' },
  { path: '/albums', icon: BookOpen, key: 'admin.albums' },
  { path: '/film-rolls', icon: Film, key: 'admin.film_rolls' },
  { path: '/upload', icon: Upload, key: 'admin.upload' },
  { path: '/photo-journal', icon: BookMarked, key: 'admin.logs' },
  { path: '/zine', icon: BookImage, key: 'admin.zine' },
  { path: '/ai-assistant', icon: Bot, key: 'admin.ai_assistant' },
  { path: '/storage', icon: HardDrive, key: 'admin.storage_cleanup' },
  { path: '/settings', icon: Settings, key: 'admin.config' },
  { path: '/friends', icon: Users, key: 'admin.friends' },
]

const themeOptions = [
  { value: 'light' as const, label: 'common.light', icon: Sun },
  { value: 'dark' as const, label: 'common.dark', icon: Moon },
  { value: 'system' as const, label: 'common.system', icon: Monitor },
]

const languageOptions = [
  { value: 'zh' as const, label: '中文' },
  { value: 'en' as const, label: 'English' },
]

export function Sidebar() {
  const { user, logout } = useAuth()
  const { language, theme, setLanguage, setTheme } = usePreferences()

  const [openMenu, setOpenMenu] = useState<'theme' | 'language' | null>(null)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [siteTitle, setSiteTitle] = useState('MO Gallery')
  const [siteUrl, setSiteUrl] = useState('')
  const menuRef = useRef<HTMLDivElement | null>(null)

  // 站点标题 + 站点地址：标题与「系统设置-站点-站点信息」一致（来自服务端 SITE_TITLE），
  // 地址取桌面端连接的服务器 base_url，即网站入口
  useEffect(() => {
    let cancelled = false
    Promise.allSettled([GetSettings(), GetApiConfig()]).then(([settingsRes, apiRes]) => {
      if (cancelled) return
      if (settingsRes.status === 'fulfilled' && settingsRes.value?.site_title) {
        setSiteTitle(settingsRes.value.site_title)
      }
      const baseUrl = apiRes.status === 'fulfilled' ? apiRes.value?.base_url : ''
      if (typeof baseUrl === 'string' && baseUrl) {
        setSiteUrl(baseUrl.replace(/\/+$/, ''))
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  // 点击站点标题：浏览器打开网站
  const handleOpenSite = () => {
    if (siteUrl) BrowserOpenURL(siteUrl)
  }

  const handleLogoutConfirm = () => {
    setShowLogoutConfirm(false)
    logout()
  }

  useEffect(() => {
    if (!openMenu) return
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [openMenu])

  const currentThemeLabel = t(themeOptions.find((o) => o.value === theme)?.label ?? 'common.system', language)
  const currentLanguageLabel = languageOptions.find((o) => o.value === language)?.label ?? '中文'

  return (
    <aside
      className="flex h-full flex-col select-none border-r"
      onDragStartCapture={(event) => event.preventDefault()}
      style={{
        width: 'var(--sidebar-width)',
        backgroundColor: 'var(--card)',
        borderColor: 'var(--border)',
      }}
    >
      {/* Logo（点击站点标题 → 浏览器打开网站） */}
      <button
        type="button"
        onClick={handleOpenSite}
        title={siteUrl ? `打开网站：${siteUrl}` : undefined}
        disabled={!siteUrl}
        className="flex h-16 w-full items-center gap-3 border-b px-5 min-w-0 text-left transition-opacity hover:opacity-75 disabled:cursor-default disabled:hover:opacity-100"
        style={{ borderColor: 'var(--border)', backgroundColor: 'transparent', color: 'var(--foreground)' }}
      >
        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold font-serif shrink-0"
          style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
          {siteTitle.charAt(0).toUpperCase() || 'M'}
        </div>
        <span className="font-serif font-bold text-sm tracking-widest uppercase truncate">{siteTitle}</span>
      </button>

      {/* 导航 */}
      <nav className="flex-1 overflow-y-auto py-2 px-2">
        {navItems.map(({ path, icon: Icon, key }) => (
          <NavLink
            key={path}
            to={path}
            draggable={false}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors mb-0.5 ${
                isActive
                  ? 'font-medium'
                  : 'hover:opacity-80'
              }`
            }
            style={({ isActive }) => ({
              backgroundColor: isActive ? 'var(--accent)' : 'transparent',
              color: isActive ? 'var(--accent-foreground)' : 'var(--muted-foreground)',
            })}
          >
            <Icon size={18} />
            <span>{t(key, language)}</span>
          </NavLink>
        ))}
      </nav>

      {/* 外观 + 语言切换（用户区上方） */}
      <div ref={menuRef} className="border-t px-2 py-2 flex flex-col gap-1" style={{ borderColor: 'var(--border)' }}>
        {/* 外观切换 */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpenMenu(openMenu === 'theme' ? null : 'theme')}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition-colors hover:opacity-80"
            style={{ color: 'var(--muted-foreground)' }}
          >
            {theme === 'dark' ? <Moon size={14} /> : theme === 'light' ? <Sun size={14} /> : <Monitor size={14} />}
            <span className="flex-1 text-left">{currentThemeLabel}</span>
            <ChevronDown
              size={12}
              style={{
                transform: openMenu === 'theme' ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 200ms',
              }}
            />
          </button>
          {openMenu === 'theme' && (
            <div
              className="absolute bottom-full left-0 right-0 mb-1 rounded-md border shadow-lg overflow-hidden"
              style={{ backgroundColor: 'var(--popover)', borderColor: 'var(--border)' }}
            >
              {themeOptions.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setTheme(value)
                    setOpenMenu(null)
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors hover:opacity-80"
                  style={{
                    color: 'var(--popover-foreground)',
                    backgroundColor: theme === value ? 'var(--accent)' : 'transparent',
                  }}
                >
                  <Icon size={14} />
                  <span className="flex-1 text-left">{t(label, language)}</span>
                  {theme === value && <Check size={12} />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 语言切换 */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpenMenu(openMenu === 'language' ? null : 'language')}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition-colors hover:opacity-80"
            style={{ color: 'var(--muted-foreground)' }}
          >
            <Globe size={14} />
            <span className="flex-1 text-left">{currentLanguageLabel}</span>
            <ChevronDown
              size={12}
              style={{
                transform: openMenu === 'language' ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 200ms',
              }}
            />
          </button>
          {openMenu === 'language' && (
            <div
              className="absolute bottom-full left-0 right-0 mb-1 rounded-md border shadow-lg overflow-hidden"
              style={{ backgroundColor: 'var(--popover)', borderColor: 'var(--border)' }}
            >
              {languageOptions.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setLanguage(value)
                    setOpenMenu(null)
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors hover:opacity-80"
                  style={{
                    color: 'var(--popover-foreground)',
                    backgroundColor: language === value ? 'var(--accent)' : 'transparent',
                  }}
                >
                  <span className="flex-1 text-left">{label}</span>
                  {language === value && <Check size={12} />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 用户信息 */}
      <div className="border-t px-3 py-3" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium shrink-0"
              style={{ backgroundColor: 'var(--secondary)', color: 'var(--secondary-foreground)' }}>
              {user?.username?.[0]?.toUpperCase() || 'A'}
            </div>
            <span className="text-xs truncate" style={{ color: 'var(--muted-foreground)' }}>
              {user?.username || 'Admin'}
            </span>
          </div>
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="p-1.5 rounded-md transition-colors hover:opacity-80"
            style={{ color: 'var(--muted-foreground)' }}
            title={t('admin.logout', language)}
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>

      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <button
            type="button"
            aria-label={t('common.cancel', language)}
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowLogoutConfirm(false)}
          />
          <div
            className="relative w-full max-w-sm rounded-lg border p-5 shadow-xl"
            style={{ backgroundColor: 'var(--popover)', borderColor: 'var(--border)' }}
          >
            <h3 className="text-sm font-medium" style={{ color: 'var(--popover-foreground)' }}>
              {t('admin.logout_confirm_title', language)}
            </h3>
            <p className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
              {t('admin.logout_confirm', language)}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="rounded-md border px-3 py-1.5 text-xs transition-colors hover:opacity-80"
                style={{ borderColor: 'var(--border)', color: 'var(--popover-foreground)' }}
              >
                {t('common.cancel', language)}
              </button>
              <button
                type="button"
                onClick={handleLogoutConfirm}
                className="rounded-md px-3 py-1.5 text-xs transition-colors hover:opacity-90"
                style={{ backgroundColor: 'var(--destructive)', color: 'var(--destructive-foreground)' }}
              >
                {t('admin.logout', language)}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
