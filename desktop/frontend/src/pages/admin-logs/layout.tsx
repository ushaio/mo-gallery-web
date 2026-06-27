/**
 * AdminContext 适配器 — 对齐 web 端 useAdmin() 接口。
 * desktop 不需要完整的管理页面布局，只提供 StoriesTab/BlogTab 所需的 context。
 */
'use client'

import React, { createContext, useContext, useCallback, useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { getAdminSettings, getCategories, type AdminSettingsDto } from '@/lib/api'

interface AdminContextType {
  handleUnauthorized: () => void
  settings: AdminSettingsDto | null
  categories: string[]
  isImmersiveMode: boolean
  setIsImmersiveMode: React.Dispatch<React.SetStateAction<boolean>>
}

const AdminContext = createContext<AdminContextType | null>(null)

export function useAdmin() {
  const context = useContext(AdminContext)
  if (!context) {
    return {
      handleUnauthorized: () => {},
      settings: null as AdminSettingsDto | null,
      categories: [] as string[],
      isImmersiveMode: false,
      setIsImmersiveMode: (() => {}) as React.Dispatch<React.SetStateAction<boolean>>,
    }
  }
  return context
}

export function AdminLogsProvider({ children }: { children: React.ReactNode }) {
  const { token, logout } = useAuth()
  const navigate = useNavigate()
  const [settings, setSettings] = useState<AdminSettingsDto | null>(null)
  const [categories, setCategories] = useState<string[]>([])
  const [isImmersiveMode, setIsImmersiveMode] = useState(false)

  const handleUnauthorized = useCallback(() => {
    logout()
    navigate('/login')
  }, [logout, navigate])

  useEffect(() => {
    if (!token) return
    ;(async () => {
      try {
        const s = await getAdminSettings(token)
        setSettings(s)
      } catch {}
      try {
        const c = await getCategories()
        setCategories(c || [])
      } catch {}
    })()
  }, [token])

  return (
    <AdminContext.Provider value={{ handleUnauthorized, settings, categories, isImmersiveMode, setIsImmersiveMode }}>
      {children}
    </AdminContext.Provider>
  )
}
