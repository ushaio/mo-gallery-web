import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AlignCenter, AlignLeft, AlignRight, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalJustifyStart, Check, ChevronDown, Image as ImageIcon, ImageOff, Link, Link2Off, Minus, Plus, RotateCcw, Star, Trash2, Type as TypeIcon, type LucideIcon } from 'lucide-react'

import { t } from '@/lib/i18n'
import { createDefaultImageTransform } from '@/lib/zine/crop-session'
import type { ImageSlot, TextSlot } from '@/lib/zine/types'
import { usePreferences } from '@/store/preferences'
import { useZineStore } from '@/store/zine'
import { GetZineSystemFonts } from '../../../wailsjs/go/main/App'

const TEXT_COLORS = ['#111111', '#666666', '#FFFFFF', '#B08D2A']
const MIN_FONT_SIZE = 8
const MAX_FONT_SIZE = 72

// 仅提供画布与 PDF 都能一致呈现的字体族：
// serif→Times/宋体类、sans-serif→Helvetica/黑体类、monospace→Courier。
// 中文字符在 PDF 中统一走注册的系统 CJK 字体
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
      className={`flex h-7 w-7 items-center justify-center rounded-full transition disabled:pointer-events-none disabled:opacity-35 ${
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

function AlignmentMenu({ label, value, options, onChange }: { label: string; value: string; options: AlignmentMenuOption[]; onChange: (value: string) => void }) {
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
    <div ref={menuRef} className="relative">
      <button
        type="button"
        title={`${label}: ${selected.label}`}
        aria-label={`${label}: ${selected.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex h-7 w-8 items-center justify-center gap-0.5 rounded-full transition hover:bg-accent"
      >
        <SelectedIcon size={14} />
        <ChevronDown size={9} aria-hidden="true" />
      </button>
      {open && (
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
                className={`flex h-8 w-full items-center gap-2 rounded px-2 text-left text-xs transition hover:bg-accent ${active ? 'bg-accent/70' : ''}`}
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

function FontMenu({ label, value, options, favoriteFonts, onChange, onToggleFavorite }: { label: string; value: string; options: Array<{ value: string; label: string }>; favoriteFonts: string[]; onChange: (value: string) => void; onToggleFavorite: (value: string) => void }) {
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
    <div ref={menuRef} className="relative">
      <button
        type="button"
        title={`${label}: ${selected.label}`}
        aria-label={`${label}: ${selected.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setQuery('')
          setOpen((current) => !current)
        }}
        className="flex h-7 min-w-16 items-center justify-center gap-1 rounded-full px-2 text-[11px] transition hover:bg-accent"
        style={{ fontFamily: value, color: 'var(--popover-foreground)' }}
      >
        <span className="max-w-14 truncate">{selected.label}</span>
        <ChevronDown size={9} aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          aria-label={label}
          className="absolute bottom-[calc(100%+8px)] left-1/2 z-30 w-56 -translate-x-1/2 overflow-hidden rounded-md border bg-popover p-1 shadow-xl"
          style={{ borderColor: 'var(--border)' }}
        >
          <input
            autoFocus
            value={query}
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
                    className="flex h-full min-w-0 flex-1 items-center gap-2 px-2 text-left text-xs"
                    style={{ fontFamily: option.value }}
                  >
                    <span className="flex-1 truncate">{option.label}</span>
                    {active && <Check size={12} className="shrink-0" />}
                  </button>
                  <button
                    type="button"
                    title={favorite ? t('admin.zine_font_unfavorite') : t('admin.zine_font_favorite')}
                    aria-label={`${favorite ? t('admin.zine_font_unfavorite') : t('admin.zine_font_favorite')} ${option.label}`}
                    aria-pressed={favorite}
                    onClick={() => onToggleFavorite(option.value)}
                    className={`mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded transition hover:bg-background ${favorite ? 'text-amber-500' : 'text-muted-foreground'}`}
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
  const project = useZineStore((state) => state.project)
  const activeSpreadId = useZineStore((state) => state.activeSpreadId)
  const selectedSlotId = useZineStore((state) => state.selectedSlotId)
  const updateSlot = useZineStore((state) => state.updateSlot)
  const removeSlot = useZineStore((state) => state.removeSlot)
  const [systemFonts, setSystemFonts] = useState<string[]>([])

  useEffect(() => {
    let active = true
    void GetZineSystemFonts()
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

  const isImage = slot.kind === 'image'
  const fontOptions = Array.from(new Map([
    ...FONT_FAMILIES.map((font) => [font.value, { value: font.value, label: t(font.labelKey, language) }] as const),
    ...systemFonts.map((font) => [font, { value: font, label: font }] as const),
    ...((slot.kind === 'text' && slot.fontFamily && !FONT_FAMILIES.some((font) => font.value === slot.fontFamily) && !systemFonts.includes(slot.fontFamily))
      ? [[slot.fontFamily, { value: slot.fontFamily, label: slot.fontFamily }] as const]
      : []),
  ]).values())

  function patchSlot(patch: Partial<ImageSlot> | Partial<TextSlot>) {
    if (!spread || !slot) return
    updateSlot(spread.id, slot.id, patch)
  }

  return (
    <div
      className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-full border bg-popover p-1 text-popover-foreground shadow-lg"
      style={{ borderColor: 'var(--border)' }}
      onClick={(event) => event.stopPropagation()}
    >
      <span className="flex items-center gap-1.5 pl-2 pr-1 text-[11px] font-medium" style={{ color: 'var(--muted-foreground)' }}>
        {isImage ? <ImageIcon size={12} /> : <TypeIcon size={12} />}
        {t(isImage ? 'admin.zine_slot_image' : 'admin.zine_slot_text', language)}
      </span>

      <BarDivider />

      {isImage ? (
        <>
          <BarButton
            label={t('admin.zine_clear_image', language)}
            onClick={() => patchSlot({ assetId: null } satisfies Partial<ImageSlot>)}
            disabled={!(slot as ImageSlot).assetId}
          >
            <ImageOff size={14} />
          </BarButton>
          <BarButton
            label={t((slot as ImageSlot).imageFrameBinding === false ? 'admin.zine_bind_image_to_frame' : 'admin.zine_unbind_image_from_frame', language)}
            active={(slot as ImageSlot).imageFrameBinding !== false}
            onClick={() => patchSlot({ imageFrameBinding: (slot as ImageSlot).imageFrameBinding === false } satisfies Partial<ImageSlot>)}
          >
            {(slot as ImageSlot).imageFrameBinding === false ? <Link2Off size={14} /> : <Link size={14} />}
          </BarButton>
          <BarButton
            label={t('admin.zine_reset_crop', language)}
            onClick={() => patchSlot({ imageTransform: createDefaultImageTransform() } satisfies Partial<ImageSlot>)}
            disabled={
              (slot as ImageSlot).imageTransform.scale === 1
              && (slot as ImageSlot).imageTransform.offsetX === 0
              && (slot as ImageSlot).imageTransform.offsetY === 0
              && (slot as ImageSlot).imageTransform.rotation === 0
            }
          >
            <RotateCcw size={14} />
          </BarButton>
        </>
      ) : (
        <>
          <BarButton
            label={t('admin.zine_font_dec', language)}
            onClick={() => patchSlot({ fontSize: Math.max(MIN_FONT_SIZE, (slot as TextSlot).fontSize - 2) } satisfies Partial<TextSlot>)}
            disabled={(slot as TextSlot).fontSize <= MIN_FONT_SIZE}
          >
            <Minus size={13} />
          </BarButton>
          <span className="w-7 text-center text-[11px] tabular-nums" title={t('admin.zine_font_size', language)}>
            {(slot as TextSlot).fontSize}
          </span>
          <BarButton
            label={t('admin.zine_font_inc', language)}
            onClick={() => patchSlot({ fontSize: Math.min(MAX_FONT_SIZE, (slot as TextSlot).fontSize + 2) } satisfies Partial<TextSlot>)}
            disabled={(slot as TextSlot).fontSize >= MAX_FONT_SIZE}
          >
            <Plus size={13} />
          </BarButton>

          <BarDivider />

          <FontMenu
            label={t('admin.zine_font_family', language)}
            value={(slot as TextSlot).fontFamily || 'serif'}
            options={fontOptions}
            favoriteFonts={zineFavoriteFonts}
            onChange={(fontFamily) => patchSlot({ fontFamily } satisfies Partial<TextSlot>)}
            onToggleFavorite={toggleZineFavoriteFont}
          />

          <BarDivider />

          <AlignmentMenu
            label={t('admin.zine_text_align', language)}
            value={(slot as TextSlot).align}
            options={HORIZONTAL_ALIGNMENTS.map((alignment) => ({ ...alignment, label: t(alignment.labelKey, language) }))}
            onChange={(align) => patchSlot({ align: align as TextSlot['align'] } satisfies Partial<TextSlot>)}
          />
          <AlignmentMenu
            label={t('admin.zine_vertical_align', language)}
            value={(slot as TextSlot).verticalAlign ?? 'top'}
            options={VERTICAL_ALIGNMENTS.map((alignment) => ({ ...alignment, label: t(alignment.labelKey, language) }))}
            onChange={(verticalAlign) => patchSlot({ verticalAlign: verticalAlign as TextSlot['verticalAlign'] } satisfies Partial<TextSlot>)}
          />

          <BarDivider />

          <div className="flex items-center gap-1 px-1" role="group" aria-label={t('admin.zine_text_color', language)}>
            {TEXT_COLORS.map((color) => {
              const active = (slot as TextSlot).color.toLowerCase() === color.toLowerCase()
              return (
                <button
                  key={color}
                  type="button"
                  title={`${t('admin.zine_text_color', language)} ${color}`}
                  aria-label={`${t('admin.zine_text_color', language)} ${color}`}
                  aria-pressed={active}
                  onClick={() => patchSlot({ color } satisfies Partial<TextSlot>)}
                  className="h-4.5 w-4.5 rounded-full border transition hover:scale-110"
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

      <BarButton label={t('admin.zine_delete_slot', language)} onClick={() => removeSlot(spread.id, slot.id)} destructive>
        <Trash2 size={14} />
      </BarButton>
    </div>
  )
}
