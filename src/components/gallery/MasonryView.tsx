'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  useContainerPosition,
  useMasonry,
  usePositioner,
  useResizeObserver,
  useScroller,
  type RenderComponentProps,
} from 'masonic'

import type { PhotoSiteMetadata } from '@mo-gallery/content-core'
import { PhotoCard } from '@mo-gallery/public-site'
import type { MediaUrlResolver } from '@mo-gallery/public-site'

import { masonryImageHeight } from './masonry-metrics'
import { useResponsiveColumnCount } from './useResponsiveColumnCount'

const MASONRY_COLUMN_RULES = [
  { minWidth: 1280, columns: 5 },
  { minWidth: 1024, columns: 4 },
  { minWidth: 640, columns: 3 },
  { minWidth: 0, columns: 2 },
]

const LOADING_ASPECT_RATIOS = [4 / 5, 3 / 2, 2 / 3, 1, 5 / 4, 3 / 4, 16 / 10, 4 / 3]

const SCROLL_FPS = 60
const OVERSCAN_BY = 4
const EMPTY_ITEMS: MasonryItem[] = []

interface MasonryViewProps {
  /** 已映射的访客领域模型（见 @/lib/public-site 的 toSitePhoto）。 */
  sitePhotos: PhotoSiteMetadata[]
  resolver: MediaUrlResolver
  grayscale: boolean
  immersive?: boolean
  loadingMore: boolean
  hasMore: boolean
  totalItems: number
  onLoadMore: (targetIndex?: number) => Promise<void>
  onPhotoClick: (photo: PhotoSiteMetadata) => void
}

interface LoadingMasonryItem {
  kind: 'loading'
  id: string
  aspectRatio: number
}

type MasonryItem = PhotoSiteMetadata | LoadingMasonryItem

function isLoadingItem(item: MasonryItem): item is LoadingMasonryItem {
  return 'kind' in item && item.kind === 'loading'
}

function getItemKey(item: MasonryItem) {
  return item.id
}

function getLoadingItemKey(index: number) {
  return `gallery-loading-${index}`
}

function useWindowSize(): [number, number] {
  const [size, setSize] = useState<[number, number]>(() => (
    typeof window === 'undefined' ? [1024, 768] : [window.innerWidth, window.innerHeight]
  ))

  useEffect(() => {
    const handleResize = () => {
      setSize((current) => (
        current[0] === window.innerWidth && current[1] === window.innerHeight
          ? current
          : [window.innerWidth, window.innerHeight]
      ))
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return size
}

function LoadingMasonryCard({
  item,
  width,
  immersive,
}: {
  item: LoadingMasonryItem
  width: number
  immersive: boolean
}) {
  return (
    <div aria-hidden="true" className="w-full animate-pulse">
      <div
        className="w-full bg-muted"
        style={{ height: masonryImageHeight(width, item.aspectRatio) }}
      />
      {!immersive ? (
        // Mirrors the shared PhotoCard's caption block (meta under the image)
        // so swapping in the real card never shifts the caption area.
        <div className="mt-4 flex items-start justify-between gap-4">
          <div className="w-3/5">
            <div className="h-5 bg-muted" />
            <div className="mt-1.5 h-[18px] w-2/3 bg-muted" />
          </div>
          <div className="h-3 w-8 bg-muted" />
        </div>
      ) : null}
    </div>
  )
}

/**
 * 宿主侧虚拟化 masonry（masonic）——替代共享包零依赖 CSS columns 版本的
 * 大图库优化实现（见 @mo-gallery/public-site PhotoGrid 的宿主替换说明）。
 * 卡片渲染本体走共享 PhotoCard，经注入的 MediaUrlResolver 解析地址。
 */
export function MasonryView({
  sitePhotos,
  resolver,
  grayscale,
  immersive = false,
  loadingMore,
  hasMore,
  totalItems,
  onLoadMore,
  onPhotoClick,
}: MasonryViewProps) {
  const columnCount = useResponsiveColumnCount(MASONRY_COLUMN_RULES)
  const columnGutter = immersive ? 4 : columnCount >= 4 ? 32 : columnCount === 3 ? 24 : 8
  const rowGutter = immersive ? 4 : columnCount >= 4 ? 80 : columnCount === 3 ? 72 : 56

  const [windowWidth, windowHeight] = useWindowSize()
  const containerRef = useRef<HTMLElement | null>(null)
  const { offset, width } = useContainerPosition(containerRef, [windowWidth, windowHeight])
  const { scrollTop, isScrolling } = useScroller(offset, SCROLL_FPS)

  const items = useMemo<MasonryItem[]>(() => {
    const itemCount = Math.max(sitePhotos.length, totalItems)

    return Array.from({ length: itemCount }, (_, index) => (
      sitePhotos[index] ?? {
        kind: 'loading',
        id: getLoadingItemKey(index),
        aspectRatio: LOADING_ASPECT_RATIOS[index % LOADING_ASPECT_RATIOS.length],
      }
    ))
  }, [sitePhotos, totalItems])

  const columnWidth = Math.max(
    1,
    Math.floor((width - columnGutter * (columnCount - 1)) / columnCount),
  )

  const positioner = usePositioner({
    width,
    columnWidth,
    columnGutter,
    rowGutter,
    columnCount,
  }, [immersive])

  const resizeObserver = useResizeObserver(positioner)

  const renderItem = useCallback(({ data, index }: RenderComponentProps<MasonryItem>) => {
    if (isLoadingItem(data)) {
      return <LoadingMasonryCard item={data} width={columnWidth} immersive={immersive} />
    }

    return (
      <PhotoCard
        photo={data}
        index={index}
        grayscale={grayscale}
        showMeta={!immersive}
        loading={index < 6 ? 'eager' : 'lazy'}
        resolver={resolver}
        onPhotoClick={onPhotoClick}
      />
    )
  }, [columnWidth, grayscale, immersive, onPhotoClick, resolver])

  const handleRender = useCallback((_startIndex: number, stopIndex: number) => {
    if (!hasMore || loadingMore) return

    // Keep roughly two viewports of loaded photos ahead of the render window.
    const lookahead = Math.max(16, columnCount * 8)
    if (stopIndex + lookahead >= sitePhotos.length) {
      void onLoadMore(stopIndex)
    }
  }, [columnCount, hasMore, loadingMore, onLoadMore, sitePhotos.length])

  return useMasonry<MasonryItem>({
    positioner,
    resizeObserver,
    items: width > 0 ? items : EMPTY_ITEMS,
    height: windowHeight,
    scrollTop,
    isScrolling,
    overscanBy: OVERSCAN_BY,
    itemHeightEstimate: immersive ? 280 : 360,
    itemKey: getItemKey,
    render: renderItem,
    onRender: handleRender,
    role: 'list',
    tabIndex: -1,
    containerRef,
  })
}
