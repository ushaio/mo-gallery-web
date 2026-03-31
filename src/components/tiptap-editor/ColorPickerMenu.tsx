/**
 * Color picker menu components for TipTap editor
 */
'use client'

import { useCallback, useEffect, useRef } from 'react'
import type { Ref, Dispatch, SetStateAction } from 'react'
import { normalizeHexColor } from './markdown-converter'
import {
  DEFAULT_TEXT_COLOR,
  DEFAULT_TEXT_HIGHLIGHT,
  BACKGROUND_COLOR_RECENT_LIMIT,
  TEXT_COLOR_RECENT_LIMIT,
  BASIC_BACKGROUND_COLOR_OPTIONS,
  MORE_BACKGROUND_COLOR_OPTIONS,
  BASIC_TEXT_COLOR_OPTIONS,
  MORE_TEXT_COLOR_OPTIONS,
} from './editor-constants'

interface ColorPickerMenuProps {
  isOpen: boolean
  menuRef: Ref<HTMLDivElement>
  position: { top: number; left: number }
  recentColors: string[]
  currentColor: string
  customColor: string
  tab: 'basic' | 'more'
  basicOptions: readonly string[]
  moreOptions: readonly string[]
  onSetColor: (color: string) => void
  onSetCustomColor: Dispatch<SetStateAction<string>>
  onSetTab: Dispatch<SetStateAction<'basic' | 'more'>>
  onMouseDown: (event: React.MouseEvent<Element>) => void
  colorPickerRef: Ref<HTMLInputElement>
  titleRecent: string
  titleClear: string
  titleBasic: string
  titleMore: string
  confirmLabel: string
}

