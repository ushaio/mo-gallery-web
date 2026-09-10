import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'

import { SegmentedTabs } from '@/components/ui/SegmentedTabs'
import { t } from '@/lib/i18n'
import { getBuiltinPlazaTemplates } from '@/lib/zine/builtin-plaza-templates'
import { getSpreadSize } from '@/lib/zine/page-sizes'
import {
  buildSpreadFromPlazaTemplate,
  fetchPlazaTemplates,
  reportPlazaTemplateUse,
  type PlazaTemplate,
} from '@/lib/zine/plaza'
import { zinePlazaCopy } from '@/lib/zine/plaza-copy'
import { ZINE_TEMPLATES } from '@/lib/zine/templates'
import { usePreferences } from '@/store/preferences'
import { useZineStore } from '@/store/zine'

import { ZineTemplatePreview } from './ZineTemplatePreview'
import type { Slot, Spread } from '@/lib/zine/types'

interface TemplateGalleryProps {
  onAddTemplate: (templateId: string) => void
  onAddSpread: (spread: Spread) => void
}

interface TemplateCardProps {
  title: string
  description?: string
  slots: Slot[]
  pageW: number
  pageH: number
  onSelect: () => void
}

function TemplateCard({ title, description, slots, pageW, pageH, onSelect }: TemplateCardProps) {
  return (
    <button
      type="button"
      title={description ? `${title} · ${description}` : title}
      onClick={onSelect}
      className="group min-w-0 rounded-lg border border-transparent p-2 text-left outline-none transition hover:border-primary hover:bg-accent/40 focus-visible:border-primary focus-visible:bg-accent/40"
    >
      <ZineTemplatePreview slots={slots} pageW={pageW} pageH={pageH} className="w-full shadow-sm ring-1 ring-black/10" />
      <span className="mt-2 block truncate text-xs font-medium">{title}</span>
      {description && <span className="mt-1 line-clamp-2 text-[10px] leading-4 text-muted-foreground">{description}</span>}
    </button>
  )
}

export function TemplateGallery({ onAddTemplate, onAddSpread }: TemplateGalleryProps) {
  const { language } = usePreferences()
  const copy = zinePlazaCopy(language)
  const pageSize = useZineStore((state) => state.project?.pageSize ?? 'a5')
  const pageOrientation = useZineStore((state) => state.project?.pageOrientation ?? 'portrait')
  const customSizeMm = useZineStore((state) => state.project?.customSizeMm)
  const { pageW, pageH } = getSpreadSize(pageSize, pageOrientation, customSizeMm)

  const [tab, setTab] = useState<'builtin' | 'plaza'>('builtin')
  const [plazaTemplates, setPlazaTemplates] = useState<PlazaTemplate[]>([])
  const [plazaLoading, setPlazaLoading] = useState(false)
  const [plazaError, setPlazaError] = useState('')
  const [requestVersion, setRequestVersion] = useState(0)

  const previews = useMemo(
    () => ZINE_TEMPLATES.map((template) => ({ id: template.id, nameKey: template.nameKey, slots: template.buildSlots(pageW, pageH) })),
    [pageW, pageH],
  )
  const builtins = useMemo(() => getBuiltinPlazaTemplates(language).map((template) => ({
    template,
    spread: buildSpreadFromPlazaTemplate(template, pageW, pageH),
  })), [language, pageW, pageH])
  const community = useMemo(() => plazaTemplates.map((template) => ({
    template,
    spread: buildSpreadFromPlazaTemplate(template, pageW, pageH),
  })), [plazaTemplates, pageW, pageH])

  const refreshCommunity = () => {
    setPlazaLoading(true)
    setPlazaError('')
    setRequestVersion((version) => version + 1)
  }

  useEffect(() => {
    if (tab !== 'plaza') return
    let cancelled = false
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
  }, [tab, requestVersion])

  const applyPlazaTemplate = (template: Pick<PlazaTemplate, 'id' | 'layout'>, communityTemplate = false) => {
    const spread = buildSpreadFromPlazaTemplate(template, pageW, pageH)
    onAddSpread(spread)
    if (communityTemplate && useZineStore.getState().project?.spreads.some((item) => item.id === spread.id)) {
      reportPlazaTemplateUse(template.id)
    }
  }

  return (
    <div className="absolute right-0 top-full z-30 mt-2 max-h-[70vh] w-96 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border bg-popover p-3 text-popover-foreground shadow-xl" style={{ borderColor: 'var(--border)' }}>
      <SegmentedTabs
        size="sm"
        className="mb-2"
        value={tab}
        onChange={(nextTab) => {
          setTab(nextTab)
          if (nextTab === 'plaza') refreshCommunity()
        }}
        options={[
          { value: 'builtin', label: t('admin.zine_templates', language) },
          { value: 'plaza', label: t('admin.zine_plaza_templates', language) },
        ]}
      />

      {tab === 'builtin' ? (
        <div className="grid grid-cols-2 gap-2">
          {previews.map((preview) => (
            <TemplateCard
              key={preview.id}
              title={t(preview.nameKey, language)}
              slots={preview.slots}
              pageW={pageW}
              pageH={pageH}
              onSelect={() => onAddTemplate(preview.id)}
            />
          ))}
        </div>
      ) : (
        <>
          <section aria-label={copy.builtin}>
            <div className="mb-1 mt-3 flex items-center justify-between gap-2 px-2">
              <h3 className="text-xs font-semibold">{copy.builtin}</h3>
              <span className="text-[10px] text-muted-foreground">{copy.editable}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {builtins.map(({ template, spread }) => (
                <TemplateCard
                  key={template.id}
                  title={template.title}
                  description={template.description}
                  slots={spread.slots}
                  pageW={pageW}
                  pageH={pageH}
                  onSelect={() => applyPlazaTemplate(template)}
                />
              ))}
            </div>
          </section>
          <section aria-label={copy.community} aria-busy={plazaLoading} className="mt-3 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
            <h3 className="px-2 text-xs font-semibold">{copy.community}</h3>
            <div role="status" className="text-xs text-muted-foreground">
              {plazaLoading ? (
                <div className="flex items-center justify-center gap-2 py-5">
                  <Loader2 size={14} className="animate-spin" />
                  {t('admin.zine_plaza_loading', language)}
                </div>
              ) : plazaError ? (
                <div className="px-2 py-4">
                  <p className="leading-5">{copy.communityUnavailable}</p>
                  <button type="button" onClick={refreshCommunity} className="mt-2 rounded-md border px-2.5 py-1 transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {copy.retry}
                  </button>
                </div>
              ) : community.length === 0 ? (
                <p className="px-2 py-5">{copy.communityEmpty}</p>
              ) : null}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {community.map(({ template, spread }) => (
                <TemplateCard
                  key={template.id}
                  title={template.title}
                  description={template.description}
                  slots={spread.slots}
                  pageW={pageW}
                  pageH={pageH}
                  onSelect={() => applyPlazaTemplate(template, true)}
                />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
