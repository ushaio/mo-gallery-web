import type { LucideIcon } from 'lucide-react'
import { Loader2 } from 'lucide-react'

interface LibrarySelectionButtonProps {
  icon: LucideIcon
  label: string
  title: string
  onClick: () => void
  disabled?: boolean
  busy?: boolean
  active?: boolean
  intent?: 'default' | 'destructive'
}

/**
 * 资源库通用浮动选中栏按钮。busy 显示 spinner 并禁用（cursor-wait），
 * 普通 disabled 用 cursor-not-allowed。i18n 无关：label/title 由调用方传入。
 */
export function LibrarySelectionButton({
  icon: Icon,
  label,
  title,
  onClick,
  disabled = false,
  busy = false,
  active = false,
  intent = 'default',
}: LibrarySelectionButtonProps) {
  const disabledClass = busy
    ? 'disabled:cursor-wait disabled:opacity-50'
    : 'disabled:cursor-not-allowed disabled:opacity-40'
  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={onClick}
      title={title}
      aria-label={label}
      className={`rounded-md p-1.5 transition-colors hover:opacity-80 ${disabledClass}`}
      style={{
        color: intent === 'destructive' ? 'var(--destructive)' : 'var(--muted-foreground)',
        backgroundColor: active ? 'var(--accent)' : undefined,
      }}
    >
      {busy ? <Loader2 size={15} className="animate-spin" /> : <Icon size={15} />}
    </button>
  )
}
