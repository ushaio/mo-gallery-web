import { useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { ZineCreateDialog, type ZineCreateOptions } from '@/components/zine/ZineCreateDialog'
import { ZineTemplatePreview } from '@/components/zine/ZineTemplatePreview'
import { t } from '@/lib/i18n'
import { getBuiltinPlazaTemplates } from '@/lib/zine/builtin-plaza-templates'
import { getPageSizeLabel, getSpreadSize } from '@/lib/zine/page-sizes'
import { buildSpreadFromPlazaTemplate } from '@/lib/zine/plaza'
import { zinePlazaCopy } from '@/lib/zine/plaza-copy'
import { usePreferences } from '@/store/preferences'
import { useZineStore } from '@/store/zine'

import { ZINE_STARTER_TEMPLATES, type ZineStarterTemplate } from './templates'
import { ZineStarterPreview } from './ZineStarterPreview'
import type { BuiltinPlazaTemplate } from '@/lib/zine/builtin-plaza-templates'

interface ZineTemplateBrowserProps {
  query: string
  showEmptyState?: boolean
}

export function ZineTemplateBrowser({ query, showEmptyState = true }: ZineTemplateBrowserProps) {
  const navigate = useNavigate()
  const { language } = usePreferences()
  const copy = zinePlazaCopy(language)
  const [creatingTemplateId, setCreatingTemplateId] = useState<string | null>(null)
  const [customOpen, setCustomOpen] = useState(false)
  const locale = language === 'en' ? 'en-US' : 'zh-CN'
  const templates = useMemo(() => ZINE_STARTER_TEMPLATES.filter((template) => {
    if (!query) return true
    return [t('admin.zine', language), t(template.titleKey, language), t(template.descriptionKey, language), template.sizeLabel]
      .some((value) => value.toLocaleLowerCase(locale).includes(query))
  }), [language, locale, query])
  const creativeTemplates = useMemo(() => getBuiltinPlazaTemplates(language)
    .filter((template) => !query || [t('admin.zine', language), template.title, template.description, getPageSizeLabel(template)]
      .some((value) => value.toLocaleLowerCase(locale).includes(query)))
    .map((template) => {
      const size = getSpreadSize(template.pageSize, template.pageOrientation)
      return { template, size, spread: buildSpreadFromPlazaTemplate(template, size.pageW, size.pageH) }
    }), [language, locale, query])

  async function createZine(options: ZineCreateOptions, templateId = 'custom', creativeTemplate?: BuiltinPlazaTemplate) {
    if (creatingTemplateId) return
    setCreatingTemplateId(templateId)
    try {
      const { pageW, pageH } = getSpreadSize(options.pageSize, options.pageOrientation, options.customSizeMm)
      const contentSpreads = creativeTemplate ? [buildSpreadFromPlazaTemplate(creativeTemplate, pageW, pageH)] : undefined
      const project = useZineStore.getState().createProject(creativeTemplate?.title ?? t('admin.zine_untitled', language), { ...options, contentSpreads })
      if (!await useZineStore.getState().save()) return
      setCustomOpen(false)
      const selectedSpread = creativeTemplate ? project.spreads.find((spread) => spread.role === 'content') : undefined
      navigate(`/design/zine/editor/${project.id}${selectedSpread ? `?spread=${encodeURIComponent(selectedSpread.id)}` : ''}`)
    } catch {
      toast.error(copy.createFailed)
    } finally {
      setCreatingTemplateId(null)
    }
  }

  function selectTemplate(template: ZineStarterTemplate) {
    if (!template.options) {
      setCustomOpen(true)
      return
    }
    void createZine(template.options, template.id)
  }

  return (
    <>
      {creativeTemplates.length > 0 && (
        <section aria-label={copy.creativeTemplates} className="mb-8">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">{copy.creativeTemplates}</h2>
            <span className="text-[11px] text-muted-foreground">{copy.editable}</span>
          </div>
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
            {creativeTemplates.map(({ template, size, spread }) => (
              <button
                key={template.id}
                type="button"
                disabled={creatingTemplateId !== null}
                onClick={() => void createZine({ pageSize: template.pageSize, pageOrientation: template.pageOrientation }, template.id, template)}
                className="group overflow-hidden rounded-lg border text-left transition-colors hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60"
                style={{ backgroundColor: 'var(--card)' }}
              >
                <div className="relative flex h-48 items-center justify-center overflow-hidden border-b bg-muted/40 p-4">
                  <ZineTemplatePreview slots={spread.slots} pageW={size.pageW} pageH={size.pageH} className="max-h-full w-full shadow-sm ring-1 ring-black/10" />
                  {creatingTemplateId === template.id && (
                    <span className="absolute inset-0 flex items-center justify-center bg-background/70">
                      <Loader2 size={18} className="animate-spin" />
                    </span>
                  )}
                </div>
                <span className="block p-3.5">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{template.title}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{getPageSizeLabel(template)}</span>
                  </span>
                  <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">{template.description}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {templates.length > 0 ? (
        <div>
          <h2 className="mb-4 text-sm font-semibold">{copy.blankTemplates}</h2>
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(190px,1fr))]">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                disabled={creatingTemplateId !== null}
                onClick={() => selectTemplate(template)}
                className="group overflow-hidden rounded-lg border text-left transition-colors hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}
              >
                <div className="relative h-44 overflow-hidden border-b" style={{ borderColor: 'var(--border)' }}>
                  <ZineStarterPreview variant={template.preview} />
                  {creatingTemplateId === template.id && (
                    <span className="absolute inset-0 flex items-center justify-center bg-background/70">
                      <Loader2 size={18} className="animate-spin" />
                    </span>
                  )}
                </div>
                <span className="block p-3.5">
                  <span className="block text-sm font-medium">{t(template.titleKey, language)}</span>
                  <span className="mt-1 block text-[11px] leading-4" style={{ color: 'var(--muted-foreground)' }}>
                    {t(template.descriptionKey, language)}
                  </span>
                  {template.sizeLabel && (
                    <span className="mt-2 block text-[10px] tabular-nums" style={{ color: 'var(--muted-foreground)' }}>
                      {template.sizeLabel}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : showEmptyState && creativeTemplates.length === 0 ? (
        <div className="flex min-h-72 items-center justify-center text-sm" style={{ color: 'var(--muted-foreground)' }}>
          {t('admin.design_no_templates', language)}
        </div>
      ) : null}

      <ZineCreateDialog
        open={customOpen}
        creating={creatingTemplateId !== null}
        onCancel={() => setCustomOpen(false)}
        onCreate={(options) => void createZine(options)}
      />
    </>
  )
}
