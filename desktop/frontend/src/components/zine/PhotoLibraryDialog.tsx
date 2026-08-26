import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { Cloud, HardDrive, X } from 'lucide-react'

import { t } from '@/lib/i18n'
import { resolveAssetUrl } from '@/lib/api/core'
import type { ZineAsset } from '@/lib/zine/types'
import { usePreferences } from '@/store/preferences'
import { CloudLibrary } from '@/features/library/cloud/CloudLibrary'
import { LocalLibrary } from '@/features/library/local/LocalLibrary'
import type { LocalAsset } from '@/features/library/local/types'
import type { Photo } from '@/types'


export type LibrarySource = 'cloud' | 'local-library'

interface PhotoLibraryDialogBaseProps {
  source: LibrarySource | null
  onClose: () => void
}

interface ZinePhotoLibraryDialogProps extends PhotoLibraryDialogBaseProps {
  existingAssets: ZineAsset[]
  onImportAssets: (assets: ZineAsset[]) => void
  existingPhotoIds?: never
  onImportPhotos?: never
}

interface CloudPhotoLibraryDialogProps extends PhotoLibraryDialogBaseProps {
  source: 'cloud' | null
  existingPhotoIds: string[]
  onImportPhotos: (photos: Photo[]) => void
  existingAssets?: never
  onImportAssets?: never
}

type PhotoLibraryDialogProps = ZinePhotoLibraryDialogProps | CloudPhotoLibraryDialogProps

function cloudPhotoToZineAsset(photo: Photo): ZineAsset {
  return {
    id: `library_${photo.id}`,
    source: 'library',
    origin: 'cloud-library',
    libraryPhotoId: photo.id,
    fileName: photo.title || photo.id,
    width: photo.width || 0,
    height: photo.height || 0,
    previewUrl: resolveAssetUrl(photo.thumbnailUrl || photo.url),
    fullUrl: resolveAssetUrl(photo.url),
    createdAt: Date.now(),
  }
}

function localPhotoToZineAsset(asset: LocalAsset): ZineAsset {
  return {
    id: `local-library_${asset.id}`,
    source: 'library',
    origin: 'local-library',
    libraryPhotoId: asset.id,
    fileName: asset.displayTitle || asset.fileName,
    width: asset.width,
    height: asset.height,
    previewUrl: asset.thumbnailUrl || asset.previewUrl,
    fullUrl: asset.originalUrl || asset.previewUrl,
    createdAt: Date.now(),
  }
}

export function PhotoLibraryDialog(props: PhotoLibraryDialogProps) {
  const { source, onClose } = props
  const language = usePreferences((state) => state.language)
  const [selectedCloudPhotos, setSelectedCloudPhotos] = useState<Photo[]>([])
  const [selectedLocalAssets, setSelectedLocalAssets] = useState<LocalAsset[]>([])

  useEffect(() => {
    setSelectedCloudPhotos([])
    setSelectedLocalAssets([])
  }, [source])

  useEffect(() => {
    if (!source) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, source])
  const handleCloudSelection = useCallback((photos: Photo[]) => {
    setSelectedCloudPhotos(photos)
  }, [])
  const handleLocalSelection = useCallback((assets: LocalAsset[]) => {
    setSelectedLocalAssets(assets)
  }, [])
  const existingCloudIds = 'existingPhotoIds' in props
    ? props.existingPhotoIds
    : (props.existingAssets ?? [])
      .filter((asset) => asset.origin === 'cloud-library' || (!asset.origin && asset.id.startsWith('library_')))
      .map((asset) => asset.libraryPhotoId ?? asset.id.replace(/^library_/, ''))
  const existingLocalIds = 'existingAssets' in props
    ? (props.existingAssets ?? [])
      .filter((asset) => asset.origin === 'local-library' || (!asset.origin && asset.id.startsWith('local-library_')))
      .map((asset) => asset.libraryPhotoId ?? asset.id.replace(/^local-library_/, ''))
    : []

  if (!source || typeof document === 'undefined') return null

  const cloud = source === 'cloud'
  const title = t(cloud ? 'admin.zine_import_cloud' : 'admin.zine_import_local_library', language)
  const Icon = cloud ? Cloud : HardDrive
  const selectedCount = cloud ? selectedCloudPhotos.length : selectedLocalAssets.length
  function handleImport() {
    if ('onImportPhotos' in props) {
      props.onImportPhotos!(selectedCloudPhotos)
    } else {
      const assets = cloud
        ? selectedCloudPhotos.map(cloudPhotoToZineAsset)
        : selectedLocalAssets.map(localPhotoToZineAsset)
      props.onImportAssets!(assets)
    }
    onClose()
  }

  return createPortal(
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="pointer-events-none fixed inset-0 z-[121] flex items-center justify-center p-4">
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          initial={{ opacity: 0, scale: 0.97, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="pointer-events-auto flex h-[min(90vh,900px)] w-[min(96vw,1400px)] flex-col overflow-hidden rounded-lg border bg-background shadow-2xl"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex h-12 shrink-0 items-center gap-2 border-b px-4" style={{ borderColor: 'var(--border)' }}>
            <Icon size={16} style={{ color: 'var(--muted-foreground)' }} />
            <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</h2>
            <button type="button" onClick={onClose} aria-label={t('common.close', language)} title={t('common.close', language)} className="flex h-8 w-8 items-center justify-center rounded-md transition hover:bg-accent">
              <X size={16} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            {cloud ? (
              <CloudLibrary selectionMode existingPhotoIds={existingCloudIds} onSelectionChange={handleCloudSelection} />
            ) : (
              <LocalLibrary selectionMode existingAssetIds={existingLocalIds} onSelectionChange={handleLocalSelection} />
            )}
          </div>
          <div className="flex shrink-0 items-center justify-between gap-3 border-t px-4 py-3" style={{ borderColor: 'var(--border)' }}>
            <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{t('admin.zine_selected_count', language, { count: selectedCount })}</span>
            <button type="button" disabled={selectedCount === 0} onClick={handleImport} className="rounded-md px-4 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50" style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>{t('admin.zine_import_selected', language)}</button>
          </div>
        </motion.div>
      </div>
    </>,
    document.body,
  )
}
