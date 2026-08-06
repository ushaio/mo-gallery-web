'use client'

import { useEffect, useRef } from 'react'

/**
 * 未保存变更的离开保护。
 * - 脏状态时注册 beforeunload，关闭窗口 / 刷新前触发浏览器原生确认
 * - Ctrl/Cmd+S 触发保存（回调经 ref 保持最新引用，避免重复注册）
 */
export function useDirtyLeaveGuard(isDirty: boolean, enabled = true) {
  useEffect(() => {
    if (!enabled || !isDirty) return

    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty, enabled])
}

export function useSaveShortcut(onSave: () => void, enabled = true) {
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave

  useEffect(() => {
    if (!enabled) return

    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        onSaveRef.current()
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [enabled])
}
