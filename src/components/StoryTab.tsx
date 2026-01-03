'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { BookOpen, MessageSquare, ChevronLeft, ChevronRight, CornerDownRight, Send, LogIn } from 'lucide-react'
import { useRouter, usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import dynamic from 'next/dynamic'
import { getPhotoStory, type StoryDto, getPhotoComments, getStoryComments, submitPhotoComment, getCommentSettings, type PublicCommentDto, type PhotoDto, resolveAssetUrl } from '@/lib/api'
import { useLanguage } from '@/contexts/LanguageContext'
import { useSettings } from '@/contexts/SettingsContext'
import { useAuth } from '@/contexts/AuthContext'
import { Toast, type Notification } from '@/components/Toast'

// Dynamically import MilkdownViewer to avoid SSR issues
const MilkdownViewer = dynamic(
  () => import('@/components/MilkdownViewer'),
  {
    ssr: false,
    loading: () => (
      <div className="animate-pulse space-y-4">
        <div className="h-4 bg-muted rounded w-full"></div>
        <div className="h-4 bg-muted rounded w-5/6"></div>
        <div className="h-4 bg-muted rounded w-4/6"></div>
      </div>
    )
  }
)

interface StoryTabProps {
  photoId: string
  currentPhoto: PhotoDto
  onPhotoChange?: (photo: PhotoDto) => void
  // Optional cached data from parent (PhotoDetailModal)
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
  onCommentsUpdate
}: StoryTabProps) {
  const { t, locale } = useLanguage()
  const { settings } = useSettings()
  const { user, token } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  
  // Use cached data if provided, otherwise manage own state
  const hasCachedData = cachedStory !== undefined
  const [internalStory, setInternalStory] = useState<StoryDto | null>(null)
  const [internalLoading, setInternalLoading] = useState(!hasCachedData)
  const [error, setError] = useState<string | null>(null)
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0)

  // Use cached or internal data
  const story = hasCachedData ? (cachedStory ?? null) : internalStory
  const loading = hasCachedData ? (externalLoading ?? false) : internalLoading

  // Comments state
  const [internalComments, setInternalComments] = useState<PublicCommentDto[]>([])
  const comments = hasCachedData && cachedComments ? cachedComments : internalComments
  const [commentsLoading, setCommentsLoading] = useState(!hasCachedData)
  const [submitting, setSubmitting] = useState(false)
  const [linuxdoOnly, setLinuxdoOnly] = useState(false)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [formData, setFormData] = useState({
    author: '',
    email: '',
    content: '',
  })
  const [notifications, setNotifications] = useState<Notification[]>([])

  // Check if user is logged in via Linux DO
  const isLinuxDoUser = user?.oauthProvider === 'linuxdo'
  // Check if user is admin
  const isAdmin = user?.isAdmin === true
  // Determine if user can comment in Linux DO only mode (admin can always comment)
  const canComment = !linuxdoOnly || isLinuxDoUser || isAdmin

  // Use refs to track fetch state and prevent duplicate requests
  const fetchedForPhotoId = useRef<string | null>(null)
  const currentStoryId = useRef<string | null>(null)
  const isFetching = useRef(false)
  const isInitialLoad = useRef(true)

  // Check if photo is within current story
  const isPhotoInCurrentStory = useCallback((pid: string) => {
    return story?.photos?.some(p => p.id === pid) ?? false
  }, [story?.photos])

  // Fetch comment settings
  useEffect(() => {
    async function fetchSettings() {
      try {
        const settings = await getCommentSettings()
        setLinuxdoOnly(settings.linuxdoOnly)
      } catch (err) {
        console.error('Failed to load comment settings:', err)
      } finally {
        setSettingsLoaded(true)
      }
    }
    fetchSettings()
  }, [])

  // Auto-fill author name for Linux DO users and admin users
  useEffect(() => {
    if ((isLinuxDoUser || isAdmin) && user?.username && !formData.author) {
      setFormData(prev => ({ ...prev, author: user.username }))
    }
  }, [isLinuxDoUser, isAdmin, user?.username])

  // Only fetch data internally if no cached data is provided
  useEffect(() => {
    // Skip internal fetching if parent provides cached data
    if (hasCachedData) {
      // Just update the photo index if within the story
      if (story?.photos) {
        const index = story.photos.findIndex(p => p.id === currentPhoto.id)
        setCurrentPhotoIndex(index >= 0 ? index : 0)
      }
      setCommentsLoading(false)
      return
    }

    if (isPhotoInCurrentStory(photoId)) {
      const index = story!.photos.findIndex(p => p.id === currentPhoto.id)
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
      currentStoryId.current = null

      try {
        const data = await getPhotoStory(photoId)
        setInternalStory(data)
        currentStoryId.current = data?.id ?? null

        if (data?.photos) {
          const index = data.photos.findIndex(p => p.id === currentPhoto.id)
          setCurrentPhotoIndex(index >= 0 ? index : 0)
        }

        if (data?.id) {
          const allComments = await getStoryComments(data.id)
          allComments.sort((a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )
          setInternalComments(allComments)
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load story'
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

    fetchData()
  }, [photoId, currentPhoto.id, isPhotoInCurrentStory, hasCachedData, story?.photos])

  useEffect(() => {
    if (story?.photos) {
      const index = story.photos.findIndex(p => p.id === currentPhoto.id)
      if (index >= 0) {
        setCurrentPhotoIndex(index)
      }
    }
  }, [currentPhoto.id, story?.photos])

  useEffect(() => {
    if (!story?.photos || story.photos.length <= 1 || !onPhotoChange) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && currentPhotoIndex > 0) {
        e.preventDefault()
        onPhotoChange(story.photos[currentPhotoIndex - 1])
      } else if (e.key === 'ArrowRight' && currentPhotoIndex < story.photos.length - 1) {
        e.preventDefault()
        onPhotoChange(story.photos[currentPhotoIndex + 1])
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [story?.photos, currentPhotoIndex, onPhotoChange])

  // Seamless refresh comments without loading state
  async function refreshComments() {
    try {
      // Don't set commentsLoading to avoid flickering
      let newComments: PublicCommentDto[]
      if (story?.id) {
        newComments = await getStoryComments(story.id)
      } else {
        newComments = await getPhotoComments(photoId)
      }
      newComments.sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      
      // Update parent cache if available, otherwise update internal state
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
    setNotifications(prev => [...prev, { id, message, type }])
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 4000)
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!formData.author.trim() || !formData.content.trim()) return

    // Double-check permission before submitting
    if (linuxdoOnly && !isLinuxDoUser) {
      notify(t('gallery.comment_linuxdo_only'), 'error')
      return
    }

    try {
      setSubmitting(true)
      const result = await submitPhotoComment(photoId, {
        author: formData.author.trim(),
        email: formData.email.trim() || undefined,
        content: formData.content.trim(),
      }, (linuxdoOnly && isLinuxDoUser) || isAdmin ? token : undefined)

      if (result.status === 'approved') {
        notify(t('gallery.comment_success'), 'success')
        await refreshComments()
      } else {
        notify(t('gallery.comment_pending'), 'info')
      }
      // Keep author name for Linux DO users and admin users, only clear content
      setFormData(prev => ({
        author: (isLinuxDoUser || isAdmin) && user?.username ? user.username : '',
        email: '',
        content: ''
      }))
    } catch (err) {
      console.error('Failed to submit comment:', err)
      notify(err instanceof Error ? err.message : t('gallery.comment_error'), 'error')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
        <div className="space-y-6 animate-pulse">
          <div className="h-10 bg-muted rounded-none w-3/4"></div>
          <div className="h-4 bg-muted rounded-none w-1/4"></div>
          <div className="space-y-3 mt-12">
            <div className="h-4 bg-muted rounded-none"></div>
            <div className="h-4 bg-muted rounded-none"></div>
            <div className="h-4 bg-muted rounded-none w-5/6"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-8 md:p-12 space-y-16 relative">
      <Toast notifications={notifications} remove={(id) => setNotifications(prev => prev.filter(n => n.id !== id))} />
      {!story ? (
        <div className="space-y-12">
          <div className="text-center py-12 border border-dashed border-border/50">
            <BookOpen className="w-10 h-10 mx-auto mb-4 opacity-10" />
            <p className="text-xs font-serif italic text-muted-foreground">{t('gallery.no_story')}</p>
          </div>
        </div>
      ) : (
        <div className="space-y-12">
          {/* Story Header */}
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="h-px w-8 bg-primary/30" />
              <span className="text-ui-xs font-bold uppercase tracking-[0.4em] text-primary/60">Journal</span>
            </div>
            <h3 className="font-serif text-3xl md:text-4xl leading-[1.1] text-foreground tracking-tight">
              {story.title}
            </h3>
            <div className="flex items-center gap-4 text-ui-micro font-mono uppercase tracking-widest text-muted-foreground/60">
              {new Date(story.createdAt).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </div>
          </div>

          {/* Photo Navigation */}
          {story.photos && story.photos.length > 1 && onPhotoChange && (
            <div className="py-8 border-t border-b border-border/50">
              <div className="flex items-center justify-between mb-6">
                <div className="space-y-1">
                  <h4 className="text-ui-xs font-bold tracking-[0.3em] uppercase text-primary">
                    {t('story.story_album')}
                  </h4>
                  <div className="text-ui-micro font-mono text-muted-foreground/60 uppercase">
                    Record {currentPhotoIndex + 1} of {story.photos.length}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => currentPhotoIndex > 0 && onPhotoChange(story.photos[currentPhotoIndex - 1])}
                    disabled={currentPhotoIndex === 0}
                    className="w-10 h-10 flex items-center justify-center border border-border hover:border-primary hover:text-primary transition-all disabled:opacity-20 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => currentPhotoIndex < story.photos.length - 1 && onPhotoChange(story.photos[currentPhotoIndex + 1])}
                    disabled={currentPhotoIndex === story.photos.length - 1}
                    className="w-10 h-10 flex items-center justify-center border border-border hover:border-primary hover:text-primary transition-all disabled:opacity-20 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar snap-x">
                {story.photos.map((photo, index) => (
                  <button
                    key={photo.id}
                    onClick={() => onPhotoChange(photo)}
                    className={`relative flex-shrink-0 w-20 h-20 overflow-hidden transition-all snap-start ${
                      index === currentPhotoIndex
                        ? 'grayscale-0 scale-105'
                        : 'grayscale hover:grayscale-0 hover:scale-105'
                    }`}
                  >
                    <img
                      src={resolveAssetUrl(photo.thumbnailUrl || photo.url, settings?.cdn_domain)}
                      alt={photo.title}
                      className="w-full h-full object-cover"
                    />
                    {index === currentPhotoIndex && (
                      <div className="absolute inset-0 border-2 border-primary" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Story Content */}
          <div className="milkdown-article-compact">
            <MilkdownViewer content={story.content} />
          </div>
        </div>
      )}

      {/* Comments Section */}
      <div className="pt-16 border-t border-border/50">
        <div className="flex items-center justify-between mb-12">
          <div className="flex items-center gap-4">
            <MessageSquare className="w-5 h-5 text-primary/40" />
            <h3 className="text-ui-xs font-bold tracking-[0.4em] uppercase text-primary/80">
              {t('gallery.comments')} {comments.length > 0 && `(${comments.length})`}
            </h3>
          </div>
        </div>

        {/* Comment Form - Now at the top */}
        <div className="relative group mb-16">
          <div className="absolute -inset-4 bg-muted/5 opacity-0 group-focus-within:opacity-100 transition-opacity pointer-events-none" />
          {!settingsLoaded ? (
            /* Loading state for settings */
            <div className="space-y-8 animate-pulse">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="h-12 bg-muted rounded-none"></div>
                <div className="h-12 bg-muted rounded-none"></div>
              </div>
              <div className="h-32 bg-muted rounded-none"></div>
            </div>
          ) : !canComment ? (
            /* Linux DO only mode - show login prompt */
            <div className="text-center py-8 border border-dashed border-border/50">
              <p className="text-xs text-muted-foreground mb-6">
                {t('gallery.comment_linuxdo_only')}
              </p>
              <button
                type="button"
                onClick={() => {
                  const returnUrl = encodeURIComponent(pathname || '/')
                  router.push(`/login?returnUrl=${returnUrl}`)
                }}
                className="inline-flex items-center gap-3 px-6 py-3 bg-[#f8d568] text-[#1a1a1a] font-bold tracking-[0.15em] text-xs uppercase hover:bg-[#f5c842] transition-all"
              >
                <LogIn className="w-4 h-4" />
                {t('gallery.comment_login_to_comment')}
              </button>
            </div>
          ) : (
          <form onSubmit={handleSubmit} className="relative space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-2">
                <label className="text-ui-micro font-bold text-muted-foreground/60 uppercase tracking-[0.3em]">
                  {t('gallery.comment_author')}
                </label>
                <input
                  type="text"
                  value={formData.author}
                  onChange={(e) => setFormData({ ...formData, author: e.target.value })}
                  className="w-full py-3 bg-transparent border-b border-border focus:border-primary outline-none transition-all text-ui-xs font-serif"
                  required
                  disabled={submitting || isLinuxDoUser || isAdmin}
                />
              </div>
              <div className="space-y-2">
                <label className="text-ui-micro font-bold text-muted-foreground/60 uppercase tracking-[0.3em]">
                  {isAdmin && !isLinuxDoUser ? t('admin.admin') : (linuxdoOnly && isLinuxDoUser ? t('gallery.comment_username') : t('gallery.comment_email'))}
                </label>
                {isAdmin && !isLinuxDoUser ? (
                  /* Show Admin badge instead of email input */
                  <div className="flex items-center gap-2 py-3 bg-primary/10 border-b border-primary/30 px-2">
                    <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>
                    </svg>
                    <span className="text-ui-xs text-primary font-medium">{t('admin.admin')}</span>
                  </div>
                ) : linuxdoOnly && isLinuxDoUser ? (
                  /* Show Linux DO user badge instead of email input */
                  <div className="flex items-center gap-2 py-3 bg-[#f8d568]/10 border-b border-[#f8d568]/30 px-2">
                    <svg className="w-4 h-4 text-[#f8d568]" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                    </svg>
                    <span className="text-ui-xs text-[#f8d568] font-medium">Linux DO</span>
                  </div>
                ) : (
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full py-3 bg-transparent border-b border-border focus:border-primary outline-none transition-all text-ui-xs font-serif placeholder:italic placeholder:text-muted-foreground/30"
                  placeholder="Optional"
                  disabled={submitting}
                />
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-ui-micro font-bold text-muted-foreground/60 uppercase tracking-[0.3em]">
                {t('gallery.comment_content')}
              </label>
              <textarea
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                className="w-full py-4 bg-transparent border border-border focus:border-primary p-4 outline-none transition-all text-ui-xs font-serif min-h-[120px] resize-none"
                required
                disabled={submitting}
              />
            </div>

            <button
              type="submit"
              disabled={submitting || !formData.author.trim() || !formData.content.trim()}
              className="group/btn flex items-center gap-4 text-ui-micro font-bold uppercase tracking-[0.4em] text-primary disabled:opacity-20"
            >
              <span>{submitting ? t('gallery.comment_submitting') : t('gallery.comment_submit')}</span>
              <div className="w-8 h-8 flex items-center justify-center border border-primary/20 rounded-full group-hover/btn:bg-primary group-hover/btn:text-primary-foreground transition-all">
                <Send className="w-3 h-3" />
              </div>
            </button>
          </form>
          )}
        </div>

        {/* Comments List - Now at the bottom with smooth animations */}
        {commentsLoading ? (
          <div className="space-y-8 animate-pulse">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="space-y-3">
                <div className="h-4 bg-muted rounded-none w-1/4"></div>
                <div className="h-4 bg-muted rounded-none w-full"></div>
              </div>
            ))}
          </div>
        ) : comments.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12 bg-muted/5 border border-border/50"
          >
            <p className="text-xs font-serif italic text-muted-foreground/60">{t('gallery.no_comments')}</p>
          </motion.div>
        ) : (
          <motion.div layout className="space-y-12">
            <AnimatePresence mode="popLayout">
              {comments.map((comment) => (
                <motion.div
                  key={comment.id}
                  layout
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  className="relative pl-8"
                >
                  <div className="absolute left-0 top-0 text-primary/20">
                    <CornerDownRight className="w-4 h-4" />
                  </div>
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-ui-xs font-bold text-foreground tracking-tight">
                      {comment.author}
                    </span>
                    <div className="w-1 h-1 rounded-full bg-border" />
                    <span className="text-ui-micro font-mono text-muted-foreground/60 uppercase tracking-widest">
                      {new Date(comment.createdAt).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="text-ui-xs font-serif leading-relaxed text-foreground/70">
                    {comment.content}
                  </p>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </div>
  )
}
