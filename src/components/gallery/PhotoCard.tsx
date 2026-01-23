'use client'

import { memo } from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { PhotoDto, resolveAssetUrl } from '@/lib/api'
import { PublicSettingsDto } from '@/lib/api'

interface PhotoCardProps {
  photo: PhotoDto
  index: number
  settings: PublicSettingsDto | null
  grayscale: boolean
  immersive?: boolean
  onClick: () => void
}

export const PhotoCard = memo(function PhotoCard({ photo, index, settings, grayscale, immersive = false, onClick }: PhotoCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.8, delay: (index % 3) * 0.1 }}
      className={`break-inside-avoid group cursor-pointer ${immersive ? 'mb-1' : 'mb-12'}`}
      onClick={onClick}
    >
      <div className={`relative overflow-hidden bg-muted ${immersive ? '' : 'mb-4'}`}>
        <Image
          src={resolveAssetUrl(photo.thumbnailUrl || photo.url, settings?.cdn_domain)}
          alt={photo.title}
          width={photo.width || 800}
          height={photo.height || 600}
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
          className={`w-full h-auto object-cover transition-all duration-[1s] ease-out group-hover:scale-105 ${
            grayscale ? 'grayscale group-hover:grayscale-0' : ''
          }`}
          loading="lazy"
          placeholder={photo.blurDataUrl ? "blur" : "empty"}
          blurDataURL={photo.blurDataUrl}
        />

        {/* Subtle Overlay on Hover */}
        <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </div>

      {/* Info Below */}
      {!immersive && (
        <div className="flex justify-between items-start gap-4">
          <div className="space-y-1.5 max-w-[80%]">
            <h3 className="text-body font-serif leading-tight text-foreground group-hover:text-primary transition-colors duration-300">
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
    </motion.div>
  )
})
