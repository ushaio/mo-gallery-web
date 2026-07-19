'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence, animate, useMotionValue, type PanInfo } from 'framer-motion'
import {
  X,
  Camera,
  Aperture,
  Timer,
  Gauge,
  MapPin,
  Download,
  Info,
  Star,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Loader2,
  LayoutGrid,
  ChevronDown,
} from 'lucide-react'
import { resolveAssetUrl } from '@/lib/api/core'
import { getPhotoComments, getStoryComments } from '@/lib/api/comments'
import { getPhotoStory } from '@/lib/api/stories'
import type { PhotoDto, PublicCommentDto, StoryDto } from '@/lib/api/types'
import { useSettings } from '@/contexts/SettingsContext'
import { useLanguage } from '@/contexts/LanguageContext'
import { useAuth } from '@/contexts/AuthContext'
import { formatFileSize } from '@/lib/utils'
import { formatPhotoCoordinates } from '@/lib/photo-location'
import { Toast, type Notification } from '@/components/Toast'
import { StoryTab } from '@/components/StoryTab'
import { PhotoViewerImage } from '@/components/photo-detail/PhotoViewerImage'

const DRAG_DISMISS_THRESHOLD = 150
const SWIPE_THRESHOLD = 50
const VELOCITY_THRESHOLD = 500
const MOBILE_CONTROLS_AUTO_HIDE_DELAY = 3000
const PAN_AXIS_LOCK_THRESHOLD = 12
const THUMBNAIL_WINDOW_RADIUS = 10
const STORY_CACHE_LIMIT = 24

type TabType = 'story' | 'info' // 面板标签类型：故事 | 信息

// 故事数据缓存，避免重复请求
interface StoryCache {
  photoId: string
  story: StoryDto | null
  comments: PublicCommentDto[]
}

interface PhotoDetailModalProps {
  photo: PhotoDto | null
  isOpen: boolean
  onClose: () => void
  onPhotoChange?: (photo: PhotoDto) => void
  allPhotos?: PhotoDto[]
  totalPhotos?: number // 照片总数（用于显示）
  hasMore?: boolean // 是否还有更多照片可加载
  onLoadMore?: () => Promise<void> // 加载更多照片的回调
  hideStoryTab?: boolean // 隐藏故事标签（从故事详情页打开时使用）
}

