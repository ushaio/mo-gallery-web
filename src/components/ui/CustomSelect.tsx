'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'

export interface SelectOption {
  value: string
  label: string
  suffix?: string // 可选后缀，如 "(草稿)"
}

type UiVariant = 'admin' | 'site'

interface CustomSelectProps {
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  uiVariant?: UiVariant
  className?: string
}

export function CustomSelect({
  value,
  options,
  onChange,
  placeholder = '请选择',
  disabled = false,
  uiVariant = 'admin',
  className = '',
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const selectedOption = options.find((opt) => opt.value === value)
  const displayLabel = selectedOption
    ? `${selectedOption.label}${selectedOption.suffix ? ` ${selectedOption.suffix}` : ''}`
    : placeholder

  const ui = useMemo(() => {
    if (uiVariant === 'site') {
      return {
        trigger:
          'min-h-10 px-3 py-2 bg-background border border-border rounded-md flex items-center justify-between cursor-pointer transition-colors hover:border-primary',
        label: 'text-sm',
        dropdown:
          'absolute z-20 w-full mt-1 bg-background border border-border rounded-md shadow-xl max-h-56 overflow-y-auto',
        option:
          'w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center justify-between group transition-colors',
        optionActive: 'bg-muted text-foreground',
      }
    }

    return {
      trigger:
        'min-h-10 px-3 py-2 bg-background border-b border-border flex items-center justify-between cursor-pointer transition-colors hover:border-primary',
      label: 'text-xs font-mono',
      dropdown:
        'absolute z-20 w-full mt-1 bg-background border border-border shadow-2xl max-h-48 overflow-y-auto',
      option:
        'w-full text-left px-4 py-3 text-xs font-bold uppercase tracking-wider hover:bg-primary hover:text-primary-foreground flex items-center justify-between group transition-colors',
      optionActive: 'bg-primary/10 text-primary',
    }
  }, [uiVariant])

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
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <span className={ui.label}>{displayLabel}</span>
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </div>
      {isOpen && (
        <div className={ui.dropdown}>
          {options.map((option) => (
            <button
              key={option.value}
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
