import type { ReactNode } from 'react'
import { AlignCenter, AlignLeft, AlignRight, Image as ImageIcon, ImageOff, Minus, Plus, RotateCcw, Trash2, Type as TypeIcon } from 'lucide-react'

import { t } from '@/lib/i18n'
import type { ImageSlot, TextSlot } from '@/lib/zine/types'
import { usePreferences } from '@/store/preferences'
import { useZineStore } from '@/store/zine'

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

export function SlotContextBar() {
  const { language } = usePreferences()
  const project = useZineStore((state) => state.project)
  const activeSpreadId = useZineStore((state) => state.activeSpreadId)
  const selectedSlotId = useZineStore((state) => state.selectedSlotId)
  const updateSlot = useZineStore((state) => state.updateSlot)
  const removeSlot = useZineStore((state) => state.removeSlot)

  const spread = project?.spreads.find((item) => item.id === activeSpreadId)
  const slot = spread?.slots.find((item) => item.id === selectedSlotId)

  if (!spread || !slot) return null

  const isImage = slot.kind === 'image'

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
            label={t('admin.zine_reset_rotation', language)}
            onClick={() => patchSlot({ rotation: 0 })}
            disabled={slot.rotation === 0}
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

          <select
            value={(slot as TextSlot).fontFamily || 'serif'}
            onChange={(event) => patchSlot({ fontFamily: event.target.value } satisfies Partial<TextSlot>)}
            title={t('admin.zine_font_family', language)}
            aria-label={t('admin.zine_font_family', language)}
            className="h-7 cursor-pointer rounded-full bg-transparent px-1.5 text-[11px] outline-none transition hover:bg-accent"
            style={{ color: 'var(--popover-foreground)' }}
          >
            {!FONT_FAMILIES.some((font) => font.value === ((slot as TextSlot).fontFamily || 'serif')) && (
              <option value={(slot as TextSlot).fontFamily}>{(slot as TextSlot).fontFamily}</option>
            )}
            {FONT_FAMILIES.map((font) => (
              <option key={font.value} value={font.value} style={{ fontFamily: font.value }}>
                {t(font.labelKey, language)}
              </option>
            ))}
          </select>

          <BarDivider />

          <BarButton label={t('admin.zine_align_left', language)} onClick={() => patchSlot({ align: 'left' } satisfies Partial<TextSlot>)} active={(slot as TextSlot).align === 'left'}>
            <AlignLeft size={14} />
          </BarButton>
          <BarButton label={t('admin.zine_align_center', language)} onClick={() => patchSlot({ align: 'center' } satisfies Partial<TextSlot>)} active={(slot as TextSlot).align === 'center'}>
            <AlignCenter size={14} />
          </BarButton>
          <BarButton label={t('admin.zine_align_right', language)} onClick={() => patchSlot({ align: 'right' } satisfies Partial<TextSlot>)} active={(slot as TextSlot).align === 'right'}>
            <AlignRight size={14} />
          </BarButton>

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
