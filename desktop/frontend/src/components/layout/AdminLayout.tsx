import { Activity, useEffect, useRef, type ReactNode } from 'react'
import { useLocation, useOutlet } from 'react-router-dom'

import { usePreferences } from '@/store/preferences'

import { Sidebar, SIDEBAR_PAGE_PATHS } from './Sidebar'

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

  return (
    <div className="flex h-full w-full overflow-hidden">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-hidden flex flex-col">
        <CachedMenuOutlet />
      </main>
    </div>
  )
}
