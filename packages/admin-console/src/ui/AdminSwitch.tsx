'use client'

import type { ReactNode } from 'react'

export interface AdminSwitchProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label?: ReactNode
  description?: ReactNode
  disabled?: boolean
  /** 保存中：显示忙碌态并禁止再次切换 */
  busy?: boolean
  id?: string
  className?: string
}

/** iOS 风格开关（结构 + 观感在 shared，状态与持久化由宿主负责）。 */
export function AdminSwitch({
  checked,
  onCheckedChange,
  label,
  description,
  disabled = false,
  busy = false,
  id,
  className,
}: AdminSwitchProps) {
  const isDisabled = disabled || busy
  const control = (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-busy={busy}
      disabled={isDisabled}
      className={`mgac-switch${checked ? ' is-on' : ''}${busy ? ' is-busy' : ''}`}
      onClick={() => onCheckedChange(!checked)}
    >
      <span className="mgac-switch-knob" />
    </button>
  )

  if (!label && !description) return <span className={className}>{control}</span>

  return (
    <div className={['mgac-switch-row', className ?? ''].filter(Boolean).join(' ')}>
      <div className="mgac-switch-text">
        {label ? <label htmlFor={id}>{label}</label> : null}
        {description ? <small>{description}</small> : null}
      </div>
      {control}
    </div>
  )
}
