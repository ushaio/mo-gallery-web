'use client'

import { useAdmin } from '../layout'
import { PhotosTab } from '@/app/admin/photos/PhotosTab'
import type { PhotosFilterPreference } from '@/lib/admin-preferences'
import type { PhotoDto } from '@/lib/api/types'

interface PhotosPageProps {
  initialFilters?: Partial<Pick<PhotosFilterPreference, 'categoryFilter' | 'photoTypeFilter' | 'albumFilter' | 'onlyFeatured'>>
  onPreview?: (photo: PhotoDto) => void
}

export default function PhotosPage({ initialFilters, onPreview: onPreviewOverride }: PhotosPageProps) {
  const {
    photos,
    categories,
    photosLoading: loading,
    photosError: error,
    photosViewMode: viewMode,
    setPhotosViewMode: onViewModeChange,
    selectedPhotoIds: selectedIds,
    setSelectedPhotoIds: onSelectionChange,
    handleSelectPhotoToggle: onSelect,
    handleDelete: onDelete,
    handleBatchAction: onBatchAction,
    refreshPhotos: onRefresh,
    handleToggleFeatured: onToggleFeatured,
    setSelectedPhoto: onPreview,
    t,
    settings,
    notify,
  } = useAdmin()

  return (
    <PhotosTab
      photos={photos}
      categories={categories}
      loading={loading}
      error={error}
      viewMode={viewMode}
      onViewModeChange={onViewModeChange}
      selectedIds={selectedIds}
      onSelect={onSelect}
      onSelectionChange={onSelectionChange}
      onDelete={onDelete}
      onBatchAction={onBatchAction}
      onRefresh={onRefresh}
      onToggleFeatured={onToggleFeatured}
      onPreview={onPreviewOverride ?? onPreview}
      t={t}
      settings={settings}
      notify={notify}
      initialFilters={initialFilters}
    />
  )
}
