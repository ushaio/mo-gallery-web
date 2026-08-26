import { ArchiveRestore, FolderArchive, Loader2, Trash2 } from 'lucide-react'
import type { FolderTrashEntry } from '../types'
import type { LocalLibraryCopy } from '../copy'

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`
  return `${(value / 1024 ** 3).toFixed(1)} GB`
}

interface Props {
  entries: FolderTrashEntry[]
  copy: LocalLibraryCopy
  loading: boolean
  busyId?: string
  onRestore: (entry: FolderTrashEntry) => void
  onPermanentDelete: (entry: FolderTrashEntry) => void
}

export function FolderTrashSection({ entries, copy, loading, busyId, onRestore, onPermanentDelete }: Props) {
  if (!loading && entries.length === 0) return null

  return (
    <section className="shrink-0 border-b bg-card/55 px-4 py-3" style={{ borderColor: 'var(--border)' }}>
      <div className="mb-2 flex items-center gap-2">
        <FolderArchive size={14} />
        <h2 className="text-xs font-medium">{copy.folderTrashBatches}</h2>
        {loading ? <Loader2 size={12} className="animate-spin text-muted-foreground" /> : <span className="text-[10px] text-muted-foreground">{entries.length}</span>}
      </div>
      {entries.length > 0 ? (
        <div className="custom-scrollbar flex max-h-48 gap-3 overflow-x-auto pb-1">
          {entries.map((entry) => {
            const busy = busyId === entry.id
            return (
              <article key={entry.id} className="w-80 shrink-0 rounded-lg border bg-background p-3">
                <div className="flex items-start gap-2">
                  <FolderArchive size={17} className="mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-xs font-medium">{entry.name}</h3>
                    <p className="mt-1 truncate text-[10px] text-muted-foreground" title={entry.originalPath}>{entry.originalPath}</p>
                  </div>
                </div>
                <dl className="mt-3 grid grid-cols-4 gap-2 text-[10px]">
                  <div><dt className="text-muted-foreground">{copy.managedAssets}</dt><dd className="mt-0.5">{entry.managedAssetCount.toLocaleString()}</dd></div>
                  <div><dt className="text-muted-foreground">{copy.otherFiles}</dt><dd className="mt-0.5">{entry.otherFileCount.toLocaleString()}</dd></div>
                  <div><dt className="text-muted-foreground">{copy.directoryCount}</dt><dd className="mt-0.5">{entry.directoryCount.toLocaleString()}</dd></div>
                  <div><dt className="text-muted-foreground">{copy.totalSize}</dt><dd className="mt-0.5">{formatBytes(entry.totalBytes)}</dd></div>
                </dl>
                <div className="mt-3 flex gap-2">
                  <button type="button" disabled={Boolean(busyId)} onClick={() => onRestore(entry)} className="flex flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[10px] hover:bg-secondary disabled:opacity-50">{busy ? <Loader2 size={11} className="animate-spin" /> : <ArchiveRestore size={12} />}{copy.restoreFolderBatch}</button>
                  <button type="button" disabled={Boolean(busyId)} onClick={() => onPermanentDelete(entry)} className="flex flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[10px] text-destructive hover:bg-secondary disabled:opacity-50"><Trash2 size={12} />{copy.deleteFolderBatch}</button>
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <p className="py-2 text-[10px] text-muted-foreground">{copy.folderTrashEmpty}</p>
      )}
    </section>
  )
}
