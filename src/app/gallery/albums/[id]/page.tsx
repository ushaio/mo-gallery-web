'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { getAlbum, type PhotoDto, type AlbumDto } from '@/lib/api'
import { useLanguage } from '@/contexts/LanguageContext'
import { useSettings } from '@/contexts/SettingsContext'
import { PhotoDetailModal } from '@/components/PhotoDetailModal'
import { GalleryToolbar } from '@/components/gallery/GalleryHeader'
import { PhotoGrid } from '@/components/gallery/PhotoGrid'
import { ViewMode } from '@/components/gallery/ViewModeToggle'
import { ArrowLeft, ArrowUp } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

export default function AlbumDetailPage() {
  const { t } = useLanguage()
  const { settings } = useSettings()
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [album, setAlbum] = useState<AlbumDto | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      const cached = sessionStorage.getItem(`album_preview_${params.id}`)
      return cached ? JSON.parse(cached) : null
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
    const fetchAlbum = async () => {
      try {
        setLoading(true)
        const data = await getAlbum(id)
        setAlbum(data)
      } catch {
        setError(true)
      } finally {
        setLoading(false)
      }
    }
    fetchAlbum()
  }, [id])

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
    const searchLower = search.toLowerCase()
    return album.photos.filter(p =>
      p.title.toLowerCase().includes(searchLower) ||
      p.category.toLowerCase().includes(searchLower)
    )
  }, [album, search])

  if (error) {
    return (
      <div className="min-h-screen bg-background text-foreground pt-24 pb-16 flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground text-sm font-mono">Album not found</p>
        <button
          onClick={() => router.push('/gallery?view=albums')}
          className="text-xs text-primary hover:underline"
        >
          ← Back to Albums
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground pt-24 pb-16">
      {/* 相册头部 */}
      <div className="px-4 md:px-8 lg:px-12">
        <div className="max-w-screen-2xl mx-auto mb-12 md:mb-16">
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
              {/* 返回按钮 */}
              <button
                onClick={() => router.push('/gallery?view=albums')}
                className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors w-fit"
              >
                <ArrowLeft className="size-3.5" />
                {t('gallery.back_to_albums') || 'Albums'}
              </button>

              {/* 标题区域 */}
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="h-px w-6 bg-primary/60" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-primary/80">
                      Album
                    </span>
                  </div>
                  <h1 className="text-4xl md:text-5xl lg:text-6xl font-serif font-light tracking-tight">
                    {album.name}
                  </h1>
                  {album.description && (
                    <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
                      {album.description}
                    </p>
                  )}
                </div>
                <div className="text-xs font-mono text-muted-foreground tracking-wider">
                  {album.photoCount} {t('gallery.count_suffix')}
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* 工具栏 */}
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

      {/* 照片网格 */}
      <div className="px-2 sm:px-4 md:px-8 lg:px-12 pt-4 md:pt-8">
        <div className="max-w-screen-2xl mx-auto">
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
        {showBackToTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.2 }}
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
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
