import type { LucideIcon } from 'lucide-react'

interface ViewOption {
  value: string
  icon: LucideIcon
  title: string
}

interface LibraryViewToggleProps {
  value: string
  onChange: (value: string) => void
  options: ViewOption[]
}

/**
 * 资源库通用视图切换器（裁切/适应/瀑布流等）。选项数量由调用方决定
 * （照片三选一、胶卷两选一），不限制固定选项。
 * i18n 无关：每个选项的 title 由调用方传入。
 */
export function LibraryViewToggle({ value, onChange, options }: LibraryViewToggleProps) {
  return (
    <div className="flex h-8 shrink-0 items-center rounded-md border bg-input p-0.5">
      {options.map((option) => {
        const Icon = option.icon
        const active = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            title={option.title}
            aria-label={option.title}
            aria-pressed={active}
            className="flex size-7 items-center justify-center rounded"
            style={{ backgroundColor: active ? 'var(--secondary)' : undefined }}
          >
            <Icon size={13} />
          </button>
        )
      })}
    </div>
  )
}
