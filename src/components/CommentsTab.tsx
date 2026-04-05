'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { MessageSquare, LogIn, Send } from 'lucide-react'
import { getPhotoComments, submitPhotoComment } from '@/lib/api/comments'
import type { PublicCommentDto } from '@/lib/api/types'
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
      setComments(data.toSorted((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))
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
          <div className="rounded-[28px] border border-destructive/20 bg-destructive/5 px-6 py-12 text-center text-destructive">
            <p className="text-sm">{error}</p>
          </div>
        ) : comments.length === 0 ? (
          <div className="rounded-[28px] border border-border/20 bg-muted/5 px-6 py-12 text-center text-muted-foreground">
            <MessageSquare className="mx-auto mb-4 h-12 w-12 opacity-50" />
            <p className="text-sm">{t('gallery.no_comments')}</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {comments.map((comment) => (
              <div
                key={comment.id}
                className="rounded-[24px] border border-border/30 bg-background/80 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)] sm:p-5"
              >
                <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  {comment.avatarUrl ? (
                    <img
                      src={comment.avatarUrl}
                      alt={comment.author}
                      className="h-11 w-11 rounded-full border border-border/30 object-cover"
                    />
                  ) : (
                    <div className="flex h-11 w-11 items-center justify-center rounded-full border border-border/30 bg-muted/40">
                      <span className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
                        {comment.author.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold uppercase tracking-[0.16em] text-foreground">
                      {comment.author}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-muted/35 px-2 py-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                      {new Date(comment.createdAt).toLocaleString(locale, {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap font-serif text-sm leading-relaxed text-foreground/80">
                    {comment.content}
                  </p>
                </div>
              </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-border bg-muted/5 p-6 md:p-8">
        {!canComment ? (
          <div className="rounded-[24px] border border-dashed border-border/30 bg-background/60 px-6 py-8 text-center">
            <p className="mb-4 text-sm text-muted-foreground">
              {t('gallery.comment_linuxdo_only')}
            </p>
            <button
              type="button"
              onClick={() => {
                const returnUrl = encodeURIComponent(pathname || '/')
                router.push(`/login?returnUrl=${returnUrl}`)
              }}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-xs font-bold uppercase tracking-[0.15em] text-primary-foreground transition-all hover:bg-primary/90"
            >
              <LogIn className="h-4 w-4" />
              {t('gallery.comment_login_to_comment')}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5 rounded-[28px] border border-border/30 bg-background/70 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)] sm:p-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                  className="w-full rounded-2xl border border-border/35 bg-background/80 px-4 py-3 text-sm text-foreground outline-none transition-colors focus:border-primary focus:bg-background"
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
                  <div className="flex min-h-12 items-center gap-2 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3">
                    <svg className="h-4 w-4 text-primary" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z" />
                    </svg>
                    <span className="text-sm font-medium text-primary">{t('admin.admin')}</span>
                  </div>
                ) : linuxdoOnly && isLinuxDoUser ? (
                  <div className="flex min-h-12 items-center gap-2 rounded-2xl border border-border/35 bg-muted/30 px-4 py-3">
                    <svg className="h-4 w-4 text-primary/70" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
                    </svg>
                    <span className="text-sm font-medium text-foreground/75">
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
                    className="w-full rounded-2xl border border-border/35 bg-background/80 px-4 py-3 text-sm text-foreground outline-none transition-colors focus:border-primary focus:bg-background"
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
                className="min-h-[120px] w-full resize-none rounded-[24px] border border-border/35 bg-background/80 px-4 py-3 text-sm font-serif text-foreground outline-none transition-colors focus:border-primary focus:bg-background"
                rows={4}
                required
                disabled={submitting}
              />
            </div>

            <button
              type="submit"
              disabled={submitting || !formData.author.trim() || !formData.content.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-xs font-bold uppercase tracking-[0.2em] text-primary-foreground transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {!submitting ? <Send className="h-3.5 w-3.5" /> : null}
              {submitting ? t('gallery.comment_submitting') : t('gallery.comment_submit')}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
