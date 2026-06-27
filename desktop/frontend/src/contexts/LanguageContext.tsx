/**
 * LanguageContext 适配器 — 对齐 web 端 useLanguage() 接口（locale + setLocale + t）。
 * 语言状态来自 desktop usePreferences，翻译用 web 的 dictionaries。
 */
'use client'

import { createContext, useContext, useCallback } from 'react'
import { usePreferences } from '@/store/preferences'
import { dictionaries, t as tFn, type Locale } from '@/lib/i18n'
import type { TranslationTree } from '@/lib/i18n/types'

function resolveTranslation(source: TranslationTree, path: string): string | undefined {
  let current: TranslationTree | string = source
  for (const key of path.split('.')) {
    if (typeof current === 'string') return undefined
    if (!(key in current)) return undefined
    const nextValue: TranslationTree[string] = current[key]
    if (typeof nextValue !== 'string' && typeof nextValue !== 'object') return undefined
    current = nextValue
  }
  return typeof current === 'string' ? current : undefined
}

type LanguageContextType = {
  locale: Locale
  setLocale: (locale: Locale) => void
  lang: Locale
  t: (key: string) => string
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const { language, setLanguage } = usePreferences()
  const locale = (language || 'zh') as Locale

  const setLocale = useCallback((next: Locale) => {
    setLanguage(next)
  }, [setLanguage])

  const t = (path: string): string => {
    const localized = resolveTranslation(dictionaries[locale], path)
    if (localized !== undefined) return localized
    const fallback = resolveTranslation(dictionaries.en, path)
    return fallback ?? path
  }

  return (
    <LanguageContext.Provider value={{ locale, setLocale, lang: locale, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (context === undefined) {
    // 兜底：未包裹 Provider 时直接用 preferences + tFn
    return { locale: 'zh' as Locale, setLocale: () => {}, lang: 'zh' as Locale, t: (k: string) => tFn(k, 'zh') }
  }
  return context
}
