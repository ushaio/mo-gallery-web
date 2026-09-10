import { useState } from 'react'
import { Grid2X2, Loader2, Plus, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { CanvasProjectPreview } from '@/components/design-canvas/CanvasProjectPreview'
import { PageHeader } from '@/components/layout/PageHeader'
import { useCachedPageEffect } from '@/hooks/useCachedPageEffect'
import { useDataRevision } from '@/hooks/useDataRevision'
import { deleteCanvasProject, listCanvasProjects } from '@/lib/design-canvas/project'
import type { CanvasProject } from '@/lib/design-canvas/types'
import { t } from '@/lib/i18n'
import { usePreferences } from '@/store/preferences'

export function CanvasProjectsPage() {
  const navigate = useNavigate()
  const { language } = usePreferences()
  const revision = useDataRevision('canvas-projects')
  const [projects, setProjects] = useState<CanvasProject[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function refresh() {
    setLoading(true)
    try { setProjects((await listCanvasProjects()).filter((project) => project.kind === 'collage')) }
    finally { setLoading(false) }
  }

  useCachedPageEffect(() => { void refresh() }, [revision])

  async function remove(id: string) {
    if (!window.confirm(t('admin.canvas_delete_confirm', language))) return
    setBusyId(id)
    try { await deleteCanvasProject(id); await refresh() }
    finally { setBusyId(null) }
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader title={t('admin.design_tool_collage', language)} actions={(
        <button type="button" onClick={() => navigate('/design/new?type=collage')} className="flex h-8 items-center gap-2 rounded-md px-3 text-xs font-medium transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
          <Plus size={14} />{t('admin.design_new', language)}
        </button>
      )} />
      <main className="min-h-0 flex-1 overflow-auto px-6 py-6">
        {loading ? (
          <div className="flex h-64 items-center justify-center"><Loader2 size={20} className="animate-spin" style={{ color: 'var(--muted-foreground)' }} /></div>
        ) : projects.length === 0 ? (
          <div className="flex min-h-[420px] flex-col items-center justify-center border border-dashed" style={{ borderColor: 'var(--border)' }}>
            <Grid2X2 size={28} strokeWidth={1.4} style={{ color: 'var(--muted-foreground)' }} />
            <p className="mt-4 text-sm font-medium">{t('admin.canvas_empty_title', language)}</p>
            <button type="button" onClick={() => navigate('/design/new?type=collage')} className="mt-4 flex h-8 items-center gap-2 rounded-md px-3 text-xs font-medium" style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}><Plus size={14} />{t('admin.canvas_choose_template', language)}</button>
          </div>
        ) : (
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
            {projects.map((project) => (
              <div key={project.id} className="group overflow-hidden rounded-lg border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
                <button type="button" onClick={() => navigate(`/design/canvas/editor/${project.id}`)} className="block h-48 w-full border-b text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" style={{ borderColor: 'var(--border)' }}><CanvasProjectPreview project={project} /></button>
                <div className="flex items-center gap-3 p-3.5">
                  <button type="button" onClick={() => navigate(`/design/canvas/editor/${project.id}`)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm font-medium">{project.title}</span>
                    <span className="mt-1 block text-[10px] tabular-nums" style={{ color: 'var(--muted-foreground)' }}>{new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(project.updatedAt)}</span>
                  </button>
                  <button type="button" disabled={busyId === project.id} onClick={() => void remove(project.id)} aria-label={t('admin.canvas_delete', language)} title={t('admin.canvas_delete', language)} className="flex size-8 shrink-0 items-center justify-center rounded-md opacity-0 transition-colors hover:bg-secondary focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100 disabled:opacity-40"><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
