'use client'

import { memo } from 'react'
import Image from 'next/image'

import { resolveAssetUrl } from '@/lib/api/core'

import type { PhotoDto } from '@/lib/api/types'

interface PhotoViewerImageProps {
  photo: PhotoDto | null
  isCurrent: boolean
  isDisplayLoaded: boolean
  isDragging: boolean
  scale: number
  cdnDomain?: string
  onDisplayLoad: (photoId: string) => void
}

export const PhotoViewerImage = memo(function PhotoViewerImage({
  photo,
  isCurrent,
  isDisplayLoaded,
  isDragging,
  scale,
  cdnDomain,
  onDisplayLoad,
}: PhotoViewerImageProps) {
  if (!photo) {
    return <div className="h-full w-full" />
  }

  const thumbnailUrl = resolveAssetUrl(photo.thumbnailUrl || photo.url, cdnDomain)
  const displayUrl = `/api/photos/${encodeURIComponent(photo.id)}/display?width=1920&v=${encodeURIComponent(photo.url)}`
  const imageStyle = {
    transform: `scale(${scale})`,
    transition: isDragging ? 'none' : 'transform 0.2s',
  }

  return (
    <div className="pointer-events-none relative h-full w-full">
      {isCurrent ? (
        <>
          {!isDisplayLoaded ? (
            <Image
              src={thumbnailUrl}
              alt={photo.title}
              fill
              sizes="(max-width: 1024px) 100vw, 70vw"
              className="select-none object-contain"
              style={imageStyle}
              draggable={false}
              unoptimized
            />
          ) : null}
          <Image
            src={displayUrl}
            alt={photo.title}
            fill
            sizes="(max-width: 1024px) 100vw, 70vw"
            className={`select-none object-contain transition-opacity duration-300 ${
              isDisplayLoaded ? 'opacity-100' : 'opacity-0'
            }`}
            style={imageStyle}
            draggable={false}
            priority
            unoptimized
            onLoad={(event) => {
              const image = event.currentTarget
              void image.decode()
                .catch(() => undefined)
                .then(() => onDisplayLoad(photo.id))
            }}
          />
          {!isDisplayLoaded ? (
            <div className="pointer-events-none absolute bottom-4 right-4 z-20 md:bottom-8 md:right-8">
              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/70">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/25 border-t-white/90" />
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <Image
          src={thumbnailUrl}
          alt={photo.title}
          fill
          sizes="(max-width: 1024px) 100vw, 70vw"
          className="select-none object-contain opacity-90"
          draggable={false}
          unoptimized
        />
      )}
    </div>
  )
})
