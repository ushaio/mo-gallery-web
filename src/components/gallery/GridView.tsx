'use client'

import { memo, useState, useEffect } from 'react'
import { PhotoDto, PublicSettingsDto, resolveAssetUrl } from '@/lib/api'
import { useEntranceAnimation } from '@/hooks/useEntranceAnimation'

interface GridViewProps {
  photos: PhotoDto[]
  settings: PublicSettingsDto | null
  grayscale: boolean
  immersive?: boolean
  onPhotoClick: (photo: PhotoDto) => void
}

interface GridItemProps {
  photo: PhotoDto
  index: number
  settings: PublicSettingsDto | null
  grayscale: boolean
  immersive: boolean
  columnCount: number
  onClick: () => void
}

// 网格单元组件 - 等比正方形裁切展示
const GridItem = memo(function GridItem({ photo, index, settings, grayscale, immersive, columnCount, onClick }: GridItemProps) {
  const { ref, style } = useEntranceAnimation({ index, columnCount })

  return (
    <div
      ref={ref}
      className="group cursor-pointer"
      onClick={onClick}
      style={style}
    >
      <div className={`relative aspect-square overflow-hidden bg-muted ${immersive ? '' : 'mb-3'}`}>
        <img
          src={resolveAssetUrl(photo.thumbnailUrl || photo.url, settings?.cdn_domain)}
          alt={photo.title}
          className={`w-full h-full object-cover transition-transform duration-300 ease-out group-hover:scale-105 ${
            grayscale ? 'grayscale group-hover:grayscale-0' : ''
          }`}
        />

        {/* 悬浮遮罩 */}
        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
      </div>

      {/* 元数据 - 图片下方 */}
      {!immersive && (
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
      )}
    </div>
  )
})

// 网格视图 - 等比正方形网格布局
export function GridView({ photos, settings, grayscale, immersive = false, onPhotoClick }: GridViewProps) {
  const [columnCount, setColumnCount] = useState(2)

  // 响应式列数调整
  useEffect(() => {
    const handleResize = () => {
      if (typeof window !== 'undefined') {
        const width = window.innerWidth
        if (width >= 1280) setColumnCount(6)
        else if (width >= 1024) setColumnCount(5)
        else if (width >= 768) setColumnCount(4)
        else if (width >= 640) setColumnCount(3)
        else setColumnCount(2)
      }
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <div
      className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 ${immersive ? 'gap-1' : 'gap-2 sm:gap-6 lg:gap-8'}`}
    >
      {photos.map((photo, index) => (
        <GridItem
          key={photo.id}
          photo={photo}
          index={index}
          settings={settings}
          grayscale={grayscale}
          immersive={immersive}
          columnCount={columnCount}
          onClick={() => onPhotoClick(photo)}
        />
      ))}
    </div>
  )
}