// 照片详情弹窗 - 全屏沉浸式查看照片，包含故事、EXIF 信息、评论和下载
export function PhotoDetailModal({
  photo,
  isOpen,
  onClose,
  onPhotoChange,
  allPhotos = [],
  totalPhotos,
  hasMore = false,
  onLoadMore,
  hideStoryTab = false,
}: PhotoDetailModalProps) {
  const { settings } = useSettings()
  const { t, locale } = useLanguage()
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<TabType>('info')
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const pendingNextRef = useRef(false)
  const prevPhotosLengthRef = useRef(allPhotos.length)
  
  // 缓存最近浏览照片的故事，避免来回切图时重复请求。
  const [storyCache, setStoryCache] = useState<StoryCache | null>(null)
  const storyCacheByPhotoRef = useRef(new Map<string, StoryCache>())
  const [storyLoading, setStoryLoading] = useState(false)

  // 缩略图条可见性状态
  const [showThumbnails, setShowThumbnails] = useState(true)
  const thumbnailsScrollRef = useRef<HTMLDivElement>(null)

  // 移动端面板展开状态
  const [mobilePanelExpanded, setMobilePanelExpanded] = useState(false)

  // 移动端沉浸模式 - 控制控件可见性
  const [mobileControlsVisible, setMobileControlsVisible] = useState(true)
  const mobileControlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const imageViewportRef = useRef<HTMLDivElement>(null)

  // 渐进式图片加载：先显示缩略图，再淡入全尺寸图片
  const [loadedPhotoIds, setLoadedPhotoIds] = useState<ReadonlySet<string>>(() => new Set())
  const [imageViewportWidth, setImageViewportWidth] = useState(0)
  const [panAxis, setPanAxis] = useState<'x' | 'y' | null>(null)
  const [isSlideAnimating, setIsSlideAnimating] = useState(false)

  const currentPhotoIndex = useMemo(() => (
    photo && allPhotos.length > 0
      ? allPhotos.findIndex((candidate) => candidate.id === photo.id)
      : -1
  ), [allPhotos, photo])
  const hasPrevious = currentPhotoIndex > 0
  const hasNextLoaded = currentPhotoIndex >= 0 && currentPhotoIndex < allPhotos.length - 1
  const canLoadMore = hasMore && onLoadMore
  const hasNext = hasNextLoaded || canLoadMore
  
  // 显示总数：优先使用传入的总数，否则使用已加载数量
  const displayTotal = totalPhotos ?? allPhotos.length
  const displayIndex = currentPhotoIndex >= 0 ? currentPhotoIndex + 1 : 0
  const hasPhotoSequence = allPhotos.length > 1 || hasMore
  const thumbnailWindowStart = Math.max(0, currentPhotoIndex - THUMBNAIL_WINDOW_RADIUS)
  const thumbnailWindowEnd = Math.min(allPhotos.length, currentPhotoIndex + THUMBNAIL_WINDOW_RADIUS + 1)
  const visibleThumbnailPhotos = allPhotos.slice(thumbnailWindowStart, thumbnailWindowEnd)
  const fullImageLoaded = photo ? loadedPhotoIds.has(photo.id) : false
  const dominantColors = photo && isOpen && Array.isArray(photo.dominantColors)
    ? photo.dominantColors
    : []

  const handleClose = useCallback(() => {
    setActiveTab('info')
    onClose()
  }, [onClose])

  const handlePrevious = useCallback(() => {
    if (hasPrevious && onPhotoChange) {
      onPhotoChange(allPhotos[currentPhotoIndex - 1])
    }
  }, [allPhotos, currentPhotoIndex, hasPrevious, onPhotoChange])

  const handleNext = useCallback(async () => {
    if (!onPhotoChange) return

    if (hasNextLoaded) {
      onPhotoChange(allPhotos[currentPhotoIndex + 1])
    } else if (canLoadMore) {
      pendingNextRef.current = true
      setIsLoadingMore(true)
      try {
        await onLoadMore()
      } finally {
        setIsLoadingMore(false)
      }
    }
  }, [allPhotos, canLoadMore, currentPhotoIndex, hasNextLoaded, onLoadMore, onPhotoChange])

  // 加载更多照片后自动导航到下一张
  useEffect(() => {
    if (pendingNextRef.current && allPhotos.length > prevPhotosLengthRef.current) {
      // 新照片已加载，导航到下一张
      const nextIndex = prevPhotosLengthRef.current
      if (nextIndex < allPhotos.length && onPhotoChange) {
        onPhotoChange(allPhotos[nextIndex])
      }
      pendingNextRef.current = false
    }
    prevPhotosLengthRef.current = allPhotos.length
  }, [allPhotos, onPhotoChange])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return

      if (e.key === 'ArrowLeft' && hasPrevious) handlePrevious()
      if (e.key === 'ArrowRight' && hasNext) handleNext()
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [allPhotos.length, handleClose, handleNext, handlePrevious, hasNext, hasPrevious, isOpen])

  // 触摸滑动处理
  const [scale, setScale] = useState(1)
  const [isDragging, setIsDragging] = useState(false)
  // 用 motion value 统一控制放大时的图片位置
  const imgX = useMotionValue(0)
  const imgY = useMotionValue(0)
  const swipeX = useMotionValue(0)

  // 双击放大/缩小
  const handleDoubleTap = useCallback(() => {
    setScale(prev => {
      if (prev !== 1) {
        animate(imgX, 0, { duration: 0.2 })
        animate(imgY, 0, { duration: 0.2 })
      }
      return prev === 1 ? 2 : 1
    })
  }, [imgX, imgY])

  const prevPhoto = hasPrevious ? allPhotos[currentPhotoIndex - 1] : null
  const nextPhoto = hasNextLoaded ? allPhotos[currentPhotoIndex + 1] : null
  const handleDisplayImageLoad = useCallback((photoId: string) => {
    setLoadedPhotoIds((previous) => {
      if (previous.has(photoId)) return previous
      const next = new Set(previous)
      next.add(photoId)
      return next
    })
  }, [])

  const animateSwipeTo = useCallback(async (target: number, onComplete?: () => void) => {
    setIsSlideAnimating(true)
    try {
      await animate(swipeX, target, {
        duration: 0.24,
        ease: [0.22, 1, 0.36, 1],
      })
      onComplete?.()
    } finally {
      swipeX.set(0)
      setPanAxis(null)
      setIsSlideAnimating(false)
    }
  }, [swipeX])

  const handleImagePanStart = useCallback(() => {
    if (isSlideAnimating) return
    setIsDragging(true)
    setPanAxis(null)
  }, [isSlideAnimating])

  const handleImagePan = useCallback((_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (scale > 1) {
      imgX.set(imgX.get() + info.delta.x)
      imgY.set(imgY.get() + info.delta.y)
      return
    }

    if (isSlideAnimating) return

    if (!panAxis) {
      if (Math.abs(info.offset.x) < PAN_AXIS_LOCK_THRESHOLD && Math.abs(info.offset.y) < PAN_AXIS_LOCK_THRESHOLD) {
        return
      }
      setPanAxis(Math.abs(info.offset.x) >= Math.abs(info.offset.y) ? 'x' : 'y')
      return
    }

    if (panAxis === 'x') {
      const movingPrev = info.offset.x > 0
      const movingNext = info.offset.x < 0

      if ((movingPrev && !hasPrevious) || (movingNext && !hasNext)) {
        swipeX.set(info.offset.x * 0.2)
        return
      }

      swipeX.set(info.offset.x)
    }
  }, [hasNext, hasPrevious, imgX, imgY, isSlideAnimating, panAxis, scale, swipeX])

  const handleImagePanEnd = useCallback(async (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    setIsDragging(false)

    if (scale > 1) {
      return
    }

    if (panAxis === 'y') {
      if (Math.abs(info.offset.y) > DRAG_DISMISS_THRESHOLD) {
        handleClose()
      }
      setPanAxis(null)
      return
    }

    if (panAxis === 'x') {
      if ((info.offset.x > SWIPE_THRESHOLD || info.velocity.x > VELOCITY_THRESHOLD) && hasPrevious && imageViewportWidth > 0) {
        await animateSwipeTo(imageViewportWidth, handlePrevious)
        return
      }

      if ((info.offset.x < -SWIPE_THRESHOLD || info.velocity.x < -VELOCITY_THRESHOLD) && hasNext && imageViewportWidth > 0) {
        await animateSwipeTo(-imageViewportWidth, () => { void handleNext() })
        return
      }

      await animateSwipeTo(0)
      return
    }

    if (Math.abs(info.offset.y) > DRAG_DISMISS_THRESHOLD) {
      handleClose()
      return
    }

    if ((info.offset.x > SWIPE_THRESHOLD || info.velocity.x > VELOCITY_THRESHOLD) && hasPrevious && imageViewportWidth > 0) {
      await animateSwipeTo(imageViewportWidth, handlePrevious)
      return
    }

    if ((info.offset.x < -SWIPE_THRESHOLD || info.velocity.x < -VELOCITY_THRESHOLD) && hasNext && imageViewportWidth > 0) {
      await animateSwipeTo(-imageViewportWidth, () => { void handleNext() })
      return
    }

    await animateSwipeTo(0)
  }, [animateSwipeTo, handleClose, handleNext, handlePrevious, hasNext, hasPrevious, imageViewportWidth, panAxis, scale])

  // 面板拖拽处理
  const handlePanelDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    // 向下拖拽 (收起)
    if (info.offset.y > 100 || info.velocity.y > 500) {
      setMobilePanelExpanded(false)
    } 
    // 向上拖拽 (展开)
    else if (info.offset.y < -80 || info.velocity.y < -400) {
      setMobilePanelExpanded(true)
    }
  }

  const notify = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Math.random().toString(36).substring(2, 9)
    setNotifications((prev) => [...prev, { id, message, type }])
    setTimeout(() => setNotifications((prev) => prev.filter((n) => n.id !== id)), 2000)
  }

  // 检查照片是否在已缓存的故事中
  const isPhotoInCachedStory = useCallback((pid: string) => {
    return storyCache?.story?.photos?.some(p => p.id === pid) ?? false
  }, [storyCache?.story?.photos])

  const cacheStoryData = useCallback((cache: StoryCache) => {
    const cacheByPhoto = storyCacheByPhotoRef.current
    const relatedPhotoIds = cache.story?.photos?.map((storyPhoto) => storyPhoto.id) ?? [cache.photoId]

    for (const relatedPhotoId of relatedPhotoIds) {
      cacheByPhoto.delete(relatedPhotoId)
      cacheByPhoto.set(relatedPhotoId, cache)
    }

    while (cacheByPhoto.size > STORY_CACHE_LIMIT) {
      const oldestKey = cacheByPhoto.keys().next().value
      if (typeof oldestKey !== 'string') break
      cacheByPhoto.delete(oldestKey)
    }

    setStoryCache(cache)
  }, [])

  // 获取故事数据 - 仅在故事标签激活时加载
  useEffect(() => {
    if (!photo || !isOpen || hideStoryTab || activeTab !== 'story') return

    const cached = storyCacheByPhotoRef.current.get(photo.id)
    if (cached) {
      setStoryLoading(false)
      setStoryCache((current) => current === cached ? current : cached)
      return
    }

    const controller = new AbortController()
    
    const fetchStoryData = async () => {
      setStoryLoading(true)
      
      try {
        const storyData = await getPhotoStory(photo.id, controller.signal)
        let commentsData: PublicCommentDto[] = []
        
        if (storyData?.id) {
          commentsData = await getStoryComments(storyData.id, controller.signal)
        } else {
          commentsData = await getPhotoComments(photo.id, controller.signal)
        }
        
        commentsData = commentsData.toSorted((a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
        
        cacheStoryData({
          photoId: photo.id,
          story: storyData,
          comments: commentsData,
        })
      } catch (err) {
        if (controller.signal.aborted) return
        console.error('Failed to load story:', err)
        cacheStoryData({ photoId: photo.id, story: null, comments: [] })
      } finally {
        if (!controller.signal.aborted) setStoryLoading(false)
      }
    }
    
    void fetchStoryData()
    return () => {
      controller.abort()
    }
  }, [activeTab, cacheStoryData, hideStoryTab, isOpen, photo])

  // 弹窗关闭时清除缓存并恢复页面滚动
  useEffect(() => {
    if (!isOpen) {
      setStoryCache(null)
      return
    }

    const { body, documentElement } = document
    const previousOverflow = body.style.overflow
    const previousPaddingRight = body.style.paddingRight
    const scrollbarWidth = window.innerWidth - documentElement.clientWidth

    body.style.overflow = 'hidden'
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`
    }

    return () => {
      body.style.overflow = previousOverflow
      body.style.paddingRight = previousPaddingRight
    }
  }, [isOpen])

  // 更新缓存中的评论列表
  const updateCommentsCache = useCallback((newComments: PublicCommentDto[]) => {
    setStoryCache((previous) => {
      if (!previous) return null
      const updated = { ...previous, comments: newComments }
      const cacheByPhoto = storyCacheByPhotoRef.current

      for (const [photoId, cached] of cacheByPhoto) {
        if (cached === previous) cacheByPhoto.set(photoId, updated)
      }

      return updated
    })
  }, [])

  // 照片切换时重置全尺寸图片加载状态
  useEffect(() => {
    setScale(1)
    imgX.set(0)
    imgY.set(0)
    swipeX.set(0)
    setPanAxis(null)
  }, [imgX, imgY, photo?.id, swipeX])

  useEffect(() => {
    const node = imageViewportRef.current
    if (!node) return

    const updateWidth = () => {
      setImageViewportWidth(node.clientWidth)
    }

    updateWidth()

    const observer = new ResizeObserver(updateWidth)
    observer.observe(node)

    return () => {
      observer.disconnect()
    }
  }, [isOpen])

  // 缩略图条滚动到当前照片位置
  useEffect(() => {
    if (showThumbnails && thumbnailsScrollRef.current && currentPhotoIndex >= 0) {
      const visibleIndex = currentPhotoIndex - thumbnailWindowStart
      const activeElement = thumbnailsScrollRef.current.children[visibleIndex] as HTMLElement
      if (activeElement) {
        activeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
      }
    }
  }, [currentPhotoIndex, showThumbnails, thumbnailWindowStart])

  // 点击复制颜色值到剪贴板
  const handleCopyColor = (color: string) => {
    navigator.clipboard.writeText(color)
    notify(t('common.copied'))
  }

  const toggleThumbnails = () => setShowThumbnails(!showThumbnails)

  // 移动端照片点击 - 切换控件可见性
  const clearMobileControlsTimeout = useCallback(() => {
    if (mobileControlsTimeoutRef.current) {
      clearTimeout(mobileControlsTimeoutRef.current)
      mobileControlsTimeoutRef.current = null
    }
  }, [])

  const scheduleMobileControlsAutoHide = useCallback(() => {
    clearMobileControlsTimeout()
    mobileControlsTimeoutRef.current = setTimeout(() => {
      setMobileControlsVisible(false)
    }, MOBILE_CONTROLS_AUTO_HIDE_DELAY)
  }, [clearMobileControlsTimeout])

  const handleMobilePhotoTap = useCallback(() => {
    if (mobilePanelExpanded) return

    setMobileControlsVisible((prev) => {
      const nextVisible = !prev
      if (nextVisible) {
        scheduleMobileControlsAutoHide()
      } else {
        clearMobileControlsTimeout()
      }
      return nextVisible
    })
  }, [mobilePanelExpanded, clearMobileControlsTimeout, scheduleMobileControlsAutoHide])

  useEffect(() => {
    if (!isOpen) {
      clearMobileControlsTimeout()
      return
    }

    setMobilePanelExpanded(false)
  }, [isOpen, clearMobileControlsTimeout])

  useEffect(() => {
    if (!isOpen) {
      clearMobileControlsTimeout()
      return
    }

    if (mobilePanelExpanded) {
      clearMobileControlsTimeout()
      setMobileControlsVisible(true)
      return
    }

    setMobileControlsVisible(true)
    scheduleMobileControlsAutoHide()
  }, [
    isOpen,
    mobilePanelExpanded,
    photo?.id,
    clearMobileControlsTimeout,
    scheduleMobileControlsAutoHide,
  ])

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      clearMobileControlsTimeout()
    }
  }, [clearMobileControlsTimeout])

  if (!photo) return null

  const photoTakenLabel = photo.takenAt
    ? user?.isAdmin
      ? new Date(photo.takenAt).toLocaleString(locale, {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
      : new Date(photo.takenAt).toLocaleDateString(locale, { dateStyle: 'long' })
    : null

  const exifItems = [
    { icon: Camera, label: t('gallery.equipment'), value: photo.cameraModel },
    { icon: Aperture, label: t('gallery.aperture'), value: photo.aperture },
    { icon: Timer, label: t('gallery.shutter'), value: photo.shutterSpeed },
    { icon: Gauge, label: t('gallery.iso'), value: photo.iso?.toString() },
    { icon: Camera, label: t('gallery.focal'), value: photo.focalLength },
    { 
      icon: MapPin, 
      label: t('gallery.gps'), 
      value: formatPhotoCoordinates(photo, 4)
    },
  ].filter(item => item.value)

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 lg:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) handleClose()
          }}
        >
          <Toast notifications={notifications} remove={(id) => setNotifications(prev => prev.filter(n => n.id !== id))} />
          
          <div
            role="dialog"
            aria-modal="true"
            className="flex h-full w-full flex-col overflow-hidden bg-background shadow-2xl lg:h-[80vh] lg:w-[80vw] lg:flex-row lg:border lg:border-white/10"
          >
            {/* Left: Photo Viewer */}
            <div className={`relative bg-black/5 flex flex-col overflow-hidden ${mobilePanelExpanded ? 'h-[40vh] lg:h-full lg:flex-1' : 'flex-1'}`}>
              <div
                ref={imageViewportRef}
                className="relative flex-1 flex items-center justify-center group overflow-hidden touch-none"
                onClick={(e) => {
                  if (isDragging) return
                  if (window.innerWidth >= 1024) return

                  const target = e.target as HTMLElement
                  if (target.closest('button, a, input, textarea, select, label')) return

                  handleMobilePhotoTap()
                }}
                onDoubleClick={handleDoubleTap}
              >
                {/* Close Button - Hidden on mobile when controls not visible */}
                <button
                  onClick={handleClose}
                  className={`absolute left-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/70 text-white/80 transition-all duration-200 hover:border-white/20 hover:bg-black/85 hover:text-white md:left-6 md:top-6 md:h-11 md:w-11 lg:pointer-events-none lg:opacity-0 lg:group-hover:pointer-events-auto lg:group-hover:opacity-100 lg:focus-visible:pointer-events-auto lg:focus-visible:opacity-100 ${
                    !mobileControlsVisible && !mobilePanelExpanded ? 'pointer-events-none opacity-0' : 'pointer-events-auto opacity-100'
                  }`}
                >
                  <X className="w-5 h-5" />
                </button>

                {/* Photo Counter - Top Right */}
                {hasPhotoSequence && (
                  <div className={`absolute top-4 right-4 md:top-6 md:right-6 z-50 px-4 py-2 bg-black/70 text-white/80 font-mono text-xs rounded-full border border-white/10 transition-all duration-300 ${
                    !mobileControlsVisible && !mobilePanelExpanded ? 'lg:opacity-0 lg:group-hover:opacity-100 opacity-0 pointer-events-none lg:pointer-events-auto' : 'lg:opacity-0 lg:group-hover:opacity-100'
                  }`}>
                    <span className="text-white">{displayIndex}</span>
                    <span className="text-white/50 mx-1">/</span>
                    <span className="text-white/50">{displayTotal}</span>
                  </div>
                )}

                <motion.div
                  className="absolute inset-0 z-10 touch-none"
                  onPanStart={handleImagePanStart}
                  onPan={handleImagePan}
                  onPanEnd={handleImagePanEnd}
                >
                  {scale === 1 && imageViewportWidth > 0 ? (
                    <motion.div
                      className="absolute top-0 flex h-full"
                      style={{ width: imageViewportWidth * 3, left: -imageViewportWidth, x: swipeX }}
                    >
                      {[prevPhoto, photo, nextPhoto].map((slidePhoto, index) => (
                        <div
                          key={slidePhoto?.id ?? `empty-slide-${index}`}
                          className="relative h-full shrink-0 p-2 md:p-12"
                          style={{ width: imageViewportWidth }}
                        >
                          <PhotoViewerImage
                            photo={slidePhoto}
                            isCurrent={index === 1}
                            isDisplayLoaded={index === 1 && fullImageLoaded}
                            isDragging={isDragging}
                            scale={index === 1 ? scale : 1}
                            cdnDomain={settings?.cdn_domain}
                            onDisplayLoad={handleDisplayImageLoad}
                          />
                        </div>
                      ))}
                    </motion.div>
                  ) : (
                    <motion.div
                      className="absolute inset-0 flex items-center justify-center p-2 md:p-12"
                      style={{ x: scale > 1 ? imgX : undefined, y: scale > 1 ? imgY : undefined }}
                    >
                      <PhotoViewerImage
                        photo={photo}
                        isCurrent
                        isDisplayLoaded={fullImageLoaded}
                        isDragging={isDragging}
                        scale={scale}
                        cdnDomain={settings?.cdn_domain}
                        onDisplayLoad={handleDisplayImageLoad}
                      />
                    </motion.div>
                  )}
                </motion.div>

                {/* Navigation Arrows - Hidden on mobile */}
                {hasPhotoSequence && (
                  <>
                    <button
                      onClick={handlePrevious}
                      disabled={!hasPrevious}
                      className="absolute left-6 top-1/2 z-20 hidden h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/70 text-white/70 opacity-0 pointer-events-none transition-all duration-200 hover:border-white/20 hover:bg-black/85 hover:text-white group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto disabled:opacity-0 disabled:pointer-events-none lg:flex"
                    >
                      <ChevronLeft className="h-7 w-7" />
                    </button>
                    <button
                      onClick={handleNext}
                      disabled={!hasNext || isLoadingMore}
                      className="absolute right-6 top-1/2 z-20 hidden h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/70 text-white/70 opacity-0 pointer-events-none transition-all duration-200 hover:border-white/20 hover:bg-black/85 hover:text-white group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto disabled:opacity-0 disabled:pointer-events-none lg:flex"
                    >
                      {isLoadingMore ? (
                        <Loader2 className="w-6 h-6 animate-spin" />
                      ) : (
                        <ChevronRight className="h-7 w-7" />
                      )}
                    </button>
                  </>
                )}

                {/* Thumbnail Toggle Button - Desktop only */}
                <div className="pointer-events-none absolute bottom-4 right-4 z-20 hidden opacity-0 transition-opacity duration-200 group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100 lg:block">
                   <button
                    onClick={(event) => {
                      toggleThumbnails()
                      if (event.detail > 0) event.currentTarget.blur()
                    }}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/80 text-white transition-opacity duration-200"
                    title={showThumbnails ? t('gallery.hide_thumbnails') : t('gallery.show_thumbnails')}
                  >
                    {showThumbnails ? <ChevronDown className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Thumbnails Strip */}
              <AnimatePresence>
                {showThumbnails && (
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 12 }}
                    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                    className="hidden h-24 lg:block relative bg-black/80 border-t border-white/5 shrink-0 z-30 overflow-hidden"
                  >
                     <div
                       ref={thumbnailsScrollRef}
                       className="flex items-center gap-2 p-3 overflow-x-auto custom-scrollbar scroll-smooth h-24"
                     >
                       {visibleThumbnailPhotos.map((p) => (
                         <button
                           key={p.id}
                           onClick={() => onPhotoChange?.(p)}
                           className={`relative flex-shrink-0 h-full aspect-square rounded-lg overflow-hidden transition-all duration-300 group/thumb ${
                             p.id === photo.id
                               ? 'ring-2 ring-white/80 scale-95 opacity-100'
                               : 'opacity-40 hover:opacity-90 hover:scale-105'
                           }`}
                         >
                           <Image
                            src={resolveAssetUrl(p.thumbnailUrl || p.url, settings?.cdn_domain)}
                            alt={p.title}
                            fill
                            sizes="72px"
                            className="object-cover"
                          />
                        </button>
                      ))}
                      {/* Load More Indicator in Thumbnails */}
                      {hasMore && (
                        <div className="flex-shrink-0 h-full aspect-square bg-white/5 rounded-lg flex items-center justify-center border border-white/10">
                           {isLoadingMore ? (
                             <Loader2 className="w-4 h-4 animate-spin text-white/50" />
                           ) : (
                             <span className="text-ui-micro text-white/40">+{(totalPhotos ?? 0) - allPhotos.length}</span>
                           )}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Right: Info & Story Panel */}
            <motion.div 
              className={`w-full lg:w-[38%] lg:min-w-[320px] xl:w-[420px] bg-background border-t lg:border-t-0 lg:border-l border-border flex flex-col lg:h-full lg:static fixed bottom-0 left-0 right-0 z-40 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] overflow-hidden ${mobilePanelExpanded ? 'h-[80vh]' : 'h-auto'}`}
              drag={mobilePanelExpanded ? "y" : false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={0.05}
              onDragEnd={handlePanelDragEnd}
            >
              {/* Mobile Panel Handle - Minimal drag handle */}
              <motion.div
                className="lg:hidden flex items-center justify-center py-3 bg-background border-b border-border touch-none cursor-grab active:cursor-grabbing"
                onTap={() => setMobilePanelExpanded((prev) => !prev)}
              >
                <div className="flex min-w-0 flex-col items-center gap-2 px-4">
                  <div className="w-12 h-1.5 bg-muted-foreground/30 rounded-full" />
                  {!mobilePanelExpanded && (
                    <div className="min-w-0 text-center">
                      <p className="truncate font-serif text-sm text-foreground">{photo.title}</p>
                      {photoTakenLabel && (
                        <p className="mt-1 truncate text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                          {photoTakenLabel}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
              
              {/* Tabs with Sliding Indicator */}
              {!hideStoryTab && (
                <div className="relative flex border-b border-border">
                  {[
                    { id: 'info', icon: Info, label: t('gallery.info') },
                    { id: 'story', icon: BookOpen, label: t('gallery.story') },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as TabType)}
                      className={`relative flex-1 flex items-center justify-center gap-2 py-4 text-ui-xs font-bold uppercase tracking-[0.2em] transition-colors duration-200
                        ${activeTab === tab.id ? 'text-primary' : 'text-muted-foreground hover:text-foreground/70'}
                      `}
                    >
                      <tab.icon className="w-3.5 h-3.5" />
                      {tab.label}
                      {activeTab === tab.id && (
                        <motion.div
                          layoutId="tab-indicator"
                          className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                          transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                        />
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* Content Area with Animated Transitions */}
              <div className="flex-1 overflow-hidden relative">
                <AnimatePresence mode="wait">
                  {activeTab === 'info' && (
                    <motion.div
                      key="info-tab"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.2, ease: 'easeOut' }}
                      className="absolute inset-0 overflow-y-auto custom-scrollbar"
                    >
                      <div className="p-6 md:p-8 space-y-8">
                        {/* Header Info */}
                        <div className="space-y-4 text-center">
                          <div className="inline-flex flex-wrap justify-center gap-2">
                            {photo.isFeatured && (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 text-amber-600 text-ui-micro font-bold uppercase tracking-widest border border-amber-500/20">
                                <Star className="w-3 h-3 fill-current" />
                                {t('gallery.featured')}
                              </span>
                            )}
                            {photo.category && photo.category.split(',').filter(cat => cat.trim()).map(cat => (
                              <span key={cat} className="px-3 py-1 bg-primary/5 text-primary text-ui-micro font-bold uppercase tracking-widest border border-primary/20">
                                {cat}
                              </span>
                            ))}
                          </div>
                          <h2 className="font-serif text-2xl md:text-3xl text-foreground leading-tight">{photo.title}</h2>
                        </div>

                        <div className="w-10 h-px bg-border mx-auto" />

                        {/* Technical Grid */}
                        {exifItems.length > 0 && (
                          <div className="space-y-4">
                            <h3 className="text-ui-micro font-bold uppercase tracking-[0.2em] text-muted-foreground/60 flex items-center gap-2">
                              <Camera className="w-3 h-3" />
                              {t('gallery.equipment')}
                            </h3>
                            <div className="grid grid-cols-2 gap-x-6 gap-y-5">
                              {exifItems.map((item, i) => (
                                <div key={i} className="space-y-1.5">
                                  <div className="flex items-center gap-1.5 text-muted-foreground/50">
                                    <item.icon className="w-3 h-3" />
                                    <span className="text-ui-micro font-medium uppercase tracking-wider">{item.label}</span>
                                  </div>
                                  <p className="font-mono text-ui-xs text-foreground/90">{item.value}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* File Details */}
                        <div className="p-5 bg-muted/5 border border-border/30 space-y-4">
                          <h3 className="text-ui-micro font-bold uppercase tracking-[0.2em] text-muted-foreground/60">
                            {t('gallery.file_details')}
                          </h3>
                          <div className="space-y-3">
                            <div className="flex justify-between items-center font-mono text-ui-xs">
                              <span className="text-muted-foreground">{t('gallery.dimensions')}</span>
                              <span className="text-foreground/90">{photo.width} × {photo.height}</span>
                            </div>
                            <div className="flex justify-between items-center font-mono text-ui-xs">
                              <span className="text-muted-foreground">{t('gallery.size')}</span>
                              <span className="text-foreground/90">{formatFileSize(photo.size)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Colors */}
                        {dominantColors.length > 0 && (
                          <div className="space-y-4">
                            <h3 className="text-ui-micro font-bold uppercase tracking-[0.2em] text-muted-foreground/60 text-center">
                              {t('gallery.palette')}
                            </h3>
                            <div className="flex justify-center flex-wrap gap-3">
                              {dominantColors.map((color, i) => (
                                <button
                                  key={i}
                                  onClick={() => handleCopyColor(color)}
                                  className="group relative w-9 h-9 rounded-full border border-border/30 shadow-sm transition-all duration-200 hover:scale-125 hover:shadow-md"
                                  style={{ backgroundColor: color }}
                                  title={color}
                                >
                                  <span className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-ui-micro font-mono opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap bg-background px-1.5 py-0.5 border border-border/50 shadow-sm">
                                    {color}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                  {activeTab === 'story' && !hideStoryTab && (
                    <motion.div
                      key="story-tab"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.2, ease: 'easeOut' }}
                      className="absolute inset-0 overflow-y-auto custom-scrollbar"
                    >
                      <StoryTab
                        photoId={photo.id}
                        currentPhoto={photo}
                        onPhotoChange={onPhotoChange}
                        cachedStory={storyCache?.photoId === photo.id || isPhotoInCachedStory(photo.id) ? storyCache?.story ?? null : null}
                        cachedComments={storyCache?.photoId === photo.id || isPhotoInCachedStory(photo.id) ? storyCache?.comments ?? [] : []}
                        isLoading={storyLoading || !(storyCache?.photoId === photo.id || isPhotoInCachedStory(photo.id))}
                        onCommentsUpdate={updateCommentsCache}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Action Bar - Only show on desktop or when panel expanded on mobile */}
              <div className={`p-4 md:p-6 border-t border-border bg-background flex gap-4 shrink-0 ${!mobilePanelExpanded ? 'hidden lg:flex' : 'flex'}`}>
                <a
                  href={resolveAssetUrl(photo.url, settings?.cdn_domain)}
                  target="_blank"
                  download
                  className="flex-1 flex items-center justify-center gap-3 py-3 bg-foreground text-background hover:bg-foreground/90 transition-colors text-xs font-bold uppercase tracking-[0.2em]"
                >
                  <Download className="w-4 h-4" />
                  {t('gallery.download')}
                </a>
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
