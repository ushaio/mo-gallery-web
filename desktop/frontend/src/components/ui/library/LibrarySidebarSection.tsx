import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ChevronDown, ChevronRight, Loader2, RefreshCw } from 'lucide-react'

interface LibrarySidebarSectionProps {
  open: boolean
  onToggle: () => void
  label: string
  icon?: LucideIcon
  onRefresh?: () => void
  refreshing?: boolean
  refreshLabel?: string
  expandLabel?: string
  collapseLabel?: string
  children?: ReactNode
}

/**
 * 资源库通用侧栏分组小标题（可折叠 + 可选刷新/图标）。
 * 保留 focus-visible ring 作为统一的无障碍改进。
 * i18n 无关：label 与各 aria 文案由调用方传入。
 */
export function LibrarySidebarSection({
  open,
  onToggle,
  label,
  icon: Icon,
  onRefresh,
  refreshing = false,
  refreshLabel,
  expandLabel,
  collapseLabel,
  children,
}: LibrarySidebarSectionProps) {
  return (
    <>
      <div className="mb-2 mt-5 flex items-center gap-1 px-1">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={open ? collapseLabel : expandLabel}
          title={open ? collapseLabel : expandLabel}
          className="flex min-w-0 flex-1 items-center gap-1 rounded-md px-1.5 py-1.5 text-left text-[10px] font-medium uppercase tracking-[0.16em] transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          style={{ color: 'var(--muted-foreground)' }}
        >
          {open ? (
            <ChevronDown size={12} className="shrink-0" />
          ) : (
            <ChevronRight size={12} className="shrink-0" />
          )}
          {Icon && <Icon size={12} className="shrink-0" />}
          <span className="truncate">{label}</span>
        </button>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            title={refreshLabel}
            aria-label={refreshLabel}
            className="flex size-6 shrink-0 items-center justify-center rounded hover:bg-secondary disabled:cursor-wait disabled:opacity-50"
            style={{ color: 'var(--muted-foreground)' }}
          >
            {refreshing ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <RefreshCw size={11} />
            )}
          </button>
        )}
      </div>
      {open && children}
    </>
  )
}
