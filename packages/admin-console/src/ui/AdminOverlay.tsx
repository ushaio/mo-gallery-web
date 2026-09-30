'use client'

import { useId, type ReactNode } from 'react'

import { useAdminRuntime } from '../runtime/AdminRuntimeProvider'
import { AdminPortalLayer, useEscapeToDismiss } from './portal'

/** 语义色调：决定图标气泡配色（危险 / 警示 / 信息 / 中性） */
export type AdminModalTone = 'danger' | 'warn' | 'info' | 'plain'

export interface AdminModalProps {
  open: boolean
  title?: ReactNode
  /** 标题下方的小字帽（计数、类别、「无法删除」这类状态说明） */
  eyebrow?: ReactNode
  description?: ReactNode
  /** 标题左侧图标气泡（不传则无气泡；图标由宿主传） */
  icon?: ReactNode
  tone?: AdminModalTone
  /** 面板宽度档位：sm 460 / md 520（默认） / lg 680 */
  size?: 'sm' | 'md' | 'lg'
  children?: ReactNode
  /** 底部动作区（按钮用 AdminButton，共享包不含业务语义） */
  footer?: ReactNode
  onClose?: () => void
  /** 是否允许 Esc / 遮罩点击关闭，默认 true */
  dismissible?: boolean
  /** 提交中：屏蔽 Esc 与遮罩关闭（按钮禁用由宿主负责） */
  busy?: boolean
  className?: string
  /** 内容区类名（宽表单/表格需要贴边或自定义内边距时用） */
  bodyClassName?: string
}

/** 居中模态：结构 + 观感由 shared 提供，内容与动作全部由宿主传。 */
export function AdminModal({
  open,
  title,
  eyebrow,
  description,
  icon,
  tone = 'plain',
  size = 'md',
  children,
  footer,
  onClose,
  dismissible = true,
  busy = false,
  className,
  bodyClassName,
}: AdminModalProps) {
  const { labels } = useAdminRuntime()
  const titleId = useId()
  const canDismiss = dismissible && !busy && Boolean(onClose)
  useEscapeToDismiss(open && canDismiss, onClose)

  if (!open) return null

  return (
    <AdminPortalLayer onDismiss={onClose} dismissible={canDismiss}>
      <div
        className={['mgac-modal', size === 'md' ? '' : `is-${size}`, className ?? '']
          .filter(Boolean)
          .join(' ')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
      >
        {title || description || eyebrow || icon ? (
          <div className={['mgac-modal-head', icon ? 'has-icon' : ''].filter(Boolean).join(' ')}>
            {icon ? <span className={`mgac-modal-icon is-${tone}`}>{icon}</span> : null}
            <div className="mgac-modal-head-text">
              {title ? (
                <h2 className="mgac-modal-title" id={titleId}>
                  {title}
                </h2>
              ) : null}
              {eyebrow ? <p className="mgac-modal-eyebrow">{eyebrow}</p> : null}
              {description ? <p className="mgac-modal-desc">{description}</p> : null}
            </div>
            {onClose ? (
              <button
                type="button"
                className="mgac-icon-btn"
                onClick={onClose}
                disabled={busy}
                aria-label={labels.closeDialog}
                title={labels.closeDialog}
              >
                ✕
              </button>
            ) : null}
          </div>
        ) : null}
        <div className={['mgac-modal-body', bodyClassName ?? ''].filter(Boolean).join(' ')}>
          {children}
        </div>
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
  /** 内容区类名（宽表单/表格需要贴边或自定义内边距时用） */
  bodyClassName?: string
  /** 提交中：屏蔽 Esc、遮罩与 ✕ 关闭（按钮禁用由宿主负责） */
  busy?: boolean
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
  bodyClassName,
  busy = false,
}: AdminDrawerProps) {
  const { labels } = useAdminRuntime()
  const canDismiss = dismissible && !busy && Boolean(onClose)
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
              disabled={busy}
              aria-label={labels.closeDialog}
              title={labels.closeDialog}
            >
              ✕
            </button>
          ) : null}
        </div>
        <div className={['mgac-modal-body', bodyClassName ?? ''].filter(Boolean).join(' ')}>
          {children}
        </div>
        {footer ? <div className="mgac-modal-foot">{footer}</div> : null}
      </aside>
    </AdminPortalLayer>
  )
}
