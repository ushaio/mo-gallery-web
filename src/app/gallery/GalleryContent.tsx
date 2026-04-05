'use client'

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUp, Loader2 } from 'lucide-react'
import dynamic from 'next/dynamic'
import { getAlbums } from '@/lib/api/albums'
import { getCategories, getPhotosWithMeta } from '@/lib/api/photos'
import type { AlbumDto, PhotoDto, PhotoPaginationMeta } from '@/lib/api/types'
import { useLanguage } from '@/contexts/LanguageContext'
import { useSettings } from '@/contexts/SettingsContext'
import { AlbumGrid } from '@/components/gallery/AlbumGrid'
import { FilmStripView } from '@/components/gallery/FilmStripView'
import { GalleryHeader, GalleryToolbar, type GalleryView } from '@/components/gallery/GalleryHeader'
import { PhotoGrid } from '@/components/gallery/PhotoGrid'
import type { ViewMode } from '@/components/gallery/ViewModeToggle'

const PhotoDetailModal = dynamic(
  () => import('@/components/PhotoDetailModal').then((m) => m.PhotoDetailModal),
  { ssr: false },
)

const PAGE_SIZE = 20
const ALL_CATEGORY_KEY = 'all'
const LEGACY_ALL_CATEGORIES = new Set(['all', '全部'])

interface GalleryContentProps {
  initialPhotos: PhotoDto[]
  initialMeta: PhotoPaginationMeta | null
  initialCategories: string[]
  initialView: GalleryView
  initialPhotoId?: string
}

