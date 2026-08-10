'use client'

import { useEffect, useRef, useState } from 'react'
import { CheckCircle, ChevronDown, type LucideIcon } from 'lucide-react'

export interface SelectDropdownOption {
  value: string
  label: string
}

interface SelectDropdownProps {
  value: string | string[]
  options: SelectDropdownOption[]
  onChange: (value: string | string[]) => void
  placeholder?: string
  /** 多选模式：勾选可累积，不自动关闭 */
  multiple?: boolean
  /** sm = 紧凑（相册/存储源），md = 常规（故事/胶卷） */
  size?: 'sm' | 'md'
  /** 触发器右侧图标（沿用上传设置里的风格） */
  icon?: LucideIcon
  /** 单选模式下的“清除选择”选项文案，例如“不关联” */
  clearLabel?: string
  /** 选项为空时的提示文案 */
  emptyText?: string
  disabled?: boolean
  ariaLabel?: string
  className?: string
  /** 下拉列表展开方向；侧栏底部控件使用 top 避免被容器裁切 */
  placement?: 'top' | 'bottom'
}

/**
 * 桌面端下拉选择器：圆角边框触发器 + 勾选列表。
 * 风格源自图片上传页的相册下拉框，支持单选/多选。
 */
export function SelectDropdown({
  value,
  options,
  onChange,
  placeholder = '',
  multiple = false,
  size = 'sm',
  icon: Icon,
  clearLabel,
  emptyText,
  disabled = false,
  ariaLabel,
  className = '',
  placement = 'bottom',
}: SelectDropdownProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const handleMouseDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const selectedValues: string[] = multiple
    ? (Array.isArray(value) ? value : [])
    : [Array.isArray(value) ? (value[0] ?? '') : value]

  const selectedLabels = options
    .filter((option) => selectedValues.includes(option.value))
    .map((option) => option.label)

  const isSelected = (optionValue: string) =>
    selectedValues.includes(optionValue)

  const handleOptionClick = (optionValue: string) => {
    if (multiple) {
      const next = selectedValues.includes(optionValue)
        ? selectedValues.filter((v) => v !== optionValue)
        : [...selectedValues, optionValue]
      onChange(next)
    } else {
      onChange(optionValue)
      setOpen(false)
    }
  }

  const triggerClass = size === 'md' ? 'px-3 py-2 text-sm' : 'px-2.5 py-1.5 text-xs'
  const optionClass = size === 'md' ? 'px-3 py-2 text-sm' : 'px-3 py-1.5 text-xs'

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={(event) => {
          event.stopPropagation()
          setOpen((prev) => !prev)
        }}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border text-left outline-none transition-colors focus:border-primary disabled:cursor-not-allowed disabled:opacity-50 ${triggerClass}`}
        style={{
          borderColor: 'var(--border)',
          backgroundColor: 'var(--background)',
          color: selectedLabels.length > 0 ? 'var(--foreground)' : 'var(--muted-foreground)',
        }}
      >
        <span className="truncate" title={selectedLabels.join(', ') || placeholder}>
          {selectedLabels.join(', ') || placeholder}
        </span>
        <span className="flex shrink-0 items-center gap-1.5" style={{ color: 'var(--muted-foreground)' }}>
          {Icon ? <Icon size={12} className="shrink-0" /> : null}
          <ChevronDown
            size={12}
            className={`shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          />
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          className={`absolute left-0 z-20 max-h-56 w-full overflow-y-auto rounded-lg border shadow-lg ${placement === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'}`}
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--background)' }}
          onClick={(event) => event.stopPropagation()}
        >
          {!multiple && clearLabel && (
            <button
              type="button"
              role="option"
              aria-selected={selectedValues[0] === ''}
              onClick={() => {
                onChange('')
                setOpen(false)
              }}
              className={`flex w-full items-center justify-between text-left hover:bg-muted/50 ${optionClass}`}
              style={{ color: 'var(--muted-foreground)' }}
            >
              <span>{clearLabel}</span>
            </button>
          )}
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={isSelected(option.value)}
              onClick={() => handleOptionClick(option.value)}
              className={`flex w-full items-center justify-between gap-2 text-left hover:bg-muted/50 ${optionClass}`}
              style={{ color: isSelected(option.value) ? 'var(--primary)' : 'var(--foreground)' }}
            >
              <span className="min-w-0 break-words">{option.label}</span>
              {isSelected(option.value) && <CheckCircle size={12} className="shrink-0" />}
            </button>
          ))}
          {options.length === 0 && emptyText && (
            <div className={`${optionClass}`} style={{ color: 'var(--muted-foreground)' }}>
              {emptyText}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
