/**
 * ThemeContext 适配器 — 对齐 web 端 useTheme() 接口。
 * 实际主题状态来自 desktop usePreferences。
 */
import { usePreferences } from '@/store/preferences'
import { useEffect, useState } from 'react'

export function useTheme() {
  const { theme } = usePreferences()
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    if (theme === 'dark') {
      setResolvedTheme('dark')
    } else if (theme === 'light') {
      setResolvedTheme('light')
    } else {
      // system
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      setResolvedTheme(mq.matches ? 'dark' : 'light')
      const handler = (e: MediaQueryListEvent) => setResolvedTheme(e.matches ? 'dark' : 'light')
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }
  }, [theme])

  return { theme, resolvedTheme }
}
