import { FileText } from 'lucide-react'
import { PhotoPreviewFrame } from '../../components/admin/PhotoPreviewFrame'
import { isPhotoAsset } from './types'
import type { LocalAsset } from './types'
import type { LocalLibraryCopy } from './copy'

interface Props {
  asset: LocalAsset
  copy: LocalLibraryCopy
  onClose: () => void
  onOpenSystem: (asset: LocalAsset) => void
  onPrevious?: () => void
  onNext?: () => void
  hasPrevious?: boolean
  hasNext?: boolean
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`
  return `${(value / 1024 ** 3).toFixed(2)} GB`
}

export function LocalLibraryPreview({ asset, copy, onClose, onPrevious, onNext, hasPrevious = false, hasNext = false }: Props) {
  const isPhoto = isPhotoAsset(asset)
  const previewPending = asset.previewStatus === 'pending' || asset.previewStatus === 'generating'
  const viewOriginalLabel = copy.original.startsWith('Original') ? 'View original' : '查看原图'
  const frameCopy = {
    viewOriginal: viewOriginalLabel, fitWindow: copy.fitted, zoomOut: copy.zoomOut, resetZoom: copy.resetZoom, zoomIn: copy.zoomIn,
    close: copy.close, previous: copy.previous, next: copy.next, loading: copy.loadingOriginal, originalUnavailable: copy.originalUnavailable,
    retry: copy.retry,
  }

  return <PhotoPreviewFrame
    key={asset.id}
    title={asset.displayTitle || asset.fileName}
    subtitle={asset.relativePath}
    originalSrc={isPhoto ? asset.originalUrl : undefined}
    previewSrc={isPhoto && (asset.previewStatus === 'ready' || asset.mimeType === 'image/gif') ? asset.previewUrl : undefined}
    alt={asset.displayTitle || asset.fileName}
    copy={frameCopy}
    onClose={onClose}
    onPrevious={onPrevious}
    onNext={onNext}
    hasPrevious={hasPrevious}
    hasNext={hasNext}
    fallback={!isPhoto ? <div className="flex max-w-md flex-col items-center gap-3 text-center text-white/70"><FileText size={54} strokeWidth={1.2} className="opacity-80" /><div className="text-sm font-medium uppercase tracking-widest">{asset.format}</div><div className="break-all text-xs text-white/50">{asset.displayTitle || asset.fileName}</div><div className="text-xs text-white/50">{formatBytes(asset.byteSize)}</div></div> : previewPending ? <div className="text-sm text-white/60">{copy.generatingPreview}</div> : undefined}
  />
}
