'use client'

import { memo, useCallback, useMemo, useState } from 'react'
import Image from 'next/image'

import { resolveAssetUrl } from '@/lib/api/core'
import type { PhotoDto, PublicSettingsDto } from '@/lib/api/types'
import { masonryImageHeight, photoAspectRatio } from './masonry-metrics'

const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i

// URLs that finished loading at least once this session. Virtualized cards
// unmount when scrolled away; on remount the image is already in the browser
// cache, so skip the fade-in to avoid a blink when scrolling back.
const loadedImageUrls = new Set<string>()

interface PhotoCardProps {
  photo: PhotoDto
  index: number
  width: number
  settings: PublicSettingsDto | null
  grayscale: boolean
  immersive?: boolean
  onPhotoClick: (photo: PhotoDto) => void
}

export const PhotoCard = memo(function PhotoCard({
  photo,
  index,
  width,
  settings,
  grayscale,
  immersive = false,
  onPhotoClick,
}: PhotoCardProps) {
  const coverUrl = useMemo(
    () => resolveAssetUrl(photo.thumbnailUrl || photo.url, settings?.cdn_domain),
    [photo.thumbnailUrl, photo.url, settings?.cdn_domain],
  )
  const primaryCategory = useMemo(() => photo.category.split(',')[0], [photo.category])
  const createdYear = useMemo(() => new Date(photo.createdAt).getFullYear(), [photo.createdAt])
  const imageHeight = masonryImageHeight(width, photoAspectRatio(photo))
  const [revealed, setRevealed] = useState(() => loadedImageUrls.has(coverUrl))
  const placeholderStyle = useMemo(() => {
    const colors = (photo.dominantColors ?? [])
      .filter((color) => HEX_COLOR_PATTERN.test(color))
      .slice(0, 4)

    if (colors.length === 0) return undefined

    const primary = colors[0]
    const secondary = colors[1] ?? primary
    const tertiary = colors[2] ?? secondary
    const accent = colors[3] ?? primary

    return {
      backgroundColor: primary,
      backgroundImage: [
        `radial-gradient(circle at 18% 20%, ${secondary} 0%, transparent 48%)`,
        `radial-gradient(circle at 82% 24%, ${tertiary} 0%, transparent 46%)`,
        `radial-gradient(circle at 70% 86%, ${accent} 0%, transparent 52%)`,
        `linear-gradient(135deg, ${primary}, ${secondary})`,
      ].join(', '),
    }
  }, [photo.dominantColors])

  const handleImageLoad = useCallback(() => {
    loadedImageUrls.add(coverUrl)
    setRevealed(true)
  }, [coverUrl])

  return (
    <button
      type="button"
      className="group block w-full cursor-pointer text-left"
      onClick={() => onPhotoClick(photo)}
      aria-label={photo.title}
    >
      <div
        className={`relative overflow-hidden bg-muted ${immersive ? '' : 'mb-4'}`}
        style={{ ...placeholderStyle, height: imageHeight }}
      >
        <Image
          src={coverUrl}
          alt={photo.title}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
          className={`object-cover transition-[filter,transform,opacity] duration-300 group-hover:scale-[1.02] ${grayscale ? 'grayscale' : ''} ${revealed ? 'opacity-100' : 'opacity-0'}`}
          loading={index < 6 ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={handleImageLoad}
        />

        <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
      </div>

      {!immersive ? (
        // Single-line truncation keeps the caption at a fixed height
        // (MASONRY_CAPTION_HEIGHT) so masonry cell heights are exact.
        <div className="flex justify-between items-start gap-4">
          <div className="space-y-1.5 max-w-[80%] min-w-0">
            <h3 className="text-body font-serif leading-tight text-foreground group-hover:text-primary transition-colors duration-200 truncate">
              {photo.title}
            </h3>
            <p className="text-label font-bold uppercase tracking-[0.2em] text-muted-foreground truncate">
              {primaryCategory}
            </p>
          </div>

          <div className="flex flex-col items-end gap-1 text-label-sm font-mono text-muted-foreground/60">
            <span>{String(index + 1).padStart(2, '0')}</span>
            <span>{createdYear}</span>
          </div>
        </div>
      ) : null}
    </button>
  )
})
