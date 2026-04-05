'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageSquare, LogIn, Send } from 'lucide-react'
import { getStoryComments, submitPhotoComment } from '@/lib/api/comments'
import type { PublicCommentDto } from '@/lib/api/types'
import { useLanguage } from '@/contexts/LanguageContext'
import { useAuth } from '@/contexts/AuthContext'
import { useSettings } from '@/contexts/SettingsContext'
import { useTheme } from '@/contexts/ThemeContext'
import { Toast, type Notification } from '@/components/Toast'
import dynamic from 'next/dynamic'

const WalineCommentsWrapper = dynamic(
  () => import('./WalineComments').then(mod => mod.WalineComments),
  { 
    ssr: false, 
    loading: () => (
      <div className="space-y-4 animate-pulse">
        <div className="flex gap-3">
          <div className="size-8 rounded-full bg-muted/60" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/4 rounded bg-muted/60" />
            <div className="h-3 w-full rounded bg-muted/60" />
          </div>
        </div>
      </div>
    )
  }
)

interface StoryCommentsProps {
  storyId: string
  targetPhotoId: string
  compact?: boolean
}

export function StoryComments({ storyId, targetPhotoId, compact = false }: StoryCommentsProps) {
  const { t, locale } = useLanguage()
  const { user, token } = useAuth()
  const { settings, isLoading: settingsLoading } = useSettings()
  const { resolvedTheme } = useTheme()
  const router = useRouter()
  const pathname = usePathname()
  const [comments, setComments] = useState<PublicCommentDto[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    author: '',
    email: '',
    content: '',
  })
  const [notifications, setNotifications] = useState<Notification[]>([])

  const linuxdoOnly = settings?.linuxdo_only ?? false
  const isLinuxDoUser = user?.oauthProvider === 'linuxdo'
  const isAdmin = user?.isAdmin === true
  const canComment = !linuxdoOnly || isLinuxDoUser || isAdmin

  const commentsStorage = settings?.comments_storage?.toUpperCase() || ''
  const isWaline = commentsStorage === 'LEANCLOUD'
  const walineServerUrl = settings?.waline_server_url || ''
  const isDark = resolvedTheme === 'dark'
  const containerClassName = compact
    ? 'space-y-5'
    : ''
  const formPanelClassName = compact
    ? 'mb-5 rounded-[24px] border border-border/20 bg-background/55 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)] sm:p-5'
    : 'mb-6 rounded-[28px] border border-border/30 bg-background/70 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)] sm:p-6'
  const emptyPanelClassName = compact
    ? 'rounded-[24px] border border-border/20 bg-muted/5 px-5 py-8 text-center'
    : 'rounded-[28px] border border-border/20 bg-muted/5 px-6 py-10 text-center'
  const listClassName = compact ? 'space-y-3' : 'space-y-4'
  const commentCardClassName = compact
    ? 'group rounded-[20px] border border-border/20 bg-background/70 p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]'
    : 'group rounded-[24px] border border-border/25 bg-background/80 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)] sm:p-5'

  useEffect(() => {
    if (!isWaline) {
      fetchComments()
    }
  }, [storyId, isWaline])

  useEffect(() => {
    if ((isLinuxDoUser || isAdmin) && user?.username && !formData.author) {
      setFormData(prev => ({ ...prev, author: user.username }))
    }
  }, [isLinuxDoUser, isAdmin, user?.username])

  async function fetchComments() {
    try {
      setLoading(true)
      setError(null)
      const data = await getStoryComments(storyId)
      setComments(data.toSorted((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))
    } catch (err) {
      console.error('Failed to load comments:', err)
      setError(err instanceof Error ? err.message : 'Failed to load comments')
    } finally {
      setLoading(false)
    }
  }

  async function refreshComments() {
    try {
      const data = await getStoryComments(storyId)
      setComments(data.toSorted((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))
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
    const returnUrl = encodeURIComponent(pathname)
    router.push(`/login?returnUrl=${returnUrl}`)
  }

  if (settingsLoading && loading && !isWaline) return null

  if (isWaline) {
    return (
      <div className={`relative ${containerClassName}`}>
        <Toast notifications={notifications} remove={(id) => setNotifications(prev => prev.filter(n => n.id !== id))} />
        {walineServerUrl ? (
          <WalineCommentsWrapper
            serverURL={walineServerUrl}
            path={`/stories/${storyId}`}
            lang={locale === 'zh' ? 'zh-CN' : 'en'}
            dark={isDark ? 'html.dark' : ''}
          />
        ) : (
          <p className="py-4 text-center text-xs text-muted-foreground">
            Comments not configured
          </p>
        )}
      </div>
    )
  }

  return (
    <div className={`relative ${containerClassName}`}>
      <Toast notifications={notifications} remove={(id) => setNotifications(prev => prev.filter(n => n.id !== id))} />
      
      {/* Comment Form */}
      <div className={formPanelClassName}>
        {!canComment ? (
          <div className="rounded-[24px] border border-dashed border-border/30 bg-background/60 px-5 py-8 text-center">
            <p className="mb-4 text-xs text-muted-foreground">
              {t('gallery.comment_linuxdo_only')}
            </p>
            <button
              type="button"
              onClick={handleLoginClick}
              className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-primary px-4 py-2 text-[11px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <LogIn className="size-3.5" />
              {t('gallery.comment_login_to_comment')}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Author Field */}
            <div>
              <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {t('gallery.comment_author')}
              </label>
              <input
                type="text"
                value={formData.author}
                onChange={(e) => setFormData({ ...formData, author: e.target.value })}
                className="w-full rounded-2xl border border-border/35 bg-background/80 px-4 py-3 text-sm text-foreground outline-none transition-colors focus:border-primary focus:bg-background"
                required
                disabled={submitting || isLinuxDoUser || isAdmin}
              />
            </div>

            {/* Email Field */}
            {isAdmin && !isLinuxDoUser ? (
              <div className="flex min-h-12 items-center gap-2 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
                <svg className="size-4 text-primary" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>
                </svg>
                <span className="text-sm font-medium text-primary">{t('admin.admin')}</span>
              </div>
            ) : linuxdoOnly && isLinuxDoUser ? (
              <div className="flex min-h-12 items-center gap-2 rounded-2xl border border-border/35 bg-muted/30 px-4 py-3">
                <svg className="size-4 text-primary/70" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                </svg>
                <span className="text-sm font-medium text-foreground/75">Linux DO</span>
              </div>
            ) : (
              <div>
                <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {t('gallery.comment_email')} <span className="normal-case font-normal">(optional)</span>
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full rounded-2xl border border-border/35 bg-background/80 px-4 py-3 text-sm text-foreground outline-none transition-colors focus:border-primary focus:bg-background"
                  disabled={submitting}
                />
              </div>
            )}

            {/* Content Field */}
            <div>
              <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {t('gallery.comment_content')}
              </label>
              <textarea
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                className="min-h-[120px] w-full resize-none rounded-[24px] border border-border/35 bg-background/80 px-4 py-3 text-sm font-serif text-foreground outline-none transition-colors focus:border-primary focus:bg-background"
                rows={3}
                required
                disabled={submitting}
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting || !formData.author.trim() || !formData.content.trim()}
              className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-xs font-semibold uppercase tracking-wider text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? (
                <>
                  <div className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  {t('gallery.comment_submitting')}
                </>
              ) : (
                <>
                  <Send className="size-3" />
                  {t('gallery.comment_submit')}
                </>
              )}
            </button>
          </form>
        )}
      </div>

      {/* Comments List */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2].map((i) => (
            <div key={i} className="flex gap-3 rounded-[24px] border border-border/20 bg-muted/10 p-5 animate-pulse">
              <div className="size-10 shrink-0 rounded-full bg-muted/60" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-1/3 rounded-full bg-muted/60" />
                <div className="h-3 w-full rounded-full bg-muted/60" />
                <div className="h-3 w-2/3 rounded-full bg-muted/40" />
              </div>
            </div>
          ))}
        </div>
      ) : comments.length === 0 ? (
        <div className={emptyPanelClassName}>
          <MessageSquare className="mb-2 size-5 text-muted-foreground/40" />
          <p className="text-xs text-muted-foreground">
            {t('gallery.no_comments')}
          </p>
        </div>
      ) : (
        <div className={listClassName}>
          <AnimatePresence mode="popLayout">
            {comments.map((comment) => (
              <motion.div
                key={comment.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className={commentCardClassName}
              >
                <div className="flex gap-3">
                  {/* Avatar */}
                  <div className="shrink-0">
                    {comment.avatarUrl ? (
                      <img
                        src={comment.avatarUrl}
                        alt={comment.author}
                        className="size-10 rounded-full border border-border/30 object-cover"
                      />
                    ) : (
                      <div className="flex size-10 items-center justify-center rounded-full border border-border/30 bg-muted/35">
                        <span className="text-xs font-bold uppercase tracking-wide text-foreground/70">
                          {comment.author.charAt(0)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground">
                        {comment.author}
                      </span>
                      <time className="inline-flex items-center rounded-full bg-muted/35 px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                        {new Date(comment.createdAt).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </time>
                    </div>
                    <p className="mt-2 font-serif text-sm leading-relaxed text-foreground/75">
                      {comment.content}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
