'use client'

import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { PhotoDto, resolveAssetUrl } from '@/lib/api'
import { PublicSettingsDto } from '@/lib/api'

interface PhotoCardProps {
  photo: PhotoDto
  index: number
  settings: PublicSettingsDto | null
  grayscale: boolean
  onClick: () => void
}

export function PhotoCard({ photo, index, settings, grayscale, onClick }: PhotoCardProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.8, delay: (index % 3) * 0.1 }}
      className="break-inside-avoid group"
      onClick={onClick}
    >
      <div className="relative overflow-hidden bg-muted">
        <img
          src={resolveAssetUrl(photo.thumbnailUrl || photo.url, settings?.cdn_domain)}
          alt={photo.title}
          className={`w-full h-auto object-cover transition-all duration-[1.5s] ease-out group-hover:scale-105 ${
            grayscale ? 'grayscale group-hover:grayscale-0' : ''
          }`}
        />

        {/* Minimalist Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex flex-col justify-end p-6">
          <div className="translate-y-4 group-hover:translate-y-0 transition-transform duration-500">
            <p className="text-[9px] font-black text-primary uppercase tracking-[0.3em] mb-1.5">
              {photo.category.split(',')[0]}
            </p>
            <h3 className="text-lg font-serif text-white leading-tight mb-3">
              {photo.title}
            </h3>
            <div className="flex items-center gap-2 text-white/60 text-[10px] font-bold uppercase tracking-widest">
              <span>View Entry</span>
              <ArrowRight className="w-3 h-3" />
            </div>
          </div>
        </div>

        {/* Photo Serial Number */}
        <div className="absolute top-4 left-4 text-[8px] font-mono text-white/30 tracking-tighter opacity-0 group-hover:opacity-100 transition-opacity">
          NO. {String(index + 1).padStart(3, '0')}
        </div>
      </div>

      {/* Subtle Caption Below */}
      <div className="mt-2 flex justify-between items-start opacity-40 group-hover:opacity-100 transition-opacity duration-500">
        <span className="text-[9px] font-mono uppercase tracking-tighter">
          {photo.cameraModel || 'Recorded Moment'}
        </span>
        <span className="text-[9px] font-mono">
          {new Date(photo.createdAt).getFullYear()}
        </span>
      </div>
    </motion.div>
  )
}
