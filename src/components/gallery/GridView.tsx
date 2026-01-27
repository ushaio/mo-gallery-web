'use client'

import { useRef, useEffect, useState, memo } from 'react'
import { PhotoDto, PublicSettingsDto, resolveAssetUrl } from '@/lib/api'

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
  onClick: () => void
}

const GridItem = memo(function GridItem({ photo, index, settings, grayscale, immersive, onClick }: GridItemProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.1, rootMargin: '50px' }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Stagger delay based on grid position - creates wave effect
  const staggerDelay = (index % 6) * 0.06

  return (
    <div
      ref={ref}
      className="group cursor-pointer"
      onClick={onClick}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateY(0) scale(1)' : 'translateY(24px) scale(0.96)',
        transition: `opacity 0.5s cubic-bezier(0.16, 1, 0.3, 1) ${staggerDelay}s, transform 0.5s cubic-bezier(0.16, 1, 0.3, 1) ${staggerDelay}s`,
      }}
    >
      <div className={`relative aspect-square overflow-hidden bg-muted ${immersive ? '' : 'mb-3'}`}>
        <img
          src={resolveAssetUrl(photo.thumbnailUrl || photo.url, settings?.cdn_domain)}
          alt={photo.title}
          className={`w-full h-full object-cover transition-transform duration-300 ease-out group-hover:scale-105 ${
            grayscale ? 'grayscale group-hover:grayscale-0' : ''
          }`}
        />

        {/* Minimal Overlay on Hover */}
        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
      </div>

      {/* Meta Data - Below Image */}
      {!immersive && (
        <div className="flex justify-between items-start opacity-60 group-hover:opacity-100 transition-opacity">
           <div className="space-y-1">
             <h3 className="text-lg font-serif leading-tight text-foreground line-clamp-1 group-hover:text-primary transition-colors">
                {photo.title}
             </h3>
             <p className="text-ui-xs font-mono text-muted-foreground uppercase tracking-widest">
                {photo.category.split(',')[0]}
             </p>
           </div>
           <span className="text-ui-micro font-mono text-muted-foreground/60">
             {String(index + 1).padStart(2, '0')}
           </span>
        </div>
      )}
    </div>
  )
})

export function GridView({ photos, settings, grayscale, immersive = false, onPhotoClick }: GridViewProps) {
  return (
    <div
      className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 ${immersive ? 'gap-1' : 'gap-4 sm:gap-6 lg:gap-8'}`}
    >
      {photos.map((photo, index) => (
        <GridItem
          key={photo.id}
          photo={photo}
          index={index}
          settings={settings}
          grayscale={grayscale}
          immersive={immersive}
          onClick={() => onPhotoClick(photo)}
        />
      ))}
    </div>
  )
}
