'use client'

import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  X, 
  Maximize2, 
  Camera, 
  Aperture, 
  Clock, 
  Gauge, 
  MapPin, 
  Download,
  Filter,
  ChevronRight,
  ArrowRight
} from 'lucide-react'
import { getPhotos, getCategories, resolveAssetUrl, type PhotoDto } from '@/lib/api'
import { useLanguage } from '@/contexts/LanguageContext'
import { useSettings } from '@/contexts/SettingsContext'
import { formatFileSize } from '@/lib/utils'
import ExifModal from '@/components/ExifModal'

export default function GalleryPage() {
  const { t } = useLanguage()
  const { settings } = useSettings()
  const [photos, setPhotos] = useState<PhotoDto[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [activeCategory, setActiveCategory] = useState('全部')
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [dominantColors, setDominantColors] = useState<string[]>([])

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

  // Palette extraction for selected photo
  useEffect(() => {
    if (selectedPhoto) {
      const img = new Image()
      img.crossOrigin = "Anonymous"
      img.src = resolveAssetUrl(selectedPhoto.url, settings?.cdn_domain)
      img.onload = () => {
        const canvas = document.createElement("canvas")
        const ctx = canvas.getContext("2d", { willReadFrequently: true })
        if (!ctx) return
        canvas.width = 40; canvas.height = 40
        ctx.drawImage(img, 0, 0, 40, 40)
        const imageData = ctx.getImageData(0, 0, 40, 40).data
        const colorCounts: Record<string, number> = {}
        for (let i = 0; i < imageData.length; i += 16) {
          const r = Math.round(imageData[i] / 10) * 10
          const g = Math.round(imageData[i+1] / 10) * 10
          const b = Math.round(imageData[i+2] / 10) * 10
          const hex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
          colorCounts[hex] = (colorCounts[hex] || 0) + 1
        }
        const sorted = Object.entries(colorCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(c => c[0])
        setDominantColors(sorted)
      }
    } else {
      setDominantColors([])
    }
  }, [selectedPhoto, settings?.cdn_domain])

  return (
    <div className="min-h-screen bg-background text-foreground pt-24 pb-16 px-4 md:px-8 lg:px-12">
      {/* Editorial Header */}
      <header className="max-w-screen-2xl mx-auto mb-12">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
          <div className="space-y-4">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 text-primary"
            >
              <span className="text-[10px] font-black uppercase tracking-[0.4em]">Collection</span>
              <div className="h-[1px] w-12 bg-primary/30" />
            </motion.div>
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-5xl md:text-7xl font-serif font-light tracking-tighter leading-none"
            >
              {activeCategory === '全部' ? t('gallery.title') : activeCategory}
            </motion.h1>
          </div>
          
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="flex flex-col items-start md:items-end gap-4"
          >
            <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
              {filteredPhotos.length} {t('gallery.count_suffix')}
            </div>
            <div className="flex flex-wrap gap-2 md:justify-end">
              {categories.map((cat, i) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-all border ${
                    activeCategory === cat 
                    ? 'bg-primary text-primary-foreground border-primary' 
                    : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground'
                  }`}
                >
                  {cat === '全部' ? t('gallery.all') : cat}
                </button>
              ))}
            </div>
          </motion.div>
        </div>
      </header>

      {/* Photobook Masonry Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="aspect-[3/4] bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="max-w-screen-2xl mx-auto">
          <motion.div 
            layout
            className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-6 space-y-6"
          >
            <AnimatePresence mode='popLayout'>
              {filteredPhotos.map((photo, index) => (
                <motion.div
                  key={photo.id}
                  layout
                  initial={{ opacity: 0, y: 40 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.8, delay: index % 3 * 0.1 }}
                  className="break-inside-avoid group"
                  onClick={() => setSelectedPhoto(photo)}
                >
                  <div className="relative overflow-hidden bg-muted">
                    <img
                      src={resolveAssetUrl(photo.thumbnailUrl || photo.url, settings?.cdn_domain)}
                      alt={photo.title}
                      className="w-full h-auto object-cover transition-all duration-[1.5s] ease-out group-hover:scale-105 grayscale group-hover:grayscale-0"
                    />
                    
                    {/* Minimalist Overlay */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex flex-col justify-end p-6">
                      <div className="translate-y-4 group-hover:translate-y-0 transition-transform duration-500">
                        <p className="text-[9px] font-black text-primary uppercase tracking-[0.3em] mb-1.5">
                          {photo.category.split(',')[0]}
                        </p>
                        <h3 className="text-lg font-serif text-white leading-tight mb-3">
                          {photo.title}
                        </h3>
                        <div className="flex items-center gap-2 text-white/60 text-[10px] font-bold uppercase tracking-widest">
                          <span>View Entry</span>
                          <ArrowRight className="w-3 h-3" />
                        </div>
                      </div>
                    </div>

                    {/* Photo Serial Number */}
                    <div className="absolute top-4 left-4 text-[8px] font-mono text-white/30 tracking-tighter opacity-0 group-hover:opacity-100 transition-opacity">
                      NO. {String(index + 1).padStart(3, '0')}
                    </div>
                  </div>
                  
                  {/* Subtle Caption Below */}
                  <div className="mt-2 flex justify-between items-start opacity-40 group-hover:opacity-100 transition-opacity duration-500">
                    <span className="text-[9px] font-mono uppercase tracking-tighter">{photo.cameraModel || 'Recorded Moment'}</span>
                    <span className="text-[9px] font-mono">{new Date(photo.createdAt).getFullYear()}</span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>

          {filteredPhotos.length === 0 && (
            <div className="py-40 text-center">
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-muted-foreground">
                {t('gallery.empty')}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Immersive Detail Modal */}
      <ExifModal 
        photo={selectedPhoto} 
        isOpen={!!selectedPhoto} 
        onClose={() => setSelectedPhoto(null)} 
      />
    </div>
  )
}

