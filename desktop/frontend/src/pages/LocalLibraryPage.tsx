import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { usePreferences } from '@/store/preferences'
import { localLibraryApi, parseLocalLibraryError } from '@/features/local-library/api'
import { localLibraryCopy } from '@/features/local-library/copy'
import { LocalLibraryWelcome } from '@/features/local-library/LocalLibraryWelcome'
import { LocalLibraryWorkbench } from '@/features/local-library/LocalLibraryWorkbench'
import { useLocalLibraryStore } from '@/features/local-library/store'
import type { EntryState, LibrarySnapshot } from '@/features/local-library/types'

export function LocalLibraryPage() {
  const language = usePreferences((state) => state.language)
  const copy = localLibraryCopy[language]
  const snapshot = useLocalLibraryStore((state) => state.snapshot)
  const setSnapshot = useLocalLibraryStore((state) => state.setSnapshot)
  const resetNavigation = useLocalLibraryStore((state) => state.resetNavigation)
  const [entry, setEntry] = useState<EntryState>({ active: false, recent: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadEntry = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const state = await localLibraryApi.entryState()
      setEntry(state)
      if (state.active && state.snapshot) setSnapshot(state.snapshot)
      else setSnapshot(null)
    } catch (cause) {
      const parsed = parseLocalLibraryError(cause)
      setError(parsed.message)
    } finally {
      setLoading(false)
    }
  }, [setSnapshot])

  useEffect(() => { void loadEntry() }, [loadEntry])

  const handleOpened = (next: LibrarySnapshot) => {
    resetNavigation()
    setSnapshot(next)
    setEntry((current) => ({ ...current, active: true, snapshot: next }))
  }

  const handleClosed = () => {
    resetNavigation()
    setSnapshot(null)
    void loadEntry()
  }

  if (loading) {
    return <div className="flex h-full items-center justify-center gap-2 text-sm" style={{ color: 'var(--muted-foreground)' }}><Loader2 size={17} className="animate-spin" />{copy.preparing}</div>
  }

  if (error) {
    return <div className="flex h-full items-center justify-center p-8"><div className="max-w-sm text-center"><p className="text-sm">{error}</p><button type="button" onClick={() => { toast.dismiss(); void loadEntry() }} className="mx-auto mt-4 flex items-center gap-2 rounded-md border px-3 py-2 text-xs hover:bg-secondary"><RefreshCw size={14} />{copy.retry}</button></div></div>
  }

  if (snapshot) {
    return <LocalLibraryWorkbench copy={copy} snapshot={snapshot} onSnapshot={setSnapshot} onClose={handleClosed} />
  }

  return <LocalLibraryWelcome copy={copy} recent={entry.recent} onOpened={handleOpened} onRecentChanged={loadEntry} />
}
