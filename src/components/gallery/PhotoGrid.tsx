'use client'

import { PhotoDto, PublicSettingsDto } from '@/lib/api'
import { GridView } from './GridView'
import { MasonryView } from './MasonryView'
import { TimelineView } from './TimelineView'
import { ViewMode } from './ViewModeToggle'

interface PhotoGridProps {
  loading: boolean
  photos: PhotoDto[]
  settings: PublicSettingsDto | null
  viewMode: ViewMode
  onPhotoClick: (photo: PhotoDto) => void
  t: (key: string) => string
}

export function PhotoGrid({ loading, photos, settings, viewMode, onPhotoClick, t }: PhotoGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="aspect-[3/4] bg-muted animate-pulse" />
        ))}
      </div>
    )
  }

  if (photos.length === 0) {
    return (
      <div className="py-40 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-muted-foreground">
          {t('gallery.empty')}
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-screen-2xl mx-auto">
      {viewMode === 'grid' && (
        <GridView
          photos={photos}
          settings={settings}
          onPhotoClick={onPhotoClick}
        />
      )}
      {viewMode === 'masonry' && (
        <MasonryView
          photos={photos}
          settings={settings}
          onPhotoClick={onPhotoClick}
        />
      )}
      {viewMode === 'timeline' && (
        <TimelineView
          photos={photos}
          settings={settings}
          onPhotoClick={onPhotoClick}
        />
      )}
    </div>
  )
}