export function GalleryContent({
  initialPhotos,
  initialMeta,
  initialCategories,
  initialView,
  initialPhotoId,
}: GalleryContentProps) {
  const { t } = useLanguage()
  const { settings } = useSettings()
  const router = useRouter()

  const [view, setView] = useState<GalleryView>(initialView)
  const [photos, setPhotos] = useState<PhotoDto[]>(initialPhotos)
  const [categories, setCategories] = useState<string[]>(() => [
    ALL_CATEGORY_KEY,
    ...initialCategories.filter((c) => !LEGACY_ALL_CATEGORIES.has(c)),
  ])
  const [activeCategory, setActiveCategory] = useState(ALL_CATEGORY_KEY)
  const [search, setSearch] = useState('')
  const [isFilterPending, startFilterTransition] = useTransition()
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoDto | null>(() => {
    if (initialPhotoId) {
      return initialPhotos.find((p) => p.id === initialPhotoId) ?? null
    }
    return null
  })
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('masonry')
  const [grayscale, setGrayscale] = useState(true)
  const [immersive, setImmersive] = useState(true)
  const [showBackToTop, setShowBackToTop] = useState(false)
  const [page, setPage] = useState(1)
  const [meta, setMeta] = useState<PhotoPaginationMeta | null>(initialMeta)
  const [albums, setAlbums] = useState<AlbumDto[]>([])
  const [albumsLoading, setAlbumsLoading] = useState(false)

  const loadMoreRef = useRef<HTMLDivElement>(null)
  const isLoadingRef = useRef(false)
  const showBackToTopRef = useRef(false)

  const deferredSearch = useDeferredValue(search)
  const currentCategory = activeCategory !== ALL_CATEGORY_KEY ? activeCategory : undefined
  const hasSearch = deferredSearch.trim().length > 0

  const handleViewChange = useCallback((nextView: GalleryView) => {
    setView(nextView)
    setSearch('')
    const url = nextView === 'albums'
      ? '/gallery?view=albums'
      : nextView === 'film'
        ? '/gallery?view=film'
        : '/gallery'
    router.push(url, { scroll: false })
  }, [router])

  // Fetch albums when switching to album view
  useEffect(() => {
    if (view !== 'albums') return

    async function fetchAlbums() {
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

    void fetchAlbums()
  }, [view])

  // Refetch photos only when category changes (skip initial load since we have server data)
  const isInitialLoad = useRef(true)
  useEffect(() => {
    if (view !== 'photos' && view !== 'film') return
    if (isInitialLoad.current) {
      isInitialLoad.current = false
      return
    }

    let stale = false

    async function fetchPhotos() {
      try {
        setLoading(true)
        setPhotos([])
        setPage(1)

        const [photosResult, categoriesData] = await Promise.all([
          getPhotosWithMeta({ category: currentCategory, page: 1, pageSize: PAGE_SIZE }),
          getCategories(),
        ])

        if (stale) return

        setPhotos(photosResult.data)
        setMeta(photosResult.meta)
        setCategories([
          ALL_CATEGORY_KEY,
          ...categoriesData.filter((category) => !LEGACY_ALL_CATEGORIES.has(category)),
        ])
      } catch (error) {
        if (!stale) console.error('Failed to fetch gallery data:', error)
      } finally {
        if (!stale) setLoading(false)
      }
    }

    void fetchPhotos()
    return () => { stale = true }
  }, [currentCategory, view])

  const loadMore = useCallback(async (): Promise<void> => {
    if (isLoadingRef.current || !meta?.hasMore) return

    isLoadingRef.current = true
    setLoadingMore(true)

    try {
      const nextPage = page + 1
      const result = await getPhotosWithMeta({
        category: currentCategory,
        page: nextPage,
        pageSize: PAGE_SIZE,
      })

      setPhotos((previous) => [...previous, ...result.data])
      setMeta(result.meta)
      setPage(nextPage)
    } catch (error) {
      console.error('Failed to load more photos:', error)
    } finally {
      setLoadingMore(false)
      isLoadingRef.current = false
    }
  }, [currentCategory, meta?.hasMore, page])

  // Infinite scroll observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const firstEntry = entries[0]
        if (firstEntry?.isIntersecting && meta?.hasMore && !loading && !loadingMore) {
          void loadMore()
        }
      },
      { threshold: 0.1, rootMargin: '100px' },
    )

    const currentElement = loadMoreRef.current
    if (currentElement) observer.observe(currentElement)

    return () => {
      if (currentElement) observer.unobserve(currentElement)
      observer.disconnect()
    }
  }, [loadMore, loading, loadingMore, meta?.hasMore])

  // Back-to-top scroll listener
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

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const filteredPhotos = useMemo(() => {
    if (!hasSearch) return photos

    const normalizedSearch = deferredSearch.toLowerCase()
    return photos.filter((photo) => (
      photo.title.toLowerCase().includes(normalizedSearch) ||
      photo.category.toLowerCase().includes(normalizedSearch)
    ))
  }, [hasSearch, photos, deferredSearch])

  const displayCount = hasSearch ? filteredPhotos.length : (meta?.total ?? photos.length)

  const handleAlbumClick = useCallback((albumId: string) => {
    const album = albums.find((item) => item.id === albumId)
    if (album) {
      sessionStorage.setItem(`album_preview_${albumId}`, JSON.stringify(album))
    }
    router.push(`/gallery/albums/${albumId}`)
  }, [albums, router])

  const handleCategoryChange = useCallback((category: string) => {
    startFilterTransition(() => {
      setActiveCategory(category)
      setSearch('')
    })
  }, [startFilterTransition])

  const hasMorePhotos = !hasSearch && (meta?.hasMore ?? false)
  const loadingMoreText = t('gallery.loadingMore')
  const noMoreText = meta?.total != null
    ? `${t('gallery.noMore')} (${meta.total})`
    : t('gallery.noMore')

  return (
    <div className="min-h-screen bg-background text-foreground pt-24 pb-16">
      <div className="px-4 md:px-8 lg:px-12">
        <div className="max-w-screen-2xl mx-auto">
          <GalleryHeader
            activeCategory={activeCategory}
            categories={categories}
            onCategoryChange={handleCategoryChange}
            photoCount={displayCount}
            albumCount={albums.length}
            view={view}
            onViewChange={handleViewChange}
            t={t}
          />
        </div>
      </div>

      <GalleryToolbar
        search={search}
        onSearchChange={setSearch}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        grayscale={grayscale}
        onGrayscaleChange={setGrayscale}
        immersive={immersive}
        onImmersiveChange={setImmersive}
        view={view}
        t={t}
      />

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
            ) : view === 'film' ? (
              <motion.div
                key="film"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{ opacity: isFilterPending ? 0.6 : 1 }}
              >
                <FilmStripView
                  photos={filteredPhotos}
                  settings={settings}
                  grayscale={grayscale}
                  onPhotoClick={setSelectedPhoto}
                  loading={loading}
                />
              </motion.div>
            ) : (
              <motion.div
                key="photos"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{ opacity: isFilterPending ? 0.6 : 1 }}
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

                {!loading && hasMorePhotos ? (
                  <div ref={loadMoreRef} className="flex items-center justify-center py-8">
                    {loadingMore ? (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="size-5 animate-spin" />
                        <span className="text-sm">{loadingMoreText}</span>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {!loading && !meta?.hasMore && photos.length > 0 && !hasSearch ? (
                  <div className="flex items-center justify-center py-8">
                    <span className="text-sm text-muted-foreground">{noMoreText}</span>
                  </div>
                ) : null}
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
        totalPhotos={hasSearch ? filteredPhotos.length : meta?.total}
        hasMore={hasMorePhotos}
        onLoadMore={loadMore}
      />

      <AnimatePresence>
        {showBackToTop ? (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onClick={scrollToTop}
            className="fixed bottom-8 right-8 z-40 rounded-full bg-primary p-3 text-primary-foreground shadow-lg"
            aria-label={t('gallery.back_to_top')}
          >
            <ArrowUp className="size-6" />
          </motion.button>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
