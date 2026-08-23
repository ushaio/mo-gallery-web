import { useEffect, useMemo, useRef, useState } from 'react'
import { FolderInput, Loader2, X } from 'lucide-react'
import { FolderTreeSelect } from './FolderTreeSelect'
import type { LocalLibraryCopy } from './copy'
import type { FolderFileOperationPlan, FolderItem } from './types'

interface Props {
  mode: 'rename' | 'move'
  relativePath: string
  currentName: string
  folders: FolderItem[]
  copy: LocalLibraryCopy
  busy: boolean
  plan?: FolderFileOperationPlan
  /** 拖拽移动场景下预设的目标文件夹（相对路径，空字符串表示资源库根目录）。
   *  提供时目标位置只读展示，不再显示目录选择器。 */
  initialDestinationParent?: string
  onClose: () => void
  onConfirm: (destinationParent: string, topLevelName: string) => void
  onExecute: () => void
}

export function MoveFolderDialog({ mode, relativePath, currentName, folders, copy, busy, plan, initialDestinationParent, onClose, onConfirm, onExecute }: Props) {
  const currentParent = relativePath.includes('/') ? relativePath.slice(0, relativePath.lastIndexOf('/')) : ''
  const [name, setName] = useState(currentName)
  const [destinationParent, setDestinationParent] = useState(initialDestinationParent ?? currentParent)
  const inputRef = useRef<HTMLInputElement>(null)
  const destinations = useMemo(() => folders.filter((folder) => (
    folder.relativePath !== relativePath && !folder.relativePath.startsWith(`${relativePath}/`)
  )), [folders, relativePath])

  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select() }, [])

  const submit = () => {
    const normalized = name.trim()
    if (plan) onExecute()
    else if (normalized && !busy) onConfirm(destinationParent, normalized)
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-5">
      <button type="button" aria-label={copy.cancelAction} className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="move-folder-title" className="relative w-full max-w-md rounded-xl border bg-background p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary"><FolderInput size={17} /></span>
          <div className="min-w-0 flex-1">
            <h2 id="move-folder-title" className="font-sans text-sm font-semibold">{mode === 'rename' ? copy.renameFolderTitle : copy.moveFolderTitle}</h2>
            <p className="mt-1 truncate text-[11px] text-muted-foreground">{relativePath}</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-md p-1.5 hover:bg-secondary"><X size={15} /></button>
        </div>
        <form className="mt-5 space-y-4" onSubmit={(event) => { event.preventDefault(); submit() }}>
          {mode === 'rename' ? (
            <div>
              <label className="text-[11px] font-medium" htmlFor="local-library-move-folder-name">{copy.folderName}</label>
              <input ref={inputRef} id="local-library-move-folder-name" value={name} onChange={(event) => setName(event.target.value)} disabled={busy}
                className="mt-2 h-9 w-full rounded-md border bg-input px-3 text-xs outline-none focus:ring-1 focus:ring-ring" />
            </div>
          ) : (
            <div>
              <label className="text-[11px] font-medium">{copy.destinationFolder}</label>
              <div className="mt-2">
                {initialDestinationParent !== undefined ? (
                  <div className="flex h-9 items-center rounded-md border bg-input px-3 text-xs text-foreground">
                    {folders.find((folder) => folder.relativePath === initialDestinationParent)?.name || initialDestinationParent || copy.root}
                  </div>
                ) : (
                  <FolderTreeSelect
                    value={destinationParent}
                    folders={destinations}
                    placeholder={copy.root}
                    searchPlaceholder={copy.folderSearchPlaceholder}
                    searchEmpty={copy.folderSearchEmpty}
                    disabled={busy}
                    ariaLabel={copy.destinationFolder}
                    onChange={(value) => setDestinationParent(value)}
                  />
                )}
              </div>
            </div>
          )}
          <p className="text-[10px] leading-4 text-muted-foreground">{copy.moveFolderHint}</p>
          {plan && <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-[11px] leading-5"><p className="font-medium">{copy.folderMovePlanReady}</p><p className="text-muted-foreground">{plan.managedAssetCount} {copy.managedAssets}, {plan.otherFileCount} {copy.otherFiles}, {plan.conflictCount} {copy.conflictsCount}.</p></div>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} disabled={busy} className="rounded-md border px-3 py-2 text-xs hover:bg-secondary disabled:opacity-50">{copy.cancelAction}</button>
            <button type="submit" disabled={busy || (!plan && !name.trim())} className="flex min-w-20 items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-xs text-primary-foreground disabled:opacity-50">
              {busy ? <Loader2 size={13} className="animate-spin" /> : null}{plan ? copy.confirmPlan : copy.moveAction}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
