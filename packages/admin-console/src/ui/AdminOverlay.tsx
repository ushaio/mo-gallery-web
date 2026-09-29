'use client'

import type { ReactNode } from 'react'

import { useAdminRuntime } from '../runtime/AdminRuntimeProvider'
import { AdminPortalLayer, useEscapeToDismiss } from './portal'

export interface AdminModalProps {
  open: boolean
  title?: ReactNode
  description?: ReactNode
  children?: ReactNode
  /** 底部动作区（按钮用 AdminButton，共享包不含业务语义） */
  footer?: ReactNode
  onClose?: () => void
  /** 是否允许 Esc / 遮罩点击关闭，默认 true */
  dismissible?: boolean
  className?: string
}

/** 居中模态：结构 + 观感由 shared 提供，内容与动作全部由宿主传。 */
export function AdminModal({
  open,
  title,
  description,
  children,
  footer,
  onClose,
  dismissible = true,
  className,
}: AdminModalProps) {
  const { labels } = useAdminRuntime()
  const canDismiss = dismissible && Boolean(onClose)
  useEscapeToDismiss(open && canDismiss, onClose)

  if (!open) return null

  return (
    <AdminPortalLayer onDismiss={onClose} dismissible={canDismiss}>
      <div
        className={['mgac-modal', className ?? ''].filter(Boolean).join(' ')}
        role="dialog"
        aria-modal="true"
      >
        {title || description ? (
          <div className="mgac-modal-head">
            <div>
              {title ? <h2 className="mgac-modal-title">{title}</h2> : null}
              {description ? <p className="mgac-modal-desc">{description}</p> : null}
            </div>
            {onClose ? (
              <button
                type="button"
                className="mgac-icon-btn"
                onClick={onClose}
                aria-label={labels.closeDialog}
                title={labels.closeDialog}
              >
                ✕
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="mgac-modal-body">{children}</div>
        {footer ? <div className="mgac-modal-foot">{footer}</div> : null}
      </div>
    </AdminPortalLayer>
  )
}

export interface AdminDrawerProps {
  open: boolean
  title?: ReactNode
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  onClose?: () => void
  dismissible?: boolean
  /** 宽度档位：md（默认 520px）/ lg（720px） */
  size?: 'md' | 'lg'
  className?: string
}

/** 右侧滑入抽屉（编辑详情、下钻面板等）。 */
export function AdminDrawer({
  open,
  title,
  description,
  children,
  footer,
  onClose,
  dismissible = true,
  size = 'md',
  className,
}: AdminDrawerProps) {
  const { labels } = useAdminRuntime()
  const canDismiss = dismissible && Boolean(onClose)
  useEscapeToDismiss(open && canDismiss, onClose)

  if (!open) return null

  return (
    <AdminPortalLayer onDismiss={onClose} dismissible={canDismiss}>
      <aside
        className={['mgac-drawer', `is-${size}`, className ?? ''].filter(Boolean).join(' ')}
        role="dialog"
        aria-modal="true"
      >
        <div className="mgac-modal-head">
          <div className="mgac-drawer-title-wrap">
            {title ? <h2 className="mgac-modal-title">{title}</h2> : null}
            {description ? <p className="mgac-modal-desc">{description}</p> : null}
          </div>
          {onClose ? (
            <button
              type="button"
              className="mgac-icon-btn"
              onClick={onClose}
              aria-label={labels.closeDialog}
              title={labels.closeDialog}
            >
              ✕
            </button>
          ) : null}
        </div>
        <div className="mgac-modal-body">{children}</div>
        {footer ? <div className="mgac-modal-foot">{footer}</div> : null}
      </aside>
    </AdminPortalLayer>
  )
}
