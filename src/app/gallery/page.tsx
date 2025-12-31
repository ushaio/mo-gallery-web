'use client'

import { useState, useEffect, useMemo } from 'react'
import { getPhotos, getCategories, type PhotoDto } from '@/lib/api'
import { useLanguage } from '@/contexts/LanguageContext'
import { useSettings } from '@/contexts/SettingsContext'
import { PhotoDetailModal } from '@/components/PhotoDetailModal'
import { GalleryHeader, GalleryToolbar } from '@/components/gallery/GalleryHeader'
import { PhotoGrid } from '@/components/gallery/PhotoGrid'
import { ViewMode } from '@/components/gallery/ViewModeToggle'

export default function GalleryPage() {
  const { t } = useLanguage()
  const { settings } = useSettings()
  const [photos, setPhotos] = useState<PhotoDto[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [activeCategory, setActiveCategory] = useState('全部')
  const [search, setSearch] = useState('')
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('masonry')
  const [grayscale, setGrayscale] = useState(true)

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
    let filtered = photos

    // Filter by category
    if (activeCategory !== '全部') {
      filtered = filtered.filter(p => p.category.includes(activeCategory))
    }

    // Filter by search
    if (search.trim()) {
      const searchLower = search.toLowerCase()
      filtered = filtered.filter(p =>
        p.title.toLowerCase().includes(searchLower) ||
        p.category.toLowerCase().includes(searchLower)
      )
    }

    return filtered
  }, [photos, activeCategory, search])

  return (
    <div className="min-h-screen bg-background text-foreground pt-24 pb-16">
      {/* Header Section */}
      <div className="px-4 md:px-8 lg:px-12">
        <div className="max-w-screen-2xl mx-auto">
          <GalleryHeader
            activeCategory={activeCategory}
            categories={categories}
            onCategoryChange={setActiveCategory}
            photoCount={filteredPhotos.length}
            t={t}
          />
        </div>
      </div>

      {/* Sticky Toolbar - outside container for proper sticky behavior */}
      <GalleryToolbar
        search={search}
        onSearchChange={setSearch}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        grayscale={grayscale}
        onGrayscaleChange={setGrayscale}
        t={t}
      />

      {/* Photo Grid */}
      <div className="px-4 md:px-8 lg:px-12">
        <div className="max-w-screen-2xl mx-auto">
          <PhotoGrid
            loading={loading}
            photos={filteredPhotos}
            settings={settings}
            viewMode={viewMode}
            grayscale={grayscale}
            onPhotoClick={setSelectedPhoto}
            t={t}
          />
        </div>
      </div>

      <PhotoDetailModal
        photo={selectedPhoto}
        isOpen={!!selectedPhoto}
        onClose={() => setSelectedPhoto(null)}
      />
    </div>
  )
}