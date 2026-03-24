'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { MessageSquare, LogIn } from 'lucide-react'
import { getPhotoComments, submitPhotoComment, type PublicCommentDto } from '@/lib/api'
import { useLanguage } from '@/contexts/LanguageContext'
import { useAuth } from '@/contexts/AuthContext'
import { useSettings } from '@/contexts/SettingsContext'
import { Toast, type Notification } from '@/components/Toast'
import dynamic from 'next/dynamic'

const WalineCommentsWrapper = dynamic(
  () => import('./WalineComments').then((mod) => mod.WalineComments),
  {
    ssr: false,
    loading: () => (
      <div className="animate-pulse space-y-4 p-6">
        <div className="h-4 w-1/4 rounded bg-muted" />
        <div className="h-3 rounded bg-muted" />
      </div>
    ),
  },
)

interface CommentsTabProps {
  photoId: string
}

export function CommentsTab({ photoId }: CommentsTabProps) {
  const { t, locale } = useLanguage()
  const { user, token } = useAuth()
  const { settings, isLoading: settingsLoading } = useSettings()
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

  const fetchComments = useCallback(async () => {
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
  }, [photoId])

  useEffect(() => {
    if (!isWaline) {
      void fetchComments()
    }
  }, [fetchComments, isWaline])

  useEffect(() => {
    if ((isLinuxDoUser || isAdmin) && user?.username && !formData.author) {
      setFormData((previous) => ({ ...previous, author: user.username }))
    }
  }, [formData.author, isAdmin, isLinuxDoUser, user?.username])

  const notify = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Math.random().toString(36).substring(2, 9)
    setNotifications((previous) => [...previous, { id, message, type }])
    setTimeout(() => {
      setNotifications((previous) => previous.filter((notification) => notification.id !== id))
    }, 4000)
  }, [])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    if (!formData.author.trim() || !formData.content.trim()) {
      return
    }

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
        await fetchComments()
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

  if (isWaline) {
    return (
      <div className="relative flex h-full flex-col">
        <Toast
          notifications={notifications}
          remove={(id) => setNotifications((previous) => previous.filter((item) => item.id !== id))}
        />
        <div className="custom-scrollbar flex-1 overflow-y-auto p-6 md:p-8">
          {walineServerUrl ? (
            <WalineCommentsWrapper
              serverURL={walineServerUrl}
              path={`/photos/${photoId}`}
              lang={locale === 'zh' ? 'zh-CN' : 'en'}
            />
          ) : (
            <div className="py-12 text-center text-muted-foreground">
              <MessageSquare className="mx-auto mb-4 h-12 w-12 opacity-50" />
              <p className="text-sm">{t('gallery.comment_waline_not_configured')}</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (loading || settingsLoading) {
    return (
      <div className="custom-scrollbar flex-1 overflow-y-auto p-6 md:p-8">
        <div className="animate-pulse space-y-4">
          {[...Array(3)].map((_, index) => (
            <div key={index} className="space-y-2">
              <div className="h-4 w-1/4 rounded bg-muted" />
              <div className="h-3 rounded bg-muted" />
              <div className="h-3 w-5/6 rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex h-full flex-col">
      <Toast
        notifications={notifications}
        remove={(id) => setNotifications((previous) => previous.filter((item) => item.id !== id))}
      />
      <div className="custom-scrollbar flex-1 space-y-6 overflow-y-auto p-6 md:p-8">
        {error ? (
          <div className="py-12 text-center text-destructive">
            <p className="text-sm">{error}</p>
          </div>
        ) : comments.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <MessageSquare className="mx-auto mb-4 h-12 w-12 opacity-50" />
            <p className="text-sm">{t('gallery.no_comments')}</p>
          </div>
        ) : (
          comments.map((comment) => (
            <div
              key={comment.id}
              className="border-b border-border pb-6 last:border-b-0"
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0">
                  {comment.avatarUrl ? (
                    <img
                      src={comment.avatarUrl}
                      alt={comment.author}
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                      <span className="text-sm font-bold text-muted-foreground">
                        {comment.author.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-baseline gap-2">
                    <span className="text-sm font-bold text-foreground">
                      {comment.author}
                    </span>
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      {new Date(comment.createdAt).toLocaleString(locale, {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                    {comment.content}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="shrink-0 border-t border-border bg-muted/5 p-6 md:p-8">
        {!canComment ? (
          <div className="py-4 text-center">
            <p className="mb-4 text-sm text-muted-foreground">
              {t('gallery.comment_linuxdo_only')}
            </p>
            <button
              type="button"
              onClick={() => {
                const returnUrl = encodeURIComponent(pathname || '/')
                router.push(`/login?returnUrl=${returnUrl}`)
              }}
              className="inline-flex items-center gap-2 bg-[#f8d568] px-6 py-3 text-xs font-bold uppercase tracking-[0.15em] text-[#1a1a1a] transition-all hover:bg-[#f5c842]"
            >
              <LogIn className="h-4 w-4" />
              {t('gallery.comment_login_to_comment')}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {t('gallery.comment_author')}
                </label>
                <input
                  type="text"
                  value={formData.author}
                  onChange={(event) =>
                    setFormData({ ...formData, author: event.target.value })
                  }
                  className="w-full border-b border-border bg-transparent px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary"
                  required
                  disabled={submitting || isLinuxDoUser || isAdmin}
                />
              </div>
              <div>
                <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {(linuxdoOnly && isLinuxDoUser) || isAdmin
                    ? t('gallery.comment_username')
                    : t('gallery.comment_email')}
                </label>
                {isAdmin && !isLinuxDoUser ? (
                  <div className="flex items-center gap-2 border-b border-primary/30 bg-primary/10 px-3 py-2">
                    <svg className="h-4 w-4 text-primary" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z" />
                    </svg>
                    <span className="text-sm font-medium text-primary">{t('admin.admin')}</span>
                  </div>
                ) : linuxdoOnly && isLinuxDoUser ? (
                  <div className="flex items-center gap-2 border-b border-[#f8d568]/30 bg-[#f8d568]/10 px-3 py-2">
                    <svg className="h-4 w-4 text-[#f8d568]" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
                    </svg>
                    <span className="text-sm font-medium text-[#f8d568]">
                      {t('gallery.comment_linuxdo_badge')}
                    </span>
                  </div>
                ) : (
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(event) =>
                      setFormData({ ...formData, email: event.target.value })
                    }
                    className="w-full border-b border-border bg-transparent px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary"
                    disabled={submitting}
                  />
                )}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {t('gallery.comment_content')}
              </label>
              <textarea
                value={formData.content}
                onChange={(event) =>
                  setFormData({ ...formData, content: event.target.value })
                }
                className="w-full resize-none border border-border bg-transparent px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary"
                rows={4}
                required
                disabled={submitting}
              />
            </div>

            <button
              type="submit"
              disabled={submitting || !formData.author.trim() || !formData.content.trim()}
              className="w-full bg-primary py-3 text-xs font-bold uppercase tracking-[0.2em] text-primary-foreground transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? t('gallery.comment_submitting') : t('gallery.comment_submit')}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
