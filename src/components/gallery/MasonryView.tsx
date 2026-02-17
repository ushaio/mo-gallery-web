'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { PhotoDto, PublicSettingsDto } from '@/lib/api'
import { PhotoCard } from './PhotoCard'

interface MasonryViewProps {
  photos: PhotoDto[]
  settings: PublicSettingsDto | null
  grayscale: boolean
  immersive?: boolean
  onPhotoClick: (photo: PhotoDto) => void
}

type ColumnPhotos = {
  [columnIndex: number]: (PhotoDto & { originalIndex: number })[]
}

// 瀑布流视图 - 根据窗口宽度自适应列数
export function MasonryView({ photos, settings, grayscale, immersive = false, onPhotoClick }: MasonryViewProps) {
  const [columnCount, setColumnCount] = useState(2)

  // 响应式列数调整
  useEffect(() => {
    const handleResize = () => {
      if (typeof window !== 'undefined') {
        const width = window.innerWidth
        if (width >= 1280) setColumnCount(5)
        else if (width >= 1024) setColumnCount(4)
        else if (width >= 640) setColumnCount(3)
        else setColumnCount(2)
      }
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // 将照片按列分配（轮流分配到各列）
  const columnPhotos: ColumnPhotos = useMemo(() => {
    const columns: ColumnPhotos = {}

    photos.forEach((photo, index) => {
      const colIndex = index % columnCount

      if (!columns[colIndex]) {
        columns[colIndex] = []
      }
      columns[colIndex].push({ ...photo, originalIndex: index })
    })

    return columns
  }, [photos, columnCount])

  return (
    <div className={`flex ${immersive ? 'gap-1' : 'gap-2 sm:gap-6 lg:gap-8'}`}>
      {Array.from({ length: columnCount }).map((_, colIndex) => (
        <div 
          key={colIndex} 
          className={`flex-1 min-w-0 flex flex-col ${immersive ? 'gap-1' : 'gap-2 sm:gap-6 lg:gap-8'}`}
        >
          {columnPhotos[colIndex]?.map((photo, photoIndex) => (
            <PhotoCard
              key={photo.id}
              photo={photo}
              index={photo.originalIndex}
              settings={settings}
              grayscale={grayscale}
              immersive={immersive}
              columnCount={columnCount}
              onClick={() => onPhotoClick(photo)}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
