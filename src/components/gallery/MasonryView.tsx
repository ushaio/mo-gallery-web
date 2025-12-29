'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { PhotoDto, PublicSettingsDto } from '@/lib/api'
import { PhotoCard } from './PhotoCard'

interface MasonryViewProps {
  photos: PhotoDto[]
  settings: PublicSettingsDto | null
  onPhotoClick: (photo: PhotoDto) => void
}

export function MasonryView({ photos, settings, onPhotoClick }: MasonryViewProps) {
  return (
    <motion.div
      layout
      className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-6 space-y-6"
    >
      <AnimatePresence mode="popLayout">
        {photos.map((photo, index) => (
          <PhotoCard
            key={photo.id}
            photo={photo}
            index={index}
            settings={settings}
            onClick={() => onPhotoClick(photo)}
          />
        ))}
      </AnimatePresence>
    </motion.div>
  )
}
