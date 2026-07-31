import { AlertTriangle, Loader2, Trash2, X } from 'lucide-react'
import type { FolderTrashEntry } from './types'
import type { LocalLibraryCopy } from './copy'

export function PermanentDeleteFolderDialog({ entry, copy, busy, onClose, onConfirm }: {
  entry: FolderTrashEntry
  copy: LocalLibraryCopy
  busy: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-5">
      <button type="button" aria-label={copy.cancelAction} onClick={onClose} className="absolute inset-0 bg-black/60" />
      <div role="dialog" aria-modal="true" aria-labelledby="permanent-folder-title" className="relative w-full max-w-md rounded-xl border bg-background p-5 shadow-2xl">
        <button type="button" disabled={busy} onClick={onClose} className="absolute right-3 top-3 rounded-md p-1.5 hover:bg-secondary"><X size={15} /></button>
        <div className="flex gap-3 pr-7"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive"><AlertTriangle size={18} /></span><div><h2 id="permanent-folder-title" className="text-sm font-semibold">{copy.deleteFolderBatchConfirmTitle}</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">{copy.deleteFolderBatchConfirmBody}</p><p className="mt-2 break-all text-[10px]">{entry.originalPath}</p></div></div>
        <div className="mt-5 flex justify-end gap-2"><button type="button" disabled={busy} onClick={onClose} className="rounded-md border px-3 py-2 text-xs hover:bg-secondary disabled:opacity-50">{copy.cancelAction}</button><button type="button" disabled={busy} onClick={onConfirm} className="flex min-w-24 items-center justify-center gap-2 rounded-md bg-destructive px-3 py-2 text-xs text-destructive-foreground disabled:opacity-50">{busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}{copy.confirmPermanent}</button></div>
      </div>
    </div>
  )
}
