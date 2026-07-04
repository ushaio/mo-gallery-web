import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'

import { PageHeader } from '@/components/layout/PageHeader'
import { ZineEditor } from '@/components/zine/ZineEditor'
import { t } from '@/lib/i18n'
import { usePreferences } from '@/store/preferences'
import { useZineStore } from '@/store/zine'

export function ZineEditorPage() {
  const { projectId } = useParams()
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

  return (
    <div className="flex h-full flex-col">
      <PageHeader title={t('admin.zine_editor', language)} />

      <main className="min-h-0 flex-1 overflow-hidden p-6">
        {loading ? (
          <div className="flex h-48 items-center justify-center rounded-lg border" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
            <Loader2 size={22} className="animate-spin" />
          </div>
        ) : error ? (
          <div className="rounded-lg border p-6 text-sm" style={{ borderColor: 'var(--destructive)', color: 'var(--destructive)' }}>
            {error}
          </div>
        ) : project ? (
          <ZineEditor />
        ) : null}
      </main>
    </div>
  )
}
