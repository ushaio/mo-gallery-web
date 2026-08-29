import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'

import { t } from '@/lib/i18n'
import { getSpreadSize } from '@/lib/zine/page-sizes'
import {
  buildSpreadFromPlazaTemplate,
  fetchPlazaTemplates,
  reportPlazaTemplateUse,
  type PlazaTemplate,
} from '@/lib/zine/plaza'
import { ZINE_TEMPLATES } from '@/lib/zine/templates'
import type { Slot, Spread } from '@/lib/zine/types'
import { usePreferences } from '@/store/preferences'
import { useZineStore } from '@/store/zine'

interface TemplateGalleryProps {
  onAddTemplate: (templateId: string) => void
  onAddSpread?: (spread: Spread) => void
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

export function TemplateGallery({ onAddTemplate, onAddSpread }: TemplateGalleryProps) {
  const { language } = usePreferences()
  const pageSize = useZineStore((state) => state.project?.pageSize ?? 'a5')
  const pageOrientation = useZineStore((state) => state.project?.pageOrientation ?? 'portrait')
  const customSizeMm = useZineStore((state) => state.project?.customSizeMm)
  const { pageW, pageH, spreadW, spreadH } = getSpreadSize(pageSize, pageOrientation, customSizeMm)

  const [tab, setTab] = useState<'builtin' | 'plaza'>('builtin')
  const [plazaTemplates, setPlazaTemplates] = useState<PlazaTemplate[]>([])
  const [plazaLoading, setPlazaLoading] = useState(false)
  const [plazaError, setPlazaError] = useState('')

  const previews = useMemo(
    () => ZINE_TEMPLATES.map((template) => ({ id: template.id, nameKey: template.nameKey, slots: template.buildSlots(pageW, pageH) })),
    [pageW, pageH],
  )
  const scale = PREVIEW_WIDTH / spreadW

  useEffect(() => {
    if (tab !== 'plaza') return
    let cancelled = false
    setPlazaLoading(true)
    setPlazaError('')
    fetchPlazaTemplates()
      .then(({ items }) => {
        if (!cancelled) setPlazaTemplates(items)
      })
      .catch((error: unknown) => {
        if (!cancelled) setPlazaError(error instanceof Error ? error.message : String(error))
      })
      .finally(() => {
        if (!cancelled) setPlazaLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [tab])

  const applyPlazaTemplate = (template: PlazaTemplate) => {
    const spread = buildSpreadFromPlazaTemplate(template, pageW, pageH)
    reportPlazaTemplateUse(template.id)
    if (onAddSpread) {
      onAddSpread(spread)
    } else {
      onAddTemplate(template.id)
    }
  }

  return (
    <div className="absolute right-0 top-full z-30 mt-2 max-h-[70vh] w-72 overflow-y-auto rounded-lg border bg-popover p-3 text-popover-foreground shadow-xl" style={{ borderColor: 'var(--border)' }}>
      <div className="mb-2 flex gap-1 rounded-md border p-0.5" style={{ borderColor: 'var(--border)' }}>
        <button
          type="button"
          className={`flex-1 rounded px-2 py-1 text-xs font-medium transition ${tab === 'builtin' ? 'bg-accent text-foreground' : 'text-foreground/60 hover:bg-accent/40'}`}
          onClick={() => setTab('builtin')}
        >
          {t('admin.zine_templates', language)}
        </button>
        <button
          type="button"
          className={`flex-1 rounded px-2 py-1 text-xs font-medium transition ${tab === 'plaza' ? 'bg-accent text-foreground' : 'text-foreground/60 hover:bg-accent/40'}`}
          onClick={() => setTab('plaza')}
        >
          {t('admin.zine_plaza_templates', language)}
        </button>
      </div>

      {tab === 'builtin' ? (
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
      ) : plazaLoading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-xs text-foreground/60">
          <Loader2 size={14} className="animate-spin" />
          {t('admin.zine_plaza_loading', language)}
        </div>
      ) : plazaError ? (
        <div className="py-8 text-center text-xs text-foreground/60">{t('admin.zine_plaza_error', language)}</div>
      ) : plazaTemplates.length === 0 ? (
        <div className="py-8 text-center text-xs text-foreground/60">—</div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {plazaTemplates.map((template) => {
            const spread = buildSpreadFromPlazaTemplate(template, pageW, pageH)
            return (
              <button
                key={template.id}
                type="button"
                className="group rounded-lg border border-transparent p-2 text-left outline-none transition hover:border-primary hover:bg-accent/40 focus-visible:border-primary focus-visible:bg-accent/40"
                onClick={() => applyPlazaTemplate(template)}
              >
                <div className="relative mx-auto overflow-hidden bg-white shadow-sm ring-1 ring-black/10" style={{ width: PREVIEW_WIDTH, height: spreadH * scale }}>
                  <div className="absolute inset-y-0 z-10 w-px bg-zinc-300/70" style={{ left: pageW * scale }} />
                  {spread.slots.map((slot) => (
                    <TemplatePreviewSlot key={slot.id} slot={slot} pageW={pageW} scale={scale} />
                  ))}
                </div>
                <p className="mt-1.5 truncate text-center text-xs">{template.title}</p>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
