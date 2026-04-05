'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, ArrowUp } from 'lucide-react'
import dynamic from 'next/dynamic'
import { getAlbum } from '@/lib/api/albums'
import type { AlbumDto, PhotoDto } from '@/lib/api/types'
import { useLanguage } from '@/contexts/LanguageContext'
import { useSettings } from '@/contexts/SettingsContext'
import { GalleryToolbar } from '@/components/gallery/GalleryHeader'
import { PhotoGrid } from '@/components/gallery/PhotoGrid'
import type { ViewMode } from '@/components/gallery/ViewModeToggle'

const PhotoDetailModal = dynamic(
  () => import('@/components/PhotoDetailModal').then((m) => m.PhotoDetailModal),
  { ssr: false },
)

export default function AlbumDetailPage() {
  const { t } = useLanguage()
  const { settings } = useSettings()
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const albumId = params.id

  const [album, setAlbum] = useState<AlbumDto | null>(() => {
    if (typeof window === 'undefined') return null

    try {
      const cachedAlbum = sessionStorage.getItem(`album_preview_${albumId}`)
      return cachedAlbum ? (JSON.parse(cachedAlbum) as AlbumDto) : null
    } catch {
      return null
    }
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoDto | null>(null)
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('masonry')
  const [grayscale, setGrayscale] = useState(true)
  const [immersive, setImmersive] = useState(true)
  const [showBackToTop, setShowBackToTop] = useState(false)

  const showBackToTopRef = useRef(false)

  useEffect(() => {
    async function fetchAlbum() {
      try {
        setLoading(true)
        const data = await getAlbum(albumId)
        setAlbum(data)
        setError(false)
      } catch {
        setError(true)
      } finally {
        setLoading(false)
      }
    }

    void fetchAlbum()
  }, [albumId])

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

  const filteredPhotos = useMemo(() => {
    if (!album) return []
    if (!search.trim()) return album.photos

    const normalizedSearch = search.toLowerCase()
    return album.photos.filter((photo) =>
      photo.title.toLowerCase().includes(normalizedSearch) ||
      photo.category.toLowerCase().includes(normalizedSearch),
    )
  }, [album, search])

  const navigateBackToAlbums = useCallback(() => {
    router.push('/gallery?view=albums')
  }, [router])

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background pb-16 pt-24 text-foreground">
        <p className="text-sm font-mono text-muted-foreground">{t('gallery.album_not_found')}</p>
        <button
          onClick={navigateBackToAlbums}
          className="text-xs text-primary hover:underline"
        >
          {t('gallery.back_to_albums')}
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-16 pt-24 text-foreground">
      <div className="px-4 md:px-8 lg:px-12">
        <div className="mx-auto mb-12 max-w-screen-2xl md:mb-16">
          {!album ? (
            <div className="animate-pulse space-y-4">
              <div className="h-4 w-24 rounded bg-muted" />
              <div className="h-12 w-64 rounded bg-muted" />
              <div className="h-4 w-48 rounded bg-muted" />
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-6"
            >
              <button
                onClick={navigateBackToAlbums}
                className="inline-flex w-fit items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="size-3.5" />
                {t('gallery.back_to_albums')}
              </button>

              <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="h-px w-6 bg-primary/60" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-primary/80">
                      {t('gallery.album_label')}
                    </span>
                  </div>
                  <h1 className="text-4xl font-serif font-light tracking-tight md:text-5xl lg:text-6xl">
                    {album.name}
                  </h1>
                  {album.description ? (
                    <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                      {album.description}
                    </p>
                  ) : null}
                </div>
                <div className="text-xs font-mono tracking-wider text-muted-foreground">
                  {album.photoCount} {t('gallery.count_suffix')}
                </div>
              </div>
            </motion.div>
          )}
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
        t={t}
      />

      <div className="px-2 pt-4 sm:px-4 md:px-8 md:pt-8 lg:px-12">
        <div className="mx-auto max-w-screen-2xl">
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
        </div>
      </div>

      <PhotoDetailModal
        photo={selectedPhoto}
        isOpen={!!selectedPhoto}
        onClose={() => setSelectedPhoto(null)}
        onPhotoChange={setSelectedPhoto}
        allPhotos={filteredPhotos}
        totalPhotos={filteredPhotos.length}
        hasMore={false}
        onLoadMore={async () => {}}
      />

      <AnimatePresence>
        {showBackToTop ? (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.2 }}
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
