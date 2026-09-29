'use client'

import type { CSSProperties } from 'react'

export interface AdminSkeletonProps {
  /** 形状：文本行 / 卡片 / 表格行 / 照片方块 */
  variant?: 'line' | 'card' | 'row' | 'tile'
  /** 重复条数（line/row）或网格列数（tile） */
  count?: number
  width?: string | number
  height?: string | number
  className?: string
  style?: CSSProperties
}

/** 加载骨架（纯展示，无宿主依赖）。 */
export function AdminSkeleton({
  variant = 'line',
  count = 1,
  width,
  height,
  className,
  style,
}: AdminSkeletonProps) {
  const items = Array.from({ length: Math.max(1, count) }, (_, index) => index)
  const mergedStyle: CSSProperties = { ...style }
  if (width !== undefined) mergedStyle.width = typeof width === 'number' ? `${width}px` : width
  if (height !== undefined) mergedStyle.height = typeof height === 'number' ? `${height}px` : height

  if (variant === 'tile') {
    return (
      <div className={['mgac-skeleton-grid', className ?? ''].filter(Boolean).join(' ')}>
        {items.map((index) => (
          <span key={index} className="mgac-skeleton is-tile" style={mergedStyle} />
        ))}
      </div>
    )
  }

  return (
    <div className={['mgac-skeleton-stack', className ?? ''].filter(Boolean).join(' ')}>
      {items.map((index) => (
        <span
          key={index}
          className={`mgac-skeleton is-${variant}`}
          style={variant === 'line' && !width ? { width: '100%', ...mergedStyle } : mergedStyle}
        />
      ))}
    </div>
  )
}
