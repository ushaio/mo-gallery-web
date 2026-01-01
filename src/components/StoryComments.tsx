'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageSquare, LogIn, Send, CornerDownRight } from 'lucide-react'
import { getStoryComments, submitPhotoComment, getCommentSettings, type PublicCommentDto } from '@/lib/api'
import { useLanguage } from '@/contexts/LanguageContext'
import { useAuth } from '@/contexts/AuthContext'
import { Toast, type Notification } from '@/components/Toast'

interface StoryCommentsProps {
  storyId: string
  targetPhotoId: string // The photo ID to attach new comments to (e.g., cover photo)
}

export function StoryComments({ storyId, targetPhotoId }: StoryCommentsProps) {
  const { t, locale } = useLanguage()
  const { user, token } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [comments, setComments] = useState<PublicCommentDto[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [linuxdoOnly, setLinuxdoOnly] = useState(false)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [formData, setFormData] = useState({
    author: '',
    email: '',
    content: '',
  })
  const [notifications, setNotifications] = useState<Notification[]>([])

  const isLinuxDoUser = user?.oauthProvider === 'linuxdo'
  // Check if user is admin
  const isAdmin = user?.isAdmin === true
  // Admin users can always comment, even without Linux DO binding
  const canComment = !linuxdoOnly || isLinuxDoUser || isAdmin

  useEffect(() => {
    fetchComments()
    fetchSettings()
  }, [storyId])

  // Auto-fill author name for Linux DO users and admin users
  useEffect(() => {
    if ((isLinuxDoUser || isAdmin) && user?.username && !formData.author) {
      setFormData(prev => ({ ...prev, author: user.username }))
    }
  }, [isLinuxDoUser, isAdmin, user?.username])

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

  async function fetchComments() {
    try {
      setLoading(true)
      setError(null)
      const data = await getStoryComments(storyId)
      // Sort by newest first
      data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      setComments(data)
    } catch (err) {
      console.error('Failed to load comments:', err)
      setError(err instanceof Error ? err.message : 'Failed to load comments')
    } finally {
      setLoading(false)
    }
  }

  // Seamless refresh comments without loading state
  async function refreshComments() {
    try {
      // Don't set loading to avoid flickering
      const data = await getStoryComments(storyId)
      // Sort by newest first
      data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      setComments(data)
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
    if (linuxdoOnly && !isLinuxDoUser && !isAdmin) {
      notify(t('gallery.comment_linuxdo_only'), 'error')
      return
    }

    try {
      setSubmitting(true)

      const result = await submitPhotoComment(targetPhotoId, {
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

  const handleLoginClick = () => {
    // Pass current page URL as return URL parameter
    const returnUrl = encodeURIComponent(pathname)
    router.push(`/login?returnUrl=${returnUrl}`)
  }

  if (!settingsLoaded && loading) return null

  return (
    <div className="max-w-screen-md mx-auto mt-32 mb-24 px-6 md:px-0 relative">
      <Toast notifications={notifications} remove={(id) => setNotifications(prev => prev.filter(n => n.id !== id))} />
      <div className="pt-16 border-t border-border/50">
        <div className="flex items-center justify-between mb-12">
          <div className="flex items-center gap-4">
            <MessageSquare className="w-5 h-5 text-primary/40" />
            <h3 className="text-[10px] font-bold tracking-[0.4em] uppercase text-primary/80">
              {t('gallery.comments')} {comments.length > 0 && `(${comments.length})`}
            </h3>
          </div>
        </div>

        {/* Comment Form - Now at the top */}
        <div className="relative group mb-16">
          <div className="absolute -inset-4 bg-muted/5 opacity-0 group-focus-within:opacity-100 transition-opacity pointer-events-none" />
          {!canComment ? (
            /* Linux DO only mode - show login prompt */
            <div className="text-center py-8 border border-dashed border-border/50">
              <p className="text-xs text-muted-foreground mb-6">
                {t('gallery.comment_linuxdo_only')}
              </p>
              <button
                type="button"
                onClick={handleLoginClick}
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
                  <label className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-[0.3em]">
                    {t('gallery.comment_author')}
                  </label>
                  <input
                    type="text"
                    value={formData.author}
                    onChange={(e) => setFormData({ ...formData, author: e.target.value })}
                    className="w-full py-3 bg-transparent border-b border-border focus:border-primary outline-none transition-all text-sm font-serif"
                    required
                    disabled={submitting || isLinuxDoUser || isAdmin}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-[0.3em]">
                    {(linuxdoOnly && isLinuxDoUser) || isAdmin ? t('gallery.comment_username') : t('gallery.comment_email')}
                  </label>
                  {isAdmin && !isLinuxDoUser ? (
                    /* Show Admin badge for admin users */
                    <div className="flex items-center gap-2 py-3 bg-primary/10 border-b border-primary/30 px-2">
                      <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>
                      </svg>
                      <span className="text-sm text-primary font-medium">{t('admin.admin')}</span>
                    </div>
                  ) : linuxdoOnly && isLinuxDoUser ? (
                    /* Show Linux DO user badge instead of email input */
                    <div className="flex items-center gap-2 py-3 bg-[#f8d568]/10 border-b border-[#f8d568]/30 px-2">
                      <svg className="w-4 h-4 text-[#f8d568]" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                      </svg>
                      <span className="text-sm text-[#f8d568] font-medium">Linux DO</span>
                    </div>
                  ) : (
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full py-3 bg-transparent border-b border-border focus:border-primary outline-none transition-all text-sm font-serif placeholder:italic placeholder:text-muted-foreground/30"
                      placeholder="Optional"
                      disabled={submitting}
                    />
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-[0.3em]">
                  {t('gallery.comment_content')}
                </label>
                <textarea
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  className="w-full py-4 bg-transparent border border-border focus:border-primary p-4 outline-none transition-all text-sm font-serif min-h-[120px] resize-none"
                  required
                  disabled={submitting}
                />
              </div>

              <button
                type="submit"
                disabled={submitting || !formData.author.trim() || !formData.content.trim()}
                className="group/btn flex items-center gap-4 text-[10px] font-bold uppercase tracking-[0.4em] text-primary disabled:opacity-20"
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
        {loading ? (
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
                  className="relative"
                >
                  <div className="flex items-start gap-4">
                    {/* Avatar */}
                    <div className="flex-shrink-0">
                      {comment.avatarUrl ? (
                        <img
                          src={comment.avatarUrl}
                          alt={comment.author}
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                          <span className="text-sm font-bold text-muted-foreground">
                            {comment.author.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                    </div>
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-xs font-bold text-foreground tracking-tight">
                          {comment.author}
                        </span>
                        <div className="w-1 h-1 rounded-full bg-border" />
                        <span className="text-[9px] font-mono text-muted-foreground/60 uppercase tracking-widest">
                          {new Date(comment.createdAt).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="text-sm font-serif leading-relaxed text-foreground/70">
                        {comment.content}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </div>
  )
}
