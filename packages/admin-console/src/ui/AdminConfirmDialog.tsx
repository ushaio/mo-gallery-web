'use client'

import { useEffect, useId, type ReactNode } from 'react'

import { AdminButton } from './AdminButton'
import { AdminPortalLayer, useEscapeToDismiss } from './portal'

/** 语义色调：danger（破坏性，默认）/ info（授予与切换）/ plain（中性，如退出登录） */
export type AdminConfirmTone = 'danger' | 'info' | 'plain'

export interface AdminConfirmOption {
  id: string
  label: ReactNode
  /** 副说明（官方后台的「数据分区」提示就走这里） */
  hint?: ReactNode
  disabled?: boolean
}

/**
 * 复选项组（差异登记点③：同一确认弹窗在不同宿主可以有完全不同的字段）。
 * 受控：`selected` / `onToggle` 由宿主持有，共享包不猜默认勾选。
 */
export interface AdminConfirmOptionsGroup {
  items: AdminConfirmOption[]
  selected: string[]
  onToggle: (id: string, checked: boolean) => void
  legend?: ReactNode
  ariaLabel?: string
}

export interface AdminConfirmDialogProps {
  open: boolean
  title: ReactNode
  /** 标题下方的小字帽（如「3 张照片」这类影响面说明） */
  eyebrow?: ReactNode
  description?: ReactNode
  tone?: AdminConfirmTone
  /** 图标由宿主传（共享包不锁死图标库） */
  icon?: ReactNode
  /** 附加字段：勾选项组 */
  options?: AdminConfirmOptionsGroup
  /** 动作区之外的附加内容（警告列表、影响面预览等） */
  children?: ReactNode
  cancelLabel?: ReactNode
  confirmLabel: ReactNode
  confirmVariant?: 'primary' | 'danger'
  /** 提交中：禁用两个按钮、屏蔽 Esc 与遮罩关闭（宿主负责异步动作） */
  busy?: boolean
  /** 打开时把焦点放到取消按钮（破坏性操作建议 true） */
  autoFocusCancel?: boolean
  /**
   * 允许按 Enter 直接确认（对齐 web 后台既有手感）。
   * 焦点停在输入框/按钮/链接上时不触发，避免与控件自身的 Enter 语义打架。
   */
  confirmOnEnter?: boolean
  /** 是否允许点击遮罩关闭，默认 true */
  closeOnBackdrop?: boolean
  defaultCancelLabel?: string
  onCancel: () => void
  onConfirm: () => void
}

const INTERACTIVE_SELECTOR = 'input, textarea, select, button, a[href], [contenteditable="true"]'

/**
 * 破坏性/敏感操作的确认弹窗。
 *
 * 上下两端都在用，差异按登记点分配：
 * - ① 导航/入口：宿主自己决定在哪些地方弹；
 * - ② 能力：不需要；
 * - ③ props：文案、色调、图标、勾选项组（官方「一并清除的数据」、web 的多个删除选项）；
 * - ④ 插槽：`children`（影响面清单等）。
 * 业务动作一律由宿主 `onConfirm` 承担（写审计日志、删库、刷新列表……共享包不碰数据）。
 */
export function AdminConfirmDialog({
  open,
  title,
  eyebrow,
  description,
  tone = 'danger',
  icon,
  options,
  children,
  cancelLabel,
  confirmLabel,
  confirmVariant = 'danger',
  busy = false,
  autoFocusCancel = false,
  confirmOnEnter = false,
  closeOnBackdrop = true,
  defaultCancelLabel = '取消',
  onCancel,
  onConfirm,
}: AdminConfirmDialogProps) {
  const titleId = useId()
  const dismissible = closeOnBackdrop && !busy
  useEscapeToDismiss(open && dismissible, onCancel)

  useEffect(() => {
    if (!open || !confirmOnEnter || busy) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter') return
      const active = document.activeElement
      if (active instanceof HTMLElement && active.matches(INTERACTIVE_SELECTOR)) return
      event.preventDefault()
      onConfirm()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, confirmOnEnter, busy, onConfirm])

  if (!open) return null

  const iconClass = ['mgac-confirm-icon', tone === 'info' ? 'is-info' : tone === 'plain' ? 'is-plain' : '']
    .filter(Boolean)
    .join(' ')

  return (
    <AdminPortalLayer onDismiss={onCancel} dismissible={dismissible}>
      <div className="mgac-confirm" role="alertdialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="mgac-confirm-head">
          {icon ? <span className={iconClass}>{icon}</span> : null}
          <h3 className="mgac-confirm-title" id={titleId}>
            {title}
          </h3>
        </div>

        {eyebrow ? <p className="mgac-confirm-eyebrow">{eyebrow}</p> : null}
        {description ? <p className="mgac-confirm-desc">{description}</p> : null}
        {options && options.items.length > 0 ? (
          <div className="mgac-confirm-options" role="group" aria-label={options.ariaLabel}>
            {options.legend ? <span className="mgac-confirm-legend">{options.legend}</span> : null}
            {options.items.map((item) => (
              <label className="mgac-confirm-option" key={item.id}>
                <input
                  type="checkbox"
                  checked={options.selected.includes(item.id)}
                  disabled={busy || item.disabled}
                  onChange={(event) => options.onToggle(item.id, event.target.checked)}
                />
                <span>
                  <strong>{item.label}</strong>
                  {item.hint ? <small className="mgac-confirm-option-hint">{item.hint}</small> : null}
                </span>
              </label>
            ))}
          </div>
        ) : null}

        {children ? <div className="mgac-confirm-body">{children}</div> : null}

        <div className="mgac-confirm-actions">
          <AdminButton variant="outline" size="sm" autoFocus={autoFocusCancel} disabled={busy} onClick={onCancel}>
            {cancelLabel ?? defaultCancelLabel}
          </AdminButton>
          <AdminButton variant={confirmVariant} size="sm" busy={busy} onClick={onConfirm}>
            {confirmLabel}
          </AdminButton>
        </div>
      </div>
    </AdminPortalLayer>
  )
}
