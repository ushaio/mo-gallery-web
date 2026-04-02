'use client'

import { useAdmin } from '../layout'
import { PhotosTab } from '@/app/admin/photos/PhotosTab'

export default function PhotosPage() {
  const {
    photos,
    categories,
    photosLoading: loading,
    photosError: error,
    photosViewMode: viewMode,
    setPhotosViewMode: onViewModeChange,
    selectedPhotoIds: selectedIds,
    handleSelectPhotoToggle: onSelect,
    handleSelectAllPhotos: onSelectAll,
    handleDelete: onDelete,
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
      onSelectAll={onSelectAll}
      onDelete={onDelete}
      onRefresh={onRefresh}
      onToggleFeatured={onToggleFeatured}
      onPreview={onPreview}
      t={t}
      settings={settings}
      notify={notify}
    />
  )
}
