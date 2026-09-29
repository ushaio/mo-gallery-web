'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'

import {
  resolveAdminLabels,
  type AdminHostAdapter,
  type AdminLabels,
} from '../adapters'

/**
 * 后台运行期上下文：把宿主的用户身份、链接渲染与文案注入给共享外壳，
 * 宿主自己的面板也可以从这里取（不必各自再取一遍）。
 */
export interface AdminRuntime {
  adapter: AdminHostAdapter
  labels: AdminLabels
}

const AdminRuntimeContext = createContext<AdminRuntime | null>(null)

export interface AdminRuntimeProviderProps {
  adapter?: AdminHostAdapter
  children: ReactNode
}

export function AdminRuntimeProvider({ adapter, children }: AdminRuntimeProviderProps) {
  const value = useMemo<AdminRuntime>(
    () => ({ adapter: adapter ?? {}, labels: resolveAdminLabels(adapter?.labels) }),
    [adapter],
  )
  return <AdminRuntimeContext.Provider value={value}>{children}</AdminRuntimeContext.Provider>
}

/** 取运行期上下文；未包 Provider 时返回一份保守默认值（不抛错，便于单点试用）。 */
export function useAdminRuntime(): AdminRuntime {
  const context = useContext(AdminRuntimeContext)
  if (context) return context
  return { adapter: {}, labels: resolveAdminLabels() }
}
