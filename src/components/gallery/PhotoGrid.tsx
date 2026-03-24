'use client'

import { memo } from 'react'
import type { PhotoDto, PublicSettingsDto } from '@/lib/api/types'
import { GridView } from './GridView'
import { MasonryView } from './MasonryView'
import { TimelineView } from './TimelineView'
import type { ViewMode } from './ViewModeToggle'

const PHOTO_GRID_SKELETON_ITEMS = Array.from({ length: 8 }, (_, index) => index)

interface PhotoGridProps {
  loading: boolean
  photos: PhotoDto[]
  settings: PublicSettingsDto | null
  viewMode: ViewMode
  grayscale: boolean
  immersive?: boolean
  onPhotoClick: (photo: PhotoDto) => void
  t: (key: string) => string
}

function PhotoGridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {PHOTO_GRID_SKELETON_ITEMS.map((index) => (
        <div key={index} className="aspect-[3/4] bg-muted animate-pulse" />
      ))}
    </div>
  )
}

const EmptyPhotoGrid = memo(function EmptyPhotoGrid({ t }: Pick<PhotoGridProps, 't'>) {
  return (
    <div className="py-40 text-center">
      <p className="text-xs font-bold uppercase tracking-[0.3em] text-muted-foreground">
        {t('gallery.empty')}
      </p>
    </div>
  )
})

export function PhotoGrid({
  loading,
  photos,
  settings,
  viewMode,
  grayscale,
  immersive = false,
  onPhotoClick,
  t,
}: PhotoGridProps) {
  if (loading) {
    return <PhotoGridSkeleton />
  }

  if (photos.length === 0) {
    return <EmptyPhotoGrid t={t} />
  }

  return (
    <div className="max-w-screen-2xl mx-auto">
      {viewMode === 'grid' ? (
        <GridView
          photos={photos}
          settings={settings}
          grayscale={grayscale}
          immersive={immersive}
          onPhotoClick={onPhotoClick}
        />
      ) : null}
      {viewMode === 'masonry' ? (
        <MasonryView
          photos={photos}
          settings={settings}
          grayscale={grayscale}
          immersive={immersive}
          onPhotoClick={onPhotoClick}
        />
      ) : null}
      {viewMode === 'timeline' ? (
        <TimelineView
          photos={photos}
          settings={settings}
          grayscale={grayscale}
          onPhotoClick={onPhotoClick}
        />
      ) : null}
    </div>
  )
}
