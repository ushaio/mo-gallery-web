interface SkeletonProps {
  className?: string
  style?: React.CSSProperties
}

/** 基础骨架块 — 圆角矩形脉冲动画 */
export function Skeleton({ className = '', style }: SkeletonProps) {
  return (
    <div
      className={`rounded-md animate-pulse ${className}`}
      style={{ backgroundColor: 'var(--muted)', ...style }}
    />
  )
}

/** 统计卡片骨架 */
export function StatCardSkeleton() {
  return (
    <div className="rounded-lg border p-4" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
      <div className="flex items-center gap-3">
        <Skeleton className="w-10 h-10 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-7 w-12" />
          <Skeleton className="h-2.5 w-24" />
        </div>
      </div>
    </div>
  )
}

/** 网格卡片骨架（相册、胶卷等） */
export function CardGridSkeleton({ count = 6, cols = 4 }: { count?: number; cols?: number }) {
  return (
    <div className={`grid gap-4`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          <Skeleton className="aspect-video w-full rounded-none" />
          <div className="p-3 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** 列表行骨架（友链、博客、叙事等） */
export function ListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3 rounded-lg border"
          style={{ borderColor: 'var(--border)' }}>
          <Skeleton className="w-10 h-10 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** 缩略图网格骨架（照片等） */
export function ThumbGridSkeleton({ count = 12, cols = 6 }: { count?: number; cols?: number }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="aspect-square w-full" />
      ))}
    </div>
  )
}

/** 表格行骨架（设置、评论等） */
export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} className={`h-3.5 ${j === 0 ? 'w-1/4' : 'w-1/6'}`} />
          ))}
        </div>
      ))}
    </div>
  )
}
