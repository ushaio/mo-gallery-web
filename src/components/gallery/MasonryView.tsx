'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createPositioner,
  useContainerPosition,
  useMasonry,
  useResizeObserver,
  useScroller,
  type Positioner,
  type RenderComponentProps,
} from 'masonic'

import type { PhotoDto, PublicSettingsDto } from '@/lib/api/types'
import { MASONRY_CAPTION_HEIGHT, masonryImageHeight, photoAspectRatio } from './masonry-metrics'
import { PhotoCard } from './PhotoCard'
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
  photos: PhotoDto[]
  settings: PublicSettingsDto | null
  grayscale: boolean
  immersive?: boolean
  loadingMore: boolean
  hasMore: boolean
  totalItems: number
  onLoadMore: (targetIndex?: number) => Promise<void>
  onPhotoClick: (photo: PhotoDto) => void
}

interface LoadingMasonryItem {
  kind: 'loading'
  id: string
  aspectRatio: number
}

interface PositionerCache {
  signature: string
  positioner: Positioner
  heights: number[]
  keys: string[]
}

type MasonryItem = PhotoDto | LoadingMasonryItem

function isLoadingItem(item: MasonryItem): item is LoadingMasonryItem {
  return 'kind' in item && item.kind === 'loading'
}

function getItemKey(item: MasonryItem) {
  return item.id
}

function getLoadingItemKey(index: number) {
  return `gallery-loading-${index}`
}

function computeItemHeight(item: MasonryItem, columnWidth: number, immersive: boolean) {
  const aspectRatio = isLoadingItem(item) ? item.aspectRatio : photoAspectRatio(item)
  const imageHeight = masonryImageHeight(columnWidth, aspectRatio)
  return immersive ? imageHeight : imageHeight + MASONRY_CAPTION_HEIGHT
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
        // Mirrors PhotoCard's caption block: 16 + 20 + 6 + 18 = MASONRY_CAPTION_HEIGHT,
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

export function MasonryView({
  photos,
  settings,
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
  const positionerCacheRef = useRef<PositionerCache | null>(null)
  const { offset, width } = useContainerPosition(containerRef, [windowWidth, windowHeight])
  const { scrollTop, isScrolling } = useScroller(offset, SCROLL_FPS)

  const items = useMemo<MasonryItem[]>(() => {
    const itemCount = Math.max(photos.length, totalItems)

    return Array.from({ length: itemCount }, (_, index) => (
      photos[index] ?? {
        kind: 'loading',
        id: getLoadingItemKey(index),
        aspectRatio: LOADING_ASPECT_RATIOS[index % LOADING_ASPECT_RATIOS.length],
      }
    ))
  }, [photos, totalItems])

  const columnWidth = Math.max(
    1,
    Math.floor((width - columnGutter * (columnCount - 1)) / columnCount),
  )

  // Every item height is known up front (photo dimensions or placeholder ratio),
  // so the positioner can be seeded before masonic renders. Keep the same
  // positioner across pagination appends; otherwise replacing a loading page
  // rebuilds every cached position and causes the visible masonry grid to flash.
  const positioner = useMemo(() => {
    const signature = `${columnCount}:${columnWidth}:${columnGutter}:${rowGutter}:${immersive}`
    const cache = positionerCacheRef.current

    let shouldReset =
      width <= 0 ||
      !cache ||
      cache.signature !== signature ||
      items.length < cache.keys.length

    if (!shouldReset && cache) {
      for (let index = 0; index < cache.keys.length; index++) {
        const previousKey = cache.keys[index]
        const nextItem = items[index]
        const nextKey = nextItem ? getItemKey(nextItem) : undefined

        if (previousKey !== nextKey && previousKey !== getLoadingItemKey(index)) {
          shouldReset = true
          break
        }
      }
    }

    if (shouldReset) {
      const next = createPositioner(columnCount, columnWidth, columnGutter, rowGutter)
      const heights: number[] = []
      const keys: string[] = []

      if (width > 0) {
        for (let index = 0; index < items.length; index++) {
          const height = computeItemHeight(items[index], columnWidth, immersive)
          next.set(index, height)
          heights[index] = height
          keys[index] = getItemKey(items[index])
        }
      }

      positionerCacheRef.current = { signature, positioner: next, heights, keys }
      return next
    }

    const updates: number[] = []
    const seededItems = cache.positioner.size()
    const existingItems = Math.min(seededItems, items.length)

    for (let index = 0; index < existingItems; index++) {
      const height = computeItemHeight(items[index], columnWidth, immersive)
      const key = getItemKey(items[index])

      if (cache.heights[index] !== height) {
        updates.push(index, height)
        cache.heights[index] = height
      }

      cache.keys[index] = key
    }

    if (updates.length > 0) {
      cache.positioner.update(updates)
    }

    for (let index = seededItems; index < items.length; index++) {
      const height = computeItemHeight(items[index], columnWidth, immersive)
      cache.positioner.set(index, height)
      cache.heights[index] = height
      cache.keys[index] = getItemKey(items[index])
    }

    return cache.positioner
  }, [columnCount, columnGutter, columnWidth, immersive, items, rowGutter, width])

  const resizeObserver = useResizeObserver(positioner)

  const renderItem = useCallback(({ data, index, width: cellWidth }: RenderComponentProps<MasonryItem>) => {
    if (isLoadingItem(data)) {
      return <LoadingMasonryCard item={data} width={cellWidth} immersive={immersive} />
    }

    return (
      <PhotoCard
        photo={data}
        index={index}
        width={cellWidth}
        settings={settings}
        grayscale={grayscale}
        immersive={immersive}
        onPhotoClick={onPhotoClick}
      />
    )
  }, [grayscale, immersive, onPhotoClick, settings])

  const handleRender = useCallback((_startIndex: number, stopIndex: number) => {
    if (!hasMore || loadingMore) return

    // Keep roughly two viewports of loaded photos ahead of the render window.
    const lookahead = Math.max(16, columnCount * 8)
    if (stopIndex + lookahead >= photos.length) {
      void onLoadMore(stopIndex)
    }
  }, [columnCount, hasMore, loadingMore, onLoadMore, photos.length])

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
