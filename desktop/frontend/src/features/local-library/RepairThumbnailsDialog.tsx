import { ImageOff, RefreshCw, X } from 'lucide-react'
import type { LocalLibraryCopy } from './copy'

export function RepairThumbnailsDialog({ copy, busy, onClose, onMissing, onRebuildAll }: {
  copy: LocalLibraryCopy
  busy: boolean
  onClose: () => void
  onMissing: () => void
  onRebuildAll: () => void
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-5">
      <button type="button" aria-label={copy.cancelAction} onClick={onClose} className="absolute inset-0 bg-black/60" />
      <div className="relative w-full max-w-md rounded-xl border bg-popover p-5 shadow-2xl" style={{ borderColor: 'var(--border)' }}>
        <button type="button" aria-label={copy.cancelAction} onClick={onClose} disabled={busy} className="absolute right-3 top-3 rounded-md p-2 hover:bg-secondary disabled:opacity-50"><X size={16} /></button>
        <div className="pr-8">
          <h2 className="font-sans text-base font-medium">{copy.repairThumbnailsTitle}</h2>
          <p className="mt-1 text-xs leading-5" style={{ color: 'var(--muted-foreground)' }}>{copy.repairThumbnailsBody}</p>
        </div>
        <div className="mt-5 space-y-2">
          <button type="button" disabled={busy} onClick={onMissing} className="flex w-full items-start gap-3 rounded-lg border p-3 text-left hover:bg-secondary disabled:opacity-50" style={{ borderColor: 'var(--border)' }}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary"><ImageOff size={16} /></span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{copy.repairMissingThumbnails}</span>
              <span className="mt-0.5 block text-xs leading-4" style={{ color: 'var(--muted-foreground)' }}>{copy.repairMissingThumbnailsHint}</span>
            </span>
          </button>
          <button type="button" disabled={busy} onClick={onRebuildAll} className="flex w-full items-start gap-3 rounded-lg border p-3 text-left hover:bg-secondary disabled:opacity-50" style={{ borderColor: 'var(--border)' }}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary"><RefreshCw size={16} /></span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{copy.rebuildAllThumbnails}</span>
              <span className="mt-0.5 block text-xs leading-4" style={{ color: 'var(--muted-foreground)' }}>{copy.rebuildAllThumbnailsHint}</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}