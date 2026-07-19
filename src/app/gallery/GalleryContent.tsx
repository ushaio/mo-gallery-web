'use client'

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUp, Loader2 } from 'lucide-react'
import dynamic from 'next/dynamic'
import { getAlbums } from '@/lib/api/albums'
import { getCategories, getPhotosWithMeta } from '@/lib/api/photos'
import { setAlbumPreview } from '@/lib/gallery-session'
import type { AlbumDto, PhotoDto, PhotoPaginationMeta } from '@/lib/api/types'
import { useLanguage } from '@/contexts/LanguageContext'
import { useSettings } from '@/contexts/SettingsContext'
import { AlbumGrid } from '@/components/gallery/AlbumGrid'
import { GalleryHeader, GalleryToolbar, type GalleryView } from '@/components/gallery/GalleryHeader'
import { PhotoGrid } from '@/components/gallery/PhotoGrid'
import type { ViewMode } from '@/components/gallery/ViewModeToggle'

const loadPhotoDetailModal = () => (
  import('@/components/PhotoDetailModal').then((module) => module.PhotoDetailModal)
)

const PhotoDetailModal = dynamic(loadPhotoDetailModal, { ssr: false })

const PAGE_SIZE = 40
// Masonry can outrun sequential page loads on fast scrolls, so a single
// loadMore call may fetch a few pages in parallel to catch up faster.
const MAX_LOAD_MORE_PAGES = 3
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
  const [meta, setMeta] = useState<PhotoPaginationMeta | null>(initialMeta)
  const [albums, setAlbums] = useState<AlbumDto[]>([])
  const [albumsLoading, setAlbumsLoading] = useState(false)

  const loadMoreRef = useRef<HTMLDivElement>(null)
  const isLoadingRef = useRef(false)
  const requestVersionRef = useRef(0)
  const showBackToTopRef = useRef(false)

  // Warm the modal chunk after the gallery becomes interactive so the first
  // photo click does not wait for JavaScript loading and evaluation.
  useEffect(() => {
    const preload = () => {
      void loadPhotoDetailModal()
    }

    if ('requestIdleCallback' in window) {
      const idleId = window.requestIdleCallback(preload, { timeout: 1500 })
      return () => window.cancelIdleCallback(idleId)
    }

    const timeoutId = globalThis.setTimeout(preload, 300)
    return () => globalThis.clearTimeout(timeoutId)
  }, [])

  const deferredSearch = useDeferredValue(search)
  const currentCategory = activeCategory !== ALL_CATEGORY_KEY ? activeCategory : undefined
  const hasSearch = deferredSearch.trim().length > 0

  const handleViewChange = useCallback((nextView: GalleryView) => {
    setView(nextView)
    setSearch('')
    const url = nextView === 'albums' ? '/gallery?view=albums' : '/gallery'
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
  const isInitialLoad = useRef(initialView === 'photos')
  useEffect(() => {
    if (view !== 'photos') return
    if (isInitialLoad.current) {
      isInitialLoad.current = false
      return
    }

    let stale = false
    const requestVersion = requestVersionRef.current + 1
    requestVersionRef.current = requestVersion
    isLoadingRef.current = false
    setLoadingMore(false)

    async function fetchPhotos() {
      try {
        setLoading(true)
        setPhotos([])
        setMeta(null)

        const [photosResult, categoriesData] = await Promise.all([
          getPhotosWithMeta({ category: currentCategory, page: 1, pageSize: PAGE_SIZE }),
          getCategories(),
        ])

        if (stale || requestVersion !== requestVersionRef.current) return

        setPhotos(photosResult.data)
        setMeta(photosResult.meta)
        setCategories([
          ALL_CATEGORY_KEY,
          ...categoriesData.filter((category) => !LEGACY_ALL_CATEGORIES.has(category)),
        ])
      } catch (error) {
        if (!stale && requestVersion === requestVersionRef.current) {
          console.error('Failed to fetch gallery data:', error)
        }
      } finally {
        if (!stale && requestVersion === requestVersionRef.current) {
          setLoading(false)
        }
      }
    }

    void fetchPhotos()
    return () => { stale = true }
  }, [currentCategory, view])

  const loadMore = useCallback(async (targetIndex?: number): Promise<void> => {
    if (isLoadingRef.current || !meta?.hasMore) return

    const requestVersion = requestVersionRef.current
    isLoadingRef.current = true
    setLoadingMore(true)

    try {
      const firstPage = meta.page + 1
      const loadedCount = meta.page * meta.pageSize
      const remainingPages = Math.max(1, meta.totalPages - meta.page)
      const wantedPages = targetIndex === undefined
        ? 1
        : Math.ceil((targetIndex + 1 + PAGE_SIZE - loadedCount) / PAGE_SIZE)
      const pageCount = Math.min(
        MAX_LOAD_MORE_PAGES,
        remainingPages,
        Math.max(1, wantedPages),
      )

      const results = await Promise.allSettled(
        Array.from({ length: pageCount }, (_, offset) => getPhotosWithMeta({
          category: currentCategory,
          page: firstPage + offset,
          pageSize: PAGE_SIZE,
        })),
      )

      if (requestVersion !== requestVersionRef.current) return

      // Only the contiguous prefix of successful pages can be appended,
      // otherwise a failed middle page would leave a hole in the list.
      const pages: Awaited<ReturnType<typeof getPhotosWithMeta>>[] = []
      for (const result of results) {
        if (result.status !== 'fulfilled') break
        pages.push(result.value)
      }

      if (pages.length === 0) {
        const failure = results[0]
        throw failure.status === 'rejected' ? failure.reason : new Error('Failed to load more photos')
      }

      setPhotos((previous) => {
        const existingIds = new Set(previous.map((photo) => photo.id))
        const nextPhotos = [...previous]

        for (const page of pages) {
          for (const photo of page.data) {
            if (!existingIds.has(photo.id)) {
              existingIds.add(photo.id)
              nextPhotos.push(photo)
            }
          }
        }

        return nextPhotos
      })
      setMeta(pages[pages.length - 1].meta)
    } catch (error) {
      if (requestVersion === requestVersionRef.current) {
        console.error('Failed to load more photos:', error)
      }
    } finally {
      if (requestVersion === requestVersionRef.current) {
        setLoadingMore(false)
        isLoadingRef.current = false
      }
    }
  }, [currentCategory, meta])

  // Infinite scroll observer
  useEffect(() => {
    if (viewMode === 'masonry') return

    // Start loading roughly one viewport before the sentinel reaches the screen.
    const preloadDistance = Math.max(window.innerHeight * 2, 1200)
    const observer = new IntersectionObserver(
      (entries) => {
        const firstEntry = entries[0]
        if (firstEntry?.isIntersecting && meta?.hasMore && !loading && !loadingMore) {
          void loadMore()
        }
      },
      {
        threshold: 0,
        rootMargin: `0px 0px ${preloadDistance}px 0px`,
      },
    )

    const currentElement = loadMoreRef.current
    if (currentElement) observer.observe(currentElement)

    return () => {
      if (currentElement) observer.unobserve(currentElement)
      observer.disconnect()
    }
  }, [loadMore, loading, loadingMore, meta?.hasMore, viewMode])

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
      setAlbumPreview(albumId, album)
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
            ) : (
              <motion.div
                key="photos"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{ opacity: isFilterPending ? 0.6 : 1 }}
              >
                <div
                  inert={selectedPhoto ? true : undefined}
                  className={selectedPhoto ? 'pointer-events-none select-none' : undefined}
                >
                  <PhotoGrid
                    key={`${currentCategory ?? ALL_CATEGORY_KEY}:${deferredSearch}:${viewMode}:${immersive}`}
                    loading={loading}
                    photos={filteredPhotos}
                    settings={settings}
                    viewMode={viewMode}
                    grayscale={grayscale}
                    immersive={immersive}
                    loadingMore={loadingMore}
                    hasMore={hasMorePhotos}
                    totalItems={hasSearch ? filteredPhotos.length : (meta?.total ?? filteredPhotos.length)}
                    onLoadMore={loadMore}
                    onPhotoClick={setSelectedPhoto}
                    t={t}
                  />
                </div>

                {!loading && hasMorePhotos && viewMode !== 'masonry' ? (
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
