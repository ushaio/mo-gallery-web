'use client'

import type { ReactNode } from 'react'

export interface ConsoleFieldProps {
  /** 字段名；作为 `<label>` 文本与单个控件关联 */
  label?: ReactNode
  /** 控件下方的说明（字数统计、到期规则等） */
  hint?: ReactNode
  /** 校验/服务端错误；给了就以错误色渲染 hint 区 */
  error?: ReactNode
  htmlFor?: string
  className?: string
  children: ReactNode
}

/**
 * 表单字段外壳：`标签 + 控件 + 说明/错误`。
 *
 * 只提供版式与文案位；控件本身由宿主用原生元素配 `.mgac-input` / `.mgac-select` /
 * `.mgac-textarea` 类名，或自己的表单件渲染——共享包不替宿主决定表单库。
 */
export function ConsoleField({ label, hint, error, htmlFor, className, children }: ConsoleFieldProps) {
  const hintText = error ?? hint
  return (
    <label className={['mgac-field', className ?? ''].filter(Boolean).join(' ')} htmlFor={htmlFor}>
      {label ? <span className="mgac-field-label">{label}</span> : null}
      {children}
      {hintText ? (
        <em className={`mgac-field-hint${error ? ' is-error' : ''}`}>{hintText}</em>
      ) : null}
    </label>
  )
}
