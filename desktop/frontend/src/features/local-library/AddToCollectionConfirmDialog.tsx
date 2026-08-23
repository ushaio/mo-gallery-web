import { FolderHeart, Loader2, X } from 'lucide-react'
import type { LocalLibraryCopy } from './copy'

interface Props {
  assetCount: number
  collectionName: string
  copy: LocalLibraryCopy
  busy: boolean
  onConfirm: () => void
  onClose: () => void
}

export function AddToCollectionConfirmDialog({ assetCount, collectionName, copy, busy, onConfirm, onClose }: Props) {
  const body = copy.addToCollectionBody
    .replace('{count}', String(assetCount))
    .replace('{name}', collectionName)
  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-5">
      <button type="button" aria-label={copy.cancelAction} className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} disabled={busy} />
      <div role="dialog" aria-modal="true" className="relative w-full max-w-sm rounded-xl border bg-background p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary"><FolderHeart size={17} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">{copy.addToCollectionTitle}</h2>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{body}</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-md p-1.5 hover:bg-secondary"><X size={15} /></button>
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-md border px-3 py-2 text-xs hover:bg-secondary disabled:opacity-50">{copy.cancelAction}</button>
          <button type="button" onClick={onConfirm} disabled={busy} className="flex min-w-16 items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-xs text-primary-foreground disabled:opacity-50">
            {busy ? <Loader2 size={13} className="animate-spin" /> : null}{copy.confirmAdd}
          </button>
        </div>
      </div>
    </div>
  )
}