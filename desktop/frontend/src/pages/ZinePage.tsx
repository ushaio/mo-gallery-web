import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookImage, Loader2, Plus, Trash2 } from 'lucide-react'

import { PageHeader } from '@/components/layout/PageHeader'
import { PageThumb } from '@/components/zine/PageThumb'
import { ZineCreateDialog, type ZineCreateOptions } from '@/components/zine/ZineCreateDialog'
import { t } from '@/lib/i18n'
import { getPageSizeLabel, getProjectSpreadSize } from '@/lib/zine/page-sizes'
import { deleteZineProject, listZineProjects } from '@/lib/zine/project'
import type { ZineProject } from '@/lib/zine/types'
import { usePreferences } from '@/store/preferences'
import { useZineStore } from '@/store/zine'

function formatProjectDate(timestamp: number, language: string) {
  return new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp))
}

function ProjectCover({ project }: { project: ZineProject }) {
  const spread = project.spreads[0]
  const { spreadW, spreadH } = getProjectSpreadSize(project)
  const thumbWidth = Math.min(204, Math.round(122 * (spreadW / spreadH)))

  return (
    <div className="zine-desk flex h-40 items-center justify-center overflow-hidden">
      {spread ? (
        <div className="transition-transform duration-300 group-hover:scale-[1.04]">
          <PageThumb project={project} spread={spread} width={thumbWidth} />
        </div>
      ) : (
        <BookImage size={22} style={{ color: 'var(--muted-foreground)' }} />
      )}
    </div>
  )
}

export function ZinePage() {
  const navigate = useNavigate()
  const { language } = usePreferences()
  const [projects, setProjects] = useState<ZineProject[]>([])
  const [loading, setLoading] = useState(true)
  const [busyProjectId, setBusyProjectId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)

  async function refreshProjects() {
    setLoading(true)
    try {
      setProjects(await listZineProjects())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refreshProjects()
  }, [])

  async function handleCreateProject(options: ZineCreateOptions) {
    if (creating) return

    setCreating(true)
    try {
      const store = useZineStore.getState()
      const project = store.createProject(t('admin.zine_untitled', language), options)
      await useZineStore.getState().save()
      setCreateOpen(false)
      navigate(`/zine/editor/${project.id}`)
    } finally {
      setCreating(false)
    }
  }

  async function handleDeleteProject(id: string) {
    if (!window.confirm(t('admin.zine_delete_confirm', language))) return

    setBusyProjectId(id)
    try {
      await deleteZineProject(id)
      await refreshProjects()
    } finally {
      setBusyProjectId(null)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader title={t('admin.zine', language)} />

      <main className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="overflow-hidden rounded-xl border" style={{ borderColor: 'var(--border)' }}>
                <div className="h-40 animate-pulse" style={{ backgroundColor: 'var(--muted)' }} />
                <div className="space-y-2 p-4">
                  <div className="h-4 w-2/3 animate-pulse rounded" style={{ backgroundColor: 'var(--muted)' }} />
                  <div className="h-3 w-1/2 animate-pulse rounded" style={{ backgroundColor: 'var(--muted)' }} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                disabled={creating}
                className="flex min-h-[248px] flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed transition hover:border-primary hover:text-primary disabled:cursor-wait disabled:opacity-60"
                style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full border border-dashed border-current">
                  {creating ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
                </span>
                <span className="text-sm font-medium">{t('admin.zine_new', language)}</span>
              </button>

              {projects.map((project) => {
                const sizeLabel = getPageSizeLabel(project)
                const orientationLabel = t(
                  project.pageOrientation === 'portrait' ? 'admin.zine_orientation_portrait' : 'admin.zine_orientation_landscape',
                  language,
                )

                return (
                  <article
                    key={project.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/zine/editor/${project.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        navigate(`/zine/editor/${project.id}`)
                      }
                    }}
                    className="group cursor-pointer overflow-hidden rounded-xl border bg-card outline-none transition hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring"
                    style={{ borderColor: 'var(--border)' }}
                    aria-label={`${t('admin.zine_open', language)} ${project.title}`}
                  >
                    <ProjectCover project={project} />

                    <div className="border-t p-4" style={{ borderColor: 'var(--border)' }}>
                      <div className="flex items-start justify-between gap-2">
                        <h2 className="min-w-0 truncate font-serif text-[15px] font-medium tracking-tight">{project.title}</h2>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            void handleDeleteProject(project.id)
                          }}
                          disabled={busyProjectId === project.id}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md opacity-0 transition hover:bg-destructive/10 focus-visible:opacity-100 group-hover:opacity-100 disabled:cursor-wait disabled:opacity-60"
                          style={{ color: 'var(--destructive)' }}
                          aria-label={t('admin.zine_delete_confirm', language)}
                          title={t('common.delete', language)}
                        >
                          {busyProjectId === project.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                        </button>
                      </div>

                      <p className="mt-1 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
                        {t('admin.zine_spreads_count', language, { count: project.spreads.length })} · {sizeLabel} {orientationLabel}
                      </p>
                      <p className="mt-0.5 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
                        {t('admin.zine_updated_at', language, { time: formatProjectDate(project.updatedAt, language) })}
                      </p>
                    </div>
                  </article>
                )
              })}
            </div>

            {projects.length === 0 && (
              <p className="mt-6 text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>
                {t('admin.zine_no_projects', language)}
              </p>
            )}
          </>
        )}
      </main>

      <ZineCreateDialog open={createOpen} creating={creating} onCancel={() => setCreateOpen(false)} onCreate={(options) => void handleCreateProject(options)} />
    </div>
  )
}
