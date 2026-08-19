import { useState, useRef, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, LibraryBig, Upload, BookMarked,
  BookImage, Bot, HardDrive, Settings, Users, LogOut,
  Sun, Moon, Monitor, Globe, Check, ChevronDown, LogIn, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { usePreferences } from '@/store/preferences'
import { t } from '@/lib/i18n'
import { GetApiConfig, GetSettings } from '../../../wailsjs/go/main/App'
import { BrowserOpenURL } from '../../../wailsjs/runtime/runtime'

const navGroups = [
  [
    { path: '/overview', icon: LayoutDashboard, key: 'admin.overview' },
  ],
  [
    { path: '/library', icon: LibraryBig, key: 'admin.resource_library' },
    { path: '/upload', icon: Upload, key: 'admin.upload' },
  ],
  [
    { path: '/photo-journal', icon: BookMarked, key: 'admin.logs' },
    { path: '/zine', icon: BookImage, key: 'admin.zine' },
  ],
  [
    { path: '/ai-assistant', icon: Bot, key: 'admin.ai_assistant' },
  ],
  [
    { path: '/storage', icon: HardDrive, key: 'admin.storage_sources' },
    { path: '/friends', icon: Users, key: 'admin.friends' },
  ],
]

export const SIDEBAR_PAGE_PATHS: ReadonlySet<string> = new Set([
  ...navGroups.flatMap((group) => group.map(({ path }) => path)),
  '/settings',
])

const themeOptions = [
  { value: 'light' as const, label: 'common.light', icon: Sun },
  { value: 'dark' as const, label: 'common.dark', icon: Moon },
  { value: 'system' as const, label: 'common.system', icon: Monitor },
]

const languageOptions = [
  { value: 'zh' as const, label: '中文' },
  { value: 'en' as const, label: 'English' },
]

interface SidebarProps {
  onOpenSettings?: () => void
}

export function Sidebar({ onOpenSettings }: SidebarProps) {
  const { user, logout, isAuthenticated } = useAuth()
  const { language, theme, sidebarCollapsed, setLanguage, setTheme, setSidebarCollapsed } = usePreferences()
  const location = useLocation()

  const [openMenu, setOpenMenu] = useState<'theme' | 'language' | null>(null)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [siteTitle, setSiteTitle] = useState('MO Gallery')
  const [siteUrl, setSiteUrl] = useState('')
  const menuRef = useRef<HTMLDivElement | null>(null)
  const lastMenuLocationsRef = useRef(new Map<string, string>())

  if (SIDEBAR_PAGE_PATHS.has(location.pathname)) {
    lastMenuLocationsRef.current.set(
      location.pathname,
      location.pathname + location.search + location.hash,
    )
  }

  const getMenuDestination = (path: string) => lastMenuLocationsRef.current.get(path) ?? path

  // 站点标题 + 站点地址：标题与「系统设置-站点-站点信息」一致（来自服务端 SITE_TITLE），
  // 地址取桌面端连接的登录地址
  useEffect(() => {
    if (!isAuthenticated) return

    let cancelled = false
    Promise.allSettled([GetSettings(), GetApiConfig()]).then(([settingsRes, apiRes]) => {
      if (cancelled) return
      if (settingsRes.status === 'fulfilled' && settingsRes.value?.site_title) {
        setSiteTitle(settingsRes.value.site_title)
      }
      const loginUrl = apiRes.status === 'fulfilled' ? apiRes.value?.login_url : ''
      if (typeof loginUrl === 'string' && loginUrl) {
        setSiteUrl(loginUrl.replace(/\/+$/, ''))
      }
    })
    return () => {
      cancelled = true
    }
  }, [isAuthenticated])

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

  useEffect(() => {
    if (sidebarCollapsed) setOpenMenu(null)
  }, [sidebarCollapsed])

  const currentThemeLabel = t(themeOptions.find((o) => o.value === theme)?.label ?? 'common.system', language)
  const currentLanguageLabel = languageOptions.find((o) => o.value === language)?.label ?? '中文'
  const collapseLabel = t(sidebarCollapsed ? 'admin.expand_sidebar' : 'admin.collapse_sidebar', language)
  const visibleNavGroups = isAuthenticated ? navGroups : [navGroups[1].slice(0, 1), navGroups[2].slice(1, 2)]
  const displayedSiteTitle = isAuthenticated ? siteTitle : 'MO Gallery'

  return (
    <aside
      className="flex h-full flex-col select-none border-r"
      onDragStartCapture={(event) => event.preventDefault()}
      style={{
        width: sidebarCollapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)',
        backgroundColor: 'var(--card)',
        borderColor: 'var(--border)',
        transition: 'width 180ms ease',
      }}
    >
      {/* Logo（点击站点标题 → 浏览器打开网站）+ 侧栏折叠入口 */}
      <div className="relative h-16 shrink-0 border-b" style={{ borderColor: 'var(--border)' }}>
        <button
          type="button"
          onClick={handleOpenSite}
          title={siteUrl ? `打开网站：${siteUrl}` : undefined}
          disabled={!siteUrl}
          className={`flex h-full w-full min-w-0 items-center text-left transition-[padding,gap,opacity] hover:opacity-75 disabled:cursor-default disabled:hover:opacity-100 ${sidebarCollapsed ? 'justify-center px-2' : 'gap-3 px-5 pr-10'}`}
          style={{ backgroundColor: 'transparent', color: 'var(--foreground)' }}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-serif text-sm font-bold"
            style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
            {displayedSiteTitle.charAt(0).toUpperCase() || 'M'}
          </div>
          {!sidebarCollapsed && <span className="truncate font-serif text-sm font-bold uppercase tracking-widest">{displayedSiteTitle}</span>}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpenMenu(null)
            setSidebarCollapsed(!sidebarCollapsed)
          }}
          className="absolute -right-3 top-1/2 z-20 flex size-6 -translate-y-1/2 items-center justify-center rounded-full border shadow-sm transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{
            backgroundColor: 'var(--card)',
            borderColor: 'var(--border)',
            color: 'var(--muted-foreground)',
          }}
          title={collapseLabel}
          aria-label={collapseLabel}
          aria-pressed={sidebarCollapsed}
        >
          {sidebarCollapsed ? <PanelLeftOpen size={13} /> : <PanelLeftClose size={13} />}
        </button>
      </div>

      {/* 导航 */}
      <nav className="flex-1 overflow-y-auto px-2 py-2">
        {visibleNavGroups.map((group, groupIndex) => (
          <div key={group[0].path}>
            {groupIndex > 0 && (
              <div
                aria-hidden="true"
                className="mx-4 my-2 h-px opacity-50"
                style={{
                  background: 'linear-gradient(90deg, transparent, var(--border) 28%, var(--border) 72%, transparent)',
                }}
              />
            )}
            {group.map(({ path, icon: Icon, key }) => (
              <NavLink
                key={path}
                to={getMenuDestination(path)}
                draggable={false}
                title={sidebarCollapsed ? t(key, language) : undefined}
                className={({ isActive }) =>
                  `mb-0.5 flex items-center rounded-md py-2 text-sm transition-colors ${sidebarCollapsed ? 'justify-center px-0' : 'gap-3 px-3'} ${
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
                {!sidebarCollapsed && <span>{t(key, language)}</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* 外观 + 语言切换（用户区上方） */}
      <div ref={menuRef} className="border-t px-2 py-2 flex flex-col gap-1" style={{ borderColor: 'var(--border)' }}>
        {/* 外观切换 */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpenMenu(openMenu === 'theme' ? null : 'theme')}
            className={`w-full flex items-center rounded-md py-1.5 text-xs transition-colors hover:opacity-80 ${sidebarCollapsed ? 'justify-center px-0' : 'gap-2 px-3'}`}
            style={{ color: 'var(--muted-foreground)' }}
            title={sidebarCollapsed ? currentThemeLabel : undefined}
            aria-label={currentThemeLabel}
            aria-expanded={openMenu === 'theme'}
            aria-haspopup="menu"
          >
            {theme === 'dark' ? <Moon size={14} /> : theme === 'light' ? <Sun size={14} /> : <Monitor size={14} />}
            {!sidebarCollapsed && <span className="flex-1 text-left">{currentThemeLabel}</span>}
            {!sidebarCollapsed && <ChevronDown
              size={12}
              style={{
                transform: openMenu === 'theme' ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 200ms',
              }}
            />}
          </button>
          {openMenu === 'theme' && (
            <div
              role="menu"
              className={`absolute z-30 mb-1 overflow-hidden rounded-md border shadow-lg ${sidebarCollapsed ? 'bottom-0 left-full ml-2 w-40' : 'bottom-full left-0 right-0'}`}
              style={{ backgroundColor: 'var(--popover)', borderColor: 'var(--border)' }}
            >
              {themeOptions.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={theme === value}
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
            className={`w-full flex items-center rounded-md py-1.5 text-xs transition-colors hover:opacity-80 ${sidebarCollapsed ? 'justify-center px-0' : 'gap-2 px-3'}`}
            style={{ color: 'var(--muted-foreground)' }}
            title={sidebarCollapsed ? currentLanguageLabel : undefined}
            aria-label={currentLanguageLabel}
            aria-expanded={openMenu === 'language'}
            aria-haspopup="menu"
          >
            <Globe size={14} />
            {!sidebarCollapsed && <span className="flex-1 text-left">{currentLanguageLabel}</span>}
            {!sidebarCollapsed && <ChevronDown
              size={12}
              style={{
                transform: openMenu === 'language' ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 200ms',
              }}
            />}
          </button>
          {openMenu === 'language' && (
            <div
              role="menu"
              className={`absolute z-30 mb-1 overflow-hidden rounded-md border shadow-lg ${sidebarCollapsed ? 'bottom-0 left-full ml-2 w-40' : 'bottom-full left-0 right-0'}`}
              style={{ backgroundColor: 'var(--popover)', borderColor: 'var(--border)' }}
            >
              {languageOptions.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={language === value}
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
      <div className={`border-t py-3 ${sidebarCollapsed ? 'px-2' : 'px-3'}`} style={{ borderColor: 'var(--border)' }}>
        {isAuthenticated ? (
          <div className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
            <div className={`flex min-w-0 items-center ${sidebarCollapsed ? '' : 'gap-2'}`}>
              {!sidebarCollapsed && <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium"
                style={{ backgroundColor: 'var(--secondary)', color: 'var(--secondary-foreground)' }}>
                {user?.username?.[0]?.toUpperCase() || 'A'}
              </div>}
              {!sidebarCollapsed && <span className="truncate text-xs" style={{ color: 'var(--muted-foreground)' }}>
                {user?.username || 'Admin'}
              </span>}
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                onClick={onOpenSettings}
                title={t('admin.config', language)}
                aria-label={t('admin.config', language)}
                className="flex size-6 items-center justify-center rounded-md transition-colors hover:bg-secondary"
                style={{ color: 'var(--muted-foreground)' }}
              >
                <Settings size={15} />
              </button>
              <button
                onClick={() => setShowLogoutConfirm(true)}
                className="flex size-6 items-center justify-center rounded-md transition-colors hover:bg-secondary"
                style={{ color: 'var(--muted-foreground)' }}
                title={t('admin.logout', language)}
              >
                <LogOut size={15} />
              </button>
            </div>
          </div>
        ) : (
          <div className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
            {!sidebarCollapsed && <span className="truncate text-xs" style={{ color: 'var(--muted-foreground)' }}>
              {t('admin.offline_mode', language)}
            </span>}
            <div className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                onClick={onOpenSettings}
                title={t('admin.config', language)}
                aria-label={t('admin.config', language)}
                className="flex size-7 items-center justify-center rounded-md transition-colors hover:bg-secondary"
                style={{ color: 'var(--muted-foreground)' }}
              >
                <Settings size={15} />
              </button>
              <NavLink
                to="/login"
                draggable={false}
                title={t('admin.login', language)}
                aria-label={t('admin.login', language)}
                className="flex size-7 items-center justify-center rounded-md transition-colors hover:bg-secondary"
                style={{ color: 'var(--muted-foreground)' }}
              >
                <LogIn size={15} />
              </NavLink>
            </div>
          </div>
        )}
      </div>

      {isAuthenticated && showLogoutConfirm && (
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
