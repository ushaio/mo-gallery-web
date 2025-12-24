'use client'

import { PhotoDto, resolveAssetUrl } from '@/lib/api'
import { X, Camera, Aperture, Timer, Gauge, Calendar, MapPin, Monitor, Code, Image as ImageIcon, Download } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSettings } from '@/contexts/SettingsContext'
import { useLanguage } from '@/contexts/LanguageContext'
import { formatFileSize } from '@/lib/utils'

interface ExifModalProps {
  photo: PhotoDto | null
  isOpen: boolean
  onClose: () => void
}

export default function ExifModal({ photo, isOpen, onClose }: ExifModalProps) {
  const { settings } = useSettings()
  const { t, locale } = useLanguage()

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
      value: photo.createdAt ? new Date(photo.createdAt).toLocaleDateString(locale) : undefined,
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
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 backdrop-blur-sm overflow-hidden"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-0 md:p-8"
            onClick={(e) => e.target === e.currentTarget && onClose()}
          >
            <div className="relative w-full h-full max-w-[1800px] bg-background border border-border flex flex-col lg:flex-row overflow-hidden shadow-2xl">
              {/* Close Button */}
              <button
                onClick={onClose}
                className="absolute top-0 right-0 z-50 p-6 text-foreground hover:text-primary transition-colors bg-background/50 backdrop-blur-md border-b border-l border-border"
              >
                <X className="w-6 h-6" />
              </button>

              {/* Left Side - Photo Display */}
              <div className="w-full lg:w-[70%] h-full flex items-center justify-center bg-black/5 relative overflow-hidden">
                <div className="w-full h-full p-4 md:p-12 flex items-center justify-center">
                  <motion.img
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    src={resolveAssetUrl(photo.url, settings?.cdn_domain)}
                    alt={photo.title}
                    className="max-w-full max-h-full object-contain shadow-2xl"
                  />
                </div>
              </div>

              {/* Right Side - Info Panel */}
              <div className="w-full lg:w-[30%] h-full flex flex-col border-l border-border bg-background overflow-y-auto">
                <div className="p-8 md:p-12 space-y-12 flex-1">
                  {/* Title Section */}
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                        {photo.category.split(',').map(cat => (
                        <span key={cat} className="text-[10px] font-bold tracking-[0.2em] uppercase text-primary border border-primary px-2 py-1">
                            {cat}
                        </span>
                        ))}
                    </div>
                    <h2 className="font-serif text-5xl leading-[0.9] text-foreground mb-2">
                        {photo.title}
                    </h2>
                  </div>

                  {/* EXIF Info */}
                  <div className="space-y-8">
                    {hasExif ? (
                        <div className="grid grid-cols-2 gap-4">
                            {exifItems.map((item, idx) => (
                                <div key={idx} className="p-4 border border-border">
                                    <p className="text-[9px] font-bold tracking-[0.2em] text-muted-foreground uppercase mb-1 flex items-center gap-2">
                                        <item.icon className="w-3 h-3" /> {item.label}
                                    </p>
                                    <p className="font-mono text-sm">{item.value}</p>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="pt-8 border-t border-border opacity-50">
                            <p className="text-[10px] tracking-[0.2em] uppercase">{t('gallery.no_exif')}</p>
                        </div>
                    )}
                  </div>

                  {/* Size Info */}
                  <div className="grid grid-cols-2 gap-x-8 gap-y-8 pt-8 border-t border-border">
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground uppercase">{t('gallery.resolution')}</p>
                      <p className="font-mono text-sm">{photo.width} × {photo.height}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground uppercase">{t('gallery.size')}</p>
                      <p className="font-mono text-sm">{formatFileSize(photo.size)}</p>
                    </div>
                  </div>
                </div>

                {/* Footer Action */}
                <div className="p-6 border-t border-border bg-muted/10">
                  <a
                    href={resolveAssetUrl(photo.url, settings?.cdn_domain)}
                    target="_blank"
                    className="w-full py-4 bg-foreground text-background text-xs font-bold uppercase tracking-[0.2em] hover:bg-primary hover:text-primary-foreground transition-all flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    {t('gallery.download')}
                  </a>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}