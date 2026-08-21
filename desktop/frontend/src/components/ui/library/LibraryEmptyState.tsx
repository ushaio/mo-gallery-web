import type { LucideIcon } from 'lucide-react'

interface LibraryEmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  className?: string
}

/**
 * 资源库通用空状态：图标块 + 标题 + 可选说明 + 可选主操作。
 * `h-full` 不进组件——云端需要撑满（由调用方传 className），本地网格不能撑满。
 * i18n 无关：所有文案由调用方传入。
 */
export function LibraryEmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  className,
}: LibraryEmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 ${className ?? ''}`}>
      <div
        className="flex h-12 w-12 items-center justify-center rounded-lg"
        style={{ backgroundColor: 'var(--muted)' }}
      >
        <Icon size={20} style={{ color: 'var(--muted-foreground)' }} />
      </div>
      <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
        {title}
      </p>
      {description && (
        <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="rounded-md px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-90"
          style={{
            backgroundColor: 'var(--primary)',
            color: 'var(--primary-foreground)',
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
