import type { ButtonHTMLAttributes, ComponentType, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

interface LibraryNavItemProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: LucideIcon | ComponentType<{ size?: number | string; className?: string }>
  label: string
  active?: boolean
  count?: number
  trailing?: ReactNode
}

/**
 * 资源库通用侧栏导航项。必须渲染单个 <button> 并 spread 其余属性，
 * 以便 ContextMenu/radix `asChild` 注入 onContextMenu 等。
 * i18n 无关：label 由调用方传入。
 */
export function LibraryNavItem({
  icon: Icon,
  label,
  active = false,
  count,
  trailing,
  type = 'button',
  className,
  style,
  ...rest
}: LibraryNavItemProps) {
  return (
    <button
      {...rest}
      type={type}
      className={`mb-0.5 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${className ?? ''}`}
      style={{
        backgroundColor: active ? 'var(--accent)' : undefined,
        color: active ? 'var(--accent-foreground)' : undefined,
        ...style,
      }}
    >
      <Icon size={15} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count != null && (
        <span className="text-[9px]" style={{ color: 'var(--muted-foreground)' }}>
          {count}
        </span>
      )}
      {trailing}
    </button>
  )
}
