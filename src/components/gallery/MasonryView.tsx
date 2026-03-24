'use client'

import { useMemo } from 'react'
import type { PhotoDto, PublicSettingsDto } from '@/lib/api/types'
import { PhotoCard } from './PhotoCard'
import { useResponsiveColumnCount } from './useResponsiveColumnCount'

const MASONRY_COLUMN_RULES = [
  { minWidth: 1280, columns: 5 },
  { minWidth: 1024, columns: 4 },
  { minWidth: 640, columns: 3 },
  { minWidth: 0, columns: 2 },
]

interface MasonryViewProps {
  photos: PhotoDto[]
  settings: PublicSettingsDto | null
  grayscale: boolean
  immersive?: boolean
  onPhotoClick: (photo: PhotoDto) => void
}

type ColumnPhoto = PhotoDto & { originalIndex: number }
type ColumnPhotos = Record<number, ColumnPhoto[]>

export function MasonryView({ photos, settings, grayscale, immersive = false, onPhotoClick }: MasonryViewProps) {
  const columnCount = useResponsiveColumnCount(MASONRY_COLUMN_RULES)

  const columnPhotos = useMemo<ColumnPhotos>(() => {
    return photos.reduce<ColumnPhotos>((columns, photo, index) => {
      const columnIndex = index % columnCount
      if (!columns[columnIndex]) {
        columns[columnIndex] = []
      }

      columns[columnIndex].push({ ...photo, originalIndex: index })
      return columns
    }, {})
  }, [columnCount, photos])

  return (
    <div className={`flex ${immersive ? 'gap-1' : 'gap-2 sm:gap-6 lg:gap-8'}`}>
      {Array.from({ length: columnCount }, (_, columnIndex) => (
        <div
          key={columnIndex}
          className={`flex-1 min-w-0 flex flex-col ${immersive ? 'gap-1' : 'gap-2 sm:gap-6 lg:gap-8'}`}
        >
          {columnPhotos[columnIndex]?.map((photo) => (
            <PhotoCard
              key={photo.id}
              photo={photo}
              index={photo.originalIndex}
              settings={settings}
              grayscale={grayscale}
              immersive={immersive}
              columnCount={columnCount}
              onClick={() => onPhotoClick(photo)}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
