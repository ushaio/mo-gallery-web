'use client'

import { Suspense, useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getPhotosWithMeta, getCategories, getAlbums, type PhotoDto, type PhotoPaginationMeta, type AlbumDto } from '@/lib/api'
import { useLanguage } from '@/contexts/LanguageContext'
import { useSettings } from '@/contexts/SettingsContext'
import { PhotoDetailModal } from '@/components/PhotoDetailModal'
import { GalleryHeader, GalleryToolbar, type GalleryView } from '@/components/gallery/GalleryHeader'
import { PhotoGrid } from '@/components/gallery/PhotoGrid'
import { AlbumGrid } from '@/components/gallery/AlbumGrid'
import { ViewMode } from '@/components/gallery/ViewModeToggle'
import { ArrowUp, Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

const PAGE_SIZE = 20

function GalleryContent() {
  const { t } = useLanguage()
  const { settings } = useSettings()
  const router = useRouter()
  const searchParams = useSearchParams()

  // 视图状态：photos | albums
  const [view, setView] = useState<GalleryView>(() => {
    return (searchParams.get('view') as GalleryView) === 'albums' ? 'albums' : 'photos'
  })

  const [photos, setPhotos] = useState<PhotoDto[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [activeCategory, setActiveCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('masonry')
  const [grayscale, setGrayscale] = useState(true)
  const [immersive, setImmersive] = useState(true)
  const [showBackToTop, setShowBackToTop] = useState(false)
  const [page, setPage] = useState(1)
  const [meta, setMeta] = useState<PhotoPaginationMeta | null>(null)

  // 相册数据
  const [albums, setAlbums] = useState<AlbumDto[]>([])
  const [albumsLoading, setAlbumsLoading] = useState(false)

  const loadMoreRef = useRef<HTMLDivElement>(null)
  const isLoadingRef = useRef(false)

  // 切换视图时更新 URL
  const handleViewChange = useCallback((newView: GalleryView) => {
    setView(newView)
    setSearch('')
    if (newView === 'albums') {
      router.push('/gallery?view=albums', { scroll: false })
    } else {
      router.push('/gallery', { scroll: false })
    }
  }, [router])

  // 加载相册数据
  useEffect(() => {
    if (view !== 'albums') return
    const fetchAlbums = async () => {
      setAlbumsLoading(true)
      try {
        const data = await getAlbums()
        setAlbums(data)
      } catch (error) {
        console.error('Failed to fetch albums:', error)
      } finally {
        setAlbumsLoading(false)
      }
    }
    fetchAlbums()
  }, [view])

  // 加载照片数据
  useEffect(() => {
    if (view !== 'photos') return
    const fetchInitialData = async () => {
      try {
        setLoading(true)
        setPhotos([])
        setPage(1)

        const category = activeCategory !== 'all' ? activeCategory : undefined
        const [photosResult, categoriesData] = await Promise.all([
          getPhotosWithMeta({ category, page: 1, pageSize: PAGE_SIZE }),
          getCategories()
        ])

        setPhotos(photosResult.data)
        setMeta(photosResult.meta)
        setCategories(['all', ...categoriesData.filter(c => c !== 'all' && c !== '全部')])
      } catch (error) {
        console.error('Failed to fetch gallery data:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchInitialData()
  }, [activeCategory, view])

  const loadMore = useCallback(async (): Promise<void> => {
    if (isLoadingRef.current || !meta?.hasMore) return

    isLoadingRef.current = true
    setLoadingMore(true)

    try {
      const nextPage = page + 1
      const category = activeCategory !== 'all' ? activeCategory : undefined
      const result = await getPhotosWithMeta({ category, page: nextPage, pageSize: PAGE_SIZE })

      setPhotos(prev => [...prev, ...result.data])
      setMeta(result.meta)
      setPage(nextPage)
    } catch (error) {
      console.error('Failed to load more photos:', error)
    } finally {
      setLoadingMore(false)
      isLoadingRef.current = false
    }
  }, [page, activeCategory, meta?.hasMore])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0]
        if (first.isIntersecting && meta?.hasMore && !loading && !loadingMore) {
          loadMore()
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    )

    const currentRef = loadMoreRef.current
    if (currentRef) observer.observe(currentRef)
    return () => { if (currentRef) observer.unobserve(currentRef) }
  }, [loadMore, meta?.hasMore, loading, loadingMore])

  const showBackToTopRef = useRef(false)
  useEffect(() => {
    const handleScroll = () => {
      const shouldShow = window.scrollY > 400
      if (shouldShow !== showBackToTopRef.current) {
        showBackToTopRef.current = shouldShow
        setShowBackToTop(shouldShow)
      }
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' })

  const filteredPhotos = useMemo(() => {
    if (!search.trim()) return photos
    const searchLower = search.toLowerCase()
    return photos.filter(p =>
      p.title.toLowerCase().includes(searchLower) ||
      p.category.toLowerCase().includes(searchLower)
    )
  }, [photos, search])

  const displayCount = search.trim() ? filteredPhotos.length : (meta?.total ?? photos.length)

  const handleAlbumClick = (albumId: string) => {
    const album = albums.find(a => a.id === albumId)
    if (album) {
      sessionStorage.setItem(`album_preview_${albumId}`, JSON.stringify(album))
    }
    router.push(`/gallery/albums/${albumId}`)
  }

  return (
    <div className="min-h-screen bg-background text-foreground pt-24 pb-16">
      {/* 页面头部区域 */}
      <div className="px-4 md:px-8 lg:px-12">
        <div className="max-w-screen-2xl mx-auto">
          <GalleryHeader
            activeCategory={activeCategory}
            categories={categories}
            onCategoryChange={(cat) => {
              setActiveCategory(cat)
              setSearch('')
            }}
            photoCount={displayCount}
            albumCount={albums.length}
            view={view}
            onViewChange={handleViewChange}
            t={t}
          />
        </div>
      </div>

      {/* 吸顶工具栏 */}
      <GalleryToolbar
        search={search}
        onSearchChange={setSearch}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        grayscale={grayscale}
        onGrayscaleChange={setGrayscale}
        immersive={immersive}
        onImmersiveChange={setImmersive}
        t={t}
      />

      {/* 内容区域 */}
      <div className="px-2 sm:px-4 md:px-8 lg:px-12 pt-4 md:pt-8">
        <div className="max-w-screen-2xl mx-auto">
          <AnimatePresence mode="wait">
            {view === 'albums' ? (
              <motion.div
                key="albums"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <AlbumGrid albums={albums} onAlbumClick={handleAlbumClick} isLoading={albumsLoading} t={t} />
              </motion.div>
            ) : (
              <motion.div
                key="photos"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <PhotoGrid
                  loading={loading}
                  photos={filteredPhotos}
                  settings={settings}
                  viewMode={viewMode}
                  grayscale={grayscale}
                  immersive={immersive}
                  onPhotoClick={setSelectedPhoto}
                  t={t}
                />

                {!loading && meta?.hasMore && !search.trim() && (
                  <div ref={loadMoreRef} className="flex justify-center items-center py-8">
                    {loadingMore && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="size-5 animate-spin" />
                        <span className="text-sm">{t('gallery.loadingMore') || '加载更多...'}</span>
                      </div>
                    )}
                  </div>
                )}

                {!loading && !meta?.hasMore && photos.length > 0 && !search.trim() && (
                  <div className="flex justify-center items-center py-8">
                    <span className="text-sm text-muted-foreground">
                      {t('gallery.noMore') || `已加载全部 ${meta?.total ?? photos.length} 张照片`}
                    </span>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <PhotoDetailModal
        photo={selectedPhoto}
        isOpen={!!selectedPhoto}
        onClose={() => setSelectedPhoto(null)}
        onPhotoChange={setSelectedPhoto}
        allPhotos={filteredPhotos}
        totalPhotos={search.trim() ? filteredPhotos.length : meta?.total}
        hasMore={!search.trim() && (meta?.hasMore ?? false)}
        onLoadMore={loadMore}
      />

      <AnimatePresence>
        {showBackToTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            onClick={scrollToTop}
            className="fixed bottom-8 right-8 p-3 bg-primary text-primary-foreground rounded-full shadow-lg z-40"
            aria-label="Back to top"
          >
            <ArrowUp className="size-6" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function GalleryPage() {
  return (
    <Suspense>
      <GalleryContent />
    </Suspense>
  )
}
