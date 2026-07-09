/**
 * Toolbar components for TipTap editor
 */
'use client'

import { useMemo } from 'react'
import type { Ref } from 'react'

interface ToolbarButtonProps {
  onClick: () => void
  onMouseDown?: (event: React.MouseEvent<HTMLButtonElement>) => void
  isActive?: boolean
  disabled?: boolean
  title: string
  children: React.ReactNode
  buttonRef?: Ref<HTMLButtonElement>
}

export function ToolbarButton({ onClick, onMouseDown, isActive, disabled, title, children, buttonRef }: ToolbarButtonProps) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      onMouseDown={onMouseDown}
      disabled={disabled}
      title={title}
      className={`flex h-7 min-w-7 items-center justify-center border px-1.5 text-[11px] transition-all duration-200 ${isActive
          ? 'border-border bg-background text-accent-foreground'
          : 'border-transparent text-muted-foreground hover:border-border hover:bg-background hover:text-accent-foreground'
        } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {children}
    </button>
  )
}

interface ToolbarSelectProps {
  value: string
  onChange: (value: string) => void
  onMouseDown?: (event: React.MouseEvent<HTMLSelectElement>) => void
  title: string
  options: ReadonlyArray<{ label: string; value: string }>
}

export function ToolbarSelect({ value, onChange, onMouseDown, title, options }: ToolbarSelectProps) {
  const selectWidth = useMemo(() => {
    const longestLabelLength = options.reduce((max, option) => {
      return Math.max(max, option.label.length)
    }, 0)

    return `${Math.max(longestLabelLength + 4, 7)}ch`
  }, [options])

  return (
    <select
      value={value}
      title={title}
      onMouseDown={onMouseDown}
      onChange={(event) => onChange(event.target.value)}
      style={{ width: selectWidth }}
      className="h-7 appearance-none border border-transparent bg-transparent px-1.5 text-[11px] text-muted-foreground transition-all duration-200 hover:border-border hover:bg-background hover:text-accent-foreground focus:border-primary/30 focus:bg-background focus:text-foreground focus:outline-none"
    >
      {options.map((option) => (
        <option key={`${title}-${option.label}`} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

export function ToolbarDivider() {
  return <div className="mx-1 h-3.5 w-px bg-border/80" />
}