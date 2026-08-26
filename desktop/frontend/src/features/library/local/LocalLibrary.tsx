import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { usePreferences } from '@/store/preferences'
import { useCachedPageEffect } from '@/hooks/useCachedPageEffect'
import { localLibraryApi, parseLocalLibraryError } from '@/features/library/local/api'
import { localLibraryCopy } from '@/features/library/local/copy'
import { LocalLibraryWelcome } from '@/features/library/local/entry/LocalLibraryWelcome'
import { LocalLibraryWorkbench } from '@/features/library/local/workbench/LocalLibraryWorkbench'
import { LocalLibraryOpeningOverlay } from '@/features/library/local/entry/LocalLibraryOpeningOverlay'
import { useLocalLibraryStore } from '@/features/library/local/store'
import { LocalLibraryUpgradeDialog } from '@/features/library/local/entry/LocalLibraryUpgradeDialog'
import type { EntryState, LibrarySnapshot, LibraryUpgradeInfo, LocalAsset } from '@/features/library/local/types'

interface LocalLibraryProps {
  selectionMode?: boolean
  existingAssetIds?: string[]
  onSelectionChange?: (assets: LocalAsset[]) => void
}

export function LocalLibrary({ selectionMode = false, existingAssetIds = [], onSelectionChange }: LocalLibraryProps = {}) {
  const language = usePreferences((state) => state.language)
  const copy = localLibraryCopy[language]
  const snapshot = useLocalLibraryStore((state) => state.snapshot)
  const setSnapshot = useLocalLibraryStore((state) => state.setSnapshot)
  const resetNavigation = useLocalLibraryStore((state) => state.resetNavigation)
  const [entry, setEntry] = useState<EntryState>({ active: false, recent: [] })
  const [loading, setLoading] = useState(true)
  const [pendingPath, setPendingPath] = useState('')
  const [pendingLabel, setPendingLabel] = useState('')
  const [pendingSnapshot, setPendingSnapshot] = useState<LibrarySnapshot | null>(null)
  const [error, setError] = useState('')
  const [initializePath, setInitializePath] = useState<string | null>(null)
  const [upgradeRequest, setUpgradeRequest] = useState<LibraryUpgradeInfo | null>(null)
  const [upgradePhase, setUpgradePhase] = useState<'confirm' | 'running' | 'completed' | 'failed'>('confirm')
  const [upgradeError, setUpgradeError] = useState('')

  const scanRunning = snapshot != null && snapshot.scan.state === 'running'
  // The library stays behind a progress overlay until its first scan finishes,
  // so an initialized library opens with thumbnails already generated. Later
  // watcher-triggered rescans never re-block the workbench.
  const initializedSessions = useRef<Set<string>>(new Set())
  const [backgroundedSession, setBackgroundedSession] = useState('')
  useEffect(() => {
    if (snapshot && snapshot.scan.state !== 'running') initializedSessions.current.add(snapshot.sessionId)
  }, [snapshot])
  const initializing = snapshot != null
    && snapshot.scan.state === 'running'
    && (snapshot.scan.phase === 'indexing' || snapshot.scan.phase === 'thumbnails')
    && snapshot.sessionId !== backgroundedSession
    && !initializedSessions.current.has(snapshot.sessionId)
  const startOpening = useCallback((path: string, label?: string) => { setPendingPath(path); setPendingLabel(label ?? '') }, [])
  const endOpening = useCallback(() => {
    setPendingPath('')
    setPendingLabel('')
    setPendingSnapshot(null)
  }, [])

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
      if (state.upgrade?.required) {
        setUpgradeRequest(state.upgrade)
        setUpgradePhase('confirm')
        setUpgradeError('')
      } else {
        setUpgradeRequest(null)
      }
      if (state.active && state.snapshot) {
        setSnapshot(state.snapshot)
      } else {
        setSnapshot(null)
      }
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

  useEffect(() => {
    if (!scanRunning) return
    let disposed = false
    const refresh = async () => {
      if (disposed) return
      try {
        const next = await localLibraryApi.snapshot()
        if (disposed) return
        if (!useLocalLibraryStore.getState().snapshot) return
        setSnapshot(next)
      } catch { /* session may be closing */ }
    }
    void refresh()
    const timer = window.setInterval(refresh, 500)
    return () => { disposed = true; window.clearInterval(timer) }
  }, [scanRunning, setSnapshot])

  useEffect(() => {
    if (!pendingSnapshot) return
    let disposed = false
    const refresh = async () => {
      if (disposed) return
      try {
        const next = await localLibraryApi.snapshot()
        if (disposed) return
        if (next.scan.state === 'running') {
          setPendingSnapshot(next)
          return
        }
        setPendingSnapshot(null)
        setPendingPath('')
        setPendingLabel('')
        setSnapshot(next)
        setEntry((current) => ({ ...current, active: true, snapshot: next }))
      } catch { /* opening session may still be initializing */ }
    }
    void refresh()
    const timer = window.setInterval(refresh, 500)
    return () => { disposed = true; window.clearInterval(timer) }
  }, [pendingSnapshot, setSnapshot])

  const handleOpened = (next: LibrarySnapshot) => {
    setUpgradeRequest(null)
    resetNavigation()
    if (next.scan.state === 'running') {
      setPendingPath(next.rootPath)
      setPendingSnapshot(next)
      return
    }
    setPendingPath('')
    setPendingLabel('')
    setPendingSnapshot(null)
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

  const handleRequestInitialize = useCallback((path: string) => {
    // Hoist the confirm dialog to the page so it survives pendingPath overlay and
    // any Welcome remount caused by entry reload.
    setInitializePath(path)
  }, [])

  const handleInitializeConfirm = useCallback(async () => {
    if (!initializePath) return
    const path = initializePath
    setInitializePath(null)
    const name = path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || 'MO Gallery Library'
    startOpening(path, copy.initialize)
    try {
      const snapshot = await localLibraryApi.initialize(path, name)
      handleOpened(snapshot)
    } catch (cause) {
      endOpening()
      toast.error(parseLocalLibraryError(cause).message)
    }
  }, [initializePath, copy.initialize, startOpening, endOpening])

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

  const initializeDialog = initializePath ? (
    <div className="fixed inset-0 z-[170] flex items-center justify-center bg-black/45 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="initialize-library-title" className="relative w-full max-w-md rounded-xl border bg-background p-5 shadow-2xl" style={{ borderColor: 'var(--border)' }}>
        <h2 id="initialize-library-title" className="text-base font-semibold">{copy.initializeConfirmTitle}</h2>
        <p className="mt-2 text-sm leading-6" style={{ color: 'var(--muted-foreground)' }}>{copy.initializeConfirmBody}</p>
        <p className="mt-3 truncate text-xs" style={{ color: 'var(--muted-foreground)' }} title={initializePath}>{initializePath}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={() => setInitializePath(null)} className="rounded-md border px-3 py-2 text-sm hover:bg-secondary">{copy.cancelAction}</button>
          <button type="button" onClick={() => void handleInitializeConfirm()} className="rounded-md px-3 py-2 text-sm" style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>{copy.initializeConfirm}</button>
        </div>
      </div>
    </div>
  ) : null

  if (error) {
    return <><div className="flex h-full items-center justify-center p-8"><div className="max-w-sm text-center"><p className="text-sm">{error}</p><button type="button" onClick={() => { toast.dismiss(); void loadEntry() }} className="mx-auto mt-4 flex items-center gap-2 rounded-md border px-3 py-2 text-xs hover:bg-secondary"><RefreshCw size={14} />{copy.retry}</button></div></div>{upgradeDialog}{initializeDialog}</>
  }

  if (snapshot) {
    return (
      <div className="relative h-full min-h-0">
        <LocalLibraryWorkbench copy={copy} snapshot={snapshot} onSnapshot={setSnapshot} onClose={handleClosed} selectionMode={selectionMode} existingAssetIds={existingAssetIds} onSelectionChange={onSelectionChange} />
        {initializing && (
          <LocalLibraryOpeningOverlay
            copy={copy}
            snapshot={snapshot}
            operationLabel={copy.initializingTitle}
            onContinueInBackground={() => { initializedSessions.current.add(snapshot.sessionId); setBackgroundedSession(snapshot.sessionId) }}
          />
        )}
        {upgradeDialog}
        {initializeDialog}
      </div>
    )
  }

  if (pendingPath) {
    const openingSnapshot = pendingSnapshot ?? {
      sessionId: '', libraryId: '', name: '', rootPath: pendingPath, state: 'open', assetCount: 0, missingCount: 0, trashCount: 0,
      scan: { state: 'running' as const, current: 0 },
    }
    return (
      <div className="relative h-full min-h-0">
        <LocalLibraryWelcome copy={copy} recent={entry.recent} onOpened={handleOpened} onRecentChanged={loadEntry} onUpgradeRequired={handleUpgradeRequired} onOpening={startOpening} onOpeningEnd={endOpening} onRequestInitialize={handleRequestInitialize} />
        <LocalLibraryOpeningOverlay copy={copy} snapshot={openingSnapshot} operationLabel={pendingLabel} />
        {upgradeDialog}
        {initializeDialog}
      </div>
    )
  }

  return <><LocalLibraryWelcome copy={copy} recent={entry.recent} onOpened={handleOpened} onRecentChanged={loadEntry} onUpgradeRequired={handleUpgradeRequired} onOpening={startOpening} onOpeningEnd={endOpening} onRequestInitialize={handleRequestInitialize} />{upgradeDialog}{initializeDialog}</>
}
