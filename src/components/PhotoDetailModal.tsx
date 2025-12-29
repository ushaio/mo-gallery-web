'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Camera,
  Aperture,
  Timer,
  Gauge,
  Calendar,
  MapPin,
  Monitor,
  Code,
  Download,
  Info,
  Star,
  BookOpen,
  MessageSquare,
} from 'lucide-react'
import { PhotoDto, resolveAssetUrl } from '@/lib/api'
import { useSettings } from '@/contexts/SettingsContext'
import { useLanguage } from '@/contexts/LanguageContext'
import { formatFileSize } from '@/lib/utils'
import { Toast, type Notification } from '@/components/Toast'
import { StoryTab } from '@/components/StoryTab'
import { CommentsTab } from '@/components/CommentsTab'

type TabType = 'info' | 'story' | 'comments'

interface PhotoDetailModalProps {
  photo: PhotoDto | null
  isOpen: boolean
  onClose: () => void
}

export function PhotoDetailModal({
  photo,
  isOpen,
  onClose,
}: PhotoDetailModalProps) {
  const { settings } = useSettings()
  const { t, locale } = useLanguage()
  const [activeTab, setActiveTab] = useState<TabType>('info')
  const [dominantColors, setDominantColors] = useState<string[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [imageLoaded, setImageLoaded] = useState(false)
  const resolvedCdnDomain = settings?.cdn_domain?.trim() || undefined

  useEffect(() => {
    setImageLoaded(false)
  }, [photo])

  const notify = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Math.random().toString(36).substring(2, 9)
    setNotifications((prev) => [...prev, { id, message, type }])
    setTimeout(() => setNotifications((prev) => prev.filter((n) => n.id !== id)), 2000)
  }

  useEffect(() => {
    if (photo && isOpen) {
      const img = new Image()
      img.crossOrigin = 'Anonymous'
      // Use thumbnail for faster palette extraction if available
      img.src = resolveAssetUrl(photo.thumbnailUrl || photo.url, resolvedCdnDomain)
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d', { willReadFrequently: true })
          if (!ctx) return
          canvas.width = 40
          canvas.height = 40
          ctx.drawImage(img, 0, 0, 40, 40)
          const imageData = ctx.getImageData(0, 0, 40, 40).data
          const colorCounts: Record<string, number> = {}
          
          // Sample every pixel (40x40 is small enough)
          for (let i = 0; i < imageData.length; i += 4) {
            const r = imageData[i]
            const g = imageData[i + 1]
            const b = imageData[i + 2]
            const a = imageData[i + 3]
            
            // Skip transparent or very transparent pixels
            if (a < 128) continue

            // Quantize colors to reduce noise (bins of 32)
            // Use bin center for representation
            const rQ = Math.floor(r / 32) * 32 + 16
            const gQ = Math.floor(g / 32) * 32 + 16
            const bQ = Math.floor(b / 32) * 32 + 16

            // Clamp values to 0-255
            const rC = Math.min(255, Math.max(0, rQ))
            const gC = Math.min(255, Math.max(0, gQ))
            const bC = Math.min(255, Math.max(0, bQ))

            const hex = `#${((1 << 24) + (rC << 16) + (gC << 8) + bC)
              .toString(16)
              .slice(1)}`
            
            colorCounts[hex] = (colorCounts[hex] || 0) + 1
          }
          
          const sorted = Object.entries(colorCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map((c) => c[0])
          setDominantColors(sorted)
        } catch (e) {
          console.error('Palette extraction failed', e)
        }
      }
    } else {
      setDominantColors([])
    }
  }, [photo, isOpen, resolvedCdnDomain])

  const handleCopyColor = (color: string) => {
    navigator.clipboard.writeText(color)
    notify(t('common.copied'))
  }

  if (!photo) return null

  const hasExif = !!(
    photo.cameraMake ||
    photo.cameraModel ||
    photo.lens ||
    photo.focalLength ||
    photo.aperture ||
    photo.shutterSpeed ||
    photo.iso ||
    photo.takenAt
  )

  const exifItems = [
    {
      icon: Camera,
      label: t('gallery.equipment'),
      value: [photo.cameraMake, photo.cameraModel].filter(Boolean).join(' '),
      show: !!(photo.cameraMake || photo.cameraModel),
    },
    {
      icon: Camera,
      label: 'Lens',
      value: photo.lens,
      show: !!photo.lens,
    },
    {
      icon: Aperture,
      label: t('gallery.aperture'),
      value: photo.aperture,
      show: !!photo.aperture,
    },
    {
      icon: Timer,
      label: t('gallery.shutter'),
      value: photo.shutterSpeed,
      show: !!photo.shutterSpeed,
    },
    {
      icon: Gauge,
      label: t('gallery.iso'),
      value: photo.iso?.toString(),
      show: !!photo.iso,
    },
    {
      icon: Camera,
      label: t('gallery.focal'),
      value: photo.focalLength,
      show: !!photo.focalLength,
    },
    {
      icon: Calendar,
      label: t('gallery.date'),
      value: photo.createdAt
        ? new Date(photo.createdAt).toLocaleDateString(locale)
        : undefined,
      show: !!photo.createdAt,
    },
    {
      icon: MapPin,
      label: 'GPS',
      value:
        photo.latitude && photo.longitude
          ? `${photo.latitude.toFixed(4)}, ${photo.longitude.toFixed(4)}`
          : undefined,
      show: !!(photo.latitude && photo.longitude),
    },
    {
      icon: Monitor,
      label: 'Orientation',
      value: photo.orientation ? `${photo.orientation}` : undefined,
      show: !!photo.orientation,
    },
    {
      icon: Code,
      label: 'Software',
      value: photo.software,
      show: !!photo.software,
    },
  ].filter((item) => item.show)

  return (
    <>
      <Toast
        notifications={notifications}
        remove={(id) =>
          setNotifications((prev) => prev.filter((n) => n.id !== id))
        }
      />
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={onClose}
            className="fixed inset-0 z-[100] bg-background/90 backdrop-blur-md"
          />

          {/* Modal Container */}
          <div
            className="fixed inset-0 z-[110] flex items-center justify-center p-0 md:p-8 pointer-events-none"
          >
            <div
              className="relative w-full h-full md:max-w-7xl md:max-h-[90vh] bg-card md:border md:border-border shadow-2xl flex flex-col md:flex-row overflow-hidden pointer-events-auto md:rounded-lg"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close Button - Floating */}
              <button
                onClick={onClose}
                className="absolute top-4 right-4 z-50 p-2.5 text-foreground/50 hover:text-foreground bg-background/50 hover:bg-background backdrop-blur-sm border border-border hover:border-foreground/30 transition-all rounded-full md:rounded-none"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Left Side - Photo Display */}
              <div className="flex-none h-[40vh] md:h-auto md:flex-1 lg:flex-none lg:w-[70%] relative bg-muted/30 flex items-center justify-center overflow-hidden">
                {/* Full Image */}
                <img
                  src={resolveAssetUrl(photo.url, settings?.cdn_domain)}
                  alt={photo.title}
                  className="relative w-full h-full object-contain p-2 md:p-8"
                />
              </div>

              {/* Right Side - Info Panel (Always visible, scrollable on mobile) */}
              <div className="flex-1 md:flex-none w-full md:w-[350px] lg:w-[30%] border-t md:border-t-0 md:border-l border-border bg-card flex flex-col overflow-hidden">
                {/* Tab Navigation */}
                <div className="flex border-b border-border shrink-0 overflow-x-auto">
                  <button
                    onClick={() => setActiveTab('info')}
                    className={`flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] md:tracking-[0.2em] border-b-2 transition-colors whitespace-nowrap ${
                      activeTab === 'info'
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Info className="w-4 h-4" />
                    {t('gallery.info')}
                  </button>
                  <button
                    onClick={() => setActiveTab('story')}
                    className={`flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] md:tracking-[0.2em] border-b-2 transition-colors whitespace-nowrap ${
                      activeTab === 'story'
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <BookOpen className="w-4 h-4" />
                    {t('gallery.story')}
                  </button>
                  <button
                    onClick={() => setActiveTab('comments')}
                    className={`flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] md:tracking-[0.2em] border-b-2 transition-colors whitespace-nowrap ${
                      activeTab === 'comments'
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <MessageSquare className="w-4 h-4" />
                    {t('gallery.comments')}
                  </button>
                </div>

                {/* Tab Content */}
                {activeTab === 'info' && (
                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 lg:p-8 space-y-6 md:space-y-8">
                  {/* Header */}
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {photo.category.split(',').map((cat) => (
                        <span
                          key={cat}
                          className="text-[10px] font-bold tracking-[0.2em] uppercase text-primary bg-primary/5 border border-primary/20 px-2 py-1 rounded-sm"
                        >
                          {cat}
                        </span>
                      ))}
                      {photo.isFeatured && (
                        <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-sm flex items-center gap-1">
                          <Star className="w-3 h-3 fill-current" />
                          {t('admin.feat')}
                        </span>
                      )}
                    </div>
                    <h2 className="font-serif text-2xl md:text-3xl leading-tight text-foreground">
                      {photo.title}
                    </h2>
                  </div>

                  {/* Palette */}
                  <div className="space-y-4 md:space-y-6">
                    <h3 className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground border-b border-border pb-2">
                      {t('gallery.palette')}
                    </h3>
                    <div className="flex flex-wrap gap-3 md:gap-4">
                      {dominantColors.length > 0
                        ? dominantColors.map((color, i) => (
                            <div
                              key={i}
                              className="flex flex-col items-center gap-1.5 md:gap-2 cursor-pointer group"
                              onClick={() => handleCopyColor(color)}
                              title="Click to copy"
                            >
                              <div
                                className="w-8 h-8 md:w-10 md:h-10 rounded-full border border-border shadow-sm transition-transform group-hover:scale-110"
                                style={{ backgroundColor: color }}
                              />
                              <span className="text-[9px] md:text-[10px] font-mono text-muted-foreground group-hover:text-foreground transition-colors uppercase">
                                {color}
                              </span>
                            </div>
                          ))
                        : [...Array(5)].map((_, i) => (
                            <div
                              key={i}
                              className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-muted animate-pulse"
                            />
                          ))}
                    </div>
                  </div>

                  {/* Technical Specs - Grid Layout */}
                  <div className="space-y-4 md:space-y-6">
                    <h3 className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground border-b border-border pb-2">
                      {t('gallery.technical_specs')}
                    </h3>
                    {hasExif ? (
                      <div className="grid grid-cols-2 gap-2 md:gap-3">
                        {exifItems.map((item, idx) => (
                          <div
                            key={idx}
                            className="p-2 md:p-3 bg-muted/20 border border-border rounded-md flex flex-col gap-1 md:gap-1.5 group hover:bg-muted/40 transition-colors"
                          >
                            <div className="flex items-center gap-1.5 md:gap-2 text-muted-foreground group-hover:text-primary transition-colors">
                              <item.icon className="w-3 h-3 md:w-3.5 md:h-3.5" />
                              <span className="text-[8px] md:text-[9px] font-bold tracking-[0.1em] uppercase truncate">
                                {item.label}
                              </span>
                            </div>
                            <p
                              className="text-[11px] md:text-xs font-mono text-foreground font-medium truncate"
                              title={item.value}
                            >
                              {item.value || '—'}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">
                        {t('gallery.no_exif')}
                      </p>
                    )}
                  </div>

                  {/* File Info */}
                  <div className="space-y-4 md:space-y-6">
                    <h3 className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground border-b border-border pb-2">
                      {t('gallery.file_info')}
                    </h3>
                    <div className="grid grid-cols-2 gap-3 md:gap-4">
                      <div className="p-2 md:p-3 bg-muted/20 border border-border rounded-md">
                        <p className="text-[8px] md:text-[9px] font-bold tracking-[0.1em] text-muted-foreground uppercase mb-1">
                          {t('gallery.resolution')}
                        </p>
                        <p className="text-[11px] md:text-xs font-mono font-medium">
                          {photo.width} × {photo.height}
                        </p>
                      </div>
                      <div className="p-2 md:p-3 bg-muted/20 border border-border rounded-md">
                        <p className="text-[8px] md:text-[9px] font-bold tracking-[0.1em] text-muted-foreground uppercase mb-1">
                          {t('gallery.size')}
                        </p>
                        <p className="text-[11px] md:text-xs font-mono font-medium">
                          {formatFileSize(photo.size)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                )}

                {/* Story Tab */}
                {activeTab === 'story' && photo && <StoryTab photoId={photo.id} />}

                {/* Comments Tab */}
                {activeTab === 'comments' && photo && <CommentsTab photoId={photo.id} />}

                {/* Footer Actions */}
                <div className="p-4 md:p-6 border-t border-border bg-muted/5 shrink-0">
                  <a
                    href={resolveAssetUrl(photo.url, settings?.cdn_domain)}
                    target="_blank"
                    className="w-full py-3 bg-primary text-primary-foreground text-xs font-bold uppercase tracking-[0.2em] hover:bg-primary/90 transition-all rounded-sm flex items-center justify-center gap-2 shadow-sm"
                  >
                    <Download className="w-4 h-4" />
                    {t('gallery.download')}
                  </a>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}
