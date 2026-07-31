import { useEffect, useRef, useState } from 'react'
import { FolderPlus, Loader2, X } from 'lucide-react'
import type { LocalLibraryCopy } from './copy'

interface Props {
  parentName: string
  copy: LocalLibraryCopy
  busy: boolean
  onClose: () => void
  onCreate: (name: string) => void
}

export function CreateFolderDialog({ parentName, copy, busy, onClose, onCreate }: Props) {
  const [name, setName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const submit = () => {
    const normalized = name.trim()
    if (normalized && !busy) onCreate(normalized)
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-5">
      <button type="button" aria-label={copy.cancelAction} className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="create-folder-title" className="relative w-full max-w-sm rounded-xl border bg-background p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary"><FolderPlus size={17} /></span>
          <div className="min-w-0 flex-1">
            <h2 id="create-folder-title" className="font-sans text-sm font-semibold">{copy.createFolderTitle}</h2>
            <p className="mt-1 truncate text-[11px] text-muted-foreground">{parentName}</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-md p-1.5 hover:bg-secondary"><X size={15} /></button>
        </div>
        <form className="mt-5" onSubmit={(event) => { event.preventDefault(); submit() }}>
          <label className="text-[11px] font-medium" htmlFor="local-library-folder-name">{copy.folderName}</label>
          <input
            ref={inputRef}
            id="local-library-folder-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={copy.createFolderPlaceholder}
            disabled={busy}
            className="mt-2 h-9 w-full rounded-md border bg-input px-3 text-xs outline-none focus:ring-1 focus:ring-ring"
          />
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={onClose} disabled={busy} className="rounded-md border px-3 py-2 text-xs hover:bg-secondary disabled:opacity-50">{copy.cancelAction}</button>
            <button type="submit" disabled={busy || !name.trim()} className="flex min-w-20 items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-xs text-primary-foreground disabled:opacity-50">
              {busy ? <Loader2 size={13} className="animate-spin" /> : null}{copy.createAction}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
