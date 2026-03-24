'use client'

import { memo, useMemo } from 'react'
import { resolveAssetUrl } from '@/lib/api/core'
import type { PhotoDto, PublicSettingsDto } from '@/lib/api/types'
import { useEntranceAnimation } from '@/hooks/useEntranceAnimation'
import { useResponsiveColumnCount } from './useResponsiveColumnCount'

const GRID_COLUMN_RULES = [
  { minWidth: 1280, columns: 6 },
  { minWidth: 1024, columns: 5 },
  { minWidth: 768, columns: 4 },
  { minWidth: 640, columns: 3 },
  { minWidth: 0, columns: 2 },
]

interface GridViewProps {
  photos: PhotoDto[]
  settings: PublicSettingsDto | null
  grayscale: boolean
  immersive?: boolean
  onPhotoClick: (photo: PhotoDto) => void
}

interface GridItemProps {
  photo: PhotoDto
  index: number
  settings: PublicSettingsDto | null
  grayscale: boolean
  immersive: boolean
  columnCount: number
  onClick: () => void
}

const GridItem = memo(function GridItem({
  photo,
  index,
  settings,
  grayscale,
  immersive,
  columnCount,
  onClick,
}: GridItemProps) {
  const { ref, style } = useEntranceAnimation({ index, columnCount })
  const coverUrl = useMemo(
    () => resolveAssetUrl(photo.thumbnailUrl || photo.url, settings?.cdn_domain),
    [photo.thumbnailUrl, photo.url, settings?.cdn_domain],
  )
  const primaryCategory = useMemo(() => photo.category.split(',')[0], [photo.category])

  return (
    <div
      ref={ref}
      className="group cursor-pointer"
      onClick={onClick}
      style={style}
    >
      <div className={`relative aspect-square overflow-hidden bg-muted ${immersive ? '' : 'mb-3'}`}>
        <img
          src={coverUrl}
          alt={photo.title}
          className={`w-full h-full object-cover transition-transform duration-300 ease-out group-hover:scale-105 ${
            grayscale ? 'grayscale group-hover:grayscale-0' : ''
          }`}
        />

        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
      </div>

      {!immersive ? (
        <div className="flex justify-between items-start opacity-60 group-hover:opacity-100 transition-opacity">
          <div className="space-y-1">
            <h3 className="text-lg font-serif leading-tight text-foreground line-clamp-1 group-hover:text-primary transition-colors">
              {photo.title}
            </h3>
            <p className="text-ui-xs font-mono text-muted-foreground uppercase tracking-widest">
              {primaryCategory}
            </p>
          </div>
          <span className="text-ui-micro font-mono text-muted-foreground/60">
            {String(index + 1).padStart(2, '0')}
          </span>
        </div>
      ) : null}
    </div>
  )
})

export function GridView({ photos, settings, grayscale, immersive = false, onPhotoClick }: GridViewProps) {
  const columnCount = useResponsiveColumnCount(GRID_COLUMN_RULES)

  return (
    <div
      className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 ${immersive ? 'gap-1' : 'gap-2 sm:gap-6 lg:gap-8'}`}
    >
      {photos.map((photo, index) => (
        <GridItem
          key={photo.id}
          photo={photo}
          index={index}
          settings={settings}
          grayscale={grayscale}
          immersive={immersive}
          columnCount={columnCount}
          onClick={() => onPhotoClick(photo)}
        />
      ))}
    </div>
  )
}
