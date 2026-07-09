import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { ImageOff } from 'lucide-react'
import { toast } from 'sonner'

import { resolveAssetUrl } from '@/lib/api/core'
import { t } from '@/lib/i18n'
import type { ZineAsset } from '@/lib/zine/types'
import { usePreferences } from '@/store/preferences'

import { TrayThumb } from './TrayThumb'

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

export function normalizeLibraryPhotos(result: LibraryPhotoLike[] | LibraryPhotoResultLike): ZineAsset[] {
  const photos = Array.isArray(result) ? result : Array.isArray(result.data) ? result.data : []

  return photos
    .filter((photo): photo is LibraryPhotoLike & { id: string | number } => photo.id !== undefined && photo.id !== null)
    .map((photo) => {
      const id = String(photo.id)
      const url = photo.url ? resolveAssetUrl(photo.url) : ''
      const thumbnailUrl = photo.thumbnailUrl ? resolveAssetUrl(photo.thumbnailUrl) : ''

      return {
        id: `library_${id}`,
        source: 'library',
        libraryPhotoId: id,
        fileName: photo.title || id,
        width: photo.width || 0,
        height: photo.height || 0,
        previewUrl: thumbnailUrl || url,
        fullUrl: url,
        createdAt: Date.now(),
      }
    })
}

function TrayMessage({ icon, text }: { icon?: ReactNode; text: string }) {
  return (
    <div className="flex h-full items-center justify-center gap-2 rounded-lg border border-dashed text-xs" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
      {icon}
      {text}
    </div>
  )
}

export function PhotoTrayLibrary({ onPickAsset, onDragAsset }: PhotoTrayLibraryProps) {
  const { language } = usePreferences()
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
        if (!cancelled) toast.error(t('admin.zine_library_unavailable', language))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadPhotos()

    return () => {
      cancelled = true
    }
  }, [language])

  if (!available) {
    return <TrayMessage icon={<ImageOff size={14} />} text={t('admin.zine_library_unavailable', language)} />
  }

  if (loading) {
    return (
      <div className="flex h-full gap-2 overflow-hidden">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="aspect-square h-full shrink-0 animate-pulse rounded-md" style={{ backgroundColor: 'var(--muted)' }} />
        ))}
      </div>
    )
  }

  if (assets.length === 0) {
    return <TrayMessage icon={<ImageOff size={14} />} text={t('admin.zine_library_empty', language)} />
  }

  return (
    <div className="custom-scrollbar flex h-full gap-2 overflow-x-auto pb-1">
      {assets.map((asset) => (
        <TrayThumb key={asset.id} asset={asset} onPick={() => onPickAsset(asset)} onDragAsset={() => onDragAsset(asset)} />
      ))}
    </div>
  )
}
