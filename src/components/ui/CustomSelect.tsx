'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'

export interface SelectOption {
  value: string
  label: string
  suffix?: string // 可选后缀，如 "(草稿)"
}

type UiVariant = 'admin' | 'site'
type UiSize = 'md' | 'sm'

interface CustomSelectProps {
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  uiVariant?: UiVariant
  /** `sm` 为紧凑尺寸：触发器 32px 高，用于与 32px 搜索框/图标按钮同排的紧凑工具栏 */
  uiSize?: UiSize
  className?: string
  ariaLabel?: string
}

export function CustomSelect({
  value,
  options,
  onChange,
  placeholder = '请选择',
  disabled = false,
  uiVariant = 'admin',
  uiSize = 'md',
  className = '',
  ariaLabel,
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const selectedOption = options.find((opt) => opt.value === value)
  const displayLabel = selectedOption
    ? `${selectedOption.label}${selectedOption.suffix ? ` ${selectedOption.suffix}` : ''}`
    : placeholder

  const ui = useMemo(() => {
    const compact = uiSize === 'sm'
    if (uiVariant === 'site') {
      return {
        trigger: compact
          ? 'h-8 px-3 py-0 bg-background border border-border rounded-md flex items-center justify-between cursor-pointer transition-colors hover:border-primary'
          : 'min-h-10 px-3 py-2 bg-background border border-border rounded-md flex items-center justify-between cursor-pointer transition-colors hover:border-primary',
        label: 'text-sm',
        dropdown:
          'absolute z-40 w-full mt-1 bg-background border border-border rounded-md shadow-xl max-h-56 overflow-y-auto',
        option:
          'w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center justify-between group transition-colors',
        optionActive: 'bg-muted text-foreground',
      }
    }

    return {
      trigger: compact
        ? 'h-8 px-3 py-0 bg-background border-b border-border flex items-center justify-between cursor-pointer transition-colors hover:border-primary'
        : 'min-h-10 px-3 py-2 bg-background border-b border-border flex items-center justify-between cursor-pointer transition-colors hover:border-primary',
      label: 'text-xs font-mono',
      dropdown:
        'absolute z-40 w-full mt-1 bg-background border border-border shadow-2xl max-h-48 overflow-y-auto',
      option:
        'w-full text-left px-4 py-3 text-xs font-bold uppercase tracking-wider hover:bg-primary hover:text-primary-foreground flex items-center justify-between group transition-colors',
      optionActive: 'bg-primary/10 text-primary',
    }
  }, [uiVariant, uiSize])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isOpen &&
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener('click', handleClickOutside, true)
    return () => document.removeEventListener('click', handleClickOutside, true)
  }, [isOpen])

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div
        className={`${ui.trigger} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (!disabled) setIsOpen(!isOpen) }
          if (event.key === 'Escape' && isOpen) { event.preventDefault(); event.stopPropagation(); setIsOpen(false) }
        }}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <span className={ui.label}>{displayLabel}</span>
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </div>
      {isOpen && (
        <div className={ui.dropdown} role="listbox" aria-label={ariaLabel}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={value === option.value}
              onClick={() => {
                onChange(option.value)
                setIsOpen(false)
              }}
              className={`${ui.option} ${value === option.value ? ui.optionActive : ''}`}
            >
              <span>
                {option.label}
                {option.suffix && ` ${option.suffix}`}
              </span>
              {value === option.value && <Check className="w-3 h-3" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
