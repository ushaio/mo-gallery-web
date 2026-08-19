import { Activity, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation, useOutlet } from 'react-router-dom'

import { usePreferences } from '@/store/preferences'

import { Sidebar, SIDEBAR_PAGE_PATHS } from './Sidebar'
import { SettingsPage } from '@/pages/SettingsPage'

function CachedMenuOutlet() {
  const location = useLocation()
  const outlet = useOutlet()
  const cachedOutletsRef = useRef(new Map<string, ReactNode>())
  const activeCacheKey = SIDEBAR_PAGE_PATHS.has(location.pathname) ? location.pathname : null

  if (activeCacheKey && outlet) {
    cachedOutletsRef.current.set(activeCacheKey, outlet)
  }

  return (
    <>
      {Array.from(cachedOutletsRef.current.entries()).map(([cacheKey, cachedOutlet]) => (
        <Activity
          key={cacheKey}
          mode={cacheKey === activeCacheKey ? 'visible' : 'hidden'}
        >
          {cachedOutlet}
        </Activity>
      ))}
      {activeCacheKey === null && outlet}
    </>
  )
}

export function AdminLayout() {
  const { theme } = usePreferences()
  const [settingsOpen, setSettingsOpen] = useState(false)

  // 主题切换
  useEffect(() => {
    const root = document.documentElement
    root.classList.remove('light', 'dark')

    if (theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      root.classList.add(prefersDark ? 'dark' : 'light')
    } else {
      root.classList.add(theme)
    }
  }, [theme])

  useEffect(() => {
    if (!settingsOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSettingsOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [settingsOpen])

  return (
    <div className="flex h-full w-full overflow-hidden">
      <Sidebar onOpenSettings={() => setSettingsOpen(true)} />
      <main className="min-w-0 flex-1 overflow-hidden flex flex-col">
        <CachedMenuOutlet />
      </main>
      {settingsOpen && (
        <div className="settings-modal-overlay fixed inset-0 z-40 flex items-center justify-center p-6" role="dialog" aria-modal="true" aria-label="Settings">
          <button type="button" aria-label="Close settings" className="absolute inset-0 bg-black/40" onClick={() => setSettingsOpen(false)} />
          <div className="relative flex h-[min(900px,calc(100vh-3rem))] w-[min(1180px,calc(100vw-3rem))] min-w-0 flex-col overflow-hidden rounded-lg border shadow-2xl" style={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)' }}>
            <button type="button" aria-label="Close settings" title="Close settings" onClick={() => setSettingsOpen(false)} className="absolute right-4 top-4 z-10 flex size-7 items-center justify-center rounded-md transition-colors hover:bg-secondary" style={{ color: 'var(--muted-foreground)' }}>
              <span aria-hidden="true" className="text-lg leading-none">×</span>
            </button>
            <SettingsPage isModal />
          </div>
        </div>
      )}
    </div>
  )
}
