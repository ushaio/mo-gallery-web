import { useEffect, useRef, useState } from 'react'
import { CheckSquare, FolderInput, Loader2, Pencil, Settings2, Trash2, Upload, X } from 'lucide-react'
import { LibrarySelectionBar, LibrarySelectionButton } from '@/components/ui/library'
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
  canEdit: boolean
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
  onEdit: () => void
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
  canEdit,
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
  onEdit,
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
    <div className="pointer-events-none absolute bottom-16 left-1/2 z-30 -translate-x-1/2">
      <LibrarySelectionBar countLabel={`${copy.selectedCountLabel} ${selectedCount.toLocaleString()}`}>
        {canEdit && <LibrarySelectionButton icon={Pencil} label={copy.batchEdit} title={copy.batchEdit} disabled={busy} onClick={onEdit} />}
        <LibrarySelectionButton
          icon={CheckSquare}
          label={allLoadedSelected ? copy.deselectLoaded : copy.selectLoaded}
          title={allLoadedSelected ? copy.deselectLoaded : copy.selectLoaded}
          disabled={busy || !canSelectLoaded}
          active={allLoadedSelected}
          onClick={onToggleSelectLoaded}
        />
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
        <LibrarySelectionButton
          icon={FolderInput}
          label={canMove ? copy.moveAssetsToFolder : moveHint || copy.moveSelectedUnavailable}
          title={canMove ? copy.moveAssetsToFolder : moveHint || copy.moveSelectedUnavailable}
          disabled={busy || !canMove}
          onClick={onMove}
        />
        <LibrarySelectionButton
          icon={Trash2}
          label={canDelete ? copy.deleteSelected : deleteHint || copy.deleteSelectedUnavailable}
          title={canDelete ? copy.deleteSelected : deleteHint || copy.deleteSelectedUnavailable}
          intent="destructive"
          disabled={busy || !canDelete}
          onClick={onDelete}
        />
        <div className="mx-0.5 h-4 w-px" style={{ backgroundColor: 'var(--border)' }} />
        <LibrarySelectionButton
          icon={X}
          label={`${copy.clearSelection} (Esc)`}
          title={`${copy.clearSelection} (Esc)`}
          disabled={busy}
          onClick={onClear}
        />
      </LibrarySelectionBar>
    </div>
  )
}
