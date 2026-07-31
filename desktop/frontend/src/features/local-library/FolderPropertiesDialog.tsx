import { Folder, Loader2, X } from 'lucide-react'
import { formatBytes } from '@/lib/utils'
import type { FolderProperties } from './types'
import type { LocalLibraryCopy } from './copy'

interface Props {
  copy: LocalLibraryCopy
  properties?: FolderProperties
  loading: boolean
  onClose: () => void
}

export function FolderPropertiesDialog({ copy, properties, loading, onClose }: Props) {
  const rows = properties ? [
    [copy.folderName, properties.name],
    [copy.folderPath, properties.isRoot ? copy.root : properties.relativePath],
    [copy.folderPhotoCount, properties.photoCount.toLocaleString()],
    [copy.folderChildCount, properties.childCount.toLocaleString()],
    [copy.folderSize, formatBytes(properties.byteSize)],
    [copy.folderModified, new Date(properties.modifiedAt).toLocaleString()],
  ] : []

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-5">
      <button type="button" aria-label={copy.cancelAction} className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="folder-properties-title" className="relative w-full max-w-md rounded-xl border bg-background p-5 shadow-2xl">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-secondary"><Folder size={17} /></span>
          <h2 id="folder-properties-title" className="min-w-0 flex-1 truncate font-sans text-sm font-semibold">{copy.folderProperties}</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 hover:bg-secondary"><X size={15} /></button>
        </div>
        {loading ? (
          <div className="flex h-40 items-center justify-center gap-2 text-xs text-muted-foreground"><Loader2 size={14} className="animate-spin" />{copy.loading}</div>
        ) : properties ? (
          <dl className="mt-5 divide-y rounded-lg border px-3">
            {rows.map(([label, value]) => (
              <div key={label} className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 py-3 text-xs">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="break-all text-right">{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </div>
  )
}
