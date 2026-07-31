import { AlertTriangle, Trash2, X } from 'lucide-react'
import type { LocalAsset } from './types'
import type { LocalLibraryCopy } from './copy'

export function RemoveMissingAssetDialog({ asset, copy, busy, onClose, onConfirm }: {
  asset: LocalAsset
  copy: LocalLibraryCopy
  busy: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-5">
      <button type="button" aria-label={copy.cancelAction} onClick={onClose} className="absolute inset-0 bg-black/60" />
      <div className="relative w-full max-w-md rounded-xl border bg-popover p-5 shadow-2xl" style={{ borderColor: 'var(--border)' }}>
        <button type="button" aria-label={copy.cancelAction} onClick={onClose} disabled={busy} className="absolute right-3 top-3 rounded-md p-2 hover:bg-secondary disabled:opacity-50"><X size={16} /></button>
        <div className="flex gap-4 pr-8">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary"><AlertTriangle size={19} style={{ color: 'var(--destructive)' }} /></span>
          <div className="min-w-0">
            <h2 className="font-sans text-base font-medium">{copy.removeMissingTitle}</h2>
            <p className="mt-2 text-xs leading-5" style={{ color: 'var(--muted-foreground)' }}>{copy.removeMissingBody}</p>
            <p className="mt-2 truncate text-xs">{asset.fileName}</p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" disabled={busy} onClick={onClose} className="rounded-md border px-4 py-2 text-xs hover:bg-secondary disabled:opacity-50">{copy.cancelAction}</button>
          <button type="button" disabled={busy} onClick={onConfirm} className="flex items-center gap-2 rounded-md px-4 py-2 text-xs text-white disabled:opacity-50" style={{ backgroundColor: 'var(--destructive)' }}><Trash2 size={14} />{copy.removeMissingRecord}</button>
        </div>
      </div>
    </div>
  )
}
