import type { HTMLAttributes, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

interface LibraryCountBarProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  icon: LucideIcon
  title: ReactNode
  count: ReactNode
}

/**
 * 资源库通用粘性计数栏（云端/本地共用的位置+计数条）。
 * title 内容由调用方传入并自带样式（云端是集合标题，本地是路径面包屑），
 * 组件只统一外壳；自带底部 mb-1 间距，避免下方卡片首行的 focus 轮廓被遮住。
 * 横向内边距由调用方按各自滚动容器的对齐方式传入 className（如本地传 px-4）。
 */
export function LibraryCountBar({
  icon: Icon,
  title,
  count,
  className,
  style,
  ...rest
}: LibraryCountBarProps) {
  return (
    <div
      {...rest}
      className={`sticky top-0 z-10 mb-1 flex h-8 shrink-0 items-center justify-between gap-3 bg-background text-[10px] ${className ?? ''}`}
      style={{ color: 'var(--muted-foreground)', ...style }}
    >
      <div className="flex min-w-0 items-center gap-1">
        <span
          className="flex size-5 shrink-0 items-center justify-center rounded bg-secondary"
          style={{ color: 'var(--foreground)' }}
        >
          <Icon size={11} />
        </span>
        <span className="min-w-0 flex-1 truncate whitespace-nowrap">{title}</span>
      </div>
      <span className="shrink-0 rounded bg-secondary px-2 py-0.5 tabular-nums">
        {count}
      </span>
    </div>
  )
}
