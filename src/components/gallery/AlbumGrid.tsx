'use client'

import { memo } from 'react'
import { motion } from 'framer-motion'
import { AlbumCard } from './AlbumCard'
import type { AlbumDto } from '@/lib/api/types'

const ALBUM_SKELETON_ITEMS = Array.from({ length: 8 }, (_, index) => index)

interface AlbumGridProps {
  albums: AlbumDto[]
  onAlbumClick: (albumId: string) => void
  isLoading?: boolean
  t: (key: string) => string
}

function AlbumCardSkeleton() {
  return (
    <div className="animate-pulse overflow-hidden rounded-sm bg-card shadow-sm">
      <div className="aspect-video bg-muted" />
      <div className="p-3 md:p-4 space-y-2">
        <div className="h-4 w-3/4 rounded bg-muted" />
        <div className="h-3 w-full rounded bg-muted" />
      </div>
    </div>
  )
}

const EmptyAlbumGrid = memo(function EmptyAlbumGrid({ t }: Pick<AlbumGridProps, 't'>) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
      <p className="text-sm font-mono tracking-wider uppercase">{t('gallery.empty')}</p>
    </div>
  )
})

export function AlbumGrid({ albums, onAlbumClick, isLoading, t }: AlbumGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {ALBUM_SKELETON_ITEMS.map((index) => (
          <AlbumCardSkeleton key={index} />
        ))}
      </div>
    )
  }

  if (albums.length === 0) {
    return <EmptyAlbumGrid t={t} />
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    >
      {albums.map((album, index) => (
        <motion.div
          key={album.id}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.05, duration: 0.3 }}
        >
          <AlbumCard album={album} onClick={onAlbumClick} t={t} />
        </motion.div>
      ))}
    </motion.div>
  )
}
