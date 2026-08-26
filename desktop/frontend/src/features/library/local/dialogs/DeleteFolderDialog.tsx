import { useState } from 'react'
import { AlertTriangle, ArchiveRestore, Loader2, Trash2, X } from 'lucide-react'
import type { FolderDeletionPreview } from '../types'
import type { LocalLibraryCopy } from '../copy'

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`
  return `${(value / 1024 ** 3).toFixed(1)} GB`
}

interface Props {
  name: string
  copy: LocalLibraryCopy
  preview?: FolderDeletionPreview
  loading: boolean
  error?: string
  busy: boolean
  onClose: () => void
  onTrash: () => void
  onPermanent: () => void
}

export function DeleteFolderDialog({ name, copy, preview, loading, error, busy, onClose, onTrash, onPermanent }: Props) {
  const [confirmingPermanent, setConfirmingPermanent] = useState(false)
  const disabled = busy || loading || !preview

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-5">
      <button type="button" aria-label={copy.cancelAction} className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="delete-folder-title" className="relative w-full max-w-lg rounded-xl border bg-background p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive"><Trash2 size={17} /></span>
          <div className="min-w-0 flex-1">
            <h2 id="delete-folder-title" className="font-sans text-sm font-semibold">{copy.deleteFolderTitle}</h2>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{copy.deleteFolderBody.replace('{name}', name)}</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-md p-1.5 hover:bg-secondary"><X size={15} /></button>
        </div>

        <div className="mt-4 rounded-lg border bg-card p-3">
          {loading ? (
            <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground"><Loader2 size={14} className="animate-spin" />{copy.folderDeleteCalculating}</div>
          ) : error ? (
            <p className="py-3 text-xs text-destructive">{error}</p>
          ) : preview ? (
            <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
              <div><dt className="text-muted-foreground">{copy.managedAssets}</dt><dd className="mt-1 font-medium">{preview.managedAssetCount.toLocaleString()}</dd></div>
              <div><dt className="text-muted-foreground">{copy.otherFiles}</dt><dd className="mt-1 font-medium">{preview.otherFileCount.toLocaleString()}</dd></div>
              <div><dt className="text-muted-foreground">{copy.directoryCount}</dt><dd className="mt-1 font-medium">{preview.directoryCount.toLocaleString()}</dd></div>
              <div><dt className="text-muted-foreground">{copy.totalSize}</dt><dd className="mt-1 font-medium">{formatBytes(preview.totalBytes)}</dd></div>
            </dl>
          ) : null}
        </div>

        {confirmingPermanent ? (
          <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
            <div className="flex gap-3"><AlertTriangle size={18} className="mt-0.5 shrink-0 text-destructive" /><div><p className="text-xs font-medium">{copy.folderPermanentConfirmTitle}</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">{copy.folderPermanentConfirmBody}</p></div></div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" disabled={busy} onClick={() => setConfirmingPermanent(false)} className="rounded-md border px-3 py-2 text-xs hover:bg-secondary disabled:opacity-50">{copy.back}</button>
              <button type="button" disabled={busy} onClick={onPermanent} className="flex min-w-24 items-center justify-center gap-2 rounded-md bg-destructive px-3 py-2 text-xs text-destructive-foreground disabled:opacity-50">{busy ? <Loader2 size={13} className="animate-spin" /> : null}{copy.confirmPermanent}</button>
            </div>
          </div>
        ) : (
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <button type="button" disabled={disabled} onClick={onTrash} className="flex items-start gap-3 rounded-lg border p-4 text-left hover:bg-secondary disabled:opacity-50"><ArchiveRestore size={18} className="mt-0.5 shrink-0" /><span><span className="block text-xs font-medium">{copy.moveFolderToTrash}</span><span className="mt-1 block text-[10px] text-muted-foreground">{copy.moveFolderToTrashHint}</span></span></button>
            <button type="button" disabled={disabled} onClick={() => setConfirmingPermanent(true)} className="flex items-start gap-3 rounded-lg border p-4 text-left text-destructive hover:bg-secondary disabled:opacity-50"><Trash2 size={18} className="mt-0.5 shrink-0" /><span><span className="block text-xs font-medium">{copy.permanentlyDeleteFolder}</span><span className="mt-1 block text-[10px]">{copy.permanentFolderHint}</span></span></button>
          </div>
        )}
      </div>
    </div>
  )
}
