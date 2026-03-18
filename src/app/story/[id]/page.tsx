'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, Calendar, ChevronLeft, ChevronRight, Clock, Image as ImageIcon } from 'lucide-react'
import Link from 'next/link'
import { getStory, resolveAssetUrl, type PhotoDto, type StoryDto } from '@/lib/api'
import { StoryComments } from '@/components/StoryComments'
import { StoryMapPanel } from '@/components/StoryMapPanel'
import { PhotoDetailModal } from '@/components/PhotoDetailModal'
import { StoryRichContent } from '@/components/StoryRichContent'
import { Toast, type Notification } from '@/components/Toast'
import { useAuth } from '@/contexts/AuthContext'
import { useLanguage } from '@/contexts/LanguageContext'
import { useSettings } from '@/contexts/SettingsContext'
import { copyStoryAsWechatArticle } from '@/lib/wechat-article'

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
  const plainText = content
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#*_`>\-\[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return Math.max(1, Math.ceil(plainText.length / 500))
}

export default function StoryDetailPage() {
  const params = useParams()
  const reduceMotion = useReducedMotion()
  const { t } = useLanguage()
  const { settings } = useSettings()
  const { isReady, user } = useAuth()

  const [story, setStory] = useState<StoryDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoDto | null>(null)
  const [activePhotoIndex, setActivePhotoIndex] = useState(0)
  const [isMapExpanded, setIsMapExpanded] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])

  const notify = (message: string, type: Notification['type'] = 'success') => {
    const id = Math.random().toString(36).slice(2, 9)
    setNotifications((prev) => [...prev, { id, message, type }])
    window.setTimeout(() => {
      setNotifications((prev) => prev.filter((item) => item.id !== id))
    }, 2200)
  }

  useEffect(() => {
    async function fetchStory() {
      if (!params.id) return

      try {
        const storyData = await getStory(params.id as string)
        setStory(storyData)
      } catch (err) {
        console.error('Failed to fetch story:', err)
        setError('Failed to load story')
      } finally {
        setLoading(false)
      }
    }

    void fetchStory()
  }, [params.id])

  const getPhotoUrl = (photo: PhotoDto, thumbnail = false) => {
    const url = thumbnail ? photo.thumbnailUrl || photo.url : photo.url
    return resolveAssetUrl(url, settings?.cdn_domain)
  }

  const coverPhoto = useMemo(() => {
    if (!story) return null
    if (story.coverPhotoId) {
      return story.photos.find((photo) => photo.id === story.coverPhotoId) || story.photos[0] || null
    }
    return story.photos[0] || null
  }, [story])

  const coverUrl = coverPhoto ? getPhotoUrl(coverPhoto) : null
  const targetPhotoId = story?.coverPhotoId || story?.photos[0]?.id
  const readingMinutes = story ? estimateReadingMinutes(story.content || '') : 1
  const activePhoto = story?.photos?.[activePhotoIndex] || null
  const isAdmin = isReady && user?.isAdmin === true

  const handleCopyWechatArticle = async () => {
    if (!story) {
      notify('No article content available to copy', 'info')
      return
    }

    try {
      await copyStoryAsWechatArticle(story, settings?.cdn_domain)
      notify('Copied as WeChat article text')
    } catch (copyError) {
      console.error('Failed to copy wechat article text:', copyError)
      notify('Copy failed, please check clipboard permission', 'error')
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-px w-14 bg-primary animate-[grow_2s_infinite]" />
          <span className="text-[10px] font-mono uppercase tracking-[0.35em] text-primary">Loading Narrative</span>
        </div>
      </div>
    )
  }

  if (error || !story) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="space-y-6 text-center">
          <p className="font-serif italic text-muted-foreground">{error || 'Story not found'}</p>
          <Link href="/story" className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.3em] transition-colors hover:text-primary">
            <ArrowLeft className="size-3" />
            {t('story.back_to_list') || 'Back to Journal'}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-background text-foreground">
      <section className="relative isolate overflow-hidden border-b border-border/50 bg-black text-white">
        <div className="absolute inset-0">
          {coverUrl ? <img src={coverUrl} alt={story.title} className="h-full w-full object-cover opacity-45" /> : <div className="h-full w-full bg-zinc-900" />}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.16),transparent_36%),linear-gradient(180deg,rgba(0,0,0,0.28),rgba(0,0,0,0.84))]" />
        </div>

        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/50 to-transparent" />

        <div className="relative mx-auto flex min-h-[72svh] max-w-7xl flex-col justify-between px-5 pb-10 pt-28 sm:px-8 lg:px-12">
          <div className="flex items-start justify-between gap-6">
            <Link href="/story" className="inline-flex cursor-pointer items-center gap-3 text-[10px] font-bold uppercase tracking-[0.28em] text-white/72 transition-colors hover:text-white">
              <span className="flex size-10 items-center justify-center rounded-full border border-white/20 bg-black/20 backdrop-blur-sm">
                <ArrowLeft className="size-4" />
              </span>
              <span className="hidden sm:block">{t('story.back_to_list') || 'Back to Journal'}</span>
            </Link>
            <div className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.3em] text-white/74 backdrop-blur-sm">
              Narrative Detail
            </div>
          </div>

          <div className="grid gap-12 lg:grid-cols-[minmax(0,1.2fr)_280px] lg:items-end">
            <motion.div initial={reduceMotion ? false : { opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="max-w-4xl">
              <div className="mb-6 flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.34em] text-white/68">
                <div className="h-px w-10 bg-white/35" />
                <span>Scroll Storytelling</span>
              </div>
              <h1 className="max-w-5xl text-4xl font-serif font-light leading-[0.92] tracking-[-0.04em] text-balance text-white sm:text-5xl md:text-6xl lg:text-7xl">
                {story.title}
              </h1>
              <p className="mt-6 max-w-2xl font-serif text-lg italic leading-relaxed text-white/70 md:text-xl">
                {story.photos.length} visual records layered into a single narrative arc, rendered with the same rich structure used in the editor.
              </p>
            </motion.div>

            <motion.aside initial={reduceMotion ? false : { opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.08 }} className="grid gap-3 self-end rounded-[28px] border border-white/14 bg-white/10 p-4 backdrop-blur-md">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/10 bg-black/18 p-3">
                  <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-white/48"><Calendar className="size-3" />Published</div>
                  <div className="text-sm font-medium text-white/88">{new Date(story.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/18 p-3">
                  <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-white/48"><Clock className="size-3" />Reading</div>
                  <div className="text-sm font-medium text-white/88">{readingMinutes} min</div>
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/18 p-3">
                <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-white/48"><ImageIcon className="size-3" />Photo Set</div>
                <div className="text-sm font-medium text-white/88">{story.photos.length} linked visuals</div>
              </div>
            </motion.aside>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 lg:px-12 lg:py-20">
        {isMapExpanded ? (
          <section className="mb-12">
            <StoryMapPanel
              photos={story.photos}
              cdnDomain={settings?.cdn_domain}
              expanded
              onToggleExpanded={() => setIsMapExpanded(false)}
            />
          </section>
        ) : null}

        <div className="grid gap-16 lg:grid-cols-[minmax(0,1fr)_320px]">
          <main className="min-w-0">
          <section className="mb-12 rounded-[32px] border border-border/60 bg-gradient-to-b from-card via-card to-card/70 p-6 shadow-[0_28px_90px_-56px_rgba(0,0,0,0.45)] sm:p-8 lg:p-10">
            <div className="mb-8 flex items-center gap-4 border-b border-border/50 pb-5">
              <span className="text-[10px] font-bold uppercase tracking-[0.34em] text-primary/75">Article</span>
              <div className="h-px flex-1 bg-border/50" />
              {isAdmin ? (
                <button
                  type="button"
                  onClick={handleCopyWechatArticle}
                  className="inline-flex size-10 items-center justify-center rounded-full border border-[#07c160]/25 bg-[#07c160]/10 text-[#0a8f49] transition-all hover:border-[#07c160]/45 hover:bg-[#07c160]/16"
                  aria-label="Copy as WeChat article text"
                  title="Copy as WeChat article text"
                >
                  <span className="flex size-6 items-center justify-center rounded-full bg-[#07c160] text-white">
                    <WechatIcon className="size-3.5" />
                  </span>
                </button>
              ) : null}
            </div>
            <article className="max-w-none">
              <StoryRichContent
                content={story.content || ''}
                photos={story.photos || []}
                cdnDomain={settings?.cdn_domain}
              />
            </article>
          </section>

          {story.photos.length > 0 ? (
            <section className="rounded-[32px] border border-border/60 bg-card/70 p-6 sm:p-8">
              <div className="mb-8 flex flex-col gap-4 border-b border-border/50 pb-5 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.34em] text-primary/75">Visual Archive</span>
                  <h2 className="mt-3 text-3xl font-serif font-light tracking-tight text-foreground md:text-4xl">Gallery</h2>
                </div>
                <p className="max-w-sm text-sm leading-6 text-muted-foreground">
                  Switch between hero frames and thumbnails. Double click a thumbnail or tap the large frame to open the photo detail modal.
                </p>
              </div>

              <div className="space-y-5">
                {activePhoto ? (
                  <div className="group relative overflow-hidden rounded-[28px] border border-border/60 bg-black/90">
                    <div className="absolute inset-0 bg-cover bg-center opacity-30 blur-3xl scale-110" style={{ backgroundImage: `url(${getPhotoUrl(activePhoto, true)})` }} />
                    <div className="relative flex min-h-[42svh] items-center justify-center px-4 py-4 sm:min-h-[54svh] sm:px-8">
                      <img src={getPhotoUrl(activePhoto)} alt={activePhoto.title} className="relative z-10 max-h-[72svh] w-auto max-w-full cursor-zoom-in object-contain transition-transform duration-300 group-hover:scale-[1.01]" onClick={() => setSelectedPhoto(activePhoto)} />
                      {story.photos.length > 1 ? (
                        <>
                          <button type="button" onClick={() => setActivePhotoIndex((prev) => (prev > 0 ? prev - 1 : story.photos.length - 1))} className="absolute left-3 top-1/2 z-20 flex size-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-black/30 text-white/70 backdrop-blur-sm transition-all hover:bg-black/50 hover:text-white sm:left-6">
                            <ChevronLeft className="size-5" />
                          </button>
                          <button type="button" onClick={() => setActivePhotoIndex((prev) => (prev < story.photos.length - 1 ? prev + 1 : 0))} className="absolute right-3 top-1/2 z-20 flex size-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-black/30 text-white/70 backdrop-blur-sm transition-all hover:bg-black/50 hover:text-white sm:right-6">
                            <ChevronRight className="size-5" />
                          </button>
                        </>
                      ) : null}
                    </div>
                    <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/70 via-black/10 to-transparent px-5 pb-5 pt-10 text-white sm:px-7 sm:pb-7">
                      <div className="flex items-end justify-between gap-4">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.3em] text-white/50">Frame</p>
                          <h3 className="mt-2 text-lg font-medium text-white/90 sm:text-xl">{activePhoto.title}</h3>
                        </div>
                        <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-white/78">{activePhotoIndex + 1} / {story.photos.length}</span>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
                  {story.photos.map((photo, index) => {
                    const active = index === activePhotoIndex
                    return (
                      <button key={photo.id} type="button" onClick={() => setActivePhotoIndex(index)} onDoubleClick={() => setSelectedPhoto(photo)} className={`group relative aspect-square cursor-pointer overflow-hidden rounded-[20px] border transition-all duration-300 ${active ? 'border-primary shadow-[0_0_0_3px_rgba(0,0,0,0.04)] ring-2 ring-primary/30 ring-offset-2 ring-offset-background' : 'border-border/50 hover:border-primary/40'}`}>
                        <img src={getPhotoUrl(photo, true)} alt={photo.title} className={`h-full w-full object-cover transition duration-500 ${active ? 'scale-105' : 'grayscale-[12%] group-hover:scale-105 group-hover:grayscale-0'}`} />
                        <div className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-3 pt-8 text-left ${active ? 'opacity-100' : 'opacity-70 group-hover:opacity-100'}`}>
                          <p className="line-clamp-2 text-xs font-medium leading-4 text-white/92">{photo.title}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </section>
          ) : null}
          </main>

          <aside className="space-y-8 lg:sticky lg:top-28 lg:self-start">
            {!isMapExpanded ? (
              <StoryMapPanel
                photos={story.photos}
                cdnDomain={settings?.cdn_domain}
                onToggleExpanded={() => setIsMapExpanded(true)}
              />
            ) : null}
            {targetPhotoId ? (
              <section className="rounded-[28px] border border-border/60 bg-card/80 p-6 shadow-[0_24px_60px_-48px_rgba(0,0,0,0.4)]">
                <div className="mb-5 flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.3em] text-primary/75">
                  <div className="h-px w-6 bg-primary/45" />
                  <span>Discussion</span>
                </div>
                <StoryComments storyId={story.id} targetPhotoId={targetPhotoId} />
              </section>
            ) : null}
          </aside>
        </div>
      </div>

      <PhotoDetailModal photo={selectedPhoto} isOpen={!!selectedPhoto} onClose={() => setSelectedPhoto(null)} onPhotoChange={setSelectedPhoto} allPhotos={story.photos} hideStoryTab />
      <Toast notifications={notifications} remove={(id) => setNotifications((prev) => prev.filter((item) => item.id !== id))} />
    </div>
  )
}
