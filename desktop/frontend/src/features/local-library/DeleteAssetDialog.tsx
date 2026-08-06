import { useState } from 'react'
import { AlertTriangle, ArchiveRestore, Trash2, X } from 'lucide-react'
import type { LocalAsset } from './types'
import type { LocalLibraryCopy } from './copy'

export function DeleteAssetDialog({ asset, copy, busy, onClose, onTrash, onRestore, onPermanent, onDeleteCloud, onDeleteCloudAndLocal }: {
  asset: LocalAsset
  copy: LocalLibraryCopy
  busy: boolean
  onClose: () => void
  onTrash: () => void
  onRestore: () => void
  onPermanent: () => void
  onDeleteCloud: () => void
  onDeleteCloudAndLocal: () => void
}) {
  const [confirmingPermanent, setConfirmingPermanent] = useState(false)
  const [confirmingCloudAndLocal, setConfirmingCloudAndLocal] = useState(false)
  const isTrashed = asset.availability === 'trashed'
  const title = isTrashed ? copy.trashedAssetTitle : copy.deleteTitle
  const body = isTrashed ? copy.trashedAssetBody : asset.isUploaded ? copy.uploadedDeleteBody : copy.deleteBody

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-5">
      <button type="button" aria-label={copy.cancelAction} disabled={busy} onClick={onClose} className="absolute inset-0 bg-black/60 disabled:cursor-wait" />
      <div className="relative w-full max-w-lg rounded-xl border bg-popover p-5 shadow-2xl" style={{ borderColor: 'var(--border)' }}>
        <button type="button" disabled={busy} onClick={onClose} className="absolute right-3 top-3 rounded-md p-2 hover:bg-secondary disabled:opacity-50"><X size={16} /></button>
        <div className="flex gap-4 pr-8">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary"><AlertTriangle size={19} style={{ color: 'var(--destructive)' }} /></span>
          <div className="min-w-0">
            <h2 className="font-sans text-base font-medium">{title}</h2>
            <p className="mt-2 text-xs leading-5" style={{ color: 'var(--muted-foreground)' }}>{body}</p>
            <p className="mt-2 truncate text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{asset.fileName}</p>
          </div>
        </div>

        {confirmingPermanent ? (
          <div className="mt-6 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
            <p className="text-xs font-medium text-destructive">{asset.trashEntryKind === 'folder' ? copy.deleteFolderBatchConfirmTitle : copy.confirmPermanent}</p>
            <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{asset.trashEntryKind === 'folder' ? copy.deleteFolderBatchConfirmBody : copy.permanentOption}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" disabled={busy} onClick={() => setConfirmingPermanent(false)} className="rounded-md border px-3 py-2 text-xs hover:bg-secondary disabled:opacity-50">{copy.cancelAction}</button>
              <button type="button" disabled={busy} onClick={onPermanent} className="rounded-md bg-destructive px-3 py-2 text-xs text-destructive-foreground disabled:opacity-50">{copy.confirmPermanent}</button>
            </div>
          </div>
        ) : confirmingCloudAndLocal ? (
          <div className="mt-6 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
            <p className="text-xs font-medium text-destructive">{copy.deleteCloudAndLocal}</p>
            <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{copy.deleteCloudAndLocalHint}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" disabled={busy} onClick={() => setConfirmingCloudAndLocal(false)} className="rounded-md border px-3 py-2 text-xs hover:bg-secondary disabled:opacity-50">{copy.cancelAction}</button>
              <button type="button" disabled={busy} onClick={onDeleteCloudAndLocal} className="rounded-md bg-destructive px-3 py-2 text-xs text-destructive-foreground disabled:opacity-50">{copy.deleteCloudAndLocal}</button>
            </div>
          </div>
        ) : isTrashed ? (
          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            <button type="button" disabled={busy} onClick={onRestore} className="flex items-start gap-3 rounded-lg border p-4 text-left hover:bg-secondary disabled:opacity-50"><ArchiveRestore size={18} className="mt-0.5 shrink-0" /><span><span className="block text-xs font-medium">{copy.restoreTrashedAsset}</span><span className="mt-1 block text-[10px] text-muted-foreground">{copy.restore}</span></span></button>
            <button type="button" disabled={busy} onClick={() => setConfirmingPermanent(true)} className="flex items-start gap-3 rounded-lg border p-4 text-left text-destructive hover:bg-secondary disabled:opacity-50"><Trash2 size={18} className="mt-0.5 shrink-0" /><span><span className="block text-xs font-medium">{copy.permanentOption}</span><span className="mt-1 block text-[10px]">{copy.confirmPermanent}</span></span></button>
          </div>
        ) : (
          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            <button type="button" disabled={busy} onClick={onTrash} className="flex items-start gap-3 rounded-lg border p-4 text-left hover:bg-secondary disabled:opacity-50"><ArchiveRestore size={18} className="mt-0.5 shrink-0" /><span><span className="block text-xs font-medium">{asset.isUploaded ? copy.deleteLocalOnly : copy.trashOption}</span><span className="mt-1 block text-[10px] text-muted-foreground">{asset.isUploaded ? copy.deleteLocalOnlyHint : copy.deleteBody}</span></span></button>
            <button type="button" disabled={busy} onClick={() => setConfirmingPermanent(true)} className="flex items-start gap-3 rounded-lg border p-4 text-left hover:bg-secondary disabled:opacity-50" style={{ color: 'var(--destructive)' }}><Trash2 size={18} /><span><span className="block text-xs font-medium">{copy.permanentOption}</span><span className="mt-1 block text-[10px]">{copy.confirmPermanent}</span></span></button>
            {asset.isUploaded && <button type="button" disabled={busy} onClick={onDeleteCloud} className="flex items-start gap-3 rounded-lg border border-sky-500/40 p-4 text-left hover:bg-secondary disabled:opacity-50"><Trash2 size={18} className="mt-0.5 shrink-0 text-sky-600" /><span><span className="block text-xs font-medium">{copy.deleteCloudOnly}</span><span className="mt-1 block text-[10px] text-muted-foreground">{copy.deleteCloudOnlyHint}</span></span></button>}
            {asset.isUploaded && <button type="button" disabled={busy} onClick={() => setConfirmingCloudAndLocal(true)} className="flex items-start gap-3 rounded-lg border border-destructive/40 p-4 text-left text-destructive hover:bg-secondary disabled:opacity-50"><Trash2 size={18} className="mt-0.5 shrink-0" /><span><span className="block text-xs font-medium">{copy.deleteCloudAndLocal}</span><span className="mt-1 block text-[10px]">{copy.deleteCloudAndLocalHint}</span></span></button>}
          </div>
        )}
      </div>
    </div>
  )
}
