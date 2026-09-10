import { useState, useRef, useEffect } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  Home, LibraryBig, Upload, BookMarked,
  LayoutTemplate, Bot, Sparkles, HardDrive, Settings, Users, LogOut,
  Sun, Moon, Monitor, Globe, Check, ChevronDown,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useOfficialAuth } from '@/contexts/OfficialAuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { usePreferences } from '@/store/preferences'
import { t } from '@/lib/i18n'
import { ACCENTS, DEFAULT_ACCENT } from '@/lib/accents'

const navGroups = [
  [
    { path: '/home', icon: Home, key: 'admin.home' },
    { path: '/ai-assistant', icon: Bot, key: 'admin.ai_assistant' },
  ],
  [
    { path: '/library', icon: LibraryBig, key: 'admin.resource_library' },
    { path: '/upload', icon: Upload, key: 'admin.upload' },
  ],
  [
    { path: '/photo-journal', icon: BookMarked, key: 'admin.logs' },
    { path: '/design', icon: LayoutTemplate, key: 'admin.design_studio' },
    { path: '/inspiration', icon: Sparkles, key: 'admin.inspiration' },
  ],
  [
    { path: '/storage', icon: HardDrive, key: 'admin.storage_cleanup' },
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
  const { isAuthenticated } = useAuth()
  const { user: officialUser, logout: officialLogout } = useOfficialAuth()
  const { language, theme, accent, sidebarCollapsed, setLanguage, setTheme, setSidebarCollapsed } = usePreferences()
  const { resolvedTheme } = useTheme()
  const location = useLocation()
  const navigate = useNavigate()

  const [openMenu, setOpenMenu] = useState<'theme' | 'language' | null>(null)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const lastMenuLocationsRef = useRef(new Map<string, string>())

  if (SIDEBAR_PAGE_PATHS.has(location.pathname)) {
    lastMenuLocationsRef.current.set(
      location.pathname,
      location.pathname + location.search + location.hash,
    )
  }

  const getMenuDestination = (path: string) => lastMenuLocationsRef.current.get(path) ?? path

  // 左下角退出的是官方账号登录；站点连接由标题栏 logo 管理。
  const handleLogoutConfirm = () => {
    setShowLogoutConfirm(false)
    void officialLogout()
    navigate('/login', { replace: true })
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
  // Local library, Design Studio, and the desktop AI assistant work without a connected site.
  // Inspiration is a separate online surface, but remains discoverable before
  // login so users can reach its connection state and future sharing flow.
  const visibleNavGroups = isAuthenticated
    ? navGroups
    : navGroups
      .map((group) => group.filter((item) =>
        item.path === '/library'
        || item.path === '/design'
        || item.path === '/ai-assistant'
        || item.path === '/inspiration',
      ))
      .filter((group) => group.length > 0)

  return (
    <aside
      className="flex h-full shrink-0 flex-col select-none border-r"
      onDragStartCapture={(event) => event.preventDefault()}
      style={{
        width: sidebarCollapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)',
        backgroundColor: 'var(--card)',
        borderColor: 'var(--border)',
        transition: 'width 180ms ease',
      }}
    >

      {/* 导航 */}
      <nav className="flex-1 overflow-x-hidden overflow-y-auto px-2 py-2">
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
                  `mb-0.5 flex min-w-0 items-center whitespace-nowrap rounded-md py-2 text-sm transition-colors ${sidebarCollapsed ? 'justify-center px-0' : 'gap-3 px-3'} ${
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
                {!sidebarCollapsed && <span className="min-w-0 truncate">{t(key, language)}</span>}
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
            className={`w-full flex items-center whitespace-nowrap rounded-md py-1.5 text-xs transition-colors hover:opacity-80 ${sidebarCollapsed ? 'justify-center px-0' : 'gap-2 px-3'}`}
            style={{ color: 'var(--muted-foreground)' }}
            title={sidebarCollapsed ? currentThemeLabel : undefined}
            aria-label={currentThemeLabel}
            aria-expanded={openMenu === 'theme'}
            aria-haspopup="menu"
          >
            {theme === 'dark' ? <Moon size={14} /> : theme === 'light' ? <Sun size={14} /> : <Monitor size={14} />}
            {!sidebarCollapsed && <span className="min-w-0 flex-1 truncate text-left">{currentThemeLabel}</span>}
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
              {/* 配色仅浅色模式生效：深色下提示当前配色已暂停 */}
              {accent !== DEFAULT_ACCENT && resolvedTheme === 'dark' && (
                <div
                  className="border-t px-3 py-2 text-[11px] leading-4"
                  style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}
                >
                  「{ACCENTS.find((a) => a.id === accent)?.name}」配色仅在浅色模式下生效
                </div>
              )}
            </div>
          )}
        </div>

        {/* 语言切换 */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpenMenu(openMenu === 'language' ? null : 'language')}
            className={`w-full flex items-center whitespace-nowrap rounded-md py-1.5 text-xs transition-colors hover:opacity-80 ${sidebarCollapsed ? 'justify-center px-0' : 'gap-2 px-3'}`}
            style={{ color: 'var(--muted-foreground)' }}
            title={sidebarCollapsed ? currentLanguageLabel : undefined}
            aria-label={currentLanguageLabel}
            aria-expanded={openMenu === 'language'}
            aria-haspopup="menu"
          >
            <Globe size={14} />
            {!sidebarCollapsed && <span className="min-w-0 flex-1 truncate text-left">{currentLanguageLabel}</span>}
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

      {/* 官方账号（站点连接由标题栏 logo 管理） */}
      <div className={`border-t py-3 ${sidebarCollapsed ? 'px-2' : 'px-3'}`} style={{ borderColor: 'var(--border)' }}>
        <div className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
          <div className={`flex min-w-0 items-center ${sidebarCollapsed ? '' : 'gap-2'}`}>
            {!sidebarCollapsed && <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium"
              style={{ backgroundColor: 'var(--secondary)', color: 'var(--secondary-foreground)' }}>
              {officialUser?.username?.[0]?.toUpperCase() || 'A'}
            </div>}
            {!sidebarCollapsed && <span className="truncate text-xs" style={{ color: 'var(--muted-foreground)' }}>
              {officialUser?.username || t('admin.official_account', language)}
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
              title={t('admin.official_logout', language)}
              aria-label={t('admin.official_logout', language)}
            >
              <LogOut size={15} />
            </button>
          </div>
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
              {t('admin.official_logout_confirm', language)}
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
                {t('admin.official_logout', language)}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
