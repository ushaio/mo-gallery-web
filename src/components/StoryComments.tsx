'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageSquare, LogIn, Send, User } from 'lucide-react'
import { getStoryComments, submitPhotoComment, type PublicCommentDto } from '@/lib/api'
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
          <div className="size-8 rounded-full bg-zinc-200 dark:bg-zinc-700" />
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-zinc-200 dark:bg-zinc-700 rounded w-1/4" />
            <div className="h-3 bg-zinc-200 dark:bg-zinc-700 rounded w-full" />
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
    ? isDark
      ? 'rounded-2xl border border-zinc-800/80 bg-zinc-950/40 p-4'
      : 'rounded-2xl border border-zinc-200/80 bg-white/80 p-4'
    : ''

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
      data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      setComments(data)
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
          <p className="text-center text-xs text-zinc-400 dark:text-zinc-500 py-4">
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
      <div className="mb-6">
        {!canComment ? (
          <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-600 p-4 text-center">
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
              {t('gallery.comment_linuxdo_only')}
            </p>
            <button
              type="button"
              onClick={handleLoginClick}
              className="inline-flex items-center gap-2 rounded-full bg-[#f8d568] px-4 py-2 text-[11px] font-semibold text-[#1a1a1a] transition-colors hover:bg-[#f5c842] cursor-pointer"
            >
              <LogIn className="size-3.5" />
              {t('gallery.comment_login_to_comment')}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Author Field */}
            <div>
              <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                {t('gallery.comment_author')}
              </label>
              <input
                type="text"
                value={formData.author}
                onChange={(e) => setFormData({ ...formData, author: e.target.value })}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition-colors focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-500"
                required
                disabled={submitting || isLinuxDoUser || isAdmin}
              />
            </div>

            {/* Email Field */}
            {isAdmin && !isLinuxDoUser ? (
              <div className="flex items-center gap-2 rounded-lg bg-zinc-100 px-3 py-2 dark:bg-zinc-800">
                <svg className="size-4 text-zinc-500" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>
                </svg>
                <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300">{t('admin.admin')}</span>
              </div>
            ) : linuxdoOnly && isLinuxDoUser ? (
              <div className="flex items-center gap-2 rounded-lg bg-[#f8d568]/10 px-3 py-2">
                <svg className="size-4 text-[#f8d568]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                </svg>
                <span className="text-sm font-medium text-[#c9a227]">Linux DO</span>
              </div>
            ) : (
              <div>
                <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  {t('gallery.comment_email')} <span className="normal-case font-normal">(optional)</span>
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition-colors focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-500"
                  disabled={submitting}
                />
              </div>
            )}

            {/* Content Field */}
            <div>
              <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                {t('gallery.comment_content')}
              </label>
              <textarea
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                className="w-full resize-none rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition-colors focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-500"
                rows={3}
                required
                disabled={submitting}
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting || !formData.author.trim() || !formData.content.trim()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 cursor-pointer"
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
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="flex gap-3 animate-pulse">
              <div className="size-8 shrink-0 rounded-full bg-zinc-200 dark:bg-zinc-700" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-1/3 rounded bg-zinc-200 dark:bg-zinc-700" />
                <div className="h-3 w-full rounded bg-zinc-200 dark:bg-zinc-700" />
              </div>
            </div>
          ))}
        </div>
      ) : comments.length === 0 ? (
        <div className="flex flex-col items-center py-6 text-center">
          <MessageSquare className="mb-2 size-5 text-zinc-300 dark:text-zinc-600" />
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            {t('gallery.no_comments')}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {comments.map((comment) => (
              <motion.div
                key={comment.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="group"
              >
                <div className="flex gap-3">
                  {/* Avatar */}
                  <div className="shrink-0">
                    {comment.avatarUrl ? (
                      <img
                        src={comment.avatarUrl}
                        alt={comment.author}
                        className="size-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex size-8 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
                        <User className="size-4 text-zinc-400" />
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                        {comment.author}
                      </span>
                      <time className="text-[10px] text-zinc-400 dark:text-zinc-500">
                        {new Date(comment.createdAt).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </time>
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
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
