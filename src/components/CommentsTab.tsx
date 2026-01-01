'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { MessageSquare, LogIn } from 'lucide-react'
import { getPhotoComments, submitPhotoComment, getCommentSettings, type PublicCommentDto } from '@/lib/api'
import { useLanguage } from '@/contexts/LanguageContext'
import { useAuth } from '@/contexts/AuthContext'
import { Toast, type Notification } from '@/components/Toast'

interface CommentsTabProps {
  photoId: string
}

export function CommentsTab({ photoId }: CommentsTabProps) {
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

  // Check if user is logged in via Linux DO
  const isLinuxDoUser = user?.oauthProvider === 'linuxdo'
  // Check if user is admin
  const isAdmin = user?.isAdmin === true
  // Determine if user can comment in Linux DO only mode
  // Admin users can always comment, even without Linux DO binding
  const canComment = !linuxdoOnly || isLinuxDoUser || isAdmin

  useEffect(() => {
    fetchComments()
    fetchSettings()
  }, [photoId])

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
      const data = await getPhotoComments(photoId)
      setComments(data)
    } catch (err) {
      console.error('Failed to load comments:', err)
      setError(err instanceof Error ? err.message : 'Failed to load comments')
    } finally {
      setLoading(false)
    }
  }

  const notify = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Math.random().toString(36).substring(2, 9)
    setNotifications(prev => [...prev, { id, message, type }])
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 4000)
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!formData.author.trim() || !formData.content.trim()) {
      return
    }

    // Double-check permission before submitting
    if (linuxdoOnly && !isLinuxDoUser && !isAdmin) {
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

      // Check if comment was approved or pending
      if (result.status === 'approved') {
        notify(t('gallery.comment_success'), 'success')
        // Refresh comments to show the new one
        await fetchComments()
      } else {
        notify(t('gallery.comment_pending'), 'info')
      }

      // Clear form - keep author name for Linux DO users and admin users
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

  if (loading || !settingsLoaded) {
    return (
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-8">
        <div className="space-y-4 animate-pulse">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-4 bg-muted rounded w-1/4"></div>
              <div className="h-3 bg-muted rounded"></div>
              <div className="h-3 bg-muted rounded w-5/6"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full relative">
      <Toast notifications={notifications} remove={(id) => setNotifications(prev => prev.filter(n => n.id !== id))} />
      {/* Comments List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-8 space-y-6">
        {error ? (
          <div className="text-center text-destructive py-12">
            <p className="text-sm">{error}</p>
          </div>
        ) : comments.length === 0 ? (
          <div className="text-center text-muted-foreground py-12">
            <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="text-sm">{t('gallery.no_comments')}</p>
          </div>
        ) : (
          comments.map((comment) => (
            <div
              key={comment.id}
              className="pb-6 border-b border-border last:border-b-0"
            >
              <div className="flex items-start gap-3">
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
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-sm font-bold text-foreground">
                      {comment.author}
                    </span>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-widest">
                      {new Date(comment.createdAt).toLocaleString(locale, {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                    {comment.content}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Comment Form */}
      <div className="border-t border-border p-6 md:p-8 bg-muted/5 shrink-0">
        {!canComment ? (
          /* Linux DO only mode - show login prompt */
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground mb-4">
              {t('gallery.comment_linuxdo_only')}
            </p>
            <button
              type="button"
              onClick={() => {
                const returnUrl = encodeURIComponent(pathname || '/')
                router.push(`/login?returnUrl=${returnUrl}`)
              }}
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#f8d568] text-[#1a1a1a] font-bold tracking-[0.15em] text-xs uppercase hover:bg-[#f5c842] transition-all"
            >
              <LogIn className="w-4 h-4" />
              {t('gallery.comment_login_to_comment')}
            </button>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
                {t('gallery.comment_author')}
              </label>
              <input
                type="text"
                value={formData.author}
                onChange={(e) =>
                  setFormData({ ...formData, author: e.target.value })
                }
                className="w-full px-3 py-2 bg-transparent border-b border-border focus:border-primary outline-none transition-colors text-sm text-foreground"
                required
                disabled={submitting || isLinuxDoUser || isAdmin}
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
                {(linuxdoOnly && isLinuxDoUser) || isAdmin ? t('gallery.comment_username') : t('gallery.comment_email')}
              </label>
              {isAdmin && !isLinuxDoUser ? (
                /* Show Admin badge for admin users */
                <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 border-b border-primary/30">
                  <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>
                  </svg>
                  <span className="text-sm text-primary font-medium">{t('admin.admin')}</span>
                </div>
              ) : linuxdoOnly && isLinuxDoUser ? (
                /* Show Linux DO user badge instead of email input */
                <div className="flex items-center gap-2 px-3 py-2 bg-[#f8d568]/10 border-b border-[#f8d568]/30">
                  <svg className="w-4 h-4 text-[#f8d568]" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                  </svg>
                  <span className="text-sm text-[#f8d568] font-medium">Linux DO</span>
                </div>
              ) : (
              <input
                type="email"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                className="w-full px-3 py-2 bg-transparent border-b border-border focus:border-primary outline-none transition-colors text-sm text-foreground"
                disabled={submitting}
              />
              )}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
              {t('gallery.comment_content')}
            </label>
            <textarea
              value={formData.content}
              onChange={(e) =>
                setFormData({ ...formData, content: e.target.value })
              }
              className="w-full px-3 py-2 bg-transparent border border-border focus:border-primary outline-none transition-colors text-sm text-foreground resize-none"
              rows={4}
              required
              disabled={submitting}
            />
          </div>

          <button
            type="submit"
            disabled={submitting || !formData.author.trim() || !formData.content.trim()}
            className="w-full py-3 bg-primary text-primary-foreground text-xs font-bold uppercase tracking-[0.2em] hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? t('gallery.comment_submitting') : t('gallery.comment_submit')}
          </button>
        </form>
        )}
      </div>
    </div>
  )
}
