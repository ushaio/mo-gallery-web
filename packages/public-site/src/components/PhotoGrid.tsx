import { memo } from 'react'

import type { PhotoSiteMetadata } from '@mo-gallery/content-core'
import type { MediaUrlResolver } from '../adapters'
import { PhotoCard } from './PhotoCard'

export type PhotoGridViewMode = 'grid' | 'masonry' | 'timeline'

interface GridViewProps {
  photos: PhotoSiteMetadata[]
  grayscale?: boolean
  immersive?: boolean
  resolver: MediaUrlResolver
  onPhotoClick?: (photo: PhotoSiteMetadata) => void
}

/** 等比方格视图（列数/间距对齐 web MasonryView 规格）。 */
export const GridView = memo(function GridView({
  photos,
  grayscale = false,
  immersive = false,
  resolver,
  onPhotoClick,
}: GridViewProps) {
  return (
    <div className={immersive
      ? 'grid grid-cols-2 gap-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5'
      : 'grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-6 md:grid-cols-4 lg:grid-cols-5 lg:gap-8'}>
      {photos.map((photo, index) => (
        <div key={photo.id}>
          <PhotoCard
            photo={photo}
            index={index}
            grayscale={grayscale}
            showMeta={!immersive}
            imageAspect="square"
            /* CSS stagger 入场：单屏节奏 index*0.05，封顶 1s 防止长列表尾项等待 */
            enterDelay={Math.min(index, 20) * 0.05}
            resolver={resolver}
            onPhotoClick={onPhotoClick}
          />
        </div>
      ))}
    </div>
  )
})

interface MasonryViewProps {
  photos: PhotoSiteMetadata[]
  grayscale?: boolean
  resolver: MediaUrlResolver
  onPhotoClick?: (photo: PhotoSiteMetadata) => void
}

/**
 * 瀑布流视图（CSS multi-column 实现，零运行时依赖）。
 * 注：列内自上而下填充（列序与源顺序不同）；宿主如需与 Web 一致的
 * 虚拟化 masonry（masonic），可在宿主侧替换本实现。
 */
export const MasonryView = memo(function MasonryView({
  photos,
  grayscale = false,
  resolver,
  onPhotoClick,
}: MasonryViewProps) {
  return (
    // 列数/gutter 对齐 web MasonryView 规格：2/3/4/5 列，
    // 列距 8/24/32px、行距（mb）56/72/80px（virtualized masonry 的宿主
    // 替换实现以本规格为基准，见 web useResponsiveColumnCount）。
    <div className="columns-2 gap-2 sm:columns-3 sm:gap-6 lg:columns-4 lg:gap-8 xl:columns-5">
      {photos.map((photo) => (
        <div key={photo.id} className="mb-14 break-inside-avoid sm:mb-18 lg:mb-20">
          <PhotoCard
            photo={photo}
            grayscale={grayscale}
            resolver={resolver}
            onPhotoClick={onPhotoClick}
          />
        </div>
      ))}
    </div>
  )
})

interface TimelineDayGroup {
  dateKey: string
  label: string
  hasTakenAt: boolean
  photos: PhotoSiteMetadata[]
}

function groupPhotosByDay(photos: PhotoSiteMetadata[]): TimelineDayGroup[] {
  const groups = new Map<string, TimelineDayGroup>()

  const push = (photo: PhotoSiteMetadata, rawDate: string | Date, hasTakenAt: boolean) => {
    const date = new Date(rawDate)
    if (Number.isNaN(date.getTime())) return
    const dateKey = `${hasTakenAt ? 'taken' : 'upload'}-${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
    let group = groups.get(dateKey)
    if (!group) {
      group = {
        dateKey,
        label: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
        hasTakenAt,
        photos: [],
      }
      groups.set(dateKey, group)
    }
    group.photos.push(photo)
  }

  for (const photo of photos) {
    const sortDate = photo.takenAt ?? photo.publishedAt ?? photo.createdAt
    push(photo, sortDate, photo.takenAt !== undefined)
  }

  return Array.from(groups.values()).sort((left, right) => right.dateKey.localeCompare(left.dateKey))
}

interface TimelineViewProps {
  photos: PhotoSiteMetadata[]
  grayscale?: boolean
  resolver: MediaUrlResolver
  onPhotoClick?: (photo: PhotoSiteMetadata) => void
}

/** 时间线视图：按拍摄日（缺失时回落发布/上传日）分组。 */
export const TimelineView = memo(function TimelineView({
  photos,
  grayscale = false,
  resolver,
  onPhotoClick,
}: TimelineViewProps) {
  const dayGroups = groupPhotosByDay(photos)

  if (dayGroups.length === 0) {
    return null
  }

  return (
    <div className="relative">
      <div className="absolute bottom-0 left-2 top-0 w-px bg-border md:left-3" />
      {dayGroups.map((group) => (
        <section key={group.dateKey} className="relative pb-8 pl-8 md:pl-12">
          <span className="absolute left-2 top-1 h-3 w-3 -translate-x-1/2 rounded-full border-2 border-background bg-primary md:left-3" />
          <h2 className="mb-3 flex items-baseline gap-2 font-mono text-sm font-bold uppercase tracking-[0.2em] text-foreground">
            {group.label}
            {!group.hasTakenAt ? (
              <span className="text-[10px] font-medium text-muted-foreground">(upload)</span>
            ) : null}
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 md:gap-4">
            {group.photos.map((photo, photoIndex) => (
              <div key={photo.id}>
                <PhotoCard
                  photo={photo}
                  grayscale={grayscale}
                  showMeta={false}
                  imageAspect="square"
                  enterDelay={Math.min(photoIndex, 16) * 0.04}
                  resolver={resolver}
                  onPhotoClick={onPhotoClick}
                />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
})

interface PhotoGridProps {
  photos: PhotoSiteMetadata[]
  viewMode: PhotoGridViewMode
  grayscale?: boolean
  immersive?: boolean
  resolver: MediaUrlResolver
  onPhotoClick?: (photo: PhotoSiteMetadata) => void
}

/**
 * 访客照片网格：grid（方格）/ masonry（瀑布流）/ timeline（时间线）三视图。
 * 纯展示组件——分页与无限滚动由宿主驱动（追加 photos 即可）。
 */
export const PhotoGrid = memo(function PhotoGrid({
  photos,
  viewMode,
  grayscale = false,
  immersive = false,
  resolver,
  onPhotoClick,
}: PhotoGridProps) {
  if (photos.length === 0) {
    return null
  }

  if (viewMode === 'timeline') {
    return <TimelineView photos={photos} grayscale={grayscale} resolver={resolver} onPhotoClick={onPhotoClick} />
  }
  if (viewMode === 'masonry') {
    return <MasonryView photos={photos} grayscale={grayscale} resolver={resolver} onPhotoClick={onPhotoClick} />
  }
  return <GridView photos={photos} grayscale={grayscale} immersive={immersive} resolver={resolver} onPhotoClick={onPhotoClick} />
})
