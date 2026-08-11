import { useMemo } from 'react'

import { t } from '@/lib/i18n'
import { getSpreadSize } from '@/lib/zine/page-sizes'
import { ZINE_TEMPLATES } from '@/lib/zine/templates'
import type { Slot } from '@/lib/zine/types'
import { usePreferences } from '@/store/preferences'
import { useZineStore } from '@/store/zine'

interface TemplateGalleryProps {
  onAddTemplate: (templateId: string) => void
}

const PREVIEW_WIDTH = 104

function TemplatePreviewSlot({ slot, pageW, scale }: { slot: Slot; pageW: number; scale: number }) {
  const style = {
    left: slot.x * scale,
    top: slot.y * scale,
    width: slot.w * scale,
    height: slot.h * scale,
  }

  if (slot.kind === 'text') {
    return (
      <div
        className="absolute"
        style={{
          ...style,
          backgroundImage: 'repeating-linear-gradient(to bottom, rgba(17,17,17,0.25) 0 1px, transparent 1px 5px)',
          backgroundSize: '82% 100%',
          backgroundRepeat: 'no-repeat',
        }}
      />
    )
  }

  return <div className="absolute bg-zinc-300/80" style={style} />
}

export function TemplateGallery({ onAddTemplate }: TemplateGalleryProps) {
  const { language } = usePreferences()
  const pageSize = useZineStore((state) => state.project?.pageSize ?? 'a5')
  const pageOrientation = useZineStore((state) => state.project?.pageOrientation ?? 'portrait')
  const customSizeMm = useZineStore((state) => state.project?.customSizeMm)
  const { pageW, pageH, spreadW, spreadH } = getSpreadSize(pageSize, pageOrientation, customSizeMm)
  const previews = useMemo(
    () => ZINE_TEMPLATES.map((template) => ({ id: template.id, nameKey: template.nameKey, slots: template.buildSlots(pageW, pageH) })),
    [pageW, pageH],
  )
  const scale = PREVIEW_WIDTH / spreadW

  return (
    <div className="absolute right-0 top-full z-30 mt-2 max-h-[70vh] w-72 overflow-y-auto rounded-lg border bg-popover p-3 text-popover-foreground shadow-xl" style={{ borderColor: 'var(--border)' }}>
      <div className="grid grid-cols-2 gap-2">
        {previews.map((preview) => (
          <button
            key={preview.id}
            type="button"
            className="group rounded-lg border border-transparent p-2 text-left outline-none transition hover:border-primary hover:bg-accent/40 focus-visible:border-primary focus-visible:bg-accent/40"
            onClick={() => onAddTemplate(preview.id)}
          >
            <div className="relative mx-auto overflow-hidden bg-white shadow-sm ring-1 ring-black/10" style={{ width: PREVIEW_WIDTH, height: spreadH * scale }}>
              <div className="absolute inset-y-0 z-10 w-px bg-zinc-300/70" style={{ left: pageW * scale }} />
              {preview.slots.map((slot) => (
                <TemplatePreviewSlot key={slot.id} slot={slot} pageW={pageW} scale={scale} />
              ))}
            </div>
            <p className="mt-1.5 truncate text-center text-xs">{t(preview.nameKey, language)}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
