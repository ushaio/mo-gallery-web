import type { HTMLAttributes, ReactNode } from 'react'

interface LibraryToolbarProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

/**
 * 资源库通用内容工具栏容器（无底色，仅下边框）。
 * spread `...rest` 以保留 `data-local-library-guide` 等属性。
 */
export function LibraryToolbar({
  children,
  className,
  style,
  ...rest
}: LibraryToolbarProps) {
  return (
    <div
      {...rest}
      className={`relative flex min-h-13 shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2 ${className ?? ''}`}
      style={{ borderColor: 'var(--border)', ...style }}
    >
      {children}
    </div>
  )
}
