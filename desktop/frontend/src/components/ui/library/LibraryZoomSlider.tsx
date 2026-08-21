import { Minus, Plus } from 'lucide-react'

interface LibraryZoomSliderProps {
  value: number
  min: number
  max: number
  step?: number
  baseValue?: number
  onChange: (value: number) => void
  ariaLabel: string
  title: string
}

/**
 * 资源库通用缩放滑杆（Minus / range / Plus / 百分比）。
 * 百分比以 baseValue（默认 176）为 100% 基准。
 * i18n 无关：aria-label 与 title 由调用方传入。
 */
export function LibraryZoomSlider({
  value,
  min,
  max,
  step = 8,
  baseValue = 176,
  onChange,
  ariaLabel,
  title,
}: LibraryZoomSliderProps) {
  return (
    <div
      className="ml-1 flex shrink-0 items-center gap-2 border-l pl-3"
      style={{ borderColor: 'var(--border)' }}
    >
      <Minus size={11} style={{ color: 'var(--muted-foreground)' }} />
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={ariaLabel}
        title={title}
        className="h-1 w-28 cursor-pointer accent-current"
      />
      <Plus size={11} style={{ color: 'var(--muted-foreground)' }} />
      <span
        className="w-8 text-right text-[9px] tabular-nums"
        style={{ color: 'var(--muted-foreground)' }}
      >
        {Math.round((value / baseValue) * 100)}%
      </span>
    </div>
  )
}
