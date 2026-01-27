'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { BookOpen, MessageSquare, ChevronLeft, ChevronRight, CornerDownRight, Send, LogIn } from 'lucide-react'
import { useRouter, usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import dynamic from 'next/dynamic'
import { getPhotoStory, type StoryDto, getPhotoComments, getStoryComments, submitPhotoComment, type PublicCommentDto, type PhotoDto, resolveAssetUrl } from '@/lib/api'
import { useLanguage } from '@/contexts/LanguageContext'
import { useSettings } from '@/contexts/SettingsContext'
import { useAuth } from '@/contexts/AuthContext'
import { Toast, type Notification } from '@/components/Toast'

const WalineCommentsWrapper = dynamic(
  () => import('./WalineComments').then(mod => mod.WalineComments),
  {
    ssr: false,
    loading: () => <div className="space-y-5 animate-pulse"><div className="h-4 bg-muted rounded-none w-1/4"></div><div className="h-4 bg-muted rounded-none w-full"></div></div>
  }
)

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
  const { settings, isLoading } = useSettings()
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
  const [formData, setFormData] = useState({
    author: '',
    email: '',
    content: '',
  })
  const [notifications, setNotifications] = useState<Notification[]>([])

  // Use linuxdo_only from cached settings
  const linuxdoOnly = settings?.linuxdo_only ?? false
  const settingsLoaded = !isLoading
  
  // Waline configuration
  const commentsStorage = settings?.comments_storage?.toUpperCase() || ''
  const isWaline = commentsStorage === 'LEANCLOUD'
  const walineServerUrl = settings?.waline_server_url || ''
  
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

  // Remove keyboard navigation - only use StoryTab's own navigation buttons

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
    <div className="flex-1 overflow-y-auto custom-scrollbar p-5 md:p-6 space-y-8 relative">
      <Toast notifications={notifications} remove={(id) => setNotifications(prev => prev.filter(n => n.id !== id))} />
      {!story ? (
        <div className="space-y-8">
          <div className="text-center py-12 border border-dashed border-border/30">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-muted/30 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-muted-foreground/30" />
            </div>
            <p className="text-ui-xs font-serif italic text-muted-foreground/60">{t('gallery.no_story')}</p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Story Header */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-px w-4 bg-primary/40" />
              <span className="text-ui-micro font-bold uppercase tracking-[0.25em] text-primary/70">Journal</span>
            </div>
            <a
              href={`/story/${story.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block font-serif text-xl md:text-2xl leading-tight text-foreground tracking-tight hover:text-primary transition-colors"
            >
              {story.title}
            </a>
            <div className="text-ui-micro font-mono uppercase tracking-widest text-muted-foreground/50">
              {new Date(story.createdAt).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </div>
          </div>

          {/* Photo Navigation */}
          {story.photos && story.photos.length > 1 && onPhotoChange && (
            <div className="py-4 border-t border-b border-border/30">
              <div className="flex items-center justify-between mb-3">
                <div className="space-y-0.5">
                  <h4 className="text-ui-micro font-bold tracking-[0.15em] uppercase text-primary/80">
                    {t('story.story_album')}
                  </h4>
                  <div className="text-ui-micro font-mono text-muted-foreground/50 uppercase">
                    {currentPhotoIndex + 1} / {story.photos.length}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => currentPhotoIndex > 0 && onPhotoChange(story.photos[currentPhotoIndex - 1])}
                    disabled={currentPhotoIndex === 0}
                    className="w-8 h-8 flex items-center justify-center border border-border/50 hover:border-primary hover:text-primary transition-all disabled:opacity-20 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => currentPhotoIndex < story.photos.length - 1 && onPhotoChange(story.photos[currentPhotoIndex + 1])}
                    disabled={currentPhotoIndex === story.photos.length - 1}
                    className="w-8 h-8 flex items-center justify-center border border-border/50 hover:border-primary hover:text-primary transition-all disabled:opacity-20 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar snap-x">
                {story.photos.map((photo, index) => (
                  <button
                    key={photo.id}
                    onClick={() => onPhotoChange(photo)}
                    className={`relative flex-shrink-0 w-14 h-14 overflow-hidden transition-all duration-200 snap-start ${
                      index === currentPhotoIndex
                        ? 'ring-2 ring-primary ring-offset-1 ring-offset-background'
                        : 'opacity-50 hover:opacity-100'
                    }`}
                  >
                    <img
                      src={resolveAssetUrl(photo.thumbnailUrl || photo.url, settings?.cdn_domain)}
                      alt={photo.title}
                      className="w-full h-full object-cover"
                    />
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
      <div className="pt-8 border-t border-border/30">
        <div className="flex items-center gap-2 mb-8">
          <MessageSquare className="w-3.5 h-3.5 text-primary/60" />
          <h3 className="text-ui-micro font-bold tracking-[0.2em] uppercase text-primary/80">
            {t('gallery.comments')} {!isWaline && comments.length > 0 && `(${comments.length})`}
          </h3>
        </div>

        {/* Waline Comments */}
        {isWaline ? (
          walineServerUrl ? (
            <WalineCommentsWrapper
              serverURL={walineServerUrl}
              path={story ? `/stories/${story.id}` : `/photos/${photoId}`}
              lang={locale === 'zh' ? 'zh-CN' : 'en'}
            />
          ) : (
            <div className="text-center py-10 bg-muted/5 border border-border/30">
              <p className="text-ui-xs font-serif italic text-muted-foreground/50">Waline server not configured</p>
            </div>
          )
        ) : (
        <>
        {/* Comment Form */}
        <div className="relative group mb-10">
          {!settingsLoaded ? (
            /* Loading state for settings */
            <div className="space-y-5 animate-pulse">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="h-10 bg-muted/50"></div>
                <div className="h-10 bg-muted/50"></div>
              </div>
              <div className="h-24 bg-muted/50"></div>
            </div>
          ) : !canComment ? (
            /* Linux DO only mode - show login prompt */
            <div className="text-center py-10 border border-dashed border-border/30 bg-muted/5">
              <MessageSquare className="w-6 h-6 mx-auto mb-4 text-muted-foreground/20" />
              <p className="text-ui-xs text-muted-foreground/60 mb-6">
                {t('gallery.comment_linuxdo_only')}
              </p>
              <button
                type="button"
                onClick={() => {
                  const returnUrl = encodeURIComponent(pathname || '/')
                  router.push(`/login?returnUrl=${returnUrl}`)
                }}
                className="inline-flex items-center gap-2.5 px-5 py-2.5 bg-[#f8d568] text-[#1a1a1a] font-bold tracking-[0.15em] text-ui-micro uppercase hover:bg-[#f5c842] transition-all"
              >
                <LogIn className="w-3.5 h-3.5" />
                {t('gallery.comment_login_to_comment')}
              </button>
            </div>
          ) : (
          <form onSubmit={handleSubmit} className="relative space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="text-ui-micro font-bold text-muted-foreground/50 uppercase tracking-[0.15em]">
                  {t('gallery.comment_author')}
                </label>
                <input
                  type="text"
                  value={formData.author}
                  onChange={(e) => setFormData({ ...formData, author: e.target.value })}
                  className="w-full py-2 bg-transparent border-b border-border/40 focus:border-primary outline-none transition-colors text-ui-xs font-serif placeholder:text-muted-foreground/30"
                  required
                  disabled={submitting || isLinuxDoUser || isAdmin}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-ui-micro font-bold text-muted-foreground/50 uppercase tracking-[0.15em]">
                  {isAdmin && !isLinuxDoUser ? t('admin.admin') : (linuxdoOnly && isLinuxDoUser ? t('gallery.comment_username') : t('gallery.comment_email'))}
                </label>
                {isAdmin && !isLinuxDoUser ? (
                  /* Show Admin badge instead of email input */
                  <div className="flex items-center gap-2 py-2 bg-primary/5 border-b border-primary/20 px-2">
                    <svg className="w-3.5 h-3.5 text-primary" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>
                    </svg>
                    <span className="text-ui-xs text-primary font-medium">{t('admin.admin')}</span>
                  </div>
                ) : linuxdoOnly && isLinuxDoUser ? (
                  /* Show Linux DO user badge instead of email input */
                  <div className="flex items-center gap-2 py-2 bg-[#f8d568]/5 border-b border-[#f8d568]/20 px-2">
                    <svg className="w-3.5 h-3.5 text-[#f8d568]" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                    </svg>
                    <span className="text-ui-xs text-[#f8d568] font-medium">Linux DO</span>
                  </div>
                ) : (
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full py-2 bg-transparent border-b border-border/40 focus:border-primary outline-none transition-colors text-ui-xs font-serif placeholder:italic placeholder:text-muted-foreground/30"
                  placeholder="Optional"
                  disabled={submitting}
                />
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-ui-micro font-bold text-muted-foreground/50 uppercase tracking-[0.15em]">
                {t('gallery.comment_content')}
              </label>
              <textarea
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                className="w-full bg-muted/5 border border-border/30 focus:border-primary p-3 outline-none transition-colors text-ui-xs font-serif min-h-[90px] resize-none placeholder:text-muted-foreground/30"
                required
                disabled={submitting}
                placeholder={t('gallery.comment_placeholder') || 'Share your thoughts...'}
              />
            </div>

            <button
              type="submit"
              disabled={submitting || !formData.author.trim() || !formData.content.trim()}
              className="w-full sm:w-auto px-6 py-2.5 bg-foreground text-background text-ui-micro font-bold uppercase tracking-[0.15em] hover:opacity-80 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Send className="w-3 h-3" />
              <span>{submitting ? t('gallery.comment_submitting') : t('gallery.comment_submit')}</span>
            </button>
          </form>
          )}
        </div>

        {/* Comments List */}
        {commentsLoading ? (
          <div className="space-y-5 animate-pulse">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="flex gap-3 pt-5 border-t border-border/20">
                <div className="w-8 h-8 bg-muted/50 shrink-0"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-muted/50 w-1/4"></div>
                  <div className="h-3 bg-muted/50 w-full"></div>
                </div>
              </div>
            ))}
          </div>
        ) : comments.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12 bg-muted/5 border border-border/20"
          >
            <div className="w-10 h-10 mx-auto mb-4 flex items-center justify-center">
              <svg className="w-6 h-6 text-primary/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" />
                <line x1="16" y1="8" x2="2" y2="22" />
                <line x1="17.5" y1="15" x2="9" y2="15" />
              </svg>
            </div>
            <p className="text-ui-xs font-serif italic text-muted-foreground/50">{t('gallery.no_comments')}</p>
            <p className="text-ui-micro text-muted-foreground/30 mt-1">Be the first to share your thoughts</p>
          </motion.div>
        ) : (
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{
              visible: { transition: { staggerChildren: 0.05 } }
            }}
            className="divide-y divide-border/20"
          >
            {comments.map((comment) => (
              <motion.div
                key={comment.id}
                variants={{
                  hidden: { opacity: 0, y: 10 },
                  visible: { opacity: 1, y: 0 }
                }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="flex gap-3 pt-5 first:pt-0 first:border-t-0"
              >
                {/* Avatar - Square design */}
                <div className="flex-shrink-0">
                  {comment.avatarUrl ? (
                    <img
                      src={comment.avatarUrl}
                      alt={comment.author}
                      className="w-8 h-8 object-cover border border-border/30"
                    />
                  ) : (
                    <div className="w-8 h-8 bg-primary/10 border border-border/30 flex items-center justify-center">
                      <span className="text-ui-micro font-bold text-primary uppercase">
                        {comment.author.charAt(0)}
                      </span>
                    </div>
                  )}
                </div>
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-ui-xs font-bold text-foreground uppercase tracking-wide">
                      {comment.author}
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground/40 uppercase tracking-wider">
                      {new Date(comment.createdAt).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="mt-1.5 text-ui-xs font-serif leading-relaxed text-foreground/70">
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
