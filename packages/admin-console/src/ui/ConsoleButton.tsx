'use client'

import type { ReactNode } from 'react'

export type ConsoleButtonVariant = 'default' | 'primary' | 'danger' | 'outline' | 'ghost' | 'icon'
export type ConsoleButtonSize = 'sm' | 'md' | 'lg'

export interface ConsoleButtonProps {
  children?: ReactNode
  variant?: ConsoleButtonVariant
  size?: ConsoleButtonSize
  /** 忙碌态：显示 spinner 并禁用点击 */
  busy?: boolean
  disabled?: boolean
  type?: 'button' | 'submit'
  title?: string
  /** 无障碍标签（icon 变体建议必填） */
  ariaLabel?: string
  autoFocus?: boolean
  fullWidth?: boolean
  className?: string
  onClick?: () => void
}

/**
 * 后台按钮原子件：变体与尺寸落在这里，颜色全部走 `--mgac-*` 令牌，
 * 宿主可用 `className` 追加自己的布局类（避让 Tailwind：本包样式不在 `@layer` 里）。
 */
export function ConsoleButton({
  children,
  variant = 'default',
  size = 'md',
  busy = false,
  disabled = false,
  type = 'button',
  title,
  ariaLabel,
  autoFocus,
  fullWidth,
  className,
  onClick,
}: ConsoleButtonProps) {
  const classes = [
    'mgac-btn',
    `is-${variant}`,
    size === 'md' ? '' : `is-${size}`,
    busy ? 'is-busy' : '',
    fullWidth ? 'is-block' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || busy}
      title={title}
      aria-label={ariaLabel}
      aria-busy={busy}
      autoFocus={autoFocus}
      onClick={onClick}
    >
      {busy ? <span className="mgac-spinner" aria-hidden="true" /> : null}
      {children}
    </button>
  )
}
