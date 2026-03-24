'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'
import {
  X,
  Calendar,
  Clock,
  MousePointer2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { resolveAssetUrl, type StoryDto, type PhotoDto } from '@/lib/api'
import { AdminButton } from '@/components/admin/AdminButton'
import { StoryRichContent } from '@/components/StoryRichContent'

interface StoryPreviewModalProps {
  story: StoryDto
  cdnDomain?: string
  previewPhotoIndex: number | null
  onClose: () => void
  onPhotoClick: (index: number) => void
  onPhotoClose: () => void
  onPrevPhoto: () => void
  onNextPhoto: () => void
  t: (key: string) => string
}

export function StoryPreviewModal({
  story,
  cdnDomain,
  previewPhotoIndex,
  onClose,
  onPhotoClick,
  onPhotoClose,
  onPrevPhoto,
  onNextPhoto,
  t,
}: StoryPreviewModalProps) {
  const getPhotoUrl = (photo: PhotoDto, thumbnail = false): string => {
    const url = thumbnail ? (photo.thumbnailUrl || photo.url) : photo.url
    return resolveAssetUrl(url, cdnDomain)
  }

  const getCoverPhoto = () => {
    if (story.coverPhotoId) {
      return story.photos?.find(p => p.id === story.coverPhotoId) || story.photos?.[0]
    }
    return story.photos?.[0]
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-background overflow-y-auto"
    >
      {/* Close Button */}
      <AdminButton
        onClick={onClose}
        adminVariant="icon"
        className="fixed top-6 right-6 z-[110] p-3 bg-background/80 backdrop-blur-sm border border-border rounded-full text-muted-foreground hover:text-foreground"
      >
        <X className="w-5 h-5" />
      </AdminButton>

      {/* Hero Section */}
      <section className="relative h-screen w-full overflow-hidden bg-black">
        <div className="absolute inset-0">
          {getCoverPhoto() ? (
            <Image
              src={getPhotoUrl(getCoverPhoto()!)}
              alt={story.title}
              fill
              unoptimized
              sizes="100vw"
              className="w-full h-full object-cover opacity-60"
            />
          ) : (
            <div className="w-full h-full bg-muted/10" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-background" />
        </div>

        <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex items-center gap-3 mb-8"
          >
            <div className="h-px w-8 bg-primary/50" />
            <span className="text-[10px] font-bold uppercase tracking-[0.5em] text-primary/80">{t('admin.narrative')}</span>
            <div className="h-px w-8 bg-primary/50" />
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.8 }}
            className="text-5xl md:text-7xl lg:text-8xl font-serif font-light tracking-tighter text-white leading-[0.9] max-w-5xl"
          >
            {story.title || t('story.untitled')}
          </motion.h1>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="mt-12 flex items-center gap-8 text-[10px] font-mono uppercase tracking-[0.3em] text-white/60"
          >
            <div className="flex items-center gap-2">
              <Calendar className="w-3 h-3" />
              {new Date(story.createdAt).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-3 h-3" />
              {Math.ceil((story.content?.length || 0) / 500)} {t('admin.min_read')}
            </div>
          </motion.div>
        </div>

        {/* Scroll Indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 1 }}
          className="absolute bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-4"
        >
          <span className="text-[9px] font-bold uppercase tracking-[0.4em] text-white/40">{t('admin.scroll')}</span>
          <div className="w-px h-12 bg-gradient-to-b from-primary/50 to-transparent" />
        </motion.div>
      </section>

      {/* Content Section */}
      <div className="px-6 md:px-12 lg:px-24 py-24 md:py-40">
        <div className="max-w-screen-md mx-auto">
          {/* Intro Text / Meta */}
          <div className="mb-20 space-y-6">
            <div className="flex items-center gap-4 text-primary/40">
              <span className="text-xs font-mono">01</span>
              <div className="h-px flex-1 bg-border/50" />
            </div>
            <p className="text-xl md:text-2xl font-serif italic text-muted-foreground leading-relaxed">
              {t('admin.narrative')} · {story.photos?.length || 0} {t('story.detail_photographs')}
            </p>
          </div>

          {/* Main Article */}
          <motion.article
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="story-rich-content--article"
          >
            <StoryRichContent
              content={story.content || ''}
              photos={story.photos || []}
              cdnDomain={cdnDomain}
            />
          </motion.article>

          {/* Large Featured Photo */}
          {story.photos && story.photos.length > 1 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              className="relative my-32 -mx-6 md:-mx-24 lg:-mx-48 aspect-[21/9] overflow-hidden bg-muted"
            >
              <Image
                src={getPhotoUrl(story.photos[1])}
                alt={t('admin.featured_visual')}
                fill
                unoptimized
                sizes="(min-width: 1024px) 1200px, 100vw"
                className="w-full h-full object-cover"
              />
            </motion.div>
          )}

          {/* Final Gallery */}
          {story.photos && story.photos.length > 0 && (
            <section className="mt-40">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-16">
                <div className="space-y-4">
                  <span className="text-[10px] font-mono text-primary uppercase tracking-[0.4em]">{t('story.detail_visual_archive')}</span>
                  <h2 className="text-4xl md:text-5xl font-serif font-light tracking-tight">{t('story.detail_gallery')}</h2>
                </div>
                <p className="text-sm text-muted-foreground font-serif italic max-w-xs">
                  {t('admin.complete_collection_hint')}
                </p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-8">
                {story.photos.map((photo, index) => (
                  <motion.div
                    key={photo.id}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.1 }}
                    className={`relative group cursor-pointer overflow-hidden bg-muted
                      ${index % 5 === 0 ? 'md:col-span-2 aspect-[16/10]' : 'aspect-square'}
                    `}
                    onClick={() => onPhotoClick(index)}
                  >
                    <img
                      src={getPhotoUrl(photo, true)}
                      alt={photo.title}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <MousePointer2 className="w-6 h-6 text-white" />
                    </div>
                  </motion.div>
                ))}
              </div>
            </section>
          )}

          {/* Footer */}
          <div className="mt-40 pt-24 border-t border-border/50 text-center">
            <AdminButton
              onClick={onClose}
              adminVariant="link"
              className="group inline-flex flex-col items-center gap-6"
            >
              <span className="text-[10px] font-bold uppercase tracking-[0.5em] text-muted-foreground group-hover:text-primary transition-colors">
                杩斿洖缂栬緫
              </span>
              <span className="text-4xl md:text-6xl font-serif font-light italic tracking-tight hover:text-primary transition-colors">
                {t('admin.close_preview')}
              </span>
            </AdminButton>
          </div>
        </div>
      </div>

      {/* Photo Lightbox */}
      {previewPhotoIndex !== null && story.photos?.[previewPhotoIndex] && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[120] bg-black/98 flex items-center justify-center"
          onClick={onPhotoClose}
        >
          <AdminButton
            onClick={onPhotoClose}
            adminVariant="icon"
            className="absolute top-12 right-12 p-2 text-white/30 hover:text-white z-10"
          >
            <X className="w-8 h-8" />
          </AdminButton>

          {story.photos.length > 1 && (
            <>
              <AdminButton
                onClick={(e) => { e.stopPropagation(); onPrevPhoto() }}
                adminVariant="icon"
                className="absolute left-8 top-1/2 -translate-y-1/2 p-4 text-white/20 hover:text-white z-10"
              >
                <ChevronLeft className="w-12 h-12" />
              </AdminButton>
              <AdminButton
                onClick={(e) => { e.stopPropagation(); onNextPhoto() }}
                adminVariant="icon"
                className="absolute right-8 top-1/2 -translate-y-1/2 p-4 text-white/20 hover:text-white z-10"
              >
                <ChevronRight className="w-12 h-12" />
              </AdminButton>
            </>
          )}

          <div className="w-full h-full flex items-center justify-center p-6 md:p-24" onClick={(e) => e.stopPropagation()}>
            <motion.img
              key={previewPhotoIndex}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              src={getPhotoUrl(story.photos[previewPhotoIndex])}
              alt={story.photos[previewPhotoIndex].title}
              className="max-w-full max-h-full object-contain"
            />
          </div>

          <div className="absolute bottom-12 left-12 flex flex-col gap-2">
            <div className="text-white font-serif text-2xl tracking-tight">
              {story.photos[previewPhotoIndex].title || t('admin.untitled_record')}
            </div>
            <div className="text-white/40 font-mono text-[10px] uppercase tracking-widest">
              {previewPhotoIndex + 1} / {story.photos.length}
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  )
}
