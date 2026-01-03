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
      className="break-inside-avoid group mb-12 cursor-pointer"
      onClick={onClick}
    >
      <div className="relative overflow-hidden bg-muted mb-4">
        <img
          src={resolveAssetUrl(photo.thumbnailUrl || photo.url, settings?.cdn_domain)}
          alt={photo.title}
          className={`w-full h-auto object-cover transition-all duration-[1s] ease-out group-hover:scale-105 ${
            grayscale ? 'grayscale group-hover:grayscale-0' : ''
          }`}
        />
        
        {/* Subtle Overlay on Hover */}
        <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </div>

      {/* Info Below */}
      <div className="flex justify-between items-start gap-4">
        <div className="space-y-1.5 max-w-[80%]">
          <h3 className="text-lg font-serif leading-tight text-foreground group-hover:text-primary transition-colors duration-300">
            {photo.title}
          </h3>
          <p className="text-ui-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
             {photo.category.split(',')[0]}
          </p>
        </div>
        
        <div className="flex flex-col items-end gap-1 text-ui-micro font-mono text-muted-foreground/60">
           <span>{String(index + 1).padStart(2, '0')}</span>
           <span>{new Date(photo.createdAt).getFullYear()}</span>
        </div>
      </div>
    </motion.div>
  )
}
