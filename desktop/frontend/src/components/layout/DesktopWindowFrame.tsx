import { useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import { Globe, PanelLeftClose, PanelLeftOpen, Unplug, X } from 'lucide-react'
import {
  BrowserOpenURL,
  Quit,
  WindowIsMaximised,
  WindowMinimise,
  WindowToggleMaximise,
} from '../../../wailsjs/runtime/runtime'
import { DisconnectSite } from '../../../wailsjs/go/main/App'
import { t } from '@/lib/i18n'
import { usePreferences } from '@/store/preferences'
import { useAuth } from '@/contexts/AuthContext'
import { WebConnectPanel } from '@/components/auth/WebConnectPanel'
import { useDesktopSiteIdentity } from './useDesktopSiteIdentity'

function CaptionIconMinimize() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <rect x="1" y="4.5" width="8" height="1" fill="currentColor" />
    </svg>
  )
}

function CaptionIconMaximize() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <rect x="1.5" y="1.5" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}

function CaptionIconRestore() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <rect x="3" y="1.5" width="5.5" height="5.5" fill="none" stroke="currentColor" strokeWidth="1" />
      <rect x="1.5" y="3" width="5.5" height="5.5" fill="var(--card)" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}

function CaptionIconClose() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M2 2 L8 8 M8 2 L2 8" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  )
}

function hasAdminSidebar(pathname: string) {
  return pathname !== '/login' && pathname !== '/setup' && pathname !== '/connect'
}

