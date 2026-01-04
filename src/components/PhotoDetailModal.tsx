'use client'

import { useState, useEffect, useRef, useCallback, TouchEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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
  ChevronUp,
} from 'lucide-react'
import { PhotoDto, resolveAssetUrl, getPhotoStory, type StoryDto, getPhotoComments, getStoryComments, type PublicCommentDto } from '@/lib/api'
import { useSettings } from '@/contexts/SettingsContext'
import { useLanguage } from '@/contexts/LanguageContext'
import { useAuth } from '@/contexts/AuthContext'
import { formatFileSize } from '@/lib/utils'
import { Toast, type Notification } from '@/components/Toast'
import { StoryTab } from '@/components/StoryTab'

type TabType = 'story' | 'info'

// Cache for story data to avoid re-fetching
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
  totalPhotos?: number // Total count of all photos (for display)
  hasMore?: boolean // Whether there are more photos to load
  onLoadMore?: () => Promise<void> // Callback to load more photos
  hideStoryTab?: boolean // Hide the story tab (useful when viewing from story detail page)
}

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
  
  // Story data cache - persists across tab switches
  const [storyCache, setStoryCache] = useState<StoryCache | null>(null)
  const [storyLoading, setStoryLoading] = useState(false)
  const storyFetchingRef = useRef(false)
  
  // Thumbnails visibility state
  const [showThumbnails, setShowThumbnails] = useState(true)
  const thumbnailsScrollRef = useRef<HTMLDivElement>(null)
  
  // Mobile panel state
  const [mobilePanelExpanded, setMobilePanelExpanded] = useState(false)
  
  // Touch swipe handling
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const touchMoveRef = useRef<{ x: number; y: number } | null>(null)

  const currentPhotoIndex = photo && allPhotos.length > 0
    ? allPhotos.findIndex(p => p.id === photo.id)
    : -1
  const hasPrevious = currentPhotoIndex > 0
  // Can go next if there are more loaded photos OR if there are more to load
  const hasNextLoaded = currentPhotoIndex >= 0 && currentPhotoIndex < allPhotos.length - 1
  const canLoadMore = hasMore && onLoadMore
  const hasNext = hasNextLoaded || canLoadMore
  
  // Display total: use totalPhotos if provided, otherwise use loaded count
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
      // Navigate to next loaded photo
      onPhotoChange(allPhotos[currentPhotoIndex + 1])
    } else if (canLoadMore) {
      // Mark that we want to go to next photo after loading
      pendingNextRef.current = true
      setIsLoadingMore(true)
      try {
        await onLoadMore()
      } finally {
        setIsLoadingMore(false)
      }
    }
  }

  // Effect to handle navigation after loading more photos
  useEffect(() => {
    if (pendingNextRef.current && allPhotos.length > prevPhotosLengthRef.current) {
      // New photos were loaded, navigate to the next one
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

  // Touch swipe handlers for mobile navigation
  const handleTouchStart = (e: TouchEvent) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    touchMoveRef.current = null
  }

  const handleTouchMove = (e: TouchEvent) => {
    touchMoveRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }

  const handleTouchEnd = () => {
    if (!touchStartRef.current || !touchMoveRef.current) return
    
    const deltaX = touchMoveRef.current.x - touchStartRef.current.x
    const deltaY = touchMoveRef.current.y - touchStartRef.current.y
    const minSwipeDistance = 50
    
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > minSwipeDistance) {
      if (deltaX > 0 && hasPrevious) {
        handlePrevious()
      } else if (deltaX < 0 && hasNext) {
        handleNext()
      }
    }
    
    touchStartRef.current = null
    touchMoveRef.current = null
  }

  const notify = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Math.random().toString(36).substring(2, 9)
    setNotifications((prev) => [...prev, { id, message, type }])
    setTimeout(() => setNotifications((prev) => prev.filter((n) => n.id !== id)), 2000)
  }

  // Check if the photo is within the cached story
  const isPhotoInCachedStory = useCallback((pid: string) => {
    return storyCache?.story?.photos?.some(p => p.id === pid) ?? false
  }, [storyCache?.story?.photos])

  // Fetch story data - only when story tab is active
  useEffect(() => {
    if (!photo || !isOpen || hideStoryTab || activeTab !== 'story') return
    
    // If photo is within the cached story, no need to refetch
    if (storyCache && isPhotoInCachedStory(photo.id)) {
      return
    }
    
    // Prevent duplicate fetches
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
          // No story, but try to get photo comments
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

  // Clear cache when modal closes and manage body scroll
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

  // Update comments in cache
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

  // Scroll to current photo in thumbnails
  useEffect(() => {
    if (showThumbnails && thumbnailsScrollRef.current && currentPhotoIndex >= 0) {
      const activeElement = thumbnailsScrollRef.current.children[currentPhotoIndex] as HTMLElement
      if (activeElement) {
        activeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
      }
    }
  }, [currentPhotoIndex, showThumbnails])

  const handleCopyColor = (color: string) => {
    navigator.clipboard.writeText(color)
    notify(t('common.copied'))
  }

  const toggleThumbnails = () => setShowThumbnails(!showThumbnails)
  const toggleMobilePanel = () => setMobilePanelExpanded(!mobilePanelExpanded)

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
          className="fixed inset-0 z-[100] flex bg-background/95 backdrop-blur-xl"
        >
          <Toast notifications={notifications} remove={(id) => setNotifications(prev => prev.filter(n => n.id !== id))} />
          
          <div className="flex flex-col lg:flex-row w-full h-full overflow-hidden">
            {/* Left: Immersive Photo Viewer */}
            <div className={`relative bg-black/5 flex flex-col overflow-hidden transition-all duration-300 ${mobilePanelExpanded ? 'h-[35vh] lg:h-full lg:flex-1' : 'flex-1'}`}>
              <div
                className="relative flex-1 flex items-center justify-center group overflow-hidden"
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              >
                {/* Close Button */}
                <button
                  onClick={onClose}
                  className="absolute top-4 left-4 md:top-6 md:left-6 z-50 p-2.5 bg-black/20 hover:bg-black/40 text-white/90 hover:text-white rounded-full backdrop-blur-md transition-all border border-white/10"
                >
                  <X className="w-5 h-5" />
                </button>

                {/* Photo Counter - Top Right */}
                {(allPhotos.length > 1 || hasMore) && (
                  <div className="absolute top-4 right-4 md:top-6 md:right-6 z-50 px-3 py-1.5 bg-black/40 backdrop-blur-md text-white/80 font-mono text-xs rounded border border-white/10 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-500">
                    {displayIndex} / {displayTotal}
                  </div>
                )}

                <div className="absolute inset-0 flex items-center justify-center p-2 md:p-12">
                  <img
                    src={resolveAssetUrl(photo.url, settings?.cdn_domain)}
                    alt={photo.title}
                    className="max-w-full max-h-full object-contain shadow-2xl select-none"
                    draggable={false}
                  />
                </div>

                {/* Navigation Arrows - Hidden on mobile */}
                {(allPhotos.length > 1 || hasMore) && (
                  <>
                    <button
                      onClick={handlePrevious}
                      disabled={!hasPrevious}
                      className="hidden md:block absolute left-4 top-1/2 -translate-y-1/2 p-4 text-foreground/20 hover:text-foreground disabled:opacity-0 transition-all z-20"
                    >
                      <ChevronLeft className="w-12 h-12" />
                    </button>
                    <button
                      onClick={handleNext}
                      disabled={!hasNext || isLoadingMore}
                      className="hidden md:block absolute right-4 top-1/2 -translate-y-1/2 p-4 text-foreground/20 hover:text-foreground disabled:opacity-0 transition-all z-20"
                    >
                      {isLoadingMore ? (
                        <Loader2 className="w-12 h-12 animate-spin" />
                      ) : (
                        <ChevronRight className="w-12 h-12" />
                      )}
                    </button>
                  </>
                )}
                
                {/* Bottom Meta Overlay */}
                <div className={`absolute bottom-0 left-0 right-0 p-4 md:p-8 bg-gradient-to-t from-black/50 to-transparent text-white transition-opacity duration-500 pointer-events-none z-10 ${mobilePanelExpanded ? 'opacity-0 lg:opacity-0 lg:group-hover:opacity-100' : 'opacity-100 md:opacity-0 md:group-hover:opacity-100'}`}>
                  <div className="max-w-screen-2xl mx-auto">
                    <div className="space-y-1 md:space-y-2">
                      <p className="font-serif text-lg md:text-3xl line-clamp-1">{photo.title}</p>
                      {photo.takenAt && (
                        <p className="font-mono text-xs opacity-70 uppercase tracking-widest">
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
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Thumbnail Toggle Button - Desktop only */}
                <div className="hidden md:block absolute bottom-4 right-4 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                   <button
                    onClick={toggleThumbnails}
                    className={`p-2 bg-black/40 hover:bg-black/60 text-white/90 hover:text-white rounded backdrop-blur-md transition-all border border-white/10 ${showThumbnails ? 'bg-primary/40 border-primary/40' : ''}`}
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
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, type: "spring", stiffness: 200, damping: 25 }}
                    className="hidden md:block relative bg-black/10 backdrop-blur-md border-t border-white/5 shrink-0 z-30 overflow-hidden"
                  >
                     <div
                      ref={thumbnailsScrollRef}
                      className="flex items-center gap-2 p-3 overflow-x-auto custom-scrollbar scroll-smooth h-24"
                    >
                      {allPhotos.map((p, idx) => (
                        <button
                          key={p.id}
                          onClick={() => onPhotoChange?.(p)}
                          className={`relative flex-shrink-0 h-full aspect-square rounded overflow-hidden transition-all group/thumb ${
                            p.id === photo.id
                              ? 'ring-2 ring-primary scale-95 opacity-100'
                              : 'opacity-50 hover:opacity-100 hover:scale-105'
                          }`}
                        >
                           <img
                            src={resolveAssetUrl(p.thumbnailUrl || p.url, settings?.cdn_domain)}
                            alt={p.title}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        </button>
                      ))}
                      {/* Load More Indicator in Thumbnails */}
                      {hasMore && (
                        <div className="flex-shrink-0 h-full bg-black/20 rounded flex items-center justify-center px-4">
                           {isLoadingMore ? (
                             <Loader2 className="w-4 h-4 animate-spin text-white/50" />
                           ) : (
                             <span className="text-ui-micro text-white/50">...</span>
                           )}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              
              {/* Mobile Thumbnails Strip */}
              {allPhotos.length > 1 && (
                <div className="md:hidden relative bg-black/10 backdrop-blur-md border-t border-white/5 shrink-0 z-30">
                  <div className="flex items-center gap-1.5 p-2 overflow-x-auto scroll-smooth h-16">
                    {allPhotos.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => onPhotoChange?.(p)}
                        className={`relative flex-shrink-0 h-full aspect-square rounded overflow-hidden transition-all ${
                          p.id === photo.id
                            ? 'ring-2 ring-primary opacity-100'
                            : 'opacity-50'
                        }`}
                      >
                        <img
                          src={resolveAssetUrl(p.thumbnailUrl || p.url, settings?.cdn_domain)}
                          alt={p.title}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </button>
                    ))}
                    {hasMore && (
                      <div className="flex-shrink-0 h-full aspect-square bg-black/20 rounded flex items-center justify-center">
                        {isLoadingMore ? (
                          <Loader2 className="w-3 h-3 animate-spin text-white/50" />
                        ) : (
                          <span className="text-[10px] text-white/50">...</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Right: Info & Story Panel */}
            <div className={`w-full lg:w-[480px] xl:w-[560px] bg-background border-t lg:border-t-0 lg:border-l border-border flex flex-col transition-all duration-300 ${mobilePanelExpanded ? 'flex-1' : 'h-auto lg:h-full'}`}>
              {/* Mobile Panel Handle */}
              <button
                onClick={toggleMobilePanel}
                className="lg:hidden flex items-center justify-center py-2 bg-muted/30 border-b border-border"
              >
                {mobilePanelExpanded ? <ChevronDown className="w-5 h-5 text-muted-foreground" /> : <ChevronUp className="w-5 h-5 text-muted-foreground" />}
              </button>
              
              {/* Tabs */}
              {!hideStoryTab && (
                <div className="flex border-b border-border">
                  {[
                    { id: 'story', icon: BookOpen, label: t('gallery.story') },
                    { id: 'info', icon: Info, label: t('gallery.info') }
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as TabType)}
                      className={`flex-1 flex items-center justify-center gap-2 py-5 text-ui-xs font-bold uppercase tracking-[0.2em] transition-all
                        ${activeTab === tab.id ? 'text-primary bg-primary/5' : 'text-muted-foreground hover:bg-muted/30'}
                      `}
                    >
                      <tab.icon className="w-3.5 h-3.5" />
                      {tab.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Content Area */}
              <div className="flex-1 overflow-hidden relative">
                {/* Info Tab */}
                <div className={`absolute inset-0 overflow-y-auto custom-scrollbar ${activeTab === 'info' ? '' : 'hidden'}`}>
                  <div className="p-8 md:p-12 space-y-12">
                      {/* Header Info */}
                      <div className="space-y-6 text-center">
                        <div className="inline-flex flex-wrap justify-center gap-2">
                          {photo.isFeatured && (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 text-amber-600 text-ui-micro font-bold uppercase tracking-widest border border-amber-500/20">
                              <Star className="w-3 h-3 fill-current" />
                              {t('gallery.featured')}
                            </span>
                          )}
                          {photo.category.split(',').map(cat => (
                            <span key={cat} className="px-3 py-1 bg-primary/5 text-primary text-ui-micro font-bold uppercase tracking-widest border border-primary/20">
                              {cat}
                            </span>
                          ))}
                        </div>
                        <h2 className="font-serif text-3xl md:text-4xl text-foreground">{photo.title}</h2>
                      </div>

                      <div className="w-12 h-px bg-border mx-auto" />

                      {/* Technical Grid */}
                      <div className="grid grid-cols-2 gap-x-8 gap-y-8">
                        {exifItems.map((item, i) => (
                          <div key={i} className="space-y-2">
                            <div className="flex items-center gap-2 text-muted-foreground/60">
                              <item.icon className="w-3.5 h-3.5" />
                              <span className="text-ui-micro font-bold uppercase tracking-[0.2em]">{item.label}</span>
                            </div>
                            <p className="font-mono text-sm border-b border-border/50 pb-2">{item.value}</p>
                          </div>
                        ))}
                      </div>

                      {/* File Details */}
                      <div className="p-6 bg-muted/10 border border-border/50 space-y-6">
                        <h3 className="text-ui-xs font-bold uppercase tracking-[0.2em] text-muted-foreground text-center">
                          {t('gallery.file_details')}
                        </h3>
                        <div className="flex justify-between items-center font-mono text-xs">
                          <span className="text-muted-foreground">{t('gallery.dimensions')}</span>
                          <span>{photo.width} × {photo.height}</span>
                        </div>
                        <div className="flex justify-between items-center font-mono text-xs">
                          <span className="text-muted-foreground">{t('gallery.size')}</span>
                          <span>{formatFileSize(photo.size)}</span>
                        </div>
                      </div>

                      {/* Colors */}
                      {dominantColors.length > 0 && (
                        <div className="space-y-4 text-center">
                          <h3 className="text-ui-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                            {t('gallery.palette')}
                          </h3>
                          <div className="flex justify-center flex-wrap gap-4">
                            {dominantColors.map((color, i) => (
                              <button
                                key={i}
                                onClick={() => handleCopyColor(color)}
                                className="group relative w-10 h-10 rounded-full border border-border/50 shadow-sm transition-transform hover:scale-110"
                                style={{ backgroundColor: color }}
                              >
                                <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-ui-micro font-mono opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap bg-background px-1 border border-border">
                                  {color}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                  </div>
                </div>
                {/* Story Tab - Always mounted, hidden when not active */}
                {!hideStoryTab && (
                  <div className={`absolute inset-0 overflow-y-auto custom-scrollbar ${activeTab === 'story' ? '' : 'hidden'}`}>
                    <StoryTab
                      photoId={photo.id}
                      currentPhoto={photo}
                      onPhotoChange={onPhotoChange}
                      cachedStory={storyCache?.story}
                      cachedComments={storyCache?.comments}
                      isLoading={storyLoading}
                      onCommentsUpdate={updateCommentsCache}
                    />
                  </div>
                )}
              </div>

              {/* Action Bar */}
              <div className={`p-4 md:p-6 border-t border-border bg-background flex gap-4 shrink-0 ${!mobilePanelExpanded ? 'hidden lg:flex' : ''}`}>
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
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
