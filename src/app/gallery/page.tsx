'use client'

import { useState, useEffect, useMemo } from 'react'
import { getPhotos, getCategories, type PhotoDto } from '@/lib/api'
import { useLanguage } from '@/contexts/LanguageContext'
import { useSettings } from '@/contexts/SettingsContext'
import { PhotoDetailModal } from '@/components/PhotoDetailModal'
import { GalleryHeader } from '@/components/gallery/GalleryHeader'
import { PhotoGrid } from '@/components/gallery/PhotoGrid'
import { ViewMode } from '@/components/gallery/ViewModeToggle'

export default function GalleryPage() {
  const { t } = useLanguage()
  const { settings } = useSettings()
  const [photos, setPhotos] = useState<PhotoDto[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [activeCategory, setActiveCategory] = useState('全部')
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('masonry')

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [photosData, categoriesData] = await Promise.all([
          getPhotos(),
          getCategories()
        ])
        setPhotos(photosData)
        setCategories(['全部', ...categoriesData.filter(c => c !== '全部')])
      } catch (error) {
        console.error('Failed to fetch gallery data:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const filteredPhotos = useMemo(() => {
    if (activeCategory === '全部') return photos
    return photos.filter(p => p.category.includes(activeCategory))
  }, [photos, activeCategory])

  return (
    <div className="min-h-screen bg-background text-foreground pt-24 pb-16 px-4 md:px-8 lg:px-12">
      <div className="max-w-screen-2xl mx-auto">
        <GalleryHeader
          activeCategory={activeCategory}
          categories={categories}
          onCategoryChange={setActiveCategory}
          photoCount={filteredPhotos.length}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          t={t}
        />

        <PhotoGrid
          loading={loading}
          photos={filteredPhotos}
          settings={settings}
          viewMode={viewMode}
          onPhotoClick={setSelectedPhoto}
          t={t}
        />
      </div>

      <PhotoDetailModal
        photo={selectedPhoto}
        isOpen={!!selectedPhoto}
        onClose={() => setSelectedPhoto(null)}
      />
    </div>
  )
}