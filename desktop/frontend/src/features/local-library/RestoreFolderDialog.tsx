import { ArchiveRestore, Loader2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { FolderItem, FolderTrashEntry } from './types'
import type { LocalLibraryCopy } from './copy'

interface Props {
  entry: FolderTrashEntry
  folders: FolderItem[]
  copy: LocalLibraryCopy
  busy: boolean
  onClose: () => void
  onConfirm: (destinationParent: string, topLevelName: string) => void
}

export function RestoreFolderDialog({ entry, folders, copy, busy, onClose, onConfirm }: Props) {
  const originalParent = useMemo(() => {
    const index = entry.originalPath.lastIndexOf('/')
    return index < 0 ? '' : entry.originalPath.slice(0, index)
  }, [entry.originalPath])
  const originalParentExists = originalParent === '' || folders.some((folder) => folder.relativePath === originalParent)
  const [destinationParent, setDestinationParent] = useState(originalParentExists ? originalParent : '')
  const [topLevelName, setTopLevelName] = useState(entry.name)
  const valid = topLevelName.trim().length > 0

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-5">
      <button type="button" aria-label={copy.cancelAction} onClick={onClose} className="absolute inset-0 bg-black/60" />
      <div role="dialog" aria-modal="true" aria-labelledby="restore-folder-title" className="relative w-full max-w-md rounded-xl border bg-background p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary"><ArchiveRestore size={17} /></span>
          <div className="min-w-0 flex-1"><h2 id="restore-folder-title" className="text-sm font-semibold">{copy.restoreFolderBatch}</h2><p className="mt-1 break-all text-[10px] text-muted-foreground">{entry.originalPath}</p></div>
          <button type="button" disabled={busy} onClick={onClose} className="rounded-md p-1.5 hover:bg-secondary"><X size={15} /></button>
        </div>
        <div className="mt-5 space-y-4">
          <label className="block text-xs"><span className="mb-1.5 block text-muted-foreground">{copy.restoreDestination}</span><select value={destinationParent} onChange={(event) => setDestinationParent(event.target.value)} className="h-9 w-full rounded-md border bg-input px-2.5 outline-none"><option value="">{copy.root}</option>{folders.map((folder) => <option key={folder.id} value={folder.relativePath}>{folder.relativePath}</option>)}</select></label>
          <label className="block text-xs"><span className="mb-1.5 block text-muted-foreground">{copy.folderName}</span><input value={topLevelName} onChange={(event) => setTopLevelName(event.target.value)} className="h-9 w-full rounded-md border bg-input px-2.5 outline-none" /></label>
          {!originalParentExists && <p className="rounded-md border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-[10px] leading-4 text-amber-700 dark:text-amber-300">{copy.originalParentMissing}</p>}
          <p className="text-[10px] text-muted-foreground">{copy.restoreConflictHint}</p>
        </div>
        <div className="mt-5 flex justify-end gap-2"><button type="button" disabled={busy} onClick={onClose} className="rounded-md border px-3 py-2 text-xs hover:bg-secondary disabled:opacity-50">{copy.cancelAction}</button><button type="button" disabled={busy || !valid} onClick={() => onConfirm(destinationParent, topLevelName.trim())} className="flex min-w-24 items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-xs text-primary-foreground disabled:opacity-50">{busy ? <Loader2 size={13} className="animate-spin" /> : null}{copy.restoreFolderBatch}</button></div>
      </div>
    </div>
  )
}
