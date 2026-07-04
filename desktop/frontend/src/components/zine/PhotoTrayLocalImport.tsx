import { useRef, useState } from 'react'
import { toast } from 'sonner'

import { saveZineAssetBlob } from '@/lib/zine/project'
import type { ZineAsset } from '@/lib/zine/types'
import { useZineStore } from '@/store/zine'

interface PhotoTrayLocalImportProps {
  onPickAsset: (asset: ZineAsset) => void
  onDragAsset: (asset: ZineAsset) => void
}

function createLocalAssetId() {
  return crypto.randomUUID?.() ?? `local_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

function getImageSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth || 0, height: image.naturalHeight || 0 })
    image.onerror = () => resolve({ width: 0, height: 0 })
    image.src = src
  })
}

export function PhotoTrayLocalImport({ onPickAsset, onDragAsset }: PhotoTrayLocalImportProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [importing, setImporting] = useState(false)
  const assets = useZineStore((state) => state.project?.assets.filter((asset) => asset.source === 'local') ?? [])
  const addAsset = useZineStore((state) => state.addAsset)

  async function importFiles(files: FileList | null) {
    if (!files?.length) return

    setImporting(true)
    try {
      for (const file of Array.from(files)) {
        const id = createLocalAssetId()
        const blobId = id
        const previewUrl = URL.createObjectURL(file)
        const { width, height } = await getImageSize(previewUrl)
        const asset: ZineAsset = {
          id,
          source: 'local',
          blobId,
          fileName: file.name,
          width,
          height,
          previewUrl,
          fullUrl: previewUrl,
          createdAt: Date.now(),
        }

        await saveZineAssetBlob(blobId, file)
        addAsset(asset)
      }
    } catch {
      toast.error('本地图片导入失败')
    } finally {
      setImporting(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="flex h-full min-w-0 gap-3">
      <div className="flex h-full shrink-0 flex-col justify-center gap-2">
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => void importFiles(event.target.files)} />
        <button type="button" className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60" onClick={() => inputRef.current?.click()} disabled={importing}>
          {importing ? '导入中...' : '导入本地图片'}
        </button>
        <span className="text-xs text-muted-foreground">支持多选 image/*</span>
      </div>
      {assets.length === 0 ? (
        <div className="flex h-full items-center text-sm text-muted-foreground">尚未导入本地图片</div>
      ) : (
        <div className="flex h-full min-w-0 flex-1 gap-3 overflow-x-auto pb-1">
          {assets.map((asset) => (
            <button
              key={asset.id}
              type="button"
              className="group relative aspect-square h-full shrink-0 overflow-hidden rounded-md border bg-muted text-left transition hover:border-primary"
              style={{ borderColor: 'var(--border)' }}
              draggable
              onClick={() => onPickAsset(asset)}
              onDragStart={(event) => {
                onDragAsset(asset)
                event.dataTransfer.setData('application/x-zine-asset-id', asset.id)
                event.dataTransfer.setData('application/json', JSON.stringify(asset))
                event.dataTransfer.effectAllowed = 'copy'
              }}
              title={asset.fileName}
            >
              <img src={asset.previewUrl || asset.fullUrl} alt={asset.fileName} className="h-full w-full object-cover" draggable={false} />
              <span className="absolute inset-x-0 bottom-0 truncate bg-black/45 px-1.5 py-1 text-[10px] text-white opacity-0 transition group-hover:opacity-100">{asset.fileName}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
