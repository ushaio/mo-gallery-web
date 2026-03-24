'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, Calendar, ChevronLeft, ChevronRight, Clock, Image as ImageIcon } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { resolveAssetUrl } from '@/lib/api/core'
import { getStory } from '@/lib/api/stories'
import type { PhotoDto, StoryDto } from '@/lib/api/types'
import { StoryComments } from '@/components/StoryComments'
import { StoryMapPanel } from '@/components/StoryMapPanel'
import { PhotoDetailModal } from '@/components/PhotoDetailModal'
import { StoryRichContent } from '@/components/StoryRichContent'
import { Toast, type Notification } from '@/components/Toast'
import { useAuth } from '@/contexts/AuthContext'
import { useLanguage } from '@/contexts/LanguageContext'
import { useSettings } from '@/contexts/SettingsContext'
import { copyStoryAsWechatArticle } from '@/lib/wechat-article'
import { buildStoryPreviewText, stripStoryContentToPlainText } from '@/lib/story-rich-content'

function WechatIcon(props: React.ComponentProps<'svg'>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M9.05 4C5.16 4 2 6.6 2 9.8c0 1.9 1.13 3.58 2.88 4.66L4.1 17.2l2.92-1.47c.65.14 1.33.22 2.03.22 3.89 0 7.05-2.6 7.05-5.8S12.94 4 9.05 4Z"
        fill="currentColor"
        fillOpacity="0.92"
      />
      <path
        d="M15.72 9.53c-3.46 0-6.28 2.3-6.28 5.13 0 1.54.83 2.91 2.14 3.85l-.51 2.2 2.26-1.13c.75.19 1.55.29 2.39.29 3.47 0 6.28-2.3 6.28-5.13s-2.81-5.21-6.28-5.21Z"
        fill="currentColor"
      />
      <circle cx="6.98" cy="9.48" r="1.02" fill="#fff" />
      <circle cx="11.01" cy="9.48" r="1.02" fill="#fff" />
      <circle cx="13.92" cy="14.54" r="0.92" fill="#fff" />
      <circle cx="17.46" cy="14.54" r="0.92" fill="#fff" />
    </svg>
  )
}

function estimateReadingMinutes(content: string) {
  const plainText = stripStoryContentToPlainText(content)
  return Math.max(1, Math.ceil(plainText.length / 500))
}

