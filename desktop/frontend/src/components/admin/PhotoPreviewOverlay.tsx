import { PhotoPreviewFrame } from './PhotoPreviewFrame'
import { photoAssetSrc } from '@/lib/photo-asset-src'
import type { Photo } from '@/types'

interface Props {
  photo: Photo
  t: (key: string) => string
  onClose: () => void
  onPrevious?: () => void
  onNext?: () => void
  hasPrevious?: boolean
  hasNext?: boolean
}

export function PhotoPreviewOverlay({ photo, t, onClose, onPrevious, onNext, hasPrevious = false, hasNext = false }: Props) {
  return <PhotoPreviewFrame
    title={photo.title || t('admin.untitled_photo')}
    subtitle={[photo.category || '', photo.photoType === 'film' ? t('admin.upload_type_film') : t('admin.upload_type_digital'), photo.takenAt ? new Date(photo.takenAt).toLocaleDateString('zh-CN') : ''].filter(Boolean).join(' · ') || photo.id}
    originalSrc={photoAssetSrc({ ...photo, thumbnailUrl: null, thumbPath: undefined })}
    previewSrc={photoAssetSrc(photo)}
    alt={photo.title || ''}
    copy={{ viewOriginal: t('admin.view_original'), fitWindow: t('admin.preview_fit'), zoomOut: t('admin.zine_zoom_out'), resetZoom: t('admin.preview_fit'), zoomIn: t('admin.zine_zoom_in'), close: t('common.cancel'), previous: t('story.detail_previous_photo'), next: t('story.detail_next_photo'), loading: t('common.loading') }}
    onClose={onClose}
    onPrevious={onPrevious}
    onNext={onNext}
    hasPrevious={hasPrevious}
    hasNext={hasNext}
  />
}
