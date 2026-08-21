import { Search, X } from 'lucide-react'

interface LibrarySearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder: string
  clearLabel?: string
  className?: string
}

/**
 * 资源库通用搜索输入框（带放大镜与一键清空）。防抖逻辑留在调用方。
 * i18n 无关：placeholder 与清空按钮文案由调用方传入。
 */
export function LibrarySearchInput({
  value,
  onChange,
  placeholder,
  clearLabel,
  className,
}: LibrarySearchInputProps) {
  return (
    <div className={`relative min-w-0 flex-1 ${className ?? ''}`}>
      <Search
        size={14}
        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
        style={{ color: 'var(--muted-foreground)' }}
      />
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-full rounded-md border bg-input pl-8 pr-8 text-xs outline-none focus:ring-1"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label={clearLabel}
          title={clearLabel}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1"
        >
          <X size={13} />
        </button>
      )}
    </div>
  )
}
