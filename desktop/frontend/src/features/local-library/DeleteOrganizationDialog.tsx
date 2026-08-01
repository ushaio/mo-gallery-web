import { Loader2, Trash2, X } from 'lucide-react'
import type { LocalLibraryCopy } from './copy'

interface Props {
  title: string
  body: string
  copy: LocalLibraryCopy
  busy: boolean
  dangerousLabel: string
  secondaryLabel?: string
  onClose: () => void
  onConfirm: (deleteContents: boolean) => void
}

export function DeleteOrganizationDialog({ title, body, copy, busy, dangerousLabel, secondaryLabel, onClose, onConfirm }: Props) {
  return <div className="fixed inset-0 z-[130] flex items-center justify-center p-5"><button type="button" aria-label={copy.cancelAction} className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} /><div role="dialog" aria-modal="true" className="relative w-full max-w-sm rounded-xl border bg-background p-5 shadow-2xl"><div className="flex items-start gap-3"><span className="flex size-9 items-center justify-center rounded-lg bg-destructive/10 text-destructive"><Trash2 size={17} /></span><div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">{title}</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">{body}</p></div><button type="button" onClick={onClose} disabled={busy} className="rounded-md p-1.5 hover:bg-secondary"><X size={15} /></button></div><div className="mt-5 flex flex-wrap justify-end gap-2"><button type="button" onClick={onClose} disabled={busy} className="rounded-md border px-3 py-2 text-xs hover:bg-secondary">{copy.cancelAction}</button>{secondaryLabel && <button type="button" onClick={() => onConfirm(false)} disabled={busy} className="rounded-md border px-3 py-2 text-xs hover:bg-secondary">{secondaryLabel}</button>}<button type="button" onClick={() => onConfirm(true)} disabled={busy} className="flex items-center gap-2 rounded-md bg-destructive px-3 py-2 text-xs text-destructive-foreground disabled:opacity-50">{busy && <Loader2 size={13} className="animate-spin" />}{dangerousLabel}</button></div></div></div>
}
