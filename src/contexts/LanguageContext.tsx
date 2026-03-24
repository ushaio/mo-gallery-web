'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import { dictionaries, type Locale } from '@/lib/i18n'
import type { TranslationTree } from '@/lib/i18n/types'

type LanguageContextType = {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: string) => string
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

function getInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'zh'

  const savedLocale = localStorage.getItem('locale')
  return savedLocale === 'zh' || savedLocale === 'en' ? savedLocale : 'zh'
}

function resolveTranslation(source: TranslationTree, path: string): string | undefined {
  let current: TranslationTree | string = source

  for (const key of path.split('.')) {
    if (typeof current === 'string') return undefined
    if (!(key in current)) return undefined

    const next = current[key]
    if (typeof next !== 'string' && typeof next !== 'object') return undefined
    current = next
  }

  return typeof current === 'string' ? current : undefined
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(getInitialLocale)

  const changeLocale = (newLocale: Locale) => {
    setLocale(newLocale)
    localStorage.setItem('locale', newLocale)
  }

  const t = (path: string): string => {
    const localized = resolveTranslation(dictionaries[locale], path)
    if (localized !== undefined) return localized

    const fallback = resolveTranslation(dictionaries.en, path)
    if (fallback !== undefined) {
      console.warn(`Translation key missing: ${path} for locale: ${locale}, falling back to en`)
      return fallback
    }

    console.warn(`Translation key missing: ${path} for locale: ${locale}`)
    return path
  }

  return (
    <LanguageContext.Provider value={{ locale, setLocale: changeLocale, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider')
  }
  return context
}
