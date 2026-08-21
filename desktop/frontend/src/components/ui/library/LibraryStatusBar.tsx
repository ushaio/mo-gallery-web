import type { HTMLAttributes, ReactNode } from 'react'

interface LibraryStatusBarProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

/**
 * 资源库通用底部状态栏壳（min-h-10、上边框、card 底色）。
 * 左侧状态/计数区与操作按钮作为 children 传入；缩放滑杆由调用方作为最后一个子元素
 * 使用 LibraryZoomSlider 渲染。spread `...rest` 以保留 `data-local-library-guide`。
 */
export function LibraryStatusBar({
  children,
  className,
  style,
  ...rest
}: LibraryStatusBarProps) {
  return (
    <div
      {...rest}
      className={`flex min-h-10 shrink-0 items-center gap-3 border-t px-4 ${className ?? ''}`}
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)', ...style }}
    >
      {children}
    </div>
  )
}
