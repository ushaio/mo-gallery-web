import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import type { ZineAsset } from '@/lib/zine/types'

interface PhotoTrayLibraryProps {
  onPickAsset: (asset: ZineAsset) => void
  onDragAsset: (asset: ZineAsset) => void
}

interface WailsPhotoApp {
  GetPhotos?: (params: { page: number; pageSize: number }) => Promise<LibraryPhotoLike[] | LibraryPhotoResultLike>
}

interface LibraryPhotoLike {
  id?: string | number
  title?: string | null
  width?: number | null
  height?: number | null
  thumbnailUrl?: string | null
  url?: string | null
}

interface LibraryPhotoResultLike {
  data?: LibraryPhotoLike[]
}

function normalizeLibraryPhotos(result: LibraryPhotoLike[] | LibraryPhotoResultLike): ZineAsset[] {
  const photos = Array.isArray(result) ? result : Array.isArray(result.data) ? result.data : []

  return photos
    .filter((photo): photo is LibraryPhotoLike & { id: string | number } => photo.id !== undefined && photo.id !== null)
    .map((photo) => {
      const id = String(photo.id)
      const url = photo.url ?? ''

      return {
        id: `library_${id}`,
        source: 'library',
        libraryPhotoId: id,
        fileName: photo.title || id,
        width: photo.width || 0,
        height: photo.height || 0,
        previewUrl: photo.thumbnailUrl || url,
        fullUrl: url,
        createdAt: Date.now(),
      }
    })
}

export function PhotoTrayLibrary({ onPickAsset, onDragAsset }: PhotoTrayLibraryProps) {
  const [assets, setAssets] = useState<ZineAsset[]>([])
  const [available, setAvailable] = useState(true)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const app = window.go?.main?.App as WailsPhotoApp | undefined
    const getPhotos = app?.GetPhotos

    if (!getPhotos) {
      setAvailable(false)
      setLoading(false)
      return
    }

    let cancelled = false
    const loadLibraryPhotos = getPhotos

    async function loadPhotos() {
      try {
        const result = await loadLibraryPhotos({ page: 1, pageSize: 60 })
        if (!cancelled) setAssets(normalizeLibraryPhotos(result))
      } catch {
        if (!cancelled) toast.error('图库加载失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadPhotos()

    return () => {
      cancelled = true
    }
  }, [])

  if (!available) {
    return <div className="flex h-full items-center text-sm text-muted-foreground">图库接口不可用</div>
  }

  if (loading) {
    return <div className="flex h-full items-center text-sm text-muted-foreground">正在加载图库...</div>
  }

  if (assets.length === 0) {
    return <div className="flex h-full items-center text-sm text-muted-foreground">图库暂无可用图片</div>
  }

  return (
    <div className="flex h-full gap-3 overflow-x-auto pb-1">
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
  )
}