export default function StoryDetailPage() {
  const params = useParams<{ id: string }>()
  const reduceMotion = useReducedMotion()
  const { locale, t } = useLanguage()
  const { settings } = useSettings()
  const { isReady, user } = useAuth()

  const [story, setStory] = useState<StoryDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoDto | null>(null)
  const [activePhotoIndex, setActivePhotoIndex] = useState(0)
  const [isMapExpanded, setIsMapExpanded] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])

  const notify = useCallback((message: string, type: Notification['type'] = 'success') => {
    const id = Math.random().toString(36).slice(2, 9)
    setNotifications((prev) => [...prev, { id, message, type }])
    window.setTimeout(() => {
      setNotifications((prev) => prev.filter((item) => item.id !== id))
    }, 2200)
  }, [])

  const detailText = useMemo(
    () => ({
      loading: t('story.detail_loading'),
      notFound: t('story.detail_not_found'),
      notFoundDesc: t('story.detail_not_found_desc'),
      backToStories: t('story.back_to_list'),
      backToAllStories: t('story.detail_back_to_all'),
      tag: t('story.detail_tag'),
      readMinutes: t('story.detail_read_minutes'),
      photographs: t('story.detail_photographs'),
      scroll: t('story.detail_scroll'),
      copyWechat: t('story.detail_copy_wechat'),
      copyEmpty: t('story.detail_copy_empty'),
      copySuccess: t('story.detail_copy_success'),
      copyFailed: t('story.detail_copy_failed'),
      visualArchive: t('story.detail_visual_archive'),
      gallery: t('story.detail_gallery'),
      collectionSuffix: t('story.detail_collection_suffix'),
      discussion: t('story.detail_discussion'),
      previousPhoto: t('story.detail_previous_photo'),
      nextPhoto: t('story.detail_next_photo'),
      viewPhotoPrefix: t('story.detail_view_photo_prefix'),
    }),
    [t]
  )

  useEffect(() => {
    async function fetchStory() {
      if (!params?.id) return

      try {
        const storyData = await getStory(params.id)
        setStory(storyData)
        setError(null)
      } catch (err) {
        console.error('Failed to fetch story:', err)
        setError(t('story.load_failed'))
      } finally {
        setLoading(false)
      }
    }

    void fetchStory()
  }, [params?.id, t])

  useEffect(() => {
    setActivePhotoIndex(0)
  }, [story?.id])

  const getPhotoUrl = useCallback((photo: PhotoDto, thumbnail = false) => {
    const url = thumbnail ? photo.thumbnailUrl || photo.url : photo.url
    return resolveAssetUrl(url, settings?.cdn_domain)
  }, [settings?.cdn_domain])

  const coverPhoto = useMemo(() => {
    if (!story) return null
    if (story.coverPhotoId) {
      return story.photos.find((photo) => photo.id === story.coverPhotoId) || story.photos[0] || null
    }
    return story.photos[0] || null
  }, [story])

  const coverUrl = coverPhoto ? getPhotoUrl(coverPhoto) : null
  const previewText = useMemo(() => (story?.content ? buildStoryPreviewText(story.content, 200) : ''), [story?.content])
  const readingMinutes = useMemo(() => estimateReadingMinutes(story?.content || ''), [story?.content])
  const storyDateLabel = useMemo(() => {
    if (!story) return ''
    return new Date(story.createdAt).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }, [locale, story])
  const activePhoto = story?.photos[activePhotoIndex] || null
  const targetPhotoId = story?.coverPhotoId || story?.photos[0]?.id
  const isAdmin = isReady && user?.isAdmin === true
  const hasMultiplePhotos = (story?.photos.length || 0) > 1

  const goToPreviousPhoto = useCallback(() => {
    if (!story || story.photos.length <= 1) return
    setActivePhotoIndex((prev) => (prev > 0 ? prev - 1 : story.photos.length - 1))
  }, [story])

  const goToNextPhoto = useCallback(() => {
    if (!story || story.photos.length <= 1) return
    setActivePhotoIndex((prev) => (prev < story.photos.length - 1 ? prev + 1 : 0))
  }, [story])

  const handleCopyWechatArticle = useCallback(async () => {
    if (!story) {
      notify(detailText.copyEmpty, 'info')
      return
    }

    try {
      await copyStoryAsWechatArticle(story, settings?.cdn_domain)
      notify(detailText.copySuccess)
    } catch (copyError) {
      console.error('Failed to copy wechat article text:', copyError)
      notify(detailText.copyFailed, 'error')
    }
  }, [detailText.copyEmpty, detailText.copyFailed, detailText.copySuccess, notify, settings?.cdn_domain, story])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-6">
          <div className="relative">
            <div className="h-px w-16 bg-foreground/80 animate-[grow_2s_ease-in-out_infinite]" />
            <div className="absolute inset-0 h-px w-16 bg-foreground/40 animate-[grow_2s_ease-in-out_infinite_0.3s]" />
          </div>
          <span className="text-[11px] font-medium uppercase tracking-[0.4em] text-foreground/60">{detailText.loading}</span>
        </div>
      </div>
    )
  }

  if (error || !story) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="space-y-8 text-center">
          <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
            <ImageIcon className="size-6 text-zinc-400" />
          </div>
          <div>
            <p className="font-serif text-xl text-zinc-900 dark:text-zinc-100">{error || detailText.notFound}</p>
            <p className="mt-2 text-sm text-zinc-500">{detailText.notFoundDesc}</p>
          </div>
          <Link href="/story" className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-6 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 cursor-pointer">
            <ArrowLeft className="size-3.5" />
            {detailText.backToStories}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="relative isolate overflow-hidden bg-zinc-950 text-white">
        <div className="absolute inset-0">
          {coverUrl ? (
            <Image
              src={coverUrl}
              alt={story.title}
              fill
              priority
              unoptimized
              sizes="100vw"
              className="h-full w-full object-cover opacity-40 transition-transform duration-1000 ease-out hover:scale-105"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900" />
          )}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.7)_100%)]" />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-transparent to-transparent" />
        </div>

        <div className="absolute inset-x-0 top-0 z-30">
          <div className="mx-auto max-w-7xl px-6 py-6 sm:px-8 lg:px-12">
            <Link
              href="/story"
              className="inline-flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70 transition-colors hover:text-white cursor-pointer"
            >
              <span className="flex size-10 items-center justify-center rounded-full border border-white/20 bg-white/10 backdrop-blur-sm transition-all hover:bg-white/20">
                <ArrowLeft className="size-4" />
              </span>
              <span className="hidden sm:block">{detailText.backToStories}</span>
            </Link>
          </div>
        </div>

        <div className="relative z-20 mx-auto flex min-h-[80svh] max-w-7xl flex-col justify-end px-6 pb-16 sm:px-8 lg:px-12">
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="max-w-4xl"
          >
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="mb-6"
            >
              <span className="inline-flex items-center gap-2.5 rounded-full bg-white/10 px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.3em] text-white/80 backdrop-blur-sm">
                <span className="size-1.5 rounded-full bg-rose-500" />
                {detailText.tag}
              </span>
            </motion.div>

            <h1 className="max-w-5xl font-serif text-4xl font-medium leading-[1.1] tracking-[-0.02em] text-white sm:text-5xl md:text-6xl lg:text-7xl">
              {story.title}
            </h1>

            {story.content ? (
              <motion.p
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.3 }}
                className="mt-6 max-w-2xl text-lg leading-relaxed text-white/60 font-light line-clamp-3"
              >
                {previewText}
              </motion.p>
            ) : null}

            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 20 }}
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
                <span>{readingMinutes} {detailText.readMinutes}</span>
              </div>
              <div className="h-3 w-px bg-white/20" aria-hidden="true" />
              <div className="flex items-center gap-2">
                <ImageIcon className="size-3.5" />
                <span>{story.photos.length} {detailText.photographs}</span>
              </div>
            </motion.div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.5 }}
          className="absolute bottom-8 left-1/2 z-20 -translate-x-1/2"
        >
          <motion.div
            animate={reduceMotion ? {} : { y: [0, 8, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            className="flex flex-col items-center gap-2"
          >
            <span className="text-[9px] uppercase tracking-[0.3em] text-white/40">{detailText.scroll}</span>
            <div className="h-8 w-px bg-gradient-to-b from-white/40 to-transparent" />
          </motion.div>
        </motion.div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-16 sm:px-8 lg:px-12 lg:py-24">
        {isMapExpanded ? (
          <motion.section
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-16"
          >
            <StoryMapPanel
              photos={story.photos}
              cdnDomain={settings?.cdn_domain}
              expanded
              onToggleExpanded={() => setIsMapExpanded(false)}
            />
          </motion.section>
        ) : null}

        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <main className="lg:col-span-8">
            <article className="mb-16">
              <div className="prose prose-lg prose-zinc max-w-none dark:prose-invert prose-headings:font-serif prose-headings:tracking-tight prose-p:leading-relaxed prose-a:text-zinc-900 prose-a:decoration-zinc-300 prose-a:underline-offset-4 hover:prose-a:text-zinc-600 dark:prose-a:text-zinc-100 dark:prose-a:decoration-zinc-600 dark:hover:prose-a:text-zinc-300">
                <StoryRichContent
                  content={story.content || ''}
                  photos={story.photos || []}
                  cdnDomain={settings?.cdn_domain}
                />
              </div>
            </article>

            <div className="mb-16 flex flex-col items-center gap-4">
              <Link
                href="/story"
                className="group inline-flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.15em] text-zinc-400 transition-colors hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300 cursor-pointer"
              >
                <ArrowLeft className="size-3 transition-transform group-hover:-translate-x-1" />
                {detailText.backToAllStories}
                <span className="h-px w-8 bg-zinc-300 transition-all group-hover:w-12 dark:bg-zinc-600" />
              </Link>
              {isAdmin ? (
                <button
                  type="button"
                  onClick={handleCopyWechatArticle}
                  className="inline-flex size-10 items-center justify-center rounded-full border border-[#07c160]/30 bg-[#07c160]/10 text-[#0a8f49] shadow-sm transition-all hover:border-[#07c160]/50 hover:bg-[#07c160]/20 hover:shadow-md cursor-pointer"
                  aria-label={detailText.copyWechat}
                  title={detailText.copyWechat}
                >
                  <span className="flex size-6 items-center justify-center rounded-full bg-[#07c160] text-white">
                    <WechatIcon className="size-3.5" />
                  </span>
                </button>
              ) : null}
            </div>

            {story.photos.length > 0 ? (
              <section className="border-t border-zinc-200 pt-12 dark:border-zinc-800">
                <div className="mb-10 flex items-end justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-[0.4em] text-zinc-400 dark:text-zinc-500">
                      {detailText.visualArchive}
                    </span>
                    <h2 className="mt-3 font-serif text-3xl font-medium tracking-tight text-zinc-900 dark:text-zinc-100 md:text-4xl">
                      {detailText.gallery}
                    </h2>
                    <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                      {story.photos.length} {detailText.collectionSuffix}
                    </p>
                  </div>
                  {hasMultiplePhotos ? (
                    <div className="hidden items-center gap-2 sm:flex">
                      <button
                        type="button"
                        onClick={goToPreviousPhoto}
                        className="flex size-10 items-center justify-center rounded-full border border-zinc-200 text-zinc-400 transition-all hover:border-zinc-300 hover:text-zinc-600 dark:border-zinc-700 dark:text-zinc-500 dark:hover:border-zinc-600 dark:hover:text-zinc-400 cursor-pointer"
                        aria-label={detailText.previousPhoto}
                      >
                        <ChevronLeft className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={goToNextPhoto}
                        className="flex size-10 items-center justify-center rounded-full border border-zinc-200 text-zinc-400 transition-all hover:border-zinc-300 hover:text-zinc-600 dark:border-zinc-700 dark:text-zinc-500 dark:hover:border-zinc-600 dark:hover:text-zinc-400 cursor-pointer"
                        aria-label={detailText.nextPhoto}
                      >
                        <ChevronRight className="size-4" />
                      </button>
                    </div>
                  ) : null}
                </div>

                {activePhoto ? (
                  <motion.div
                    key={activePhoto.id}
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5 }}
                    className="group relative mb-8 overflow-hidden rounded-2xl bg-zinc-100 dark:bg-zinc-900"
                  >
                    <div
                      className="absolute inset-0 bg-cover bg-center opacity-30 blur-2xl scale-110"
                      style={{ backgroundImage: `url(${getPhotoUrl(activePhoto, true)})` }}
                    />

                    <div className="relative flex min-h-[50svh] items-center justify-center p-6 sm:p-10">
                      <img
                        src={getPhotoUrl(activePhoto)}
                        alt={activePhoto.title}
                        className="relative z-10 max-h-[70svh] w-auto max-w-full cursor-zoom-in object-contain shadow-2xl transition-transform duration-500 group-hover:scale-[1.02]"
                        onClick={() => setSelectedPhoto(activePhoto)}
                      />

                      {hasMultiplePhotos ? (
                        <>
                          <button
                            type="button"
                            onClick={goToPreviousPhoto}
                            className="absolute left-4 top-1/2 z-20 flex size-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-zinc-700 shadow-lg backdrop-blur-sm transition-all hover:bg-white hover:shadow-xl sm:hidden cursor-pointer"
                            aria-label={detailText.previousPhoto}
                          >
                            <ChevronLeft className="size-5" />
                          </button>
                          <button
                            type="button"
                            onClick={goToNextPhoto}
                            className="absolute right-4 top-1/2 z-20 flex size-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-zinc-700 shadow-lg backdrop-blur-sm transition-all hover:bg-white hover:shadow-xl sm:hidden cursor-pointer"
                            aria-label={detailText.nextPhoto}
                          >
                            <ChevronRight className="size-5" />
                          </button>
                        </>
                      ) : null}
                    </div>

                    <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/70 via-black/20 to-transparent p-6 sm:p-8">
                      <div className="flex items-end justify-between gap-4">
                        <div>
                          <h3 className="text-lg font-medium text-white sm:text-xl">{activePhoto.title}</h3>
                        </div>
                        <span className="shrink-0 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white/80 backdrop-blur-sm">
                          {activePhotoIndex + 1} / {story.photos.length}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                ) : null}

                <div className="grid grid-cols-4 gap-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7">
                  {story.photos.map((photo, index) => {
                    const isActive = index === activePhotoIndex
                    return (
                      <button
                        key={photo.id}
                        type="button"
                        onClick={() => setActivePhotoIndex(index)}
                        onDoubleClick={() => setSelectedPhoto(photo)}
                        className={`group relative aspect-square cursor-pointer overflow-hidden rounded-xl border-2 transition-all duration-300 ${
                          isActive
                            ? 'border-zinc-900 ring-4 ring-zinc-900/20 dark:border-zinc-100 dark:ring-zinc-100/20'
                            : 'border-transparent opacity-60 hover:opacity-100'
                        }`}
                        aria-label={`${detailText.viewPhotoPrefix} ${photo.title}`}
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

          <aside className="space-y-8 lg:col-span-4 lg:sticky lg:top-8 lg:self-start">
            {!isMapExpanded ? (
              <StoryMapPanel
                photos={story.photos}
                cdnDomain={settings?.cdn_domain}
                onToggleExpanded={() => setIsMapExpanded(true)}
              />
            ) : null}

            {targetPhotoId ? (
              <div className="rounded-[28px] border border-border/30 bg-background/80 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)] sm:p-6">
                <div className="mb-6 flex items-center gap-2">
                  <div className="h-px w-6 bg-border" />
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.4em] text-muted-foreground">
                    {detailText.discussion}
                  </h3>
                </div>
                <StoryComments storyId={story.id} targetPhotoId={targetPhotoId} compact />
              </div>
            ) : null}
          </aside>
        </div>
      </div>

      <PhotoDetailModal
        photo={selectedPhoto}
        isOpen={!!selectedPhoto}
        onClose={() => setSelectedPhoto(null)}
        onPhotoChange={setSelectedPhoto}
        allPhotos={story.photos}
        hideStoryTab
      />
      <Toast
        notifications={notifications}
        remove={(id) => setNotifications((prev) => prev.filter((item) => item.id !== id))}
      />
    </div>
  )
}
