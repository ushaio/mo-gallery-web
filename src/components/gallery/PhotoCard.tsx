'use client'

import { memo } from 'react'
import Image from 'next/image'
import { PhotoDto, resolveAssetUrl } from '@/lib/api'
import { PublicSettingsDto } from '@/lib/api'
import { useEntranceAnimation } from '@/hooks/useEntranceAnimation'

interface PhotoCardProps {
  photo: PhotoDto
  index: number
  settings: PublicSettingsDto | null
  grayscale: boolean
  immersive?: boolean
  columnCount?: number
  onClick: () => void
}

export const PhotoCard = memo(function PhotoCard({ photo, index, settings, grayscale, immersive = false, columnCount = 5, onClick }: PhotoCardProps) {
  const { ref, style } = useEntranceAnimation({ index, columnCount })

  return (
    <div
      ref={ref}
      className={`break-inside-avoid group cursor-pointer ${immersive ? 'mb-1' : 'mb-12'}`}
      onClick={onClick}
      style={style}
    >
      <div
        className={`relative overflow-hidden ${immersive ? '' : 'mb-4'}`}
        style={{ backgroundColor: photo.dominantColors?.[0] || '#e5e5e5' }}
      >
        <Image
          src={resolveAssetUrl(photo.thumbnailUrl || photo.url, settings?.cdn_domain)}
          alt={photo.title}
          width={photo.width || 800}
          height={photo.height || 600}
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
          className={`w-full h-auto object-cover transition-transform duration-300 ease-out group-hover:scale-105 ${
            grayscale ? 'grayscale group-hover:grayscale-0' : ''
          }`}
          loading="lazy"
        />

        {/* Subtle Overlay on Hover */}
        <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
      </div>

      {/* Info Below */}
      {!immersive && (
        <div className="flex justify-between items-start gap-4">
          <div className="space-y-1.5 max-w-[80%]">
            <h3 className="text-body font-serif leading-tight text-foreground group-hover:text-primary transition-colors duration-200">
              {photo.title}
            </h3>
            <p className="text-label font-bold uppercase tracking-[0.2em] text-muted-foreground">
               {photo.category.split(',')[0]}
            </p>
          </div>

          <div className="flex flex-col items-end gap-1 text-label-sm font-mono text-muted-foreground/60">
             <span>{String(index + 1).padStart(2, '0')}</span>
             <span>{new Date(photo.createdAt).getFullYear()}</span>
          </div>
        </div>
      )}
    </div>
  )
})
