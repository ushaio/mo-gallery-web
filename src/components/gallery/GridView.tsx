'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { PhotoDto, PublicSettingsDto, resolveAssetUrl } from '@/lib/api'

interface GridViewProps {
  photos: PhotoDto[]
  settings: PublicSettingsDto | null
  grayscale: boolean
  onPhotoClick: (photo: PhotoDto) => void
}

export function GridView({ photos, settings, grayscale, onPhotoClick }: GridViewProps) {
  return (
    <motion.div
      layout
      className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8"
    >
      <AnimatePresence mode="popLayout">
        {photos.map((photo, index) => (
          <motion.div
            key={photo.id}
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.5, delay: (index % 10) * 0.05 }}
            className="group cursor-pointer"
            onClick={() => onPhotoClick(photo)}
          >
            <div className="relative aspect-square overflow-hidden bg-muted mb-3">
              <img
                src={resolveAssetUrl(photo.thumbnailUrl || photo.url, settings?.cdn_domain)}
                alt={photo.title}
                className={`w-full h-full object-cover transition-all duration-700 ease-out group-hover:scale-105 ${
                  grayscale ? 'grayscale group-hover:grayscale-0' : ''
                }`}
              />

              {/* Minimal Overlay on Hover */}
              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </div>

            {/* Meta Data - Below Image */}
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
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.div>
  )
}
