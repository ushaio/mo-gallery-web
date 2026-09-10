import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AlignCenter, AlignLeft, AlignRight, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalJustifyStart, Check, ChevronDown, Copy, Crop, Image as ImageIcon, ImageOff, Link, Link2Off, LockKeyhole, Minus, PenLine, Plus, RotateCcw, Star, Trash2, Type as TypeIcon, UnlockKeyhole, type LucideIcon } from 'lucide-react'

import { t } from '@/lib/i18n'
import { createDefaultImageTransform } from '@/lib/zine/crop-session'
import { zineEditorCopy } from '@/lib/zine/editor-copy'
import type { ImageSlot, TextSlot } from '@/lib/zine/types'
import { usePreferences } from '@/store/preferences'
import { useZineStore } from '@/store/zine'
import { GetZineSystemFonts } from '../../../wailsjs/go/main/App'

const TEXT_COLORS = ['#111111', '#666666', '#FFFFFF', '#B08D2A']
const MIN_FONT_SIZE = 8
const MAX_FONT_SIZE = 72

// 通用字体族由系统解析到实际字体；画布与 PDF 复用同一份可嵌入字形。
const FONT_FAMILIES = [
  { value: 'serif', labelKey: 'admin.zine_font_serif' },
  { value: 'sans-serif', labelKey: 'admin.zine_font_sans' },
  { value: 'monospace', labelKey: 'admin.zine_font_mono' },
  { value: 'Arial', labelKey: 'admin.zine_font_arial' },
  { value: 'Georgia', labelKey: 'admin.zine_font_georgia' },
  { value: 'Courier New', labelKey: 'admin.zine_font_courier' },
  { value: 'SimSun', labelKey: 'admin.zine_font_song' },
  { value: 'SimHei', labelKey: 'admin.zine_font_heiti' },
  { value: 'KaiTi', labelKey: 'admin.zine_font_kaiti' },
  { value: 'FangSong', labelKey: 'admin.zine_font_fangsong' },
] as const

const HORIZONTAL_ALIGNMENTS = [
  { value: 'left', labelKey: 'admin.zine_align_left', icon: AlignLeft },
  { value: 'center', labelKey: 'admin.zine_align_center', icon: AlignCenter },
  { value: 'right', labelKey: 'admin.zine_align_right', icon: AlignRight },
] as const

const VERTICAL_ALIGNMENTS = [
  { value: 'top', labelKey: 'admin.zine_vertical_align_top', icon: AlignVerticalJustifyStart },
  { value: 'center', labelKey: 'admin.zine_vertical_align_center', icon: AlignVerticalJustifyCenter },
  { value: 'bottom', labelKey: 'admin.zine_vertical_align_bottom', icon: AlignVerticalJustifyEnd },
] as const

interface BarButtonProps {
  label: string
  onClick: () => void
  disabled?: boolean
  active?: boolean
  destructive?: boolean
  children: ReactNode
}

