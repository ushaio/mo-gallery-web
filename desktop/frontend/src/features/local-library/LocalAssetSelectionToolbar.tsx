import { useEffect, useRef, useState } from 'react'
import { CheckSquare, FolderInput, Loader2, Settings2, Trash2, Upload, X } from 'lucide-react'
import type { LocalLibraryCopy } from './copy'

interface UploadSource {
  id: string
  name: string
  type?: string
}

interface Props {
  copy: LocalLibraryCopy
  selectedCount: number
  allLoadedSelected: boolean
  busy: boolean
  canSelectLoaded: boolean
  canUpload: boolean
  canMove: boolean
  canDelete: boolean
  uploadHint?: string
  moveHint?: string
  deleteHint?: string
  storageSources: UploadSource[]
  storageSourcesLoading: boolean
  onRefreshStorageSources: () => void
  onUploadSettings: () => void
  onUploadToStorage: (storageSourceId: string) => void
  onToggleSelectLoaded: () => void
  onMove: () => void
  onDelete: () => void
  onClear: () => void
}

export function LocalAssetSelectionToolbar({
  copy,
  selectedCount,
  allLoadedSelected,
  busy,
  canSelectLoaded,
  canUpload,
  canMove,
  canDelete,
  uploadHint,
  moveHint,
  deleteHint,
  storageSources,
  storageSourcesLoading,
  onRefreshStorageSources,
  onUploadSettings,
  onUploadToStorage,
  onToggleSelectLoaded,
  onMove,
  onDelete,
  onClear,
}: Props) {
  const [uploadMenuOpen, setUploadMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!uploadMenuOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setUploadMenuOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [uploadMenuOpen])

  return (
    <div className="pointer-events-none absolute bottom-14 left-1/2 z-30 -translate-x-1/2">
      <div className="pointer-events-auto flex items-center gap-0.5 rounded-lg border px-1.5 py-1.5 shadow-lg" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}>
        <span className="whitespace-nowrap px-2 text-xs font-medium">{copy.selectedCountLabel} {selectedCount.toLocaleString()}</span>
        <div className="mx-0.5 h-4 w-px" style={{ backgroundColor: 'var(--border)' }} />
        <button
          type="button"
          disabled={busy || !canSelectLoaded}
          onClick={onToggleSelectLoaded}
          title={allLoadedSelected ? copy.deselectLoaded : copy.selectLoaded}
          aria-label={allLoadedSelected ? copy.deselectLoaded : copy.selectLoaded}
          className="rounded-md p-1.5 transition-colors hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
          style={{ backgroundColor: allLoadedSelected ? 'var(--accent)' : 'transparent', color: allLoadedSelected ? 'var(--accent-foreground)' : 'var(--muted-foreground)' }}
        >
          <CheckSquare size={15} />
        </button>
        <div ref={menuRef} className="relative">
          <button
            type="button"
            disabled={busy || !canUpload}
            onClick={() => {
              if (!storageSourcesLoading && storageSources.length === 0) onRefreshStorageSources()
              setUploadMenuOpen((open) => !open)
            }}
            title={canUpload ? copy.uploadTo : uploadHint || copy.uploadSelectedUnavailable}
            aria-label={copy.uploadTo}
            aria-haspopup="menu"
            aria-expanded={uploadMenuOpen}
            className="rounded-md p-1.5 hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
            style={{ backgroundColor: uploadMenuOpen ? 'var(--accent)' : undefined, color: 'var(--muted-foreground)' }}
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
          </button>
          {uploadMenuOpen && canUpload && (
            <div role="menu" className="absolute bottom-full left-1/2 z-50 mb-2 min-w-52 -translate-x-1/2 overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-xl" style={{ borderColor: 'var(--border)' }}>
              <div className="px-2 py-1.5 text-[10px] font-medium text-muted-foreground">{copy.uploadTo}</div>
              <button type="button" role="menuitem" onClick={() => { setUploadMenuOpen(false); onUploadSettings() }} className="flex min-h-8 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent"><Settings2 size={14} />{copy.uploadSettings}</button>
              <div className="-mx-1 my-1 h-px bg-border" />
              {storageSourcesLoading ? (
                <div className="flex min-h-8 items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground"><Loader2 size={14} className="animate-spin" />{copy.loadingStorageSources}</div>
              ) : storageSources.length > 0 ? storageSources.map((source) => (
                <button key={source.id} type="button" role="menuitem" onClick={() => { setUploadMenuOpen(false); onUploadToStorage(source.id) }} className="flex min-h-8 w-full items-center rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent">
                  <span className="min-w-0 flex-1 truncate">{source.name}</span>
                  {source.type && <span className="ml-3 shrink-0 text-[10px] text-muted-foreground">{source.type}</span>}
                </button>
              )) : (
                <div className="px-2 py-2 text-xs text-muted-foreground">{copy.noStorageSources}</div>
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          disabled={busy || !canMove}
          onClick={onMove}
          title={canMove ? copy.moveAssetsToFolder : moveHint || copy.moveSelectedUnavailable}
          aria-label={copy.moveAssetsToFolder}
          className="rounded-md p-1.5 hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
          style={{ color: 'var(--muted-foreground)' }}
        >
          <FolderInput size={15} />
        </button>
        <button
          type="button"
          disabled={busy || !canDelete}
          onClick={onDelete}
          title={canDelete ? copy.deleteSelected : deleteHint || copy.deleteSelectedUnavailable}
          aria-label={copy.deleteSelected}
          className="rounded-md p-1.5 hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
          style={{ color: 'var(--destructive)' }}
        >
          <Trash2 size={15} />
        </button>
        <div className="mx-0.5 h-4 w-px" style={{ backgroundColor: 'var(--border)' }} />
        <button
          type="button"
          disabled={busy}
          onClick={onClear}
          title={`${copy.clearSelection} (Esc)`}
          aria-label={copy.clearSelection}
          className="rounded-md p-1.5 hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
          style={{ color: 'var(--muted-foreground)' }}
        >
          <X size={15} />
        </button>
      </div>
    </div>
  )
}
