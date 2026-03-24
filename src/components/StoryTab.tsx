'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { BookOpen, MessageSquare, ChevronLeft, ChevronRight, Send, LogIn } from 'lucide-react'
import { useRouter, usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import dynamic from 'next/dynamic'
import { getPhotoComments, getStoryComments, submitPhotoComment } from '@/lib/api/comments'
import { resolveAssetUrl } from '@/lib/api/core'
import { getPhotoStory } from '@/lib/api/stories'
import type { PhotoDto, PublicCommentDto, StoryDto } from '@/lib/api/types'
import { useLanguage } from '@/contexts/LanguageContext'
import { useSettings } from '@/contexts/SettingsContext'
import { useAuth } from '@/contexts/AuthContext'
import { Toast, type Notification } from '@/components/Toast'
import { StoryRichContent } from '@/components/StoryRichContent'

const WalineCommentsWrapper = dynamic(
  () => import('./WalineComments').then((mod) => mod.WalineComments),
  {
    ssr: false,
    loading: () => (
      <div className="animate-pulse space-y-5">
        <div className="h-4 w-1/4 rounded-none bg-muted" />
        <div className="h-4 w-full rounded-none bg-muted" />
      </div>
    ),
  },
)

interface StoryTabProps {
  photoId: string
  currentPhoto: PhotoDto
  onPhotoChange?: (photo: PhotoDto) => void
  cachedStory?: StoryDto | null
  cachedComments?: PublicCommentDto[]
  isLoading?: boolean
  onCommentsUpdate?: (comments: PublicCommentDto[]) => void
}

export function StoryTab({
  photoId,
  currentPhoto,
  onPhotoChange,
  cachedStory,
  cachedComments,
  isLoading: externalLoading,
  onCommentsUpdate,
}: StoryTabProps) {
  const { t, locale } = useLanguage()
  const { settings, isLoading } = useSettings()
  const { user, token } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  const hasCachedData = cachedStory !== undefined
  const [internalStory, setInternalStory] = useState<StoryDto | null>(null)
  const [internalLoading, setInternalLoading] = useState(!hasCachedData)
  const [error, setError] = useState<string | null>(null)
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0)

  const story = hasCachedData ? (cachedStory ?? null) : internalStory
  const loading = hasCachedData ? (externalLoading ?? false) : internalLoading

  const [internalComments, setInternalComments] = useState<PublicCommentDto[]>([])
  const comments = hasCachedData && cachedComments ? cachedComments : internalComments
  const [commentsLoading, setCommentsLoading] = useState(!hasCachedData)
  const [submitting, setSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    author: '',
    email: '',
    content: '',
  })
  const [notifications, setNotifications] = useState<Notification[]>([])

  const linuxdoOnly = settings?.linuxdo_only ?? false
  const settingsLoaded = !isLoading

  const commentsStorage = settings?.comments_storage?.toUpperCase() || ''
  const isWaline = commentsStorage === 'LEANCLOUD'
  const walineServerUrl = settings?.waline_server_url || ''

  const isLinuxDoUser = user?.oauthProvider === 'linuxdo'
  const isAdmin = user?.isAdmin === true
  const canComment = !linuxdoOnly || isLinuxDoUser || isAdmin

  const fetchedForPhotoId = useRef<string | null>(null)
  const isFetching = useRef(false)
  const isInitialLoad = useRef(true)

  const isPhotoInCurrentStory = useCallback((targetPhotoId: string) => {
    return story?.photos?.some((photo) => photo.id === targetPhotoId) ?? false
  }, [story?.photos])

  useEffect(() => {
    if ((isLinuxDoUser || isAdmin) && user?.username && !formData.author) {
      setFormData((previous) => ({ ...previous, author: user.username }))
    }
  }, [formData.author, isAdmin, isLinuxDoUser, user?.username])

  useEffect(() => {
    if (hasCachedData) {
      if (story?.photos) {
        const index = story.photos.findIndex((photo) => photo.id === currentPhoto.id)
        setCurrentPhotoIndex(index >= 0 ? index : 0)
      }
      setCommentsLoading(false)
      return
    }

    if (isPhotoInCurrentStory(photoId)) {
      const index = story?.photos?.findIndex((photo) => photo.id === currentPhoto.id) ?? 0
      setCurrentPhotoIndex(index >= 0 ? index : 0)
      return
    }

    if (fetchedForPhotoId.current === photoId || isFetching.current) {
      return
    }

    isFetching.current = true
    fetchedForPhotoId.current = photoId

    async function fetchData() {
      if (isInitialLoad.current) {
        setInternalLoading(true)
        setCommentsLoading(true)
      }
      setError(null)

      try {
        const data = await getPhotoStory(photoId)
        setInternalStory(data)

        if (data?.photos) {
          const index = data.photos.findIndex((photo) => photo.id === currentPhoto.id)
          setCurrentPhotoIndex(index >= 0 ? index : 0)
        }

        if (data?.id) {
          const allComments = await getStoryComments(data.id)
          allComments.sort((a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          )
          setInternalComments(allComments)
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : t('story.load_failed')
        if (errorMessage.includes('No story found')) {
          setInternalStory(null)
          setError(null)
          try {
            const photoComments = await getPhotoComments(photoId)
            setInternalComments(photoComments)
          } catch (commentErr) {
            console.error('Failed to load comments:', commentErr)
          }
        } else {
          console.error('Failed to load story:', err)
          setError(errorMessage)
        }
      } finally {
        setInternalLoading(false)
        setCommentsLoading(false)
        isFetching.current = false
        isInitialLoad.current = false
      }
    }

    void fetchData()
  }, [currentPhoto.id, hasCachedData, isPhotoInCurrentStory, photoId, story?.photos, t])

  useEffect(() => {
    if (story?.photos) {
      const index = story.photos.findIndex((photo) => photo.id === currentPhoto.id)
      if (index >= 0) {
        setCurrentPhotoIndex(index)
      }
    }
  }, [currentPhoto.id, story?.photos])

  async function refreshComments() {
    try {
      const newComments = story?.id
        ? await getStoryComments(story.id)
        : await getPhotoComments(photoId)

      newComments.sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )

      if (onCommentsUpdate) {
        onCommentsUpdate(newComments)
      } else {
        setInternalComments(newComments)
      }
    } catch (err) {
      console.error('Failed to refresh comments:', err)
    }
  }

  const notify = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Math.random().toString(36).substring(2, 9)
    setNotifications((previous) => [...previous, { id, message, type }])
    setTimeout(() => {
      setNotifications((previous) => previous.filter((notification) => notification.id !== id))
    }, 4000)
  }, [])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!formData.author.trim() || !formData.content.trim()) return

    if (linuxdoOnly && !isLinuxDoUser && !isAdmin) {
      notify(t('gallery.comment_linuxdo_only'), 'error')
      return
    }

    try {
      setSubmitting(true)
      const result = await submitPhotoComment(
        photoId,
        {
          author: formData.author.trim(),
          email: formData.email.trim() || undefined,
          content: formData.content.trim(),
        },
        (linuxdoOnly && isLinuxDoUser) || isAdmin ? token : undefined,
      )

      if (result.status === 'approved') {
        notify(t('gallery.comment_success'), 'success')
        await refreshComments()
      } else {
        notify(t('gallery.comment_pending'), 'info')
      }

      setFormData({
        author: (isLinuxDoUser || isAdmin) && user?.username ? user.username : '',
        email: '',
        content: '',
      })
    } catch (err) {
      console.error('Failed to submit comment:', err)
      notify(err instanceof Error ? err.message : t('gallery.comment_error'), 'error')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="custom-scrollbar flex-1 overflow-y-auto p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-10 w-3/4 rounded-none bg-muted" />
          <div className="h-4 w-1/4 rounded-none bg-muted" />
          <div className="mt-12 space-y-3">
            <div className="h-4 rounded-none bg-muted" />
            <div className="h-4 rounded-none bg-muted" />
            <div className="h-4 w-5/6 rounded-none bg-muted" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="custom-scrollbar relative flex-1 space-y-8 overflow-y-auto p-5 md:p-6">
      <Toast
        notifications={notifications}
        remove={(id) => setNotifications((previous) => previous.filter((item) => item.id !== id))}
      />

      {!story ? (
        <div className="space-y-8">
          <div className="border border-dashed border-border/30 py-12 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted/30">
              <BookOpen className="h-5 w-5 text-muted-foreground/30" />
            </div>
            <p className="font-serif text-ui-xs italic text-muted-foreground/60">{t('gallery.no_story')}</p>
            {error ? <p className="mt-2 text-ui-micro text-destructive/70">{error}</p> : null}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-px w-4 bg-primary/40" />
              <span className="text-ui-micro font-bold uppercase tracking-[0.25em] text-primary/70">
                {t('story.journal')}
              </span>
            </div>
            <a
              href={`/story/${story.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-xl leading-tight tracking-tight text-foreground transition-colors hover:text-primary md:text-2xl"
            >
              {story.title}
            </a>
            <div className="text-ui-micro font-mono uppercase tracking-widest text-muted-foreground/50">
              {new Date(story.createdAt).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </div>
          </div>

          {story.photos && story.photos.length > 1 && onPhotoChange ? (
            <div className="border-b border-t border-border/30 py-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="space-y-0.5">
                  <h4 className="text-ui-micro font-bold uppercase tracking-[0.15em] text-primary/80">
                    {t('story.story_album')}
                  </h4>
                  <div className="text-ui-micro font-mono uppercase text-muted-foreground/50">
                    {currentPhotoIndex + 1} / {story.photos.length}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => currentPhotoIndex > 0 && onPhotoChange(story.photos[currentPhotoIndex - 1])}
                    disabled={currentPhotoIndex === 0}
                    className="flex h-8 w-8 items-center justify-center border border-border/50 transition-all hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-20"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => currentPhotoIndex < story.photos.length - 1 && onPhotoChange(story.photos[currentPhotoIndex + 1])}
                    disabled={currentPhotoIndex === story.photos.length - 1}
                    className="flex h-8 w-8 items-center justify-center border border-border/50 transition-all hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-20"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="custom-scrollbar flex snap-x gap-2 overflow-x-auto pb-2">
                {story.photos.map((photo, index) => (
                  <button
                    key={photo.id}
                    onClick={() => onPhotoChange(photo)}
                    className={`relative h-14 w-14 flex-shrink-0 snap-start overflow-hidden transition-all duration-200 ${
                      index === currentPhotoIndex
                        ? 'ring-2 ring-primary ring-offset-1 ring-offset-background'
                        : 'opacity-50 hover:opacity-100'
                    }`}
                  >
                    <img
                      src={resolveAssetUrl(photo.thumbnailUrl || photo.url, settings?.cdn_domain)}
                      alt={photo.title}
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <StoryRichContent
            content={story.content}
            photos={story.photos || []}
            cdnDomain={settings?.cdn_domain}
            className="story-rich-content--compact"
          />
        </div>
      )}

      <div className="border-t border-border/30 pt-8">
        <div className="mb-8 flex items-center gap-2">
          <MessageSquare className="h-3.5 w-3.5 text-primary/60" />
          <h3 className="text-ui-micro font-bold uppercase tracking-[0.2em] text-primary/80">
            {t('gallery.comments')} {!isWaline && comments.length > 0 ? `(${comments.length})` : ''}
          </h3>
        </div>

        {isWaline ? (
          walineServerUrl ? (
            <WalineCommentsWrapper
              serverURL={walineServerUrl}
              path={story ? `/stories/${story.id}` : `/photos/${photoId}`}
              lang={locale === 'zh' ? 'zh-CN' : 'en'}
            />
          ) : (
            <div className="border border-border/30 bg-muted/5 py-10 text-center">
              <p className="font-serif text-ui-xs italic text-muted-foreground/50">
                {t('gallery.comment_waline_not_configured')}
              </p>
            </div>
          )
        ) : (
          <>
            <div className="group relative mb-10">
              {!settingsLoaded ? (
                <div className="animate-pulse space-y-5">
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <div className="h-10 bg-muted/50" />
                    <div className="h-10 bg-muted/50" />
                  </div>
                  <div className="h-24 bg-muted/50" />
                </div>
              ) : !canComment ? (
                <div className="border border-dashed border-border/30 bg-muted/5 py-10 text-center">
                  <MessageSquare className="mx-auto mb-4 h-6 w-6 text-muted-foreground/20" />
                  <p className="mb-6 text-ui-xs text-muted-foreground/60">
                    {t('gallery.comment_linuxdo_only')}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      const returnUrl = encodeURIComponent(pathname || '/')
                      router.push(`/login?returnUrl=${returnUrl}`)
                    }}
                    className="inline-flex items-center gap-2.5 bg-[#f8d568] px-5 py-2.5 text-ui-micro font-bold uppercase tracking-[0.15em] text-[#1a1a1a] transition-all hover:bg-[#f5c842]"
                  >
                    <LogIn className="h-3.5 w-3.5" />
                    {t('gallery.comment_login_to_comment')}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="relative space-y-5">
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="text-ui-micro font-bold uppercase tracking-[0.15em] text-muted-foreground/50">
                        {t('gallery.comment_author')}
                      </label>
                      <input
                        type="text"
                        value={formData.author}
                        onChange={(event) => setFormData({ ...formData, author: event.target.value })}
                        className="w-full border-b border-border/40 bg-transparent py-2 text-ui-xs font-serif outline-none transition-colors placeholder:text-muted-foreground/30 focus:border-primary"
                        required
                        disabled={submitting || isLinuxDoUser || isAdmin}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-ui-micro font-bold uppercase tracking-[0.15em] text-muted-foreground/50">
                        {isAdmin && !isLinuxDoUser
                          ? t('admin.admin')
                          : linuxdoOnly && isLinuxDoUser
                            ? t('gallery.comment_username')
                            : t('gallery.comment_email')}
                      </label>
                      {isAdmin && !isLinuxDoUser ? (
                        <div className="flex items-center gap-2 border-b border-primary/20 bg-primary/5 px-2 py-2">
                          <svg className="h-3.5 w-3.5 text-primary" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z" />
                          </svg>
                          <span className="text-ui-xs font-medium text-primary">{t('admin.admin')}</span>
                        </div>
                      ) : linuxdoOnly && isLinuxDoUser ? (
                        <div className="flex items-center gap-2 border-b border-[#f8d568]/20 bg-[#f8d568]/5 px-2 py-2">
                          <svg className="h-3.5 w-3.5 text-[#f8d568]" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
                          </svg>
                          <span className="text-ui-xs font-medium text-[#f8d568]">
                            {t('gallery.comment_linuxdo_badge')}
                          </span>
                        </div>
                      ) : (
                        <input
                          type="email"
                          value={formData.email}
                          onChange={(event) => setFormData({ ...formData, email: event.target.value })}
                          className="w-full border-b border-border/40 bg-transparent py-2 text-ui-xs font-serif outline-none transition-colors placeholder:italic placeholder:text-muted-foreground/30 focus:border-primary"
                          placeholder={t('common.optional')}
                          disabled={submitting}
                        />
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-ui-micro font-bold uppercase tracking-[0.15em] text-muted-foreground/50">
                      {t('gallery.comment_content')}
                    </label>
                    <textarea
                      value={formData.content}
                      onChange={(event) => setFormData({ ...formData, content: event.target.value })}
                      className="min-h-[90px] w-full resize-none border border-border/30 bg-muted/5 p-3 text-ui-xs font-serif outline-none transition-colors placeholder:text-muted-foreground/30 focus:border-primary"
                      required
                      disabled={submitting}
                      placeholder={t('gallery.comment_empty_hint')}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting || !formData.author.trim() || !formData.content.trim()}
                    className="flex w-full items-center justify-center gap-2 bg-foreground px-6 py-2.5 text-ui-micro font-bold uppercase tracking-[0.15em] text-background transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-30 sm:w-auto"
                  >
                    <Send className="h-3 w-3" />
                    <span>{submitting ? t('gallery.comment_submitting') : t('gallery.comment_submit')}</span>
                  </button>
                </form>
              )}
            </div>

            {commentsLoading ? (
              <div className="animate-pulse space-y-5">
                {[...Array(2)].map((_, index) => (
                  <div key={index} className="flex gap-3 border-t border-border/20 pt-5">
                    <div className="h-8 w-8 shrink-0 bg-muted/50" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-1/4 bg-muted/50" />
                      <div className="h-3 w-full bg-muted/50" />
                    </div>
                  </div>
                ))}
              </div>
            ) : comments.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="border border-border/20 bg-muted/5 py-12 text-center"
              >
                <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center">
                  <svg className="h-6 w-6 text-primary/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                    <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" />
                    <line x1="16" y1="8" x2="2" y2="22" />
                    <line x1="17.5" y1="15" x2="9" y2="15" />
                  </svg>
                </div>
                <p className="font-serif text-ui-xs italic text-muted-foreground/50">{t('gallery.no_comments')}</p>
                <p className="mt-1 text-ui-micro text-muted-foreground/30">{t('gallery.comment_empty_hint')}</p>
              </motion.div>
            ) : (
              <motion.div
                initial="hidden"
                animate="visible"
                variants={{
                  visible: { transition: { staggerChildren: 0.05 } },
                }}
                className="divide-y divide-border/20"
              >
                {comments.map((comment) => (
                  <motion.div
                    key={comment.id}
                    variants={{
                      hidden: { opacity: 0, y: 10 },
                      visible: { opacity: 1, y: 0 },
                    }}
                    transition={{ duration: 0.25, ease: 'easeOut' }}
                    className="flex gap-3 pt-5 first:border-t-0 first:pt-0"
                  >
                    <div className="flex-shrink-0">
                      {comment.avatarUrl ? (
                        <img
                          src={comment.avatarUrl}
                          alt={comment.author}
                          className="h-8 w-8 border border-border/30 object-cover"
                        />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center border border-border/30 bg-primary/10">
                          <span className="text-ui-micro font-bold uppercase text-primary">
                            {comment.author.charAt(0)}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="text-ui-xs font-bold uppercase tracking-wide text-foreground">
                          {comment.author}
                        </span>
                        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/40">
                          {new Date(comment.createdAt).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="mt-1.5 font-serif text-ui-xs leading-relaxed text-foreground/70">
                        {comment.content}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
