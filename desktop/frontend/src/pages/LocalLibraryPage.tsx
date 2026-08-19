import { useCallback, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { usePreferences } from '@/store/preferences'
import { useCachedPageEffect } from '@/hooks/useCachedPageEffect'
import { localLibraryApi, parseLocalLibraryError } from '@/features/local-library/api'
import { localLibraryCopy } from '@/features/local-library/copy'
import { LocalLibraryWelcome } from '@/features/local-library/LocalLibraryWelcome'
import { LocalLibraryWorkbench } from '@/features/local-library/LocalLibraryWorkbench'
import { useLocalLibraryStore } from '@/features/local-library/store'
import { LocalLibraryUpgradeDialog } from '@/features/local-library/LocalLibraryUpgradeDialog'
import type { EntryState, LibrarySnapshot, LibraryUpgradeInfo, LocalAsset } from '@/features/local-library/types'

interface LocalLibraryPageProps {
  selectionMode?: boolean
  existingAssetIds?: string[]
  onSelectionChange?: (assets: LocalAsset[]) => void
}

export function LocalLibraryPage({ selectionMode = false, existingAssetIds = [], onSelectionChange }: LocalLibraryPageProps = {}) {
  const language = usePreferences((state) => state.language)
  const copy = localLibraryCopy[language]
  const snapshot = useLocalLibraryStore((state) => state.snapshot)
  const setSnapshot = useLocalLibraryStore((state) => state.setSnapshot)
  const resetNavigation = useLocalLibraryStore((state) => state.resetNavigation)
  const [entry, setEntry] = useState<EntryState>({ active: false, recent: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [upgradeRequest, setUpgradeRequest] = useState<LibraryUpgradeInfo | null>(null)
  const [upgradePhase, setUpgradePhase] = useState<'confirm' | 'running' | 'completed' | 'failed'>('confirm')
  const [upgradeError, setUpgradeError] = useState('')

  const upgradeFromError = (cause: unknown): LibraryUpgradeInfo | null => {
    const parsed = parseLocalLibraryError(cause)
    if (parsed.code !== 'LIBRARY_UPGRADE_REQUIRED' || !parsed.details) return null
    return {
      rootPath: String(parsed.details.path ?? parsed.details.rootPath ?? ''),
      currentVersion: Number(parsed.details.currentVersion ?? 0),
      targetVersion: Number(parsed.details.targetVersion ?? 0),
      required: true,
    }
  }

  const loadEntry = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const state = await localLibraryApi.entryState()
      setEntry(state)
      if (state.active && state.snapshot) setSnapshot(state.snapshot)
      else setSnapshot(null)
    } catch (cause) {
      const upgrade = upgradeFromError(cause)
      if (upgrade?.rootPath) {
        setUpgradeRequest(upgrade)
        setUpgradePhase('confirm')
        setUpgradeError('')
      } else {
        setError(parseLocalLibraryError(cause).message)
      }
    } finally {
      setLoading(false)
    }
  }, [setSnapshot])

  useCachedPageEffect(() => { void loadEntry() }, [loadEntry])

  const handleOpened = (next: LibrarySnapshot) => {
    setUpgradeRequest(null)
    resetNavigation()
    setSnapshot(next)
    setEntry((current) => ({ ...current, active: true, snapshot: next }))
  }

  const handleClosed = () => {
    resetNavigation()
    setSnapshot(null)
    void loadEntry()
  }

  const handleUpgradeRequired = (info: LibraryUpgradeInfo) => {
    setUpgradeRequest(info)
    setUpgradePhase('confirm')
    setUpgradeError('')
  }

  const handleUpgradeStart = async () => {
    if (!upgradeRequest) return
    setUpgradePhase('running')
    setUpgradeError('')
    try {
      const upgraded = await localLibraryApi.upgrade(upgradeRequest.rootPath)
      setUpgradeRequest(upgraded)
      setUpgradePhase('completed')
    } catch (cause) {
      setUpgradeError(parseLocalLibraryError(cause).message)
      setUpgradePhase('failed')
    }
  }

  const handleUpgradeConfirm = async () => {
    if (!upgradeRequest) return
    try {
      const next = await localLibraryApi.open(upgradeRequest.rootPath)
      handleOpened(next)
    } catch (cause) {
      const nextUpgrade = upgradeFromError(cause)
      if (nextUpgrade) {
        setUpgradeRequest(nextUpgrade)
        setUpgradePhase('confirm')
      } else {
        setUpgradeError(parseLocalLibraryError(cause).message)
        setUpgradePhase('failed')
      }
    }
  }

  const upgradeDialog = upgradeRequest ? (
    <LocalLibraryUpgradeDialog
      copy={copy}
      info={upgradeRequest}
      phase={upgradePhase}
      error={upgradeError}
      onStart={() => void handleUpgradeStart()}
      onCancel={() => { if (upgradePhase !== 'running') setUpgradeRequest(null) }}
      onConfirm={() => void handleUpgradeConfirm()}
    />
  ) : null

  if (loading && !snapshot) {
    return <><div className="flex h-full items-center justify-center gap-2 text-sm" style={{ color: 'var(--muted-foreground)' }}><Loader2 size={17} className="animate-spin" />{copy.preparing}</div>{upgradeDialog}</>
  }

  if (error) {
    return <><div className="flex h-full items-center justify-center p-8"><div className="max-w-sm text-center"><p className="text-sm">{error}</p><button type="button" onClick={() => { toast.dismiss(); void loadEntry() }} className="mx-auto mt-4 flex items-center gap-2 rounded-md border px-3 py-2 text-xs hover:bg-secondary"><RefreshCw size={14} />{copy.retry}</button></div></div>{upgradeDialog}</>
  }

  if (snapshot) {
    return <><LocalLibraryWorkbench copy={copy} snapshot={snapshot} onSnapshot={setSnapshot} onClose={handleClosed} selectionMode={selectionMode} existingAssetIds={existingAssetIds} onSelectionChange={onSelectionChange} />{upgradeDialog}</>
  }

  return <><LocalLibraryWelcome copy={copy} recent={entry.recent} onOpened={handleOpened} onRecentChanged={loadEntry} onUpgradeRequired={handleUpgradeRequired} />{upgradeDialog}</>
}
