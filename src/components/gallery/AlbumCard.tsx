'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { resolveAssetUrl } from '@/lib/api'
import type { AlbumDto } from '@/lib/api'

interface AlbumCardProps {
  album: AlbumDto
  onClick: (albumId: string) => void
}

export function AlbumCard({ album, onClick }: AlbumCardProps) {
  const [isHovered, setIsHovered] = useState(false)
  const coverUrl = album.coverUrl
    ? resolveAssetUrl(album.coverUrl)
    : null

  return (
    <motion.div
      whileHover={{ y: -4 }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      onClick={() => onClick(album.id)}
      role="button"
      tabIndex={0}
      aria-label={`查看相册: ${album.name}, 包含 ${album.photoCount} 张照片`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick(album.id)
        }
      }}
      className="cursor-pointer overflow-hidden rounded-sm bg-card shadow-sm hover:shadow-md transition-shadow duration-300 focus:outline-none focus:ring-1 focus:ring-primary/40"
    >
      {/* 封面区域 */}
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
          <div className="h-full w-full flex items-center justify-center">
            <span className="text-muted-foreground/30 text-4xl font-serif">
              {album.name.charAt(0)}
            </span>
          </div>
        )}

        {/* 照片数量徽章 */}
        <div className="absolute bottom-2 right-2 rounded-full bg-background/80 px-2.5 py-0.5 text-[10px] font-mono text-foreground backdrop-blur-sm tracking-wider border border-border/30">
          {album.photoCount}
        </div>
      </div>

      {/* 信息区域 */}
      <div className="p-3 md:p-4">
        <h3 className="text-sm font-medium tracking-wide text-foreground line-clamp-1">
          {album.name}
        </h3>
        {album.description && (
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {album.description}
          </p>
        )}
      </div>
    </motion.div>
  )
}
