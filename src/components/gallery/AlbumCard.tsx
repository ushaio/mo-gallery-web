'use client'

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { resolveAssetUrl } from '@/lib/api/core'
import type { AlbumDto } from '@/lib/api/types'

interface AlbumCardProps {
  album: AlbumDto
  onClick: (albumId: string) => void
  t: (key: string) => string
}

export function AlbumCard({ album, onClick, t }: AlbumCardProps) {
  const [isHovered, setIsHovered] = useState(false)
  const coverUrl = useMemo(
    () => (album.coverUrl ? resolveAssetUrl(album.coverUrl) : null),
    [album.coverUrl],
  )
  const accessibilityLabel = useMemo(
    () =>
      `${t('gallery.album_aria_prefix')}: ${album.name}, ${t('gallery.album_aria_contains')} ${album.photoCount} ${t('gallery.album_aria_photos')}`,
    [album.name, album.photoCount, t],
  )

  return (
    <motion.div
      whileHover={{ y: -4 }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      onClick={() => onClick(album.id)}
      role="button"
      tabIndex={0}
      aria-label={accessibilityLabel}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onClick(album.id)
        }
      }}
      className="cursor-pointer overflow-hidden rounded-sm bg-card shadow-sm transition-shadow duration-300 hover:shadow-md focus:outline-none focus:ring-1 focus:ring-primary/40"
    >
      <div className="relative aspect-video overflow-hidden bg-muted">
        {coverUrl ? (
          <motion.img
            src={coverUrl}
            alt={album.name}
            animate={{ scale: isHovered ? 1.05 : 1 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className="font-serif text-4xl text-muted-foreground/30">
              {album.name.charAt(0)}
            </span>
          </div>
        )}

        <div className="absolute bottom-2 right-2 rounded-full border border-border/30 bg-background/80 px-2.5 py-0.5 text-[10px] font-mono tracking-wider text-foreground backdrop-blur-sm">
          {album.photoCount}
        </div>
      </div>

      <div className="p-3 md:p-4">
        <h3 className="line-clamp-1 text-sm font-medium tracking-wide text-foreground">
          {album.name}
        </h3>
        {album.description ? (
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {album.description}
          </p>
        ) : null}
      </div>
    </motion.div>
  )
}
