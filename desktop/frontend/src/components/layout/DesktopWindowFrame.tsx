import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import {
  BrowserOpenURL,
  Quit,
  WindowIsMaximised,
  WindowMinimise,
  WindowToggleMaximise,
} from '../../../wailsjs/runtime/runtime'
import { getWindowAppearance, type WindowStyle } from '@/lib/window-appearance'
import { t } from '@/lib/i18n'
import { usePreferences } from '@/store/preferences'
import { useDesktopSiteIdentity } from './useDesktopSiteIdentity'
import { WindowChromeContext } from './window-chrome'

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
  return pathname !== '/login' && pathname !== '/setup'
}

function DesktopTitleBar() {
  const location = useLocation()
  const hasSidebar = hasAdminSidebar(location.pathname)
  const { language, sidebarCollapsed, setSidebarCollapsed } = usePreferences()
  const { siteTitle, siteUrl } = useDesktopSiteIdentity()
  const [isMaximised, setIsMaximised] = useState(false)
  const [isFocused, setIsFocused] = useState(true)

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

  const handleOpenSite = () => {
    if (siteUrl) BrowserOpenURL(siteUrl)
  }

  const collapseLabel = t(sidebarCollapsed ? 'admin.expand_sidebar' : 'admin.collapse_sidebar', language)
  const minimizeLabel = t('admin.window_minimize', language)
  const maximizeLabel = t(isMaximised ? 'admin.window_restore' : 'admin.window_maximize', language)
  const closeLabel = t('admin.window_close', language)
  const openSiteLabel = siteUrl ? t('admin.open_site', language, { url: siteUrl }) : undefined

  return (
    <header
      className={`desktop-title-bar window-drag-region relative z-10 flex h-9 shrink-0 select-none items-center${isFocused ? '' : ' is-unfocused'}`}
      style={{ backgroundColor: 'var(--card)', color: 'var(--muted-foreground)' }}
      onDoubleClick={toggleMaximise}
    >
      {hasSidebar ? (
        <div
          className="relative flex h-full shrink-0 items-center border-r"
          style={{
            width: sidebarCollapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)',
            borderColor: 'var(--border)',
            transition: 'width 180ms ease',
          }}
        >
          <button
            type="button"
            onClick={handleOpenSite}
            title={openSiteLabel}
            disabled={!siteUrl}
            className={`window-no-drag desktop-chrome-identity flex h-full w-full min-w-0 items-center text-left transition-[padding,gap,opacity] hover:opacity-75 disabled:cursor-default disabled:hover:opacity-100 ${sidebarCollapsed ? 'justify-center px-2' : 'gap-2.5 px-4 pr-9'}`}
            style={{ backgroundColor: 'transparent', color: 'var(--foreground)' }}
            onDoubleClick={(event) => event.stopPropagation()}
          >
            <span
              className="flex size-6 shrink-0 items-center justify-center rounded-md font-serif text-xs font-bold"
              style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}
            >
              {siteTitle.charAt(0).toUpperCase() || 'M'}
            </span>
            {!sidebarCollapsed && (
              <span className="truncate font-serif text-xs font-bold uppercase tracking-widest">
                {siteTitle}
              </span>
            )}
          </button>
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
          <span
            className="flex size-6 shrink-0 items-center justify-center rounded-md font-serif text-xs font-bold"
            style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}
          >
            {siteTitle.charAt(0).toUpperCase() || 'M'}
          </span>
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
    </header>
  )
}

export function DesktopWindowFrame({ children }: { children: ReactNode }) {
  const [activeStyle, setActiveStyle] = useState<WindowStyle | null>(null)
  const integrated = activeStyle === 'integrated'
  const chromeValue = useMemo(
    () => ({ integrated, styleReady: activeStyle !== null }),
    [integrated, activeStyle],
  )

  useEffect(() => {
    let cancelled = false
    getWindowAppearance()
      .then((appearance) => {
        if (!cancelled) setActiveStyle(appearance.activeStyle)
      })
      .catch(() => {
        if (!cancelled) setActiveStyle('integrated')
      })
    return () => { cancelled = true }
  }, [])

  return (
    <WindowChromeContext.Provider value={chromeValue}>
      <div className={`flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground${integrated ? ' integrated-window-frame' : ''}`}>
        {integrated && <DesktopTitleBar />}
        <div className="relative z-0 min-h-0 flex-1 overflow-hidden">{children}</div>
      </div>
    </WindowChromeContext.Provider>
  )
}
