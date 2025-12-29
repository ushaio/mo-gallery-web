'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { PhotoDto, PublicSettingsDto, resolveAssetUrl } from '@/lib/api'

interface GridViewProps {
  photos: PhotoDto[]
  settings: PublicSettingsDto | null
  onPhotoClick: (photo: PhotoDto) => void
}

export function GridView({ photos, settings, onPhotoClick }: GridViewProps) {
  return (
    <motion.div
      layout
      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-1"
    >
      <AnimatePresence mode="popLayout">
        {photos.map((photo, index) => (
          <motion.div
            key={photo.id}
            layout
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.3, delay: (index % 10) * 0.03 }}
            className="group relative aspect-square cursor-pointer overflow-hidden bg-muted"
            onClick={() => onPhotoClick(photo)}
          >
            <img
              src={resolveAssetUrl(photo.thumbnailUrl || photo.url, settings?.cdn_domain)}
              alt={photo.title}
              className="w-full h-full object-cover transition-all duration-700 ease-out group-hover:scale-110"
            />

            {/* Hover Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
              <div className="translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
                <p className="text-[8px] font-black text-primary uppercase tracking-[0.2em] mb-1">
                  {photo.category.split(',')[0]}
                </p>
                <h3 className="text-sm font-serif text-white leading-tight line-clamp-2">
                  {photo.title}
                </h3>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.div>
  )
}
