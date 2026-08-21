import { useEffect, useRef, useState } from 'react'
import { FilePenLine, FolderInput, Loader2, X } from 'lucide-react'
import { FolderTreeSelect } from './FolderTreeSelect'
import type { LocalLibraryCopy } from './copy'
import type { FolderItem, LocalAsset } from './types'

interface Props {
  mode: 'rename' | 'move'
  asset?: LocalAsset
  selectedCount: number
  folders: FolderItem[]
  copy: LocalLibraryCopy
  busy: boolean
  onClose: () => void
  onRename: (fileName: string) => void
  onMove: (destinationFolder: string) => void
}

export function AssetFileOperationDialog({ mode, asset, selectedCount, folders, copy, busy, onClose, onRename, onMove }: Props) {
  const [fileName, setFileName] = useState(asset?.fileName ?? '')
  const [destinationFolder, setDestinationFolder] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (mode === 'rename') {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [mode])

  const submit = () => {
    if (busy) return
    if (mode === 'rename') {
      const normalized = fileName.trim()
      if (normalized) onRename(normalized)
    } else {
      onMove(destinationFolder)
    }
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-5">
      <button type="button" aria-label={copy.cancelAction} className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="asset-file-operation-title" className="relative w-full max-w-md rounded-xl border bg-background p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary">{mode === 'rename' ? <FilePenLine size={17} /> : <FolderInput size={17} />}</span>
          <div className="min-w-0 flex-1">
            <h2 id="asset-file-operation-title" className="font-sans text-sm font-semibold">{mode === 'rename' ? copy.renameAssetTitle : copy.moveAssetsTitle}</h2>
            <p className="mt-1 truncate text-[11px] text-muted-foreground">{mode === 'rename' ? asset?.relativePath : `${selectedCount} ${copy.selectedItems}`}</p>
          </div>
          <button type="button" title={copy.cancelAction} aria-label={copy.cancelAction} onClick={onClose} disabled={busy} className="rounded-md p-1.5 hover:bg-secondary"><X size={15} /></button>
        </div>
        <form className="mt-5 space-y-4" onSubmit={(event) => { event.preventDefault(); submit() }}>
          {mode === 'rename' ? (
            <div>
              <label className="text-[11px] font-medium" htmlFor="local-library-asset-file-name">{copy.assetFileName}</label>
              <input ref={inputRef} id="local-library-asset-file-name" value={fileName} onChange={(event) => setFileName(event.target.value)} disabled={busy} className="mt-2 h-9 w-full rounded-md border bg-input px-3 text-xs outline-none focus:ring-1 focus:ring-ring" />
            </div>
          ) : (
            <div>
              <label className="text-[11px] font-medium">{copy.destinationFolder}</label>
              <div className="mt-2">
                <FolderTreeSelect
                  value={destinationFolder}
                  folders={folders}
                  placeholder={copy.root}
                  searchPlaceholder={copy.folderSearchPlaceholder}
                  searchEmpty={copy.folderSearchEmpty}
                  disabled={busy}
                  ariaLabel={copy.destinationFolder}
                  onChange={(value) => setDestinationFolder(value)}
                />
              </div>
            </div>
          )}
          <p className="text-[10px] leading-4 text-muted-foreground">{copy.assetMoveHint}</p>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} disabled={busy} className="rounded-md border px-3 py-2 text-xs hover:bg-secondary disabled:opacity-50">{copy.cancelAction}</button>
            <button type="submit" disabled={busy || (mode === 'rename' && !fileName.trim())} className="flex min-w-20 items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-xs text-primary-foreground disabled:opacity-50">
              {busy ? <Loader2 size={13} className="animate-spin" /> : null}{copy.moveAction}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
