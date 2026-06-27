'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, X } from 'lucide-react'

export interface MultiSelectOption {
  value: string
  label: string
  suffix?: string
}

type UiVariant = 'admin' | 'site'

interface CustomMultiSelectProps {
  values: string[]
  options: MultiSelectOption[]
  onChange: (values: string[]) => void
  placeholder?: string
  inputPlaceholder?: string
  disabled?: boolean
  allowCreate?: boolean
  uiVariant?: UiVariant
  className?: string
}

function normalize(s: string) {
  return s.trim()
}

function buildLabel(option: MultiSelectOption) {
  return `${option.label}${option.suffix ? ` ${option.suffix}` : ''}`
}

export function CustomMultiSelect({
  values,
  options,
  onChange,
  placeholder = '请选择',
  inputPlaceholder = '',
  disabled = false,
  allowCreate = false,
  uiVariant = 'admin',
  className = '',
}: CustomMultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const optionByValue = useMemo(() => {
    const map = new Map<string, MultiSelectOption>()
    for (const opt of options) map.set(opt.value, opt)
    return map
  }, [options])

  const selected = useMemo(() => {
    const unique: string[] = []
    const seen = new Set<string>()
    for (const v of values) {
      if (seen.has(v)) continue
      seen.add(v)
      unique.push(v)
    }
    return unique
  }, [values])

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase()
    return options.filter((opt) => {
      if (selected.includes(opt.value)) return false
      if (!q) return true
      return opt.label.toLowerCase().includes(q) || opt.value.toLowerCase().includes(q)
    })
  }, [options, query, selected])

  const canCreate = useMemo(() => {
    if (!allowCreate) return false
    const v = normalize(query)
    if (!v) return false
    if (selected.includes(v)) return false
    return !options.some((o) => o.value === v)
  }, [allowCreate, options, query, selected])

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

  const ui = useMemo(() => {
    if (uiVariant === 'site') {
      return {
        container: 'bg-background border border-border rounded-md',
        trigger:
          'min-h-10 px-3 py-2 flex flex-wrap gap-2 items-center cursor-text transition-colors focus-within:border-primary',
        chip: 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted text-sm',
        chipRemove:
          'p-0.5 rounded hover:bg-background/80 text-muted-foreground hover:text-foreground transition-colors',
        input: 'flex-1 min-w-[80px] bg-transparent outline-none text-sm',
        dropdown:
          'absolute z-20 w-full mt-1 bg-background border border-border rounded-md shadow-xl max-h-56 overflow-y-auto',
        option:
          'w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center justify-between transition-colors',
        optionActive: 'bg-muted text-foreground',
        create:
          'w-full text-left px-3 py-2 text-sm text-primary hover:bg-muted flex items-center justify-between transition-colors',
        hint: 'px-3 py-2 text-sm text-muted-foreground text-center',
      }
    }

    return {
      container: 'bg-background border-b border-border',
      trigger:
        'min-h-[48px] p-3 bg-muted/30 border-b border-border flex flex-wrap gap-2 cursor-text focus-within:border-primary transition-colors',
      chip: 'inline-flex items-center gap-1.5 px-2.5 py-1 bg-foreground/10 text-xs font-medium',
      chipRemove: 'p-0 hover:text-destructive transition-colors',
      input: 'flex-1 min-w-[60px] outline-none bg-transparent text-sm',
      dropdown:
        'absolute z-20 w-full mt-1 bg-background border border-border shadow-xl max-h-40 overflow-y-auto',
      option:
        'w-full text-left px-4 py-2.5 text-sm font-medium hover:bg-primary hover:text-primary-foreground flex items-center justify-between transition-colors group',
      optionActive: 'bg-primary/10 text-primary',
      create:
        'w-full text-left px-4 py-2.5 text-sm font-medium text-primary hover:bg-primary hover:text-primary-foreground flex items-center justify-between transition-colors',
      hint: 'px-4 py-3 text-xs text-muted-foreground text-center',
    }
  }, [uiVariant])

  const addValue = (value: string) => {
    const v = normalize(value)
    if (!v) return
    if (selected.includes(v)) return
    onChange([...selected, v])
    setQuery('')
    queueMicrotask(() => inputRef.current?.focus())
  }

  const removeValue = (value: string) => {
    onChange(selected.filter((v) => v !== value))
    queueMicrotask(() => inputRef.current?.focus())
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div
        className={`${ui.container}`}
        onClick={() => {
          if (disabled) return
          setIsOpen(true)
          inputRef.current?.focus()
        }}
      >
        <div className={`${ui.trigger} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
          {selected.map((v) => {
            const opt = optionByValue.get(v)
            const label = opt ? buildLabel(opt) : v
            return (
              <span key={v} className={ui.chip}>
                {label}
                {!disabled && (
                  <button
                    type="button"
                    className={ui.chipRemove}
                    onClick={(e) => {
                      e.stopPropagation()
                      removeValue(v)
                    }}
                    aria-label="Remove"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </span>
            )
          })}

          <input
            ref={inputRef}
            type="text"
            value={query}
            disabled={disabled}
            onFocus={() => !disabled && setIsOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value)
              setIsOpen(true)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (canCreate) {
                  addValue(query)
                  return
                }
                const exact = filteredOptions.find(
                  (o) => o.label.toLowerCase() === query.trim().toLowerCase()
                )
                if (exact) addValue(exact.value)
                return
              }

              if (e.key === 'Backspace' && !query && selected.length > 0) {
                removeValue(selected[selected.length - 1])
              }

              if (e.key === 'Escape') {
                setIsOpen(false)
              }
            }}
            className={ui.input}
            placeholder={
              selected.length === 0 && !query ? placeholder : (inputPlaceholder || '')
            }
          />

          <ChevronDown
            className={`ml-auto w-4 h-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </div>
      </div>

      {isOpen && !disabled && (
        <div className={ui.dropdown}>
          {canCreate ? (
            <button
              type="button"
              className={ui.create}
              onClick={(e) => {
                e.preventDefault()
                addValue(query)
              }}
            >
              <span>Create &ldquo;{normalize(query)}&rdquo;</span>
              <PlusIcon uiVariant={uiVariant} />
            </button>
          ) : null}

          {filteredOptions.length > 0 ? (
            filteredOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`${ui.option} ${selected.includes(opt.value) ? ui.optionActive : ''}`}
                onClick={(e) => {
                  e.preventDefault()
                  addValue(opt.value)
                }}
              >
                <span>
                  {opt.label}
                  {opt.suffix ? ` ${opt.suffix}` : ''}
                </span>
                <Check className="w-3 h-3 opacity-0 group-hover:opacity-100" />
              </button>
            ))
          ) : (
            <div className={ui.hint}>{query.trim() ? 'No results' : 'Start typing...'}</div>
          )}
        </div>
      )}
    </div>
  )
}

function PlusIcon({ uiVariant }: { uiVariant: UiVariant }) {
  return (
    <span
      className={
        uiVariant === 'site'
          ? 'text-muted-foreground'
          : 'text-primary-foreground/80'
      }
    >
      +
    </span>
  )
}