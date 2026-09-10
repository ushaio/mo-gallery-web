import { useEffect, useMemo, useState } from 'react'
import { Loader2, TriangleAlert } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { saveCanvasProject } from '@/lib/design-canvas/project'
import { t } from '@/lib/i18n'
import { usePreferences } from '@/store/preferences'

import { CanvasTemplatePreview } from './CanvasTemplatePreview'
import { BUILTIN_CANVAS_TEMPLATES, createCanvasProject, loadCanvasTemplates, type CanvasTemplateDocument } from './templates'

interface CanvasTemplateBrowserProps {
  query: string
  showEmptyState?: boolean
}

export function CanvasTemplateBrowser({ query, showEmptyState = true }: CanvasTemplateBrowserProps) {
  const navigate = useNavigate()
  const { language } = usePreferences()
  const [creatingId, setCreatingId] = useState<string | null>(null)
  const [catalog, setCatalog] = useState<CanvasTemplateDocument[]>(BUILTIN_CANVAS_TEMPLATES)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  const locale = language === 'en' ? 'en-US' : 'zh-CN'
  const templates = useMemo(() => catalog.filter((template) => {
    if (template.kind !== 'collage') return false
    if (!query) return true
    return [t('admin.design_tool_collage', language), template.title ?? (template.titleKey ? t(template.titleKey, language) : ''), template.description ?? (template.descriptionKey ? t(template.descriptionKey, language) : ''), `${template.canvas.width} x ${template.canvas.height}`, ...template.tags]
      .some((value) => value.toLocaleLowerCase(locale).includes(query))
  }), [catalog, language, locale, query])

  useEffect(() => {
    let active = true
    setLoading(true)
    setFailed(false)
    void loadCanvasTemplates()
      .then((templates) => { if (active) setCatalog(templates) })
      .catch((error) => { console.error(error); if (active) setFailed(true) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [retry])

  async function selectTemplate(templateId: string) {
    if (creatingId) return
    const template = catalog.find((item) => item.id === templateId)
    if (!template) return
    setCreatingId(template.id)
    setSaveFailed(false)
    try {
      const project = createCanvasProject(template, t(template.untitledTitleKey ?? 'admin.canvas_untitled_design', language))
      await saveCanvasProject(project)
      navigate(`/design/canvas/editor/${project.id}`)
    } catch (error) {
      console.error('Failed to create canvas project', error)
      setSaveFailed(true)
    } finally {
      setCreatingId(null)
    }
  }

  return (
    <div>
      <h2 className="mb-4 text-sm font-semibold">{t('admin.canvas_collage_templates', language)}</h2>
      {saveFailed && <p role="alert" className="mb-4 flex items-center gap-2 text-xs text-destructive"><TriangleAlert size={14} />{t('admin.canvas_create_failed', language)}</p>}
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(190px,1fr))]">
        {templates.map((template) => (
          <button
            key={template.id}
            type="button"
            disabled={creatingId !== null}
            onClick={() => void selectTemplate(template.id)}
            className="group overflow-hidden rounded-lg border text-left transition-colors hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}
          >
            <div className="relative h-44 overflow-hidden border-b" style={{ borderColor: 'var(--border)' }}>
              <CanvasTemplatePreview template={template} />
              {creatingId === template.id && (
                <span className="absolute inset-0 flex items-center justify-center bg-background/75"><Loader2 size={18} className="animate-spin" /></span>
              )}
            </div>
            <span className="block p-3.5">
              <span className="block text-sm font-medium">{template.title ?? (template.titleKey ? t(template.titleKey, language) : '')}</span>
              <span className="mt-1 block text-[11px] leading-4" style={{ color: 'var(--muted-foreground)' }}>{template.description ?? (template.descriptionKey ? t(template.descriptionKey, language) : '')}</span>
              <span className="mt-2 block text-[10px] tabular-nums" style={{ color: 'var(--muted-foreground)' }}>{template.canvas.width} x {template.canvas.height} px</span>
            </span>
          </button>
        ))}
      </div>
      {templates.length === 0 && showEmptyState && <p className="py-8 text-center text-sm text-muted-foreground">{t('admin.design_no_templates', language)}</p>}
      {loading && <p role="status" className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><Loader2 size={14} className="animate-spin" />{language === 'en' ? 'Loading more templates…' : '正在加载更多模板…'}</p>}
      {failed && <div role="status" className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><TriangleAlert size={14} /><span>{language === 'en' ? 'More templates could not be loaded. Basic layouts are available.' : '更多模板加载失败，基础拼图仍可使用。'}</span><button type="button" onClick={() => setRetry(value => value + 1)} className="rounded px-2 py-1 text-foreground underline focus-visible:ring-2 focus-visible:ring-ring">{language === 'en' ? 'Retry' : '重试'}</button></div>}
    </div>
  )
}
