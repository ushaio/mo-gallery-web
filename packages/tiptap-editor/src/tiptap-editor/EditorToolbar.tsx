/**
 * Toolbar primitives shared by the main, selection, and contextual editor menus.
 */
'use client'

import { useEffect, useMemo, useRef } from 'react'
import type { Ref } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ChevronDown } from 'lucide-react'
import type { EditorCommandDescriptor } from './editor-command-registry'

interface ToolbarButtonProps {
  onClick: () => void
  onMouseDown?: (event: React.MouseEvent<HTMLButtonElement>) => void
  isActive?: boolean
  disabled?: boolean
  title: string
  children: React.ReactNode
  buttonRef?: Ref<HTMLButtonElement>
  className?: string
  ariaHasPopup?: React.AriaAttributes['aria-haspopup']
  ariaExpanded?: boolean
}

export function ToolbarButton({
  onClick,
  onMouseDown,
  isActive,
  disabled,
  title,
  children,
  buttonRef,
  className = '',
  ariaHasPopup,
  ariaExpanded,
}: ToolbarButtonProps) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      onMouseDown={onMouseDown}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={typeof isActive === 'boolean' ? isActive : undefined}
      aria-haspopup={ariaHasPopup}
      aria-expanded={ariaExpanded}
      className={`flex h-11 min-w-11 shrink-0 items-center justify-center rounded-md border px-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 sm:h-8 sm:min-w-8 sm:rounded-sm sm:px-1.5 ${isActive
          ? 'border-primary/30 bg-primary/10 text-primary'
          : 'border-transparent text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground'
        } disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
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
  className?: string
}

export function ToolbarSelect({ value, onChange, onMouseDown, title, options, className = '' }: ToolbarSelectProps) {
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
      aria-label={title}
      onMouseDown={onMouseDown}
      onChange={(event) => onChange(event.target.value)}
      style={{ width: selectWidth }}
      className={`h-11 max-w-[7.5rem] appearance-none rounded-md border border-transparent bg-transparent px-2 text-xs text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground focus:border-primary/30 focus:bg-background focus:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-8 sm:rounded-sm sm:px-1.5 ${className}`}
    >
      {options.map((option) => (
        <option key={`${title}-${option.label}`} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

export function ToolbarDivider({ className = '' }: { className?: string }) {
  return <div className={`mx-1 h-4 w-px shrink-0 bg-border/80 ${className}`} aria-hidden="true" />
}

interface FloatingToolbarButtonProps {
  onClick: () => void
  isActive?: boolean
  disabled?: boolean
  title: string
  children: React.ReactNode
}

export function FloatingToolbarButton({
  onClick,
  isActive,
  disabled = false,
  title,
  children,
}: FloatingToolbarButtonProps) {
  return (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={typeof isActive === 'boolean' ? isActive : undefined}
      className={`flex h-8 min-w-8 items-center justify-center rounded-sm border px-1.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        isActive
          ? 'border-primary/30 bg-primary/10 text-primary'
          : 'border-transparent text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground'
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {children}
    </button>
  )
}

interface ToolbarPopoverProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  label: string
  icon: LucideIcon
  children: React.ReactNode
  active?: boolean
  disabled?: boolean
  panelClassName?: string
}

export function ToolbarPopover({
  open,
  onOpenChange,
  label,
  icon: Icon,
  children,
  active = false,
  disabled = false,
  panelClassName = '',
}: ToolbarPopoverProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const onOpenChangeRef = useRef(onOpenChange)

  useEffect(() => {
    onOpenChangeRef.current = onOpenChange
  }, [onOpenChange])

  useEffect(() => {
    if (!open) return

    const focusFrame = window.requestAnimationFrame(() => {
      rootRef.current?.querySelector<HTMLElement>(
        '[role="menu"] [role="menuitem"]:not([aria-disabled="true"]), [role="menu"] select:not([disabled]), [role="menu"] input:not([disabled])',
      )?.focus()
    })
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onOpenChangeRef.current(false)
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onOpenChangeRef.current(false)
      triggerRef.current?.focus()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  const handlePanelKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    if ((event.target as HTMLElement).closest('input, select, textarea, [contenteditable="true"]')) return
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
      '[role="menuitem"]:not([aria-disabled="true"]), button:not([disabled]), select:not([disabled]), input:not([disabled])',
    )).filter((item) => item.tabIndex !== -1)
    if (items.length === 0) return

    event.preventDefault()
    const currentIndex = items.indexOf(document.activeElement as HTMLElement)
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? items.length - 1
        : event.key === 'ArrowDown'
          ? (currentIndex + 1 + items.length) % items.length
          : (currentIndex - 1 + items.length) % items.length
    items[nextIndex]?.focus()
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <ToolbarButton
        buttonRef={triggerRef}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onOpenChange(!open)}
        isActive={active || open}
        disabled={disabled}
        title={label}
        ariaHasPopup="menu"
        ariaExpanded={open}
      >
        <Icon className="h-4 w-4" />
        <ChevronDown className="ml-0.5 hidden h-3 w-3 sm:block" aria-hidden="true" />
      </ToolbarButton>
      {open ? (
        <div
          role="menu"
          aria-label={label}
          onKeyDown={handlePanelKeyDown}
          className={`absolute left-0 top-[calc(100%+6px)] z-30 min-w-56 rounded-md border border-border/80 bg-background p-1.5 text-foreground shadow-[0_16px_36px_rgba(15,23,42,0.16)] ${panelClassName}`}
        >
          {children}
        </div>
      ) : null}
    </div>
  )
}

export function CommandMenuItem({
  command,
  onSelect,
}: {
  command: EditorCommandDescriptor
  onSelect?: () => void
}) {
  const Icon = command.icon
  return (
    <button
      type="button"
      role="menuitem"
      aria-disabled={command.disabled}
      disabled={command.disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        command.execute()
        onSelect?.()
      }}
      className="flex h-9 w-full items-center gap-2 rounded-sm px-2 text-left text-xs text-foreground transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45"
    >
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{command.label}</span>
      {command.shortcut ? <kbd className="text-[10px] text-muted-foreground">{command.shortcut}</kbd> : null}
      {command.active ? <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" /> : null}
    </button>
  )
}
