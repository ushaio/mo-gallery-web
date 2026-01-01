'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { MessageSquare, LogIn, Send, CornerDownRight } from 'lucide-react'
import { getStoryComments, submitPhotoComment, getCommentSettings, type PublicCommentDto } from '@/lib/api'
import { useLanguage } from '@/contexts/LanguageContext'
import { useAuth } from '@/contexts/AuthContext'

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
  const [submitMessage, setSubmitMessage] = useState<{
    type: 'success' | 'error' | 'pending'
    text: string
  } | null>(null)

  const isLinuxDoUser = user?.oauthProvider === 'linuxdo'
  const canComment = !linuxdoOnly || isLinuxDoUser

  useEffect(() => {
    fetchComments()
    fetchSettings()
  }, [storyId])

  useEffect(() => {
    if (isLinuxDoUser && user?.username && !formData.author) {
      setFormData(prev => ({ ...prev, author: user.username }))
    }
  }, [isLinuxDoUser, user?.username])

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!formData.author.trim() || !formData.content.trim()) return
    if (linuxdoOnly && !isLinuxDoUser) return

    try {
      setSubmitting(true)
      setSubmitMessage(null)

      const result = await submitPhotoComment(targetPhotoId, {
        author: formData.author.trim(),
        email: formData.email.trim() || undefined,
        content: formData.content.trim(),
      }, linuxdoOnly && isLinuxDoUser ? token : undefined)

      if (result.status === 'approved') {
        setSubmitMessage({ type: 'success', text: t('gallery.comment_success') })
        await fetchComments()
      } else {
        setSubmitMessage({ type: 'pending', text: t('gallery.comment_pending') })
      }

      setFormData({ author: '', email: '', content: '' })
      setTimeout(() => setSubmitMessage(null), 5000)
    } catch (err) {
      console.error('Failed to submit comment:', err)
      setSubmitMessage({
        type: 'error',
        text: err instanceof Error ? err.message : t('gallery.comment_error'),
      })
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
    <div className="max-w-screen-md mx-auto mt-32 mb-24 px-6 md:px-0">
      <div className="pt-16 border-t border-border/50">
        <div className="flex items-center justify-between mb-12">
          <div className="flex items-center gap-4">
            <MessageSquare className="w-5 h-5 text-primary/40" />
            <h3 className="text-[10px] font-bold tracking-[0.4em] uppercase text-primary/80">
              {t('gallery.comments')} {comments.length > 0 && `(${comments.length})`}
            </h3>
          </div>
        </div>

        {/* Comments List */}
        {loading ? (
          <div className="space-y-8 animate-pulse mb-12">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="space-y-3">
                <div className="h-4 bg-muted rounded-none w-1/4"></div>
                <div className="h-4 bg-muted rounded-none w-full"></div>
              </div>
            ))}
          </div>
        ) : comments.length === 0 ? (
          <div className="text-center py-12 mb-12 bg-muted/5 border border-border/50">
            <p className="text-xs font-serif italic text-muted-foreground/60">{t('gallery.no_comments')}</p>
          </div>
        ) : (
          <div className="space-y-12 mb-16">
            {comments.map((comment) => (
              <div key={comment.id} className="relative pl-8">
                <div className="absolute left-0 top-0 text-primary/20">
                  <CornerDownRight className="w-4 h-4" />
                </div>
                <div className="flex items-center gap-3 mb-3">
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
            ))}
          </div>
        )}

        {/* Comment Form */}
        <div className="relative group">
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
                    disabled={submitting || isLinuxDoUser}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-[0.3em]">
                    {linuxdoOnly && isLinuxDoUser ? t('gallery.comment_username') : t('gallery.comment_email')}
                  </label>
                  {linuxdoOnly && isLinuxDoUser ? (
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

              {submitMessage && (
                <div className={`text-[10px] p-4 font-mono uppercase tracking-widest border ${
                  submitMessage.type === 'success' ? 'bg-primary/5 border-primary/20 text-primary' :
                  submitMessage.type === 'pending' ? 'bg-amber-500/5 border-amber-500/20 text-amber-600' :
                  'bg-destructive/5 border-destructive/20 text-destructive'
                }`}>
                  {submitMessage.text}
                </div>
              )}

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
      </div>
    </div>
  )
}