function BarButton({ label, onClick, disabled, active, destructive, children }: BarButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-35 ${
        active ? 'bg-accent text-accent-foreground' : destructive ? 'hover:bg-destructive/10' : 'hover:bg-accent'
      }`}
      style={destructive ? { color: 'var(--destructive)' } : undefined}
    >
      {children}
    </button>
  )
}

function BarDivider() {
  return <div className="mx-0.5 h-4 w-px shrink-0" style={{ backgroundColor: 'var(--border)' }} />
}

interface AlignmentMenuOption {
  value: string
  label: string
  icon: LucideIcon
}

function AlignmentMenu({ label, value, options, disabled, onChange }: { label: string; value: string; options: AlignmentMenuOption[]; disabled?: boolean; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const selected = options.find((option) => option.value === value) ?? options[0]
  const SelectedIcon = selected.icon

  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  return (
    <div
      ref={menuRef}
      className="relative shrink-0"
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !open) return
        event.preventDefault()
        event.stopPropagation()
        setOpen(false)
        menuRef.current?.querySelector('button')?.focus()
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      <button
        type="button"
        title={`${label}: ${selected.label}`}
        aria-label={`${label}: ${selected.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className="flex h-7 w-8 items-center justify-center gap-0.5 rounded-full transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-35"
      >
        <SelectedIcon size={14} />
        <ChevronDown size={9} aria-hidden="true" />
      </button>
      {open && !disabled && (
        <div
          role="menu"
          aria-label={label}
          className="absolute bottom-[calc(100%+8px)] left-1/2 z-30 min-w-32 -translate-x-1/2 overflow-hidden rounded-md border bg-popover p-1 shadow-xl"
          style={{ borderColor: 'var(--border)' }}
        >
          {options.map((option) => {
            const Icon = option.icon
            const active = option.value === value
            return (
              <button
                key={option.value}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
                className={`flex h-8 w-full items-center gap-2 rounded px-2 text-left text-xs transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${active ? 'bg-accent/70' : ''}`}
              >
                <Icon size={14} />
                <span className="flex-1 whitespace-nowrap">{option.label}</span>
                {active && <Check size={12} />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function FontMenu({ label, value, options, favoriteFonts, favoriteLabel, unfavoriteLabel, disabled, onChange, onToggleFavorite }: { label: string; value: string; options: Array<{ value: string; label: string }>; favoriteFonts: string[]; favoriteLabel: string; unfavoriteLabel: string; disabled?: boolean; onChange: (value: string) => void; onToggleFavorite: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const menuRef = useRef<HTMLDivElement | null>(null)
  const selected = options.find((option) => option.value === value) ?? { value, label: value }
  const filteredOptions = (query.trim()
    ? options.filter((option) => option.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    : options
  ).sort((left, right) => Number(favoriteFonts.includes(right.value)) - Number(favoriteFonts.includes(left.value)))

  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  return (
    <div
      ref={menuRef}
      className="relative shrink-0"
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !open) return
        event.preventDefault()
        event.stopPropagation()
        setOpen(false)
        menuRef.current?.querySelector('button')?.focus()
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      <button
        type="button"
        title={`${label}: ${selected.label}`}
        aria-label={`${label}: ${selected.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => {
          setQuery('')
          setOpen((current) => !current)
        }}
        className="flex h-7 min-w-16 items-center justify-center gap-1 rounded-full px-2 text-[11px] transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-35"
        style={{ fontFamily: value, color: 'var(--popover-foreground)' }}
      >
        <span className="max-w-14 truncate">{selected.label}</span>
        <ChevronDown size={9} aria-hidden="true" />
      </button>
      {open && !disabled && (
        <div
          role="menu"
          aria-label={label}
          className="absolute bottom-[calc(100%+8px)] left-1/2 z-30 w-56 -translate-x-1/2 overflow-hidden rounded-md border bg-popover p-1 shadow-xl"
          style={{ borderColor: 'var(--border)' }}
        >
          <input
            autoFocus
            value={query}
            aria-label={label}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={label}
            className="mb-1 h-8 w-full rounded border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring"
            style={{ borderColor: 'var(--border)' }}
          />
          <div className="max-h-72 overflow-y-auto">
            {filteredOptions.map((option) => {
              const active = option.value === value
              const favorite = favoriteFonts.includes(option.value)
              return (
                <div key={option.value} className={`flex h-8 items-center rounded transition hover:bg-accent ${active ? 'bg-accent/70' : ''}`}>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    onClick={() => {
                      onChange(option.value)
                      setOpen(false)
                    }}
                    className="flex h-full min-w-0 flex-1 items-center gap-2 rounded px-2 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    style={{ fontFamily: option.value }}
                  >
                    <span className="flex-1 truncate">{option.label}</span>
                    {active && <Check size={12} className="shrink-0" />}
                  </button>
                  <button
                    type="button"
                    title={favorite ? unfavoriteLabel : favoriteLabel}
                    aria-label={`${favorite ? unfavoriteLabel : favoriteLabel} ${option.label}`}
                    aria-pressed={favorite}
                    onClick={() => onToggleFavorite(option.value)}
                    className={`mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded transition hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${favorite ? 'text-amber-500' : 'text-muted-foreground'}`}
                  >
                    <Star size={13} fill={favorite ? 'currentColor' : 'none'} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export function SlotContextBar() {
  const { language, zineFavoriteFonts, toggleZineFavoriteFont } = usePreferences()
  const copy = zineEditorCopy(language)
  const project = useZineStore((state) => state.project)
  const activeSpreadId = useZineStore((state) => state.activeSpreadId)
  const selectedSlotId = useZineStore((state) => state.selectedSlotId)
  const editingSlotId = useZineStore((state) => state.editingSlotId)
  const aiTaskId = useZineStore((state) => state.aiTaskId)
  const editSlot = useZineStore((state) => state.editSlot)
  const duplicateSlot = useZineStore((state) => state.duplicateSlot)
  const setSlotLocked = useZineStore((state) => state.setSlotLocked)
  const updateSlot = useZineStore((state) => state.updateSlot)
  const removeSlot = useZineStore((state) => state.removeSlot)
  const [systemFonts, setSystemFonts] = useState<string[]>([])

  useEffect(() => {
    let active = true
    void Promise.resolve().then(() => GetZineSystemFonts())
      .then((fonts) => {
        if (active && Array.isArray(fonts)) setSystemFonts(fonts)
      })
      .catch(() => {
        // Browser development mode has no Wails bridge.
      })
    return () => { active = false }
  }, [])

  const spread = project?.spreads.find((item) => item.id === activeSpreadId)
  const slot = spread?.slots.find((item) => item.id === selectedSlotId)

  if (!spread || !slot) return null
  if (slot.kind === 'image' && editingSlotId === slot.id) return null

  const isImage = slot.kind === 'image'
  const locked = Boolean(slot.locked)
  const contentDisabled = Boolean(aiTaskId) || locked
  const fontOptions = Array.from(new Map([
    ...FONT_FAMILIES.map((font) => [font.value, { value: font.value, label: t(font.labelKey, language) }] as const),
    ...systemFonts.map((font) => [font, { value: font, label: font }] as const),
    ...((slot.kind === 'text' && slot.fontFamily && !FONT_FAMILIES.some((font) => font.value === slot.fontFamily) && !systemFonts.includes(slot.fontFamily))
      ? [[slot.fontFamily, { value: slot.fontFamily, label: slot.fontFamily }] as const]
      : []),
  ]).values())

  function patchSlot(patch: Partial<ImageSlot> | Partial<TextSlot>) {
    if (!spread || !slot || contentDisabled) return
    updateSlot(spread.id, slot.id, patch)
  }

  return (
    <div
      data-zine-editor-control
      className="absolute bottom-14 left-1/2 z-20 flex w-max max-w-[calc(100%_-_24px)] -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-lg"
      style={{ borderColor: 'var(--border)' }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <span className="flex shrink-0 items-center gap-1.5 pl-2 pr-1 text-[11px] font-medium" style={{ color: 'var(--muted-foreground)' }}>
        {isImage ? <ImageIcon size={12} /> : <TypeIcon size={12} />}
        {t(isImage ? 'admin.zine_slot_image' : 'admin.zine_slot_text', language)}
      </span>

      <BarDivider />

      <button
        type="button"
        title={isImage ? copy.crop : copy.editText}
        disabled={contentDisabled || (slot.kind === 'image' && !slot.assetId)}
        aria-pressed={editingSlotId === slot.id}
        onClick={() => editSlot(slot.id)}
        className={`flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2 text-[11px] transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-35 ${editingSlotId === slot.id ? 'bg-accent' : ''}`}
      >
        {isImage ? <Crop size={13} /> : <PenLine size={13} />}
        {isImage ? copy.crop : copy.editText}
      </button>

      {isImage ? (
        <>
          <BarButton
            label={t('admin.zine_clear_image', language)}
            onClick={() => patchSlot({ assetId: null } satisfies Partial<ImageSlot>)}
            disabled={contentDisabled || !(slot as ImageSlot).assetId}
          >
            <ImageOff size={14} />
          </BarButton>
          <BarButton
            label={t((slot as ImageSlot).imageFrameBinding === false ? 'admin.zine_bind_image_to_frame' : 'admin.zine_unbind_image_from_frame', language)}
            active={(slot as ImageSlot).imageFrameBinding !== false}
            disabled={contentDisabled}
            onClick={() => patchSlot({ imageFrameBinding: (slot as ImageSlot).imageFrameBinding === false } satisfies Partial<ImageSlot>)}
          >
            {(slot as ImageSlot).imageFrameBinding === false ? <Link2Off size={14} /> : <Link size={14} />}
          </BarButton>
          <BarButton
            label={t('admin.zine_reset_crop', language)}
            onClick={() => patchSlot({ imageTransform: createDefaultImageTransform() } satisfies Partial<ImageSlot>)}
            disabled={
              contentDisabled || ((slot as ImageSlot).imageTransform.scale === 1
              && (slot as ImageSlot).imageTransform.offsetX === 0
              && (slot as ImageSlot).imageTransform.offsetY === 0
              && (slot as ImageSlot).imageTransform.rotation === 0)
            }
          >
            <RotateCcw size={14} />
          </BarButton>
        </>
      ) : (
        <>
          <div className="flex shrink-0 items-center gap-0.5">
            <BarButton
              label={t('admin.zine_font_dec', language)}
              onClick={() => patchSlot({ fontSize: Math.max(MIN_FONT_SIZE, (slot as TextSlot).fontSize - 2) } satisfies Partial<TextSlot>)}
              disabled={contentDisabled || (slot as TextSlot).fontSize <= MIN_FONT_SIZE}
            >
              <Minus size={13} />
            </BarButton>
            <span className="w-7 text-center text-[11px] tabular-nums" title={t('admin.zine_font_size', language)}>
              {(slot as TextSlot).fontSize}
            </span>
            <BarButton
              label={t('admin.zine_font_inc', language)}
              onClick={() => patchSlot({ fontSize: Math.min(MAX_FONT_SIZE, (slot as TextSlot).fontSize + 2) } satisfies Partial<TextSlot>)}
              disabled={contentDisabled || (slot as TextSlot).fontSize >= MAX_FONT_SIZE}
            >
              <Plus size={13} />
            </BarButton>
          </div>

          <BarDivider />

          <FontMenu
            key={`font:${slot.id}`}
            label={t('admin.zine_font_family', language)}
            value={(slot as TextSlot).fontFamily || 'serif'}
            options={fontOptions}
            favoriteFonts={zineFavoriteFonts}
            favoriteLabel={t('admin.zine_font_favorite', language)}
            unfavoriteLabel={t('admin.zine_font_unfavorite', language)}
            disabled={contentDisabled}
            onChange={(fontFamily) => patchSlot({ fontFamily } satisfies Partial<TextSlot>)}
            onToggleFavorite={toggleZineFavoriteFont}
          />

          <BarDivider />

          <AlignmentMenu
            key={`horizontal:${slot.id}`}
            label={t('admin.zine_text_align', language)}
            value={(slot as TextSlot).align}
            disabled={contentDisabled}
            options={HORIZONTAL_ALIGNMENTS.map((alignment) => ({ ...alignment, label: t(alignment.labelKey, language) }))}
            onChange={(align) => patchSlot({ align: align as TextSlot['align'] } satisfies Partial<TextSlot>)}
          />
          <AlignmentMenu
            key={`vertical:${slot.id}`}
            label={t('admin.zine_vertical_align', language)}
            value={(slot as TextSlot).verticalAlign ?? 'top'}
            disabled={contentDisabled}
            options={VERTICAL_ALIGNMENTS.map((alignment) => ({ ...alignment, label: t(alignment.labelKey, language) }))}
            onChange={(verticalAlign) => patchSlot({ verticalAlign: verticalAlign as TextSlot['verticalAlign'] } satisfies Partial<TextSlot>)}
          />

          <BarDivider />

          <div className="flex shrink-0 items-center gap-1 px-1" role="group" aria-label={t('admin.zine_text_color', language)}>
            {TEXT_COLORS.map((color) => {
              const active = (slot as TextSlot).color.toLowerCase() === color.toLowerCase()
              return (
                <button
                  key={color}
                  type="button"
                  title={`${t('admin.zine_text_color', language)} ${color}`}
                  aria-label={`${t('admin.zine_text_color', language)} ${color}`}
                  aria-pressed={active}
                  disabled={contentDisabled}
                  onClick={() => patchSlot({ color } satisfies Partial<TextSlot>)}
                  className="h-4.5 w-4.5 rounded-full border transition hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-35"
                  style={{
                    backgroundColor: color,
                    borderColor: 'var(--border)',
                    boxShadow: active ? '0 0 0 2px var(--popover), 0 0 0 3.5px var(--primary)' : undefined,
                  }}
                />
              )
            })}
          </div>
        </>
      )}

      <BarDivider />

      <BarButton label={copy.duplicate} onClick={() => duplicateSlot(spread.id, slot.id)} disabled={Boolean(aiTaskId)}>
        <Copy size={14} />
      </BarButton>
      <BarButton label={locked ? copy.unlock : copy.lock} onClick={() => setSlotLocked(spread.id, slot.id, !locked)} active={locked} disabled={Boolean(aiTaskId)}>
        {locked ? <LockKeyhole size={14} /> : <UnlockKeyhole size={14} />}
      </BarButton>
      <BarButton label={t('admin.zine_delete_slot', language)} onClick={() => removeSlot(spread.id, slot.id)} disabled={contentDisabled} destructive>
        <Trash2 size={14} />
      </BarButton>
    </div>
  )
}
