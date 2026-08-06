'use client'

/**
 * 叙事预览弹窗：只读复刻发布页（web src/app/story/[id]/page.tsx）的浏览效果。
 * 深色头图（标签胶囊 + 标题 + 摘要 + 元信息）+ 正文 + 画廊，点击照片进入预览灯箱。
 * 地图与评论区为发布页的站点级能力，预览中不渲染。
 */
import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  X,
  Calendar,
  Clock,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
} from 'lucide-react'
import { resolveAssetUrl } from '@/lib/api/core'
import type { StoryDto, PhotoDto } from '@/lib/api/types'
import { AdminButton } from '@/components/admin/AdminButton'
import { StoryRichContent } from '@/components/StoryRichContent'
import { getStoryCoverImageStyle, getStoryCoverPhoto } from '@/lib/story-cover'
import { buildStoryPreviewText, prepareStoryContentForPreview, stripStoryContentToPlainText } from '@/lib/story-rich-content'

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
  const [activePhotoIndex, setActivePhotoIndex] = useState(0)
  // 故事切换时在渲染期重置当前照片（React 官方推荐的派生状态重置模式）
  const [prevStoryId, setPrevStoryId] = useState<string | undefined>(story.id)
  if (prevStoryId !== story.id) {
    setPrevStoryId(story.id)
    setActivePhotoIndex(0)
  }

  const getPhotoUrl = (photo: PhotoDto, thumbnail = false): string => {
    const url = thumbnail ? (photo.thumbnailUrl || photo.url) : photo.url
    return resolveAssetUrl(url, cdnDomain)
  }

  const coverPhoto = getStoryCoverPhoto(story)
  const coverUrl = coverPhoto ? getPhotoUrl(coverPhoto) : null
  const photos = story.photos || []
  const hasMultiplePhotos = photos.length > 1
  const activePhoto = photos[activePhotoIndex] || null
  const activePhotoThumbnailUrl = activePhoto ? getPhotoUrl(activePhoto, true) : null
  const activePhotoFullUrl = activePhoto ? getPhotoUrl(activePhoto) : null
  const previewText = story.content ? buildStoryPreviewText(story.content, 200) : ''
  const readingMinutes = Math.max(1, Math.ceil((stripStoryContentToPlainText(story.content || '') || '').length / 500))
  // 预览正文：回填已上传图片（data-photo-id → 照片记录），本地/未解析图片给灰色占位
  const previewContent = useMemo(
    () => prepareStoryContentForPreview(story.content || '', story.photos || [], cdnDomain),
    [story.content, story.photos, cdnDomain],
  )
  const storyDateLabel = new Date(story.createdAt).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const goToPreviousPhoto = () => {
    if (photos.length <= 1) return
    setActivePhotoIndex((prev) => (prev > 0 ? prev - 1 : photos.length - 1))
  }
  const goToNextPhoto = () => {
    if (photos.length <= 1) return
    setActivePhotoIndex((prev) => (prev < photos.length - 1 ? prev + 1 : 0))
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

      {/* Hero — 对齐发布页：深色头图 + 底部左对齐内容 */}
      <header className="relative isolate overflow-hidden bg-zinc-950 text-white">
        <div className="absolute inset-0">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={story.title}
              className="absolute inset-0 h-full w-full object-cover opacity-40"
              style={getStoryCoverImageStyle(story)}
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900" />
          )}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.7)_100%)]" />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-transparent to-transparent" />
        </div>

        <div className="relative z-20 mx-auto flex min-h-[80svh] max-w-7xl flex-col justify-end px-6 pb-16 sm:px-8 lg:px-12">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="max-w-4xl"
          >
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="mb-6"
            >
              <span className="inline-flex items-center gap-2.5 rounded-full bg-white/10 px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.3em] text-white/80 backdrop-blur-sm">
                <span className="size-1.5 rounded-full bg-rose-500" />
                {t('story.detail_tag')}
              </span>
            </motion.div>

            <h1 className="max-w-5xl font-serif text-4xl font-medium leading-[1.1] tracking-[-0.02em] text-white sm:text-5xl md:text-6xl lg:text-7xl">
              {story.title || t('story.untitled')}
            </h1>

            {story.content ? (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.3 }}
                className="mt-6 max-w-2xl text-lg leading-relaxed text-white/60 font-light line-clamp-3"
              >
                {previewText}
              </motion.p>
            ) : null}

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="mt-10 flex flex-wrap items-center gap-8 text-[11px] font-medium uppercase tracking-[0.2em] text-white/50"
            >
              <div className="flex items-center gap-2">
                <Calendar className="size-3.5" />
                <time dateTime={story.createdAt}>{storyDateLabel}</time>
              </div>
              <div className="h-3 w-px bg-white/20" aria-hidden="true" />
              <div className="flex items-center gap-2">
                <Clock className="size-3.5" />
                <span>{readingMinutes} {t('story.detail_read_minutes')}</span>
              </div>
              <div className="h-3 w-px bg-white/20" aria-hidden="true" />
              <div className="flex items-center gap-2">
                <ImageIcon className="size-3.5" />
                <span>{photos.length} {t('story.detail_photographs')}</span>
              </div>
            </motion.div>
          </motion.div>
        </div>

        {/* Scroll Indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.5 }}
          className="absolute bottom-8 left-1/2 z-20 -translate-x-1/2"
        >
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            className="flex flex-col items-center gap-2"
          >
            <span className="text-[9px] uppercase tracking-[0.3em] text-white/40">{t('story.detail_scroll')}</span>
            <div className="h-8 w-px bg-gradient-to-b from-white/40 to-transparent" />
          </motion.div>
        </motion.div>
      </header>

      {/* Body — 对齐发布页：正文 + 返回 + 画廊 */}
      <div className="mx-auto max-w-7xl px-6 py-16 sm:px-8 lg:px-12 lg:py-24">
        <main>
          <article className="mb-16">
            <StoryRichContent content={previewContent} className="story-rich-content--article" />
          </article>

          {/* 返回入口：预览中点击关闭预览 */}
          <div className="mb-16 flex flex-col items-center gap-4">
            <button
              type="button"
              onClick={onClose}
              className="group inline-flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.15em] text-zinc-400 transition-colors hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300 cursor-pointer"
            >
              <ArrowLeft className="size-3 transition-transform group-hover:-translate-x-1" />
              {t('story.detail_back_to_all')}
              <span className="h-px w-8 bg-zinc-300 transition-all group-hover:w-12 dark:bg-zinc-600" />
            </button>
          </div>

          {photos.length > 0 ? (
            <section className="border-t border-zinc-200 pt-12 dark:border-zinc-800">
              <div className="mb-10 flex items-end justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.4em] text-zinc-400 dark:text-zinc-500">
                    {t('story.detail_visual_archive')}
                  </span>
                  <h2 className="mt-3 font-serif text-3xl font-medium tracking-tight text-zinc-900 dark:text-zinc-100 md:text-4xl">
                    {t('story.detail_gallery')}
                  </h2>
                  <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                    {photos.length} {t('story.detail_collection_suffix')}
                  </p>
                </div>
                {hasMultiplePhotos ? (
                  <div className="hidden items-center gap-2 sm:flex">
                    <button
                      type="button"
                      onClick={goToPreviousPhoto}
                      className="flex size-10 items-center justify-center rounded-full border border-zinc-200 text-zinc-400 transition-all hover:border-zinc-300 hover:text-zinc-600 dark:border-zinc-700 dark:text-zinc-500 dark:hover:border-zinc-600 dark:hover:text-zinc-400 cursor-pointer"
                      aria-label={t('story.detail_previous_photo')}
                    >
                      <ChevronLeft className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={goToNextPhoto}
                      className="flex size-10 items-center justify-center rounded-full border border-zinc-200 text-zinc-400 transition-all hover:border-zinc-300 hover:text-zinc-600 dark:border-zinc-700 dark:text-zinc-500 dark:hover:border-zinc-600 dark:hover:text-zinc-400 cursor-pointer"
                      aria-label={t('story.detail_next_photo')}
                    >
                      <ChevronRight className="size-4" />
                    </button>
                  </div>
                ) : null}
              </div>

              {activePhoto ? (
                <div className="relative mb-8 aspect-[16/10] w-full overflow-hidden rounded-2xl bg-zinc-100 dark:bg-zinc-900">
                  <div
                    className="absolute inset-0 bg-cover bg-center opacity-30 blur-2xl scale-110"
                    style={activePhotoThumbnailUrl ? { backgroundImage: `url(${activePhotoThumbnailUrl})` } : undefined}
                  />

                  <div className="absolute inset-0 flex items-center justify-center p-6 sm:p-10">
                    <img
                      src={activePhotoFullUrl || ''}
                      alt={activePhoto.title}
                      className="relative z-10 max-h-full w-auto max-w-full cursor-zoom-in object-contain shadow-2xl"
                      onClick={() => onPhotoClick(activePhotoIndex)}
                    />

                    {hasMultiplePhotos ? (
                      <>
                        <button
                          type="button"
                          onClick={goToPreviousPhoto}
                          className="absolute left-4 top-1/2 z-20 flex size-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-zinc-700 shadow-lg backdrop-blur-sm transition-all hover:bg-white hover:shadow-xl sm:hidden cursor-pointer"
                          aria-label={t('story.detail_previous_photo')}
                        >
                          <ChevronLeft className="size-5" />
                        </button>
                        <button
                          type="button"
                          onClick={goToNextPhoto}
                          className="absolute right-4 top-1/2 z-20 flex size-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-zinc-700 shadow-lg backdrop-blur-sm transition-all hover:bg-white hover:shadow-xl sm:hidden cursor-pointer"
                          aria-label={t('story.detail_next_photo')}
                        >
                          <ChevronRight className="size-5" />
                        </button>
                      </>
                    ) : null}
                  </div>

                  <div className="absolute inset-x-0 bottom-0 z-20 p-6 sm:p-8">
                    <div className="flex items-end justify-end gap-4">
                      <span className="shrink-0 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white/80 backdrop-blur-sm">
                        {activePhotoIndex + 1} / {photos.length}
                      </span>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-4 gap-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7">
                {photos.map((photo, index) => {
                  const isActive = index === activePhotoIndex
                  return (
                    <button
                      key={photo.id}
                      type="button"
                      onClick={() => setActivePhotoIndex(index)}
                      onDoubleClick={() => onPhotoClick(index)}
                      className={`group relative aspect-square cursor-pointer overflow-hidden rounded-xl border-2 transition-all duration-300 ${
                        isActive
                          ? 'border-zinc-900 ring-4 ring-zinc-900/20 dark:border-zinc-100 dark:ring-zinc-100/20'
                          : 'border-transparent opacity-60 hover:opacity-100'
                      }`}
                      aria-label={`${t('story.detail_view_photo_prefix')} ${photo.title}`}
                    >
                      <img
                        src={getPhotoUrl(photo, true)}
                        alt={photo.title}
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-110"
                      />
                      {isActive ? (
                        <div className="absolute inset-0 bg-zinc-900/10 dark:bg-zinc-100/10" />
                      ) : null}
                    </button>
                  )
                })}
              </div>
            </section>
          ) : null}
        </main>
      </div>

      {/* Photo Lightbox — 预览专用灯箱 */}
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
