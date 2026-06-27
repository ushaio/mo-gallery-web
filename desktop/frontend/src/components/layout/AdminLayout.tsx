import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { usePreferences } from '@/store/preferences'
import { useEffect } from 'react'

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
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-hidden flex flex-col">
        <Outlet />
      </main>
    </div>
  )
}
