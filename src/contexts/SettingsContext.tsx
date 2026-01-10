'use client'

import React, { createContext, useContext, useState } from 'react'
import type { PublicSettingsDto } from '@/lib/api'

export interface SocialLink {
  title: string
  url: string
}

export interface EnvConfig {
  socialLinks: SocialLink[]
  siteAuthor: string
}

interface SettingsContextType {
  settings: PublicSettingsDto
  envConfig: EnvConfig
  isLoading: boolean
  refresh: () => Promise<void>
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined)

interface SettingsProviderProps {
  children: React.ReactNode
  initialEnvConfig?: EnvConfig
  initialSettings?: PublicSettingsDto
}

export function SettingsProvider({ children, initialEnvConfig, initialSettings }: SettingsProviderProps) {
  const [settings] = useState<PublicSettingsDto>(
    initialSettings || {
      site_title: 'MO GALLERY',
      cdn_domain: '',
      linuxdo_only: false,
      comments_storage: '',
      waline_server_url: '',
    },
  )
  const [envConfig] = useState<EnvConfig>(initialEnvConfig || { socialLinks: [], siteAuthor: 'MO' })
  const [isLoading] = useState(false)

  const refresh = async () => {}

  return (
    <SettingsContext.Provider value={{ settings, envConfig, isLoading, refresh }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const context = useContext(SettingsContext)
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider')
  }
  return context
}
