import { useState } from 'react'
import { ArrowLeft, Search } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { PageHeader } from '@/components/layout/PageHeader'
import { DESIGN_TOOLS, type DesignKind } from '@/features/design-studio/catalog'
import { CanvasTemplateBrowser } from '@/features/design-studio/canvas/CanvasTemplateBrowser'
import { ToolPreview } from '@/features/design-studio/DesignPreview'
import { ZineTemplateBrowser } from '@/features/design-studio/zine/ZineTemplateBrowser'
import { t } from '@/lib/i18n'
import { usePreferences } from '@/store/preferences'

type TemplateFilter = 'all' | DesignKind

export function DesignTemplatePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { language } = usePreferences()
  const requestedType = searchParams.get('type')
  const [filter, setFilter] = useState<TemplateFilter>(DESIGN_TOOLS.some((tool) => tool.id === requestedType) ? requestedType as DesignKind : 'all')
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '')

  const locale = language === 'en' ? 'en-US' : 'zh-CN'
  const normalizedQuery = query.trim().toLocaleLowerCase(locale)
  const unavailableTools = DESIGN_TOOLS.filter((tool) => {
    if (tool.available || (filter !== 'all' && filter !== tool.id)) return false
    if (!normalizedQuery) return true
    return [t(tool.titleKey, language), t(tool.descriptionKey, language)]
      .some((value) => value.toLocaleLowerCase(locale).includes(normalizedQuery))
  })

  const filters: Array<{ id: TemplateFilter; label: string }> = [
    { id: 'all', label: t('admin.design_filter_all', language) },
    ...DESIGN_TOOLS.map((tool) => ({ id: tool.id, label: t(tool.titleKey, language) })),
  ]

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title={t('admin.design_choose_template', language)}
        actions={(
          <button
            type="button"
            onClick={() => navigate('/design')}
            className="flex h-8 items-center gap-2 rounded-md border px-3 text-xs font-medium transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{ borderColor: 'var(--border)' }}
          >
            <ArrowLeft size={14} />
            {t('admin.design_back_to_studio', language)}
          </button>
        )}
      />

      <main className="min-h-0 flex-1 overflow-auto">
        <div className="sticky top-0 z-10 border-b px-6 py-4" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--background)' }}>
          <div className="flex items-center gap-4">
            <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto" aria-label={t('admin.design_template_categories', language)}>
              {filters.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={filter === item.id}
                  onClick={() => setFilter(item.id)}
                  className="shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  style={{
                    backgroundColor: filter === item.id ? 'var(--primary)' : 'transparent',
                    color: filter === item.id ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <label className="flex h-8 w-56 shrink-0 items-center gap-2 rounded-md border px-2.5" style={{ borderColor: 'var(--border)' }}>
              <Search size={14} style={{ color: 'var(--muted-foreground)' }} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('admin.design_search_templates', language)}
                aria-label={t('admin.design_search_templates', language)}
                className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
              />
            </label>
          </div>
        </div>

        <section className="px-6 py-7">
          {(filter === 'all' || filter === 'zine') && (
            <ZineTemplateBrowser query={normalizedQuery} showEmptyState={filter === 'zine'} />
          )}

          {(filter === 'all' || filter === 'collage') && (
            <div className={filter === 'all' ? 'mt-10' : ''}>
              <CanvasTemplateBrowser query={normalizedQuery} showEmptyState={filter === 'collage'} />
            </div>
          )}

          {unavailableTools.length > 0 && (
            <div className={filter === 'all' && !normalizedQuery ? 'mt-10' : ''}>
              <h2 className="mb-4 text-sm font-semibold">{t('admin.design_more_formats', language)}</h2>
              <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(190px,1fr))]">
                {unavailableTools.map((tool) => (
                  <div key={tool.id} className="overflow-hidden rounded-lg border opacity-60" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
                    <div className="h-36 border-b" style={{ borderColor: 'var(--border)' }}>
                      <ToolPreview variant={tool.preview} />
                    </div>
                    <div className="flex items-center justify-between gap-3 p-3.5">
                      <span className="text-sm font-medium">{t(tool.titleKey, language)}</span>
                      <span className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
                        {t('admin.design_coming_soon', language)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {filter !== 'all' && filter !== 'zine' && filter !== 'collage' && normalizedQuery && unavailableTools.length === 0 && (
            <div className="flex min-h-72 items-center justify-center text-sm" style={{ color: 'var(--muted-foreground)' }}>
              {t('admin.design_no_templates', language)}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
