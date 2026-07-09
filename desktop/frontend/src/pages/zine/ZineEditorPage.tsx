import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2 } from 'lucide-react'

import { ZineEditor } from '@/components/zine/ZineEditor'
import { t } from '@/lib/i18n'
import { usePreferences } from '@/store/preferences'
import { useZineStore } from '@/store/zine'

export function ZineEditorPage() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const { language } = usePreferences()
  const project = useZineStore((state) => state.project)
  const loadProject = useZineStore((state) => state.loadProject)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!projectId) {
        setError(t('common.error', language))
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)

      try {
        await loadProject(projectId)
        const loadedProject = useZineStore.getState().project
        if (!cancelled && (!loadedProject || loadedProject.id !== projectId)) {
          setError(t('admin.zine_no_projects', language))
        }
      } catch {
        if (!cancelled) setError(t('common.error', language))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [language, loadProject, projectId])

  if (loading) {
    return (
      <div className="zine-desk flex h-full items-center justify-center" style={{ color: 'var(--muted-foreground)' }}>
        <Loader2 size={22} className="animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="zine-desk flex h-full flex-col items-center justify-center gap-4">
        <p className="text-sm" style={{ color: 'var(--destructive)' }}>{error}</p>
        <button
          type="button"
          onClick={() => navigate('/zine')}
          className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm transition hover:bg-accent"
          style={{ borderColor: 'var(--border)' }}
        >
          <ArrowLeft size={15} />
          {t('admin.zine_back', language)}
        </button>
      </div>
    )
  }

  return project ? <ZineEditor /> : null
}
