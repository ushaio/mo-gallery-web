'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'

import {
  resolveConsoleLabels,
  type ConsoleHostAdapter,
  type ConsoleLabels,
} from '../adapters'

/**
 * 后台运行期上下文：把宿主的用户身份、链接渲染与文案注入给共享外壳，
 * 宿主自己的面板也可以从这里取（不必各自再取一遍）。
 */
export interface ConsoleRuntime {
  adapter: ConsoleHostAdapter
  labels: ConsoleLabels
}

const ConsoleRuntimeContext = createContext<ConsoleRuntime | null>(null)

export interface ConsoleRuntimeProviderProps {
  adapter?: ConsoleHostAdapter
  children: ReactNode
}

export function ConsoleRuntimeProvider({ adapter, children }: ConsoleRuntimeProviderProps) {
  const value = useMemo<ConsoleRuntime>(
    () => ({ adapter: adapter ?? {}, labels: resolveConsoleLabels(adapter?.labels) }),
    [adapter],
  )
  return <ConsoleRuntimeContext.Provider value={value}>{children}</ConsoleRuntimeContext.Provider>
}

/** 取运行期上下文；未包 Provider 时返回一份保守默认值（不抛错，便于单点试用）。 */
export function useConsoleRuntime(): ConsoleRuntime {
  const context = useContext(ConsoleRuntimeContext)
  if (context) return context
  return { adapter: {}, labels: resolveConsoleLabels() }
}
