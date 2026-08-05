/**
 * ThemeContext 适配器 — 对齐 web 端 useTheme() 接口。
 * 实际主题状态来自 desktop usePreferences。
 */
import { usePreferences } from '@/store/preferences'
import { useSyncExternalStore } from 'react'

function subscribeSystemTheme(callback: () => void) {
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  media.addEventListener('change', callback)
  return () => media.removeEventListener('change', callback)
}

export function useTheme() {
  const { theme } = usePreferences()
  const systemTheme = useSyncExternalStore<'light' | 'dark'>(
    subscribeSystemTheme,
    () => window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    () => 'light',
  )
  const resolvedTheme = theme === 'system' ? systemTheme : theme

  return { theme, resolvedTheme }
}
