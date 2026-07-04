import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookImage, Loader2, Plus, Trash2 } from 'lucide-react'

import { PageHeader } from '@/components/layout/PageHeader'
import { t } from '@/lib/i18n'
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

export function ZinePage() {
  const navigate = useNavigate()
  const { language } = usePreferences()
  const [projects, setProjects] = useState<ZineProject[]>([])
  const [loading, setLoading] = useState(true)
  const [busyProjectId, setBusyProjectId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

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

  async function handleCreateProject() {
    if (creating) return

    setCreating(true)
    try {
      const store = useZineStore.getState()
      const project = store.createProject('Untitled Zine')
      await useZineStore.getState().save()
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
      <PageHeader
        title={t('admin.zine', language)}
        actions={(
          <button
            type="button"
            onClick={handleCreateProject}
            disabled={creating}
            className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
            style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}
          >
            {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            {t('admin.zine_new', language)}
          </button>
        )}
      />

      <main className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex h-48 items-center justify-center" style={{ color: 'var(--muted-foreground)' }}>
            <Loader2 size={22} className="animate-spin" />
          </div>
        ) : projects.length === 0 ? (
          <div className="flex min-h-[280px] flex-col items-center justify-center rounded-lg border border-dashed text-center" style={{ borderColor: 'var(--border)' }}>
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl" style={{ backgroundColor: 'var(--muted)' }}>
              <BookImage size={22} style={{ color: 'var(--muted-foreground)' }} />
            </div>
            <p className="text-sm font-medium">{t('admin.zine_no_projects', language)}</p>
            <button
              type="button"
              onClick={handleCreateProject}
              disabled={creating}
              className="mt-4 inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
              style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}
            >
              {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              {t('admin.zine_new', language)}
            </button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <article key={project.id} className="rounded-lg border p-5" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold">{project.title}</h2>
                    <p className="mt-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>
                      {project.spreads.length} {project.spreads.length === 1 ? 'spread' : 'spreads'}
                    </p>
                  </div>
                  <BookImage size={20} style={{ color: 'var(--muted-foreground)' }} />
                </div>

                <div className="mt-5 space-y-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>
                  <p>{formatProjectDate(project.updatedAt, language)}</p>
                  <p>{project.pageSize.toUpperCase()} · {project.pageOrientation}</p>
                </div>

                <div className="mt-5 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => navigate(`/zine/editor/${project.id}`)}
                    className="flex-1 rounded-md px-3 py-2 text-sm transition-opacity hover:opacity-90"
                    style={{ backgroundColor: 'var(--secondary)', color: 'var(--secondary-foreground)' }}
                  >
                    {t('admin.zine_open', language)}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteProject(project.id)}
                    disabled={busyProjectId === project.id}
                    className="inline-flex items-center justify-center rounded-md border px-3 py-2 transition-opacity hover:opacity-80 disabled:cursor-wait disabled:opacity-60"
                    style={{ borderColor: 'var(--border)', color: 'var(--destructive)' }}
                    aria-label={t('admin.delete', language)}
                  >
                    {busyProjectId === project.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