function ColorPickerMenu({
  isOpen,
  menuRef,
  position,
  recentColors,
  currentColor,
  customColor,
  tab,
  basicOptions,
  moreOptions,
  onSetColor,
  onSetCustomColor,
  onSetTab,
  onMouseDown,
  colorPickerRef,
  titleRecent,
  titleClear,
  titleBasic,
  titleMore,
  confirmLabel,
}: ColorPickerMenuProps) {
  if (!isOpen) return null

  return (
    <div
      ref={menuRef}
      className="fixed z-50 flex w-[360px] flex-col gap-3 rounded-md border border-border bg-background p-4 shadow-xl"
      style={{
        top: position.top,
        left: position.left,
      }}
    >
      <div className="space-y-2">
        <div className="text-sm text-foreground">{titleRecent}</div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onMouseDown={onMouseDown}
            onClick={() => onSetColor('')}
            className={`h-8 w-8 rounded-sm border bg-[linear-gradient(135deg,transparent_46%,#ff6b6b_46%,#ff6b6b_54%,transparent_54%)] transition-colors ${currentColor
                ? 'border-border hover:border-foreground/30'
                : 'border-foreground/60'
              }`}
            title={titleClear}
          />
          {recentColors.map((color) => (
            <button
              key={color}
              type="button"
              onMouseDown={onMouseDown}
              onClick={() => onSetColor(color)}
              className={`h-8 w-8 rounded-sm border transition-colors ${currentColor === color
                  ? 'border-foreground/60'
                  : 'border-border hover:border-foreground/30'
                }`}
              title={color}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onMouseDown={onMouseDown}
            onClick={() => onSetTab('basic')}
            className={`text-sm transition-colors ${tab === 'basic'
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground'
              }`}
          >
            {titleBasic}
          </button>
          <button
            type="button"
            onMouseDown={onMouseDown}
            onClick={() => {
              onSetTab('more')
              if (colorPickerRef && 'current' in colorPickerRef && colorPickerRef.current) {
                colorPickerRef.current.click()
              }
            }}
            className={`text-sm transition-colors ${tab === 'more'
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground'
              }`}
          >
            {titleMore}
          </button>
          <input
            ref={colorPickerRef}
            type="color"
            value={normalizeHexColor(customColor) || DEFAULT_TEXT_HIGHLIGHT}
            onChange={(event) => {
              const nextColor = normalizeHexColor(event.target.value)
              if (!nextColor) return
              onSetCustomColor(nextColor)
              onSetTab('more')
            }}
            className="sr-only"
            tabIndex={-1}
          />
        </div>
        <div className="grid grid-cols-8 gap-2">
          {(tab === 'basic' ? basicOptions : moreOptions).map((color) => (
            <button
              key={`${tab}-${color}`}
              type="button"
              onMouseDown={onMouseDown}
              onClick={() => {
                onSetCustomColor(color)
                onSetColor(color)
              }}
              className={`h-7 w-7 rounded-sm border transition-colors ${currentColor === color
                  ? 'border-foreground/60'
                  : 'border-border hover:border-foreground/30'
                }`}
              title={color}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>

      <div className="border-t border-border pt-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onMouseDown={onMouseDown}
            className="h-9 w-12 shrink-0 rounded-sm border border-border"
            style={{ backgroundColor: normalizeHexColor(customColor) || DEFAULT_TEXT_HIGHLIGHT }}
            onClick={() => onSetColor(customColor)}
            title={customColor}
          />
          <input
            type="text"
            value={customColor}
            onChange={(event) => onSetCustomColor(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                onSetColor(customColor)
              }
            }}
            className="h-9 min-w-0 flex-1 rounded-sm border border-border px-3 text-sm text-foreground outline-none transition-colors focus:border-primary"
          />
          <button
            type="button"
            onMouseDown={onMouseDown}
            onClick={() => onSetColor(customColor)}
            className="h-9 shrink-0 rounded-sm border border-border px-4 text-sm text-foreground transition-colors hover:border-foreground/30"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Background Color Picker ---

interface BackgroundColorPickerProps {
  isOpen: boolean
  position: { top: number; left: number }
  currentColor: string
  recentColors: string[]
  customColor: string
  tab: 'basic' | 'more'
  buttonRef: Ref<HTMLButtonElement>
  menuRef: Ref<HTMLDivElement>
  pickerRef: Ref<HTMLInputElement>
  onSetColor: (color: string) => void
  onSetCustomColor: Dispatch<SetStateAction<string>>
  onSetTab: Dispatch<SetStateAction<'basic' | 'more'>>
  onSetIsOpen: Dispatch<SetStateAction<boolean>>
  onMouseDown: (event: React.MouseEvent<Element>) => void
  t: (key: string) => string
}

export function BackgroundColorPicker({
  isOpen,
  position,
  currentColor,
  recentColors,
  customColor,
  tab,
  menuRef,
  pickerRef,
  onSetColor,
  onSetCustomColor,
  onSetTab,
  onSetIsOpen,
  onMouseDown,
  t,
}: BackgroundColorPickerProps) {
  return (
    <ColorPickerMenu
      isOpen={isOpen}
      menuRef={menuRef}
      position={position}
      recentColors={recentColors}
      currentColor={currentColor}
      customColor={customColor}
      tab={tab}
      basicOptions={BASIC_BACKGROUND_COLOR_OPTIONS}
      moreOptions={MORE_BACKGROUND_COLOR_OPTIONS}
      onSetColor={onSetColor}
      onSetCustomColor={onSetCustomColor}
      onSetTab={onSetTab}
      onMouseDown={onMouseDown}
      colorPickerRef={pickerRef}
      titleRecent={t('editor.background_color_recent')}
      titleClear={t('editor.background_color_clear')}
      titleBasic={t('editor.background_color_basic')}
      titleMore={t('editor.background_color_more')}
      confirmLabel={t('editor.confirm')}
    />
  )
}

// --- Text Color Picker ---

interface TextColorPickerProps {
  isOpen: boolean
  position: { top: number; left: number }
  currentColor: string
  recentColors: string[]
  customColor: string
  tab: 'basic' | 'more'
  buttonRef: Ref<HTMLButtonElement>
  menuRef: Ref<HTMLDivElement>
  pickerRef: Ref<HTMLInputElement>
  onSetColor: (color: string) => void
  onSetCustomColor: Dispatch<SetStateAction<string>>
  onSetTab: Dispatch<SetStateAction<'basic' | 'more'>>
  onSetIsOpen: Dispatch<SetStateAction<boolean>>
  onMouseDown: (event: React.MouseEvent<Element>) => void
  t: (key: string) => string
}

export function TextColorPicker({
  isOpen,
  position,
  currentColor,
  recentColors,
  customColor,
  tab,
  menuRef,
  pickerRef,
  onSetColor,
  onSetCustomColor,
  onSetTab,
  onMouseDown,
  t,
}: TextColorPickerProps) {
  return (
    <ColorPickerMenu
      isOpen={isOpen}
      menuRef={menuRef}
      position={position}
      recentColors={recentColors}
      currentColor={currentColor}
      customColor={customColor}
      tab={tab}
      basicOptions={BASIC_TEXT_COLOR_OPTIONS}
      moreOptions={MORE_TEXT_COLOR_OPTIONS}
      onSetColor={onSetColor}
      onSetCustomColor={onSetCustomColor}
      onSetTab={onSetTab}
      onMouseDown={onMouseDown}
      colorPickerRef={pickerRef}
      titleRecent={t('editor.text_color_recent')}
      titleClear={t('editor.text_color_clear')}
      titleBasic={t('editor.text_color_basic')}
      titleMore={t('editor.text_color_more')}
      confirmLabel={t('editor.confirm')}
    />
  )
}

// --- Hook for color picker menu positioning and event handling ---

interface UseColorPickerMenuOptions {
  isOpen: boolean
  buttonRef: Ref<HTMLButtonElement>
  onSetIsOpen: Dispatch<SetStateAction<boolean>>
  onSetPosition: Dispatch<SetStateAction<{ top: number; left: number }>>
}

export function useColorPickerMenu({
  isOpen,
  buttonRef,
  onSetIsOpen,
  onSetPosition,
}: UseColorPickerMenuOptions) {
  const updatePosition = useCallback(() => {
    const buttonElement = buttonRef as React.RefObject<HTMLButtonElement>
    if (!buttonElement?.current) return

    const rect = buttonElement.current.getBoundingClientRect()
    const menuWidth = 360
    const viewportPadding = 12
    const left = Math.max(
      viewportPadding,
      Math.min(rect.left, window.innerWidth - menuWidth - viewportPadding)
    )

    onSetPosition({
      top: rect.bottom + 6,
      left,
    })
  }, [buttonRef, onSetPosition])

  useEffect(() => {
    if (!isOpen) return

    updatePosition()

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null
      const menuElement = (buttonRef as React.RefObject<HTMLButtonElement>)?.current
      // Check if click is inside button - if so, don't close (let toggle logic handle it)
      if (menuElement?.contains(target)) {
        return
      }
      onSetIsOpen(false)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onSetIsOpen(false)
      }
    }

    const handleViewportChange = () => {
      updatePosition()
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange, true)

    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('scroll', handleViewportChange, true)
    }
  }, [isOpen, updatePosition, buttonRef, onSetIsOpen])

  return { updatePosition }
}

export {
  DEFAULT_TEXT_COLOR,
  DEFAULT_TEXT_HIGHLIGHT,
  BACKGROUND_COLOR_RECENT_LIMIT,
  TEXT_COLOR_RECENT_LIMIT,
  BASIC_BACKGROUND_COLOR_OPTIONS,
  MORE_BACKGROUND_COLOR_OPTIONS,
  BASIC_TEXT_COLOR_OPTIONS,
  MORE_TEXT_COLOR_OPTIONS,
}