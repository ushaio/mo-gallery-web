'use client'

import { useState, useEffect } from 'react'
import { BookOpen, MessageSquare, ChevronLeft, ChevronRight } from 'lucide-react'
import { getPhotoStory, type StoryDto, getPhotoComments, submitPhotoComment, type PublicCommentDto, type PhotoDto, resolveAssetUrl } from '@/lib/api'
import { useLanguage } from '@/contexts/LanguageContext'
import { useSettings } from '@/contexts/SettingsContext'
import ReactMarkdown from 'react-markdown'

interface StoryTabProps {
  photoId: string
  currentPhoto: PhotoDto
  onPhotoChange?: (photo: PhotoDto) => void
}

export function StoryTab({ photoId, currentPhoto, onPhotoChange }: StoryTabProps) {
  const { t, locale } = useLanguage()
  const { settings } = useSettings()
  const [story, setStory] = useState<StoryDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0)

  // Comments state
  const [comments, setComments] = useState<PublicCommentDto[]>([])
  const [commentsLoading, setCommentsLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
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
    async function fetchStory() {
      try {
        setLoading(true)
        setError(null)
        const data = await getPhotoStory(photoId)
        setStory(data)
        // Find current photo index in story photos
        if (data && data.photos) {
          const index = data.photos.findIndex(p => p.id === currentPhoto.id)
          setCurrentPhotoIndex(index >= 0 ? index : 0)
        }
      } catch (err) {
        // If the error is "No story found", treat it as no story (not an error)
        const errorMessage = err instanceof Error ? err.message : 'Failed to load story'
        if (errorMessage.includes('No story found')) {
          setStory(null)
          setError(null)
        } else {
          console.error('Failed to load story:', err)
          setError(errorMessage)
        }
      } finally {
        setLoading(false)
      }
    }

    fetchStory()
    fetchComments()
  }, [photoId, currentPhoto.id])

  // Update current photo index when currentPhoto changes
  useEffect(() => {
    if (story?.photos) {
      const index = story.photos.findIndex(p => p.id === currentPhoto.id)
      if (index >= 0) {
        setCurrentPhotoIndex(index)
      }
    }
  }, [currentPhoto.id, story?.photos])

  // Keyboard navigation
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

  async function fetchComments() {
    try {
      setCommentsLoading(true)
      const data = await getPhotoComments(photoId)
      setComments(data)
    } catch (err) {
      console.error('Failed to load comments:', err)
    } finally {
      setCommentsLoading(false)
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
          <div className="h-6 bg-muted rounded w-3/4"></div>
          <div className="h-4 bg-muted rounded w-1/4"></div>
          <div className="space-y-2 mt-6">
            <div className="h-4 bg-muted rounded"></div>
            <div className="h-4 bg-muted rounded"></div>
            <div className="h-4 bg-muted rounded w-5/6"></div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-8">
        <div className="text-center text-destructive py-12">
          <p className="text-sm">{error}</p>
        </div>
      </div>
    )
  }

  if (!story) {
    return (
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-8">
        <div className="text-center text-muted-foreground py-12">
          <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p className="text-sm">{t('gallery.no_story')}</p>
        </div>

        {/* Comments Section - Always show even without story */}
        <div className="mt-8 border-t border-border pt-6">
          <div className="flex items-center gap-2 mb-6">
            <MessageSquare className="w-5 h-5 text-muted-foreground" />
            <h3 className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground">
              {t('gallery.comments')} {comments.length > 0 && `(${comments.length})`}
            </h3>
          </div>

          {/* Comments List */}
          {commentsLoading ? (
            <div className="space-y-4 animate-pulse mb-6">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="space-y-2">
                  <div className="h-4 bg-muted rounded w-1/4"></div>
                  <div className="h-3 bg-muted rounded"></div>
                  <div className="h-3 bg-muted rounded w-5/6"></div>
                </div>
              ))}
            </div>
          ) : comments.length === 0 ? (
            <div className="text-center text-muted-foreground py-8 mb-6">
              <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">{t('gallery.no_comments')}</p>
            </div>
          ) : (
            <div className="space-y-4 mb-6">
              {comments.map((comment) => (
                <div
                  key={comment.id}
                  className="pb-4 border-b border-border last:border-b-0"
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
              ))}
            </div>
          )}

          {/* Comment Form */}
          <div className="border-t border-border pt-6">
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
                className="w-full py-3 bg-primary text-primary-foreground text-xs font-bold uppercase tracking-[0.2em] hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed rounded-sm"
              >
                {submitting ? t('gallery.comment_submitting') : t('gallery.comment_submit')}
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-8 space-y-6">
      {/* Story Header */}
      <div className="space-y-3">
        <h3 className="font-serif text-2xl leading-tight text-foreground">
          {story.title}
        </h3>
        <div className="text-[10px] text-muted-foreground uppercase tracking-widest">
          {new Date(story.createdAt).toLocaleString(locale, {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      </div>

      {/* Photo Gallery Navigation - Show if multiple photos */}
      {story.photos && story.photos.length > 1 && onPhotoChange && (
        <div className="border-t border-b border-border py-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h4 className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground">
                {locale === 'zh' ? '叙事相册' : 'Story Album'}
              </h4>
              <span className="text-xs text-muted-foreground">
                {currentPhotoIndex + 1} / {story.photos.length}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => currentPhotoIndex > 0 && onPhotoChange(story.photos[currentPhotoIndex - 1])}
                disabled={currentPhotoIndex === 0}
                className="p-2 rounded-md border border-border hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title={locale === 'zh' ? '上一张' : 'Previous'}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => currentPhotoIndex < story.photos.length - 1 && onPhotoChange(story.photos[currentPhotoIndex + 1])}
                disabled={currentPhotoIndex === story.photos.length - 1}
                className="p-2 rounded-md border border-border hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title={locale === 'zh' ? '下一张' : 'Next'}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Thumbnail Strip */}
          <div className="relative">
            <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar">
              {story.photos.map((photo, index) => (
                <button
                  key={photo.id}
                  onClick={() => onPhotoChange(photo)}
                  className={`relative flex-shrink-0 w-24 h-24 rounded-md overflow-hidden border-2 transition-all ${
                    index === currentPhotoIndex
                      ? 'border-primary ring-2 ring-primary/20 scale-105'
                      : 'border-border hover:border-primary/50'
                  }`}
                  title={photo.title}
                >
                  <img
                    src={resolveAssetUrl(photo.thumbnailUrl || photo.url, settings?.cdn_domain)}
                    alt={photo.title}
                    className="w-full h-full object-cover"
                  />
                  {index === currentPhotoIndex && (
                    <div className="absolute inset-0 bg-primary/10 flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-primary"></div>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Keyboard hint */}
          <p className="text-[10px] text-muted-foreground mt-3 text-center">
            {locale === 'zh' ? '使用 ← → 键切换照片' : 'Use ← → keys to navigate'}
          </p>
        </div>
      )}

      {/* Story Content */}
      <div className="prose prose-sm max-w-none dark:prose-invert">
        <ReactMarkdown
          components={{
            h1: ({ children }) => (
              <h1 className="font-serif text-xl mb-4 text-foreground">{children}</h1>
            ),
            h2: ({ children }) => (
              <h2 className="font-serif text-lg mb-3 text-foreground">{children}</h2>
            ),
            h3: ({ children }) => (
              <h3 className="font-serif text-base mb-2 text-foreground">{children}</h3>
            ),
            p: ({ children }) => (
              <p className="text-sm leading-relaxed mb-4 text-foreground">{children}</p>
            ),
            ul: ({ children }) => (
              <ul className="list-disc list-inside mb-4 text-sm text-foreground">{children}</ul>
            ),
            ol: ({ children }) => (
              <ol className="list-decimal list-inside mb-4 text-sm text-foreground">{children}</ol>
            ),
            li: ({ children }) => (
              <li className="mb-1 text-foreground">{children}</li>
            ),
            blockquote: ({ children }) => (
              <blockquote className="border-l-4 border-primary pl-4 italic my-4 text-muted-foreground">
                {children}
              </blockquote>
            ),
            code: ({ children }) => (
              <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">
                {children}
              </code>
            ),
            pre: ({ children }) => (
              <pre className="bg-muted p-4 rounded overflow-x-auto mb-4">
                {children}
              </pre>
            ),
            a: ({ href, children }) => (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {children}
              </a>
            ),
          }}
        >
          {story.content}
        </ReactMarkdown>
      </div>

      {/* Related Photos Count - Remove this section as we now have the gallery above */}

      {/* Comments Section - Below Story */}
      <div className="border-t border-border pt-6">
        <div className="flex items-center gap-2 mb-6">
          <MessageSquare className="w-5 h-5 text-muted-foreground" />
          <h3 className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground">
            {t('gallery.comments')} {comments.length > 0 && `(${comments.length})`}
          </h3>
        </div>

        {/* Comments List */}
        {commentsLoading ? (
          <div className="space-y-4 animate-pulse mb-6">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 bg-muted rounded w-1/4"></div>
                <div className="h-3 bg-muted rounded"></div>
                <div className="h-3 bg-muted rounded w-5/6"></div>
              </div>
            ))}
          </div>
        ) : comments.length === 0 ? (
          <div className="text-center text-muted-foreground py-8 mb-6">
            <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">{t('gallery.no_comments')}</p>
          </div>
        ) : (
          <div className="space-y-4 mb-6">
            {comments.map((comment) => (
              <div
                key={comment.id}
                className="pb-4 border-b border-border last:border-b-0"
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
            ))}
          </div>
        )}

        {/* Comment Form */}
        <div className="border-t border-border pt-6">
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
              className="w-full py-3 bg-primary text-primary-foreground text-xs font-bold uppercase tracking-[0.2em] hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed rounded-sm"
            >
              {submitting ? t('gallery.comment_submitting') : t('gallery.comment_submit')}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
