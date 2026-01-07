'use client'

import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { useMemo } from 'react'
import { PhotoDto, PublicSettingsDto, resolveAssetUrl } from '@/lib/api'

// Optimized masonry layout using CSS columns (similar to react-photo-album approach)
// This provides better performance and compatibility with custom styling

interface MasonryViewProps {
  photos: PhotoDto[]
  settings: PublicSettingsDto | null
  grayscale: boolean
  immersive?: boolean
  onPhotoClick: (photo: PhotoDto) => void
}

export function MasonryView({ photos, settings, grayscale, immersive = false, onPhotoClick }: MasonryViewProps) {
  // Responsive columns configuration - matches other views
  const columnClass = useMemo(() => {
    if (typeof window === 'undefined') return 'columns-2'
    if (window.innerWidth < 640) return 'columns-2'
    if (window.innerWidth < 1024) return 'columns-3'
    if (window.innerWidth < 1280) return 'columns-4'
    return 'columns-5'
  }, [])

  const gapClass = immersive ? 'gap-1' : 'gap-4 sm:gap-6 lg:gap-8'

  return (
    <motion.div
      layout
      className={`${columnClass} ${gapClass}`}
    >
      {photos.map((photo, index) => (
        <motion.div
          key={photo.id}
          layout
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: (index % 3) * 0.1 }}
          className={`break-inside-avoid group cursor-pointer ${immersive ? 'mb-1' : 'mb-12'}`}
          onClick={() => onPhotoClick(photo)}
        >
          <div className={`relative overflow-hidden bg-muted ${immersive ? '' : 'mb-4'}`}>
            <img
              src={resolveAssetUrl(photo.thumbnailUrl || photo.url, settings?.cdn_domain)}
              alt={photo.title}
              className={`w-full h-auto object-cover transition-all duration-[1s] ease-out group-hover:scale-105 ${
                grayscale ? 'grayscale group-hover:grayscale-0' : ''
              }`}
              loading="lazy"
            />

            {/* Hover overlay - matching other views */}
            <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          </div>

          {/* Info below image - matching other views */}
          {!immersive && (
            <div className="flex justify-between items-start gap-4">
              <div className="space-y-1.5 max-w-[80%]">
                <h3 className="text-lg font-serif leading-tight text-foreground group-hover:text-primary transition-colors duration-300">
                  {photo.title}
                </h3>
                <p className="text-ui-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  {photo.category.split(',')[0]}
                </p>
              </div>
              <ArrowRight className="w-5 h-5 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300 text-primary" />
            </div>
          )}
        </motion.div>
      ))}
    </motion.div>
  )
}
