import { AlertTriangle, ArchiveRestore, FileQuestion, Trash2, X } from 'lucide-react'
import type { AssetAvailability } from './types'
import type { LocalLibraryCopy } from './copy'

interface Props {
  open: boolean
  availability: AssetAvailability
  selectedCount: number
  uploadedCount: number
  folderBatchCount: number
  busy: boolean
  copy: LocalLibraryCopy
  onClose: () => void
  onConfirm: () => void
}

export function DeleteAssetsDialog({
  open,
  availability,
  selectedCount,
  uploadedCount,
  folderBatchCount,
  busy,
  copy,
  onClose,
  onConfirm,
}: Props) {
  if (!open) return null

  const isTrashed = availability === 'trashed'
  const isMissing = availability === 'missing'
  const title = isTrashed ? copy.batchPermanentDeleteTitle : isMissing ? copy.batchRemoveMissingTitle : copy.batchTrashTitle
  const body = isTrashed ? copy.batchPermanentDeleteBody : isMissing ? copy.batchRemoveMissingBody : copy.batchTrashBody
  const confirmLabel = isTrashed ? copy.confirmPermanent : isMissing ? copy.removeMissingRecord : copy.moveToTrash
  const Icon = isMissing ? FileQuestion : isTrashed ? Trash2 : ArchiveRestore

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-5">
      <button type="button" aria-label={copy.cancelAction} disabled={busy} onClick={onClose} className="absolute inset-0 bg-black/60 disabled:cursor-wait" />
      <div className="relative w-full max-w-lg rounded-xl border bg-popover p-5 shadow-2xl" style={{ borderColor: 'var(--border)' }}>
        <button type="button" disabled={busy} onClick={onClose} className="absolute right-3 top-3 rounded-md p-2 hover:bg-secondary disabled:opacity-50"><X size={16} /></button>
        <div className="flex gap-4 pr-8">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary"><Icon size={19} style={{ color: isMissing ? 'var(--foreground)' : 'var(--destructive)' }} /></span>
          <div className="min-w-0">
            <h2 className="font-sans text-base font-medium">{title}</h2>
            <p className="mt-2 text-xs leading-5" style={{ color: 'var(--muted-foreground)' }}>{body.replace('{count}', selectedCount.toLocaleString())}</p>
          </div>
        </div>

        {availability === 'active' && uploadedCount > 0 && (
          <div className="mt-4 flex gap-2 rounded-lg border border-sky-500/35 bg-sky-500/5 p-3 text-[10px] leading-4 text-muted-foreground">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-sky-600" />
            <span>{copy.batchTrashUploadedHint.replace('{count}', uploadedCount.toLocaleString())}</span>
          </div>
        )}
        {isTrashed && folderBatchCount > 0 && (
          <div className="mt-4 flex gap-2 rounded-lg border border-amber-500/35 bg-amber-500/10 p-3 text-[10px] leading-4 text-amber-700 dark:text-amber-300">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>{copy.batchFolderTrashHint.replace('{count}', folderBatchCount.toLocaleString())}</span>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" disabled={busy} onClick={onClose} className="rounded-md border px-3 py-2 text-xs hover:bg-secondary disabled:opacity-50">{copy.cancelAction}</button>
          <button type="button" disabled={busy} onClick={onConfirm} className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs disabled:opacity-50 ${isMissing ? 'bg-primary text-primary-foreground' : 'bg-destructive text-destructive-foreground'}`}>
            {busy ? <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Icon size={13} />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
