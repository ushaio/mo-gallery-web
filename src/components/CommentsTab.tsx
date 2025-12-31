'use client'

import { useState, useEffect } from 'react'
import { MessageSquare } from 'lucide-react'
import { getPhotoComments, submitPhotoComment, type PublicCommentDto } from '@/lib/api'
import { useLanguage } from '@/contexts/LanguageContext'

interface CommentsTabProps {
  photoId: string
}

export function CommentsTab({ photoId }: CommentsTabProps) {
  const { t, locale } = useLanguage()
  const [comments, setComments] = useState<PublicCommentDto[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    author: '',
    email: '',
    content: '',
  })
  const [submitMessage, setSubmitMessage] = useState<{
    type: 'success' | 'error' | 'pending'
    text: string
  } | null>(null)

  useEffect(() => {
    fetchComments()
  }, [photoId])

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!formData.author.trim() || !formData.content.trim()) {
      return
    }

    try {
      setSubmitting(true)
      setSubmitMessage(null)

      const result = await submitPhotoComment(photoId, {
        author: formData.author.trim(),
        email: formData.email.trim() || undefined,
        content: formData.content.trim(),
      })

      // Check if comment was approved or pending
      if (result.status === 'approved') {
        setSubmitMessage({
          type: 'success',
          text: t('gallery.comment_success'),
        })
        // Refresh comments to show the new one
        await fetchComments()
      } else {
        setSubmitMessage({
          type: 'pending',
          text: t('gallery.comment_pending'),
        })
      }

      // Clear form
      setFormData({ author: '', email: '', content: '' })

      // Clear message after 5 seconds
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

  if (loading) {
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
    <div className="flex flex-col h-full">
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
              <div className="flex items-baseline gap-2 mb-2">
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
          ))
        )}
      </div>

      {/* Comment Form */}
      <div className="border-t border-border p-6 md:p-8 bg-muted/5 shrink-0">
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
                disabled={submitting}
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
                {t('gallery.comment_email')}
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                className="w-full px-3 py-2 bg-transparent border-b border-border focus:border-primary outline-none transition-colors text-sm text-foreground"
                disabled={submitting}
              />
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

          {submitMessage && (
            <div
              className={`text-xs p-3 border ${
                submitMessage.type === 'success'
                  ? 'bg-primary/10 border-primary/20 text-primary'
                  : submitMessage.type === 'pending'
                  ? 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400'
                  : 'bg-destructive/10 border-destructive/20 text-destructive'
              }`}
            >
              {submitMessage.text}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !formData.author.trim() || !formData.content.trim()}
            className="w-full py-3 bg-primary text-primary-foreground text-xs font-bold uppercase tracking-[0.2em] hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? t('gallery.comment_submitting') : t('gallery.comment_submit')}
          </button>
        </form>
      </div>
    </div>
  )
}