function DesktopTitleBar() {
  const location = useLocation()
  const hasSidebar = hasAdminSidebar(location.pathname)
  const { language, sidebarCollapsed, setSidebarCollapsed } = usePreferences()
  // 站点连接状态变化后重新拉取配置，保持跳转地址同步。
  const { isAuthenticated: siteConnected, logout: siteLogout } = useAuth()
  const { siteTitle, siteUrl } = useDesktopSiteIdentity(siteConnected)
  const [isMaximised, setIsMaximised] = useState(false)
  const [isFocused, setIsFocused] = useState(true)
  const [siteMenuOpen, setSiteMenuOpen] = useState(false)
  const [connectOpen, setConnectOpen] = useState(false)

  const syncMaximisedState = () => {
    void WindowIsMaximised().then(setIsMaximised).catch(() => undefined)
  }

  useEffect(() => {
    syncMaximisedState()
    const handleFocus = () => setIsFocused(true)
    const handleBlur = () => setIsFocused(false)
    window.addEventListener('focus', handleFocus)
    window.addEventListener('blur', handleBlur)
    return () => {
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('blur', handleBlur)
    }
  }, [])

  const toggleMaximise = () => {
    WindowToggleMaximise()
    window.setTimeout(syncMaximisedState, 80)
  }

  useEffect(() => {
    if (!siteMenuOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      // 站点菜单和连接弹窗都属于 logo 交互区，点击其外部时收起菜单。
      if (!(target instanceof Element) || !target.closest('[data-site-menu-root]')) {
        setSiteMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [siteMenuOpen])

  useEffect(() => {
    if (!connectOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setConnectOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [connectOpen])

  // 已连接站点：logo 弹出「跳转站点 / 断开连接」菜单；未连接：弹出连接站点弹窗。
  const handleLogoClick = () => {
    if (siteConnected) {
      setSiteMenuOpen((open) => !open)
    } else {
      setConnectOpen(true)
    }
  }

  const handleJumpSite = () => {
    setSiteMenuOpen(false)
    if (siteUrl) BrowserOpenURL(siteUrl)
  }

  const handleDisconnectSite = async () => {
    setSiteMenuOpen(false)
    await DisconnectSite().catch(() => undefined)
    siteLogout()
    toast.success(t('admin.disconnect_site', language))
  }

  const collapseLabel = t(sidebarCollapsed ? 'admin.expand_sidebar' : 'admin.collapse_sidebar', language)
  const minimizeLabel = t('admin.window_minimize', language)
  const maximizeLabel = t(isMaximised ? 'admin.window_restore' : 'admin.window_maximize', language)
  const closeLabel = t('admin.window_close', language)
  const logoLabel = siteConnected
    ? (siteUrl ? t('admin.open_site', language, { url: siteUrl }) : undefined)
    : t('admin.connect_site', language)

  return (
    <header
      className={`desktop-title-bar window-drag-region relative z-10 flex h-9 shrink-0 select-none items-center${isFocused ? '' : ' is-unfocused'}`}
      style={{ backgroundColor: 'var(--card)', color: 'var(--muted-foreground)' }}
      onDoubleClick={toggleMaximise}
    >
      {hasSidebar ? (
        <div
          data-site-menu-root
          className="relative flex h-full shrink-0 items-center border-r"
          style={{
            width: sidebarCollapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)',
            borderColor: 'var(--border)',
            transition: 'width 180ms ease',
          }}
        >
          <button
            type="button"
            onClick={handleLogoClick}
            title={logoLabel}
            className={`window-no-drag desktop-chrome-identity flex h-full w-full min-w-0 items-center text-left transition-[padding,gap,opacity] hover:opacity-75 ${sidebarCollapsed ? 'justify-center px-2' : 'gap-2.5 px-4 pr-9'}`}
            style={{ backgroundColor: 'transparent', color: 'var(--foreground)' }}
            onDoubleClick={(event) => event.stopPropagation()}
          >
            <img
              src="/logo.png"
              alt=""
              aria-hidden="true"
              className="size-6 shrink-0 rounded-md bg-white object-contain p-0.5"
            />
            {!sidebarCollapsed && (
              <span className="truncate font-serif text-xs font-bold uppercase tracking-widest">
                {siteTitle}
              </span>
            )}
          </button>
          {siteMenuOpen && (
            <div
              role="menu"
              className={`window-no-drag absolute top-full z-50 mt-1 w-56 overflow-hidden rounded-md border shadow-lg ${sidebarCollapsed ? 'left-2' : 'left-3'}`}
              style={{ backgroundColor: 'var(--popover)', borderColor: 'var(--border)' }}
            >
              {siteUrl && (
                <div
                  className="truncate border-b px-3 py-2 text-[11px]"
                  style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}
                >
                  {siteUrl}
                </div>
              )}
              <button
                type="button"
                role="menuitem"
                disabled={!siteUrl}
                onClick={handleJumpSite}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs transition-colors hover:opacity-80 disabled:cursor-default disabled:opacity-50"
                style={{ color: 'var(--popover-foreground)' }}
              >
                <Globe size={14} />
                <span className="flex-1 text-left">{t('admin.goto_site', language)}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => void handleDisconnectSite()}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs transition-colors hover:opacity-80"
                style={{ color: 'var(--destructive)' }}
              >
                <Unplug size={14} />
                <span className="flex-1 text-left">{t('admin.disconnect_site', language)}</span>
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="window-no-drag absolute -right-3 top-1/2 z-20 flex size-6 -translate-y-1/2 items-center justify-center rounded-full border shadow-sm transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{
              backgroundColor: 'var(--card)',
              borderColor: 'var(--border)',
              color: 'var(--muted-foreground)',
            }}
            title={collapseLabel}
            aria-label={collapseLabel}
            aria-pressed={sidebarCollapsed}
            onDoubleClick={(event) => event.stopPropagation()}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={13} /> : <PanelLeftClose size={13} />}
          </button>
        </div>
      ) : (
        <div className="desktop-chrome-identity flex min-w-0 items-center gap-2.5 px-3">
          <img
            src="/logo.png"
            alt=""
            aria-hidden="true"
            className="size-6 shrink-0 rounded-md bg-white object-contain p-0.5"
          />
          <span className="truncate font-serif text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--foreground)' }}>
            {siteTitle}
          </span>
        </div>
      )}

      <div className="min-w-0 flex-1 self-stretch" />

      <div
        className="window-no-drag flex h-full shrink-0"
        onDoubleClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => WindowMinimise()}
          className="desktop-caption-button flex h-full w-[46px] items-center justify-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
          title={minimizeLabel}
          aria-label={minimizeLabel}
        >
          <CaptionIconMinimize />
        </button>
        <button
          type="button"
          onClick={toggleMaximise}
          className="desktop-caption-button flex h-full w-[46px] items-center justify-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
          title={maximizeLabel}
          aria-label={maximizeLabel}
        >
          {isMaximised ? <CaptionIconRestore /> : <CaptionIconMaximize />}
        </button>
        <button
          type="button"
          onClick={() => Quit()}
          className="desktop-caption-button desktop-caption-close flex h-full w-[46px] items-center justify-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
          title={closeLabel}
          aria-label={closeLabel}
        >
          <CaptionIconClose />
        </button>
      </div>

      {connectOpen && (
        <div
          className="window-no-drag fixed inset-0 z-50 flex items-center justify-center p-6"
          role="dialog"
          aria-modal="true"
          aria-label={t('admin.connect_site', language)}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            aria-label={t('common.cancel', language)}
            className="absolute inset-0 bg-black/40"
            onClick={() => setConnectOpen(false)}
          />
          <div
            className="relative w-full max-w-sm overflow-hidden rounded-lg border shadow-xl"
            style={{ backgroundColor: 'var(--popover)', borderColor: 'var(--border)' }}
          >
            <div
              className="flex items-center justify-between border-b px-5 py-3"
              style={{ borderColor: 'var(--border)' }}
            >
              <h3 className="text-sm font-medium" style={{ color: 'var(--popover-foreground)' }}>
                {t('admin.connect_site', language)}
              </h3>
              <button
                type="button"
                onClick={() => setConnectOpen(false)}
                className="flex size-6 items-center justify-center rounded-md transition-colors hover:bg-secondary"
                style={{ color: 'var(--muted-foreground)' }}
                aria-label={t('common.cancel', language)}
              >
                <X size={14} />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-5">
              <WebConnectPanel
                onConnected={() => {
                  setConnectOpen(false)
                  toast.success(t('admin.connect_success', language))
                }}
              />
            </div>
          </div>
        </div>
      )}
    </header>
  )
}

export function DesktopWindowFrame({ children }: { children: ReactNode }) {
  return (
    <div className="integrated-window-frame flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <DesktopTitleBar />
      <div className="relative z-0 min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  )
}
