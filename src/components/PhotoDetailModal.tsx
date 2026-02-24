'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
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
import { PhotoDto, resolveAssetUrl, getPhotoStory, type StoryDto, getPhotoComments, getStoryComments, type PublicCommentDto } from '@/lib/api'
import { useSettings } from '@/contexts/SettingsContext'
import { useLanguage } from '@/contexts/LanguageContext'
import { useAuth } from '@/contexts/AuthContext'
import { formatFileSize } from '@/lib/utils'
import { Toast, type Notification } from '@/components/Toast'
import { StoryTab } from '@/components/StoryTab'

type TabType = 'story' | 'info' // 面板标签类型：故事 | 信息

// 故事数据缓存，避免重复请求
interface StoryCache {
  photoId: string
  story: StoryDto | null
  comments: PublicCommentDto[]
  fetchedAt: number
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
  const [activeTab, setActiveTab] = useState<TabType>(hideStoryTab ? 'info' : 'story')
  const [dominantColors, setDominantColors] = useState<string[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const pendingNextRef = useRef(false)
  const prevPhotosLengthRef = useRef(allPhotos.length)
  
  // 故事数据缓存 - 在标签切换之间持久化
  const [storyCache, setStoryCache] = useState<StoryCache | null>(null)
  const [storyLoading, setStoryLoading] = useState(false)
  const storyFetchingRef = useRef(false)

  // 缩略图条可见性状态
  const [showThumbnails, setShowThumbnails] = useState(true)
  const thumbnailsScrollRef = useRef<HTMLDivElement>(null)

  // 移动端面板展开状态
  const [mobilePanelExpanded, setMobilePanelExpanded] = useState(false)

  // 移动端沉浸模式 - 控制控件可见性
  const [mobileControlsVisible, setMobileControlsVisible] = useState(true)
  const mobileControlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 渐进式图片加载：先显示缩略图，再淡入全尺寸图片
  const [fullImageLoaded, setFullImageLoaded] = useState(false)

  const currentPhotoIndex = photo && allPhotos.length > 0
    ? allPhotos.findIndex(p => p.id === photo.id)
    : -1
  const hasPrevious = currentPhotoIndex > 0
  const hasNextLoaded = currentPhotoIndex >= 0 && currentPhotoIndex < allPhotos.length - 1
  const canLoadMore = hasMore && onLoadMore
  const hasNext = hasNextLoaded || canLoadMore
  
  // 显示总数：优先使用传入的总数，否则使用已加载数量
  const displayTotal = totalPhotos ?? allPhotos.length
  const displayIndex = currentPhotoIndex >= 0 ? currentPhotoIndex + 1 : 0

  const handlePrevious = () => {
    if (hasPrevious && onPhotoChange) {
      onPhotoChange(allPhotos[currentPhotoIndex - 1])
    }
  }

  const handleNext = async () => {
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
  }

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
    if (!isOpen || allPhotos.length <= 1) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && hasPrevious) handlePrevious()
      if (e.key === 'ArrowRight' && hasNext) handleNext()
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, allPhotos, currentPhotoIndex, hasPrevious, hasNext])

  // 触摸滑动处理
  const [scale, setScale] = useState(1)
  const [isDragging, setIsDragging] = useState(false)
  // 用 motion value 统一控制放大时的图片位置
  const imgX = useMotionValue(0)
  const imgY = useMotionValue(0)

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

  // 拖拽关闭阈值
  const DRAG_DISMISS_THRESHOLD = 150

  // 拖拽处理
  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    setIsDragging(false)

    // 放大状态：位置已由 imgX/imgY motion value 实时更新，无需额外处理
    if (scale > 1) return

    // 垂直拖拽关闭判定
    if (Math.abs(info.offset.y) > DRAG_DISMISS_THRESHOLD) {
      onClose()
      return
    }

    // 水平拖拽切换判定
    const SWIPE_THRESHOLD = 50
    const VELOCITY_THRESHOLD = 500

    if (info.offset.x > SWIPE_THRESHOLD || info.velocity.x > VELOCITY_THRESHOLD) {
      if (hasPrevious) handlePrevious()
    } else if (info.offset.x < -SWIPE_THRESHOLD || info.velocity.x < -VELOCITY_THRESHOLD) {
      if (hasNext) handleNext()
    }
  }

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

  useEffect(() => {
    if (typeof window !== 'undefined') {
       // 更新面板高度状态以响应 mobilePanelExpanded 变化
       // 实际高度由 CSS 类控制，这里主要用于状态同步
    }
  }, [mobilePanelExpanded])

  const notify = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Math.random().toString(36).substring(2, 9)
    setNotifications((prev) => [...prev, { id, message, type }])
    setTimeout(() => setNotifications((prev) => prev.filter((n) => n.id !== id)), 2000)
  }

  // 检查照片是否在已缓存的故事中
  const isPhotoInCachedStory = useCallback((pid: string) => {
    return storyCache?.story?.photos?.some(p => p.id === pid) ?? false
  }, [storyCache?.story?.photos])

  // 获取故事数据 - 仅在故事标签激活时加载
  useEffect(() => {
    if (!photo || !isOpen || hideStoryTab || activeTab !== 'story') return

    // 如果照片在已缓存的故事中，无需重新获取
    if (storyCache && isPhotoInCachedStory(photo.id)) {
      return
    }

    // 防止重复请求
    if (storyFetchingRef.current) return
    
    const fetchStoryData = async () => {
      storyFetchingRef.current = true
      setStoryLoading(true)
      
      try {
        const storyData = await getPhotoStory(photo.id)
        let commentsData: PublicCommentDto[] = []
        
        if (storyData?.id) {
          commentsData = await getStoryComments(storyData.id)
        } else {
          commentsData = await getPhotoComments(photo.id)
        }
        
        commentsData.sort((a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
        
        setStoryCache({
          photoId: photo.id,
          story: storyData,
          comments: commentsData,
          fetchedAt: Date.now(),
        })
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load story'
        if (errorMessage.includes('No story found')) {
          // 无故事，尝试获取照片评论
          try {
            const photoComments = await getPhotoComments(photo.id)
            photoComments.sort((a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            )
            setStoryCache({
              photoId: photo.id,
              story: null,
              comments: photoComments,
              fetchedAt: Date.now(),
            })
          } catch {
            setStoryCache({
              photoId: photo.id,
              story: null,
              comments: [],
              fetchedAt: Date.now(),
            })
          }
        } else {
          console.error('Failed to load story:', err)
        }
      } finally {
        setStoryLoading(false)
        storyFetchingRef.current = false
      }
    }
    
    fetchStoryData()
  }, [photo?.id, isOpen, isPhotoInCachedStory])

  // 弹窗关闭时清除缓存并恢复页面滚动
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
      setStoryCache(null)
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  // 更新缓存中的评论列表
  const updateCommentsCache = useCallback((newComments: PublicCommentDto[]) => {
    setStoryCache(prev => prev ? { ...prev, comments: newComments } : null)
  }, [])

  useEffect(() => {
    if (photo && isOpen) {
      if (Array.isArray(photo.dominantColors) && photo.dominantColors.length > 0) {
        setDominantColors(photo.dominantColors)
      } else {
        setDominantColors([])
      }
    } else {
      setDominantColors([])
    }
  }, [photo, isOpen])

  // 照片切换时重置全尺寸图片加载状态
  useEffect(() => {
    setFullImageLoaded(false)
    setScale(1)
    imgX.set(0)
    imgY.set(0)
  }, [photo?.id])

  // 缩略图条滚动到当前照片位置
  useEffect(() => {
    if (showThumbnails && thumbnailsScrollRef.current && currentPhotoIndex >= 0) {
      const activeElement = thumbnailsScrollRef.current.children[currentPhotoIndex] as HTMLElement
      if (activeElement) {
        activeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
      }
    }
  }, [currentPhotoIndex, showThumbnails])

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
    }, 3000)
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
    setMobileControlsVisible(true)
    scheduleMobileControlsAutoHide()
  }, [isOpen, clearMobileControlsTimeout, scheduleMobileControlsAutoHide])

  useEffect(() => {
    if (mobilePanelExpanded) {
      clearMobileControlsTimeout()
      setMobileControlsVisible(true)
    }
  }, [mobilePanelExpanded, clearMobileControlsTimeout])

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      clearMobileControlsTimeout()
    }
  }, [clearMobileControlsTimeout])

  if (!photo) return null

  const exifItems = [
    { icon: Camera, label: t('gallery.equipment'), value: photo.cameraModel },
    { icon: Aperture, label: t('gallery.aperture'), value: photo.aperture },
    { icon: Timer, label: t('gallery.shutter'), value: photo.shutterSpeed },
    { icon: Gauge, label: t('gallery.iso'), value: photo.iso?.toString() },
    { icon: Camera, label: t('gallery.focal'), value: photo.focalLength },
    { 
      icon: MapPin, 
      label: 'GPS', 
      value: photo.latitude && photo.longitude ? `${photo.latitude.toFixed(4)}, ${photo.longitude.toFixed(4)}` : undefined 
    },
  ].filter(item => item.value)

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex bg-background"
        >
          <Toast notifications={notifications} remove={(id) => setNotifications(prev => prev.filter(n => n.id !== id))} />
          
          <div className="flex flex-col lg:flex-row w-full h-full overflow-hidden">
            {/* Left: Immersive Photo Viewer */}
            <div className={`relative bg-black/5 flex flex-col overflow-hidden ${mobilePanelExpanded ? 'h-[40vh] lg:h-full lg:flex-1' : 'flex-1'}`}>
              <div
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
                  onClick={onClose}
                  className={`absolute top-4 left-4 md:top-6 md:left-6 z-50 w-10 h-10 md:w-11 md:h-11 flex items-center justify-center bg-black/30 hover:bg-black/50 backdrop-blur-md text-white/80 hover:text-white rounded-full border border-white/10 hover:border-white/20 transition-all duration-300 hover:scale-105 ${
                    !mobileControlsVisible && !mobilePanelExpanded ? 'lg:flex opacity-0 pointer-events-none lg:opacity-100 lg:pointer-events-auto' : ''
                  }`}
                >
                  <X className="w-5 h-5" />
                </button>

                {/* Photo Counter - Top Right */}
                {(allPhotos.length > 1 || hasMore) && (
                  <div className={`absolute top-4 right-4 md:top-6 md:right-6 z-50 px-4 py-2 bg-black/30 backdrop-blur-md text-white/80 font-mono text-xs rounded-full border border-white/10 transition-all duration-300 ${
                    !mobileControlsVisible && !mobilePanelExpanded ? 'lg:opacity-0 lg:group-hover:opacity-100 opacity-0 pointer-events-none lg:pointer-events-auto' : 'md:opacity-0 md:group-hover:opacity-100'
                  }`}>
                    <span className="text-white">{displayIndex}</span>
                    <span className="text-white/50 mx-1">/</span>
                    <span className="text-white/50">{displayTotal}</span>
                  </div>
                )}

                {/* Dual-layer Blurred Background */}
                <div className="absolute inset-0 z-0 overflow-hidden">
                  {/* Base layer - deep blur with darkening */}
                  <div
                    className="absolute inset-0 bg-cover bg-center blur-3xl scale-125 transition-all duration-1000"
                    style={{
                      backgroundImage: `url(${resolveAssetUrl(photo.thumbnailUrl || photo.url, settings?.cdn_domain)})`,
                      opacity: 0.4,
                    }}
                  />
                  {/* Top layer - lighter blur with gradient overlay */}
                  <div
                    className="absolute inset-0 bg-cover bg-center blur-2xl scale-110 transition-all duration-700"
                    style={{
                      backgroundImage: `url(${resolveAssetUrl(photo.thumbnailUrl || photo.url, settings?.cdn_domain)})`,
                      opacity: 0.15,
                    }}
                  />
                  {/* Gradient overlays for depth */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-black/40" />
                  <div className="absolute inset-0 bg-gradient-to-r from-black/30 via-transparent to-black/30" />
                </div>

                <motion.div
                  className="absolute inset-0 flex items-center justify-center p-2 md:p-12 z-10 touch-none"
                  drag={scale === 1}
                  dragElastic={0.2}
                  dragSnapToOrigin
                  onDragStart={() => setIsDragging(true)}
                  onDragEnd={handleDragEnd}
                  onPanStart={() => { if (scale > 1) setIsDragging(true) }}
                  onPan={(_, info) => {
                    if (scale > 1) {
                      imgX.set(imgX.get() + info.delta.x)
                      imgY.set(imgY.get() + info.delta.y)
                    }
                  }}
                  onPanEnd={() => { if (scale > 1) setIsDragging(false) }}
                  style={{ x: scale > 1 ? imgX : undefined, y: scale > 1 ? imgY : undefined }}
                >
                  <div className="relative w-full h-full pointer-events-none">
                    {/* Thumbnail placeholder - shows while full image loads */}
                    <Image
                      src={resolveAssetUrl(photo.thumbnailUrl || photo.url, settings?.cdn_domain)}
                      alt={photo.title}
                      fill
                      sizes="(max-width: 1024px) 100vw, 70vw"
                      className={`object-contain select-none transition-opacity duration-500 ${
                        fullImageLoaded ? 'opacity-0' : 'opacity-100'
                      }`}
                      style={{ filter: 'blur(8px)', transform: `scale(${scale})`, transition: isDragging ? 'none' : 'transform 0.2s' }}
                      draggable={false}
                      priority
                    />
                    {/* Full resolution image */}
                    <Image
                      src={resolveAssetUrl(photo.url, settings?.cdn_domain)}
                      alt={photo.title}
                      fill
                      sizes="(max-width: 1024px) 100vw, 70vw"
                      className={`object-contain shadow-2xl select-none transition-opacity duration-700 ${
                        fullImageLoaded ? 'opacity-100' : 'opacity-0'
                      }`}
                      style={{ transform: `scale(${scale})`, transition: isDragging ? 'none' : 'transform 0.2s' }}
                      draggable={false}
                      priority
                      onLoad={() => setFullImageLoaded(true)}
                    />
                    {/* Loading indicator */}
                    {!fullImageLoaded && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="flex flex-col items-center gap-3">
                          <div className="w-8 h-8 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>

                {/* Navigation Arrows - Hidden on mobile */}
                {(allPhotos.length > 1 || hasMore) && (
                  <>
                    <button
                      onClick={handlePrevious}
                      disabled={!hasPrevious}
                      className="hidden md:flex absolute left-6 top-1/2 -translate-y-1/2 w-14 h-14 items-center justify-center bg-black/30 hover:bg-black/50 backdrop-blur-md text-white/70 hover:text-white disabled:opacity-0 disabled:pointer-events-none rounded-full border border-white/10 hover:border-white/20 transition-all duration-300 hover:scale-110 z-20 group"
                    >
                      <ChevronLeft className="w-7 h-7 transition-transform group-hover:-translate-x-0.5" />
                    </button>
                    <button
                      onClick={handleNext}
                      disabled={!hasNext || isLoadingMore}
                      className="hidden md:flex absolute right-6 top-1/2 -translate-y-1/2 w-14 h-14 items-center justify-center bg-black/30 hover:bg-black/50 backdrop-blur-md text-white/70 hover:text-white disabled:opacity-0 disabled:pointer-events-none rounded-full border border-white/10 hover:border-white/20 transition-all duration-300 hover:scale-110 z-20 group"
                    >
                      {isLoadingMore ? (
                        <Loader2 className="w-6 h-6 animate-spin" />
                      ) : (
                        <ChevronRight className="w-7 h-7 transition-transform group-hover:translate-x-0.5" />
                      )}
                    </button>
                  </>
                )}
                
                {/* Bottom Info Card - Hidden on mobile when controls not visible */}
                <div className={`absolute bottom-0 left-0 right-0 p-4 md:p-8 transition-all duration-300 pointer-events-none z-10 ${
                  mobilePanelExpanded
                    ? 'opacity-0 lg:opacity-0 lg:group-hover:opacity-100'
                    : mobileControlsVisible
                      ? 'opacity-100 md:opacity-0 md:group-hover:opacity-100'
                      : 'opacity-0 lg:opacity-0 lg:group-hover:opacity-100'
                }`}>
                  <div className="max-w-screen-2xl mx-auto">
                    <div className="inline-flex flex-col gap-2 p-4 md:p-5 bg-black/40 backdrop-blur-xl rounded-lg border border-white/10">
                      <p className="font-serif text-lg md:text-2xl text-white leading-tight">{photo.title}</p>
                      <div className="flex items-center gap-4 text-white/60">
                        {photo.takenAt && (
                          <span className="font-mono text-xs uppercase tracking-wider">
                            {user?.isAdmin
                              ? new Date(photo.takenAt).toLocaleString(locale, {
                                  year: 'numeric',
                                  month: '2-digit',
                                  day: '2-digit',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : new Date(photo.takenAt).toLocaleDateString(locale, { dateStyle: 'long' })
                            }
                          </span>
                        )}
                        {photo.cameraModel && (
                          <>
                            <span className="w-px h-3 bg-white/20" />
                            <span className="font-mono text-xs uppercase tracking-wider flex items-center gap-1.5">
                              <Camera className="w-3 h-3" />
                              {photo.cameraModel}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Thumbnail Toggle Button - Desktop only */}
                <div className="hidden md:block absolute bottom-4 right-4 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                   <button
                    onClick={toggleThumbnails}
                    className={`w-10 h-10 flex items-center justify-center bg-black/30 hover:bg-black/50 backdrop-blur-md text-white/70 hover:text-white rounded-full border border-white/10 hover:border-white/20 transition-all duration-300 ${showThumbnails ? 'bg-white/20 border-white/30' : ''}`}
                    title={showThumbnails ? 'Hide Thumbnails' : 'Show Thumbnails'}
                  >
                    {showThumbnails ? <ChevronDown className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Thumbnails Strip */}
              <AnimatePresence>
                {showThumbnails && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                    className="hidden md:block relative bg-black/20 backdrop-blur-sm border-t border-white/5 shrink-0 z-30 overflow-hidden"
                  >
                     <div
                       ref={thumbnailsScrollRef}
                       className="flex items-center gap-2 p-3 overflow-x-auto custom-scrollbar scroll-smooth h-24"
                     >
                       {allPhotos.map((p) => (
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
              
              {/* Mobile Thumbnails Strip - Hidden when controls not visible */}
              {allPhotos.length > 1 && (
                <AnimatePresence>
                  {(mobileControlsVisible || mobilePanelExpanded) && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="md:hidden relative bg-black/30 backdrop-blur-md border-t border-white/5 shrink-0 z-30"
                    >
                      <div className="flex items-center gap-1.5 p-2 overflow-x-auto scroll-smooth h-14">
                        {allPhotos.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => onPhotoChange?.(p)}
                            className={`relative flex-shrink-0 h-full aspect-square overflow-hidden transition-all duration-300 ${
                              p.id === photo.id
                                ? 'ring-2 ring-white/80 opacity-100'
                                : 'opacity-50'
                            }`}
                          >
                            <Image
                              src={resolveAssetUrl(p.thumbnailUrl || p.url, settings?.cdn_domain)}
                              alt={p.title}
                              fill
                              sizes="40px"
                              className="object-cover"
                            />
                          </button>
                        ))}
                        {hasMore && (
                          <div className="flex-shrink-0 h-full aspect-square bg-white/5 flex items-center justify-center border border-white/10">
                            {isLoadingMore ? (
                              <Loader2 className="w-3 h-3 animate-spin text-white/50" />
                            ) : (
                              <span className="text-[10px] text-white/40">+</span>
                            )}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              )}
            </div>

            {/* Right: Info & Story Panel */}
            <motion.div 
              className={`w-full lg:w-[480px] xl:w-[560px] bg-background border-t lg:border-t-0 lg:border-l border-border flex flex-col transition-all duration-300 lg:h-full lg:static fixed bottom-0 left-0 right-0 z-40 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] rounded-t-2xl lg:rounded-none overflow-hidden`}
              animate={{
                height: mobilePanelExpanded ? '80vh' : 'auto',
                y: 0
              }}
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
                <div className="w-12 h-1.5 bg-muted-foreground/30 rounded-full" />
              </motion.div>
              
              {/* Tabs with Sliding Indicator */}
              {!hideStoryTab && (
                <div className="relative flex border-b border-border">
                  {[
                    { id: 'story', icon: BookOpen, label: t('gallery.story') },
                    { id: 'info', icon: Info, label: t('gallery.info') }
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
                                  <span className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-ui-micro font-mono opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap bg-background/95 backdrop-blur-sm px-1.5 py-0.5 border border-border/50 shadow-sm">
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
                        cachedStory={storyCache?.story}
                        cachedComments={storyCache?.comments}
                        isLoading={storyLoading}
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
