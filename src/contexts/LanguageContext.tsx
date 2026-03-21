'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { dictionaries, Locale } from '@/lib/i18n'

type LanguageContextType = {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: string) => string
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>('zh')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const savedLocale = localStorage.getItem('locale') as Locale
    if (savedLocale && (savedLocale === 'zh' || savedLocale === 'en')) {
      setLocale(savedLocale)
    }
    setMounted(true)
  }, [])

  const changeLocale = (newLocale: Locale) => {
    setLocale(newLocale)
    localStorage.setItem('locale', newLocale)
  }

  const t = (path: string): string => {
    const keys = path.split('.')
    const resolve = (source: any) => {
      let current = source
      for (const key of keys) {
        if (current?.[key] === undefined) {
          return undefined
        }
        current = current[key]
      }
      return typeof current === 'string' ? current : undefined
    }

    const localized = resolve(dictionaries[locale])
    if (localized !== undefined) return localized

    const fallback = resolve(dictionaries.en)
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
