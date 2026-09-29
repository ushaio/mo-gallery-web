'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export interface AdminPortalLayerProps {
  children: ReactNode
  /** 点击遮罩 / 按 Esc 时的回调 */
  onDismiss?: () => void
  /** 是否允许遮罩点击与 Esc 关闭 */
  dismissible?: boolean
  /** 额外的遮罩类名 */
  scrimClassName?: string
}

/**
 * 浮层挂载层：portal 到 `document.body`，避免被祖先的 `overflow: hidden` /
 * `transform` / `backdrop-filter` 裁切或错位（后台外壳自己就带 `overflow: hidden`）。
 *
 * 注意：portal 出来的节点在 `.mgac` 根之外，因此设计令牌同时声明在 `.mgac-portal`
 * 上（见 admin-theme.css 的令牌层），这里必须带上 `mgac-portal` 类。
 */
export function AdminPortalLayer({
  children,
  onDismiss,
  dismissible = true,
  scrimClassName,
}: AdminPortalLayerProps) {
  const [host, setHost] = useState<HTMLElement | null>(null)

  useEffect(() => {
    setHost(document.body)
  }, [])

  if (!host) return null

  return createPortal(
    <div className="mgac-portal" role="presentation">
      <div
        className={['mgac-portal-scrim', scrimClassName ?? ''].filter(Boolean).join(' ')}
        role="presentation"
        onClick={dismissible ? onDismiss : undefined}
      />
      {children}
    </div>,
    host,
  )
}

/** Esc 关闭：`enabled` 为 false（例如提交中）时不响应。 */
export function useEscapeToDismiss(enabled: boolean, onDismiss?: () => void) {
  useEffect(() => {
    if (!enabled || !onDismiss) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [enabled, onDismiss])
}
