'use client'

import { BookText, Clock, FileText, Tag, X } from 'lucide-react'
import { AdminButton } from '@/components/admin/AdminButton'
import { StoryRichContent } from '@/components/StoryRichContent'
import { formatRelativeTimeLabel } from '@/lib/utils'

interface BlogPreviewModalProps {
  blog: {
    title: string
    content: string
    category?: string
    tags?: string
  }
  updatedAt?: string
  t: (key: string) => string
  onClose: () => void
}

/**
 * 博客预览弹窗：以只读方式渲染 TipTap HTML 内容，交互与叙事预览一致。
 */
export function BlogPreviewModal({ blog, updatedAt, t, onClose }: BlogPreviewModalProps) {
  const relativeTime = updatedAt ? formatRelativeTimeLabel(new Date(updatedAt).getTime(), t, 'datetime') : null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm md:p-12"
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border bg-background shadow-2xl"
        style={{ borderColor: 'var(--border)' }}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between border-b p-6" style={{ borderColor: 'var(--border)' }}>
          <div className="min-w-0">
            <h3 className="truncate font-serif text-2xl">{blog.title || t('admin.untitled')}</h3>
            <div
              className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-[10px] uppercase tracking-wide"
              style={{ color: 'var(--muted-foreground)' }}
            >
              <span className="flex items-center gap-1.5">
                <BookText className="h-3 w-3" />
                {t('admin.blog')}
              </span>
              {relativeTime && (
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3 w-3" />
                  {relativeTime}
                </span>
              )}
              {blog.category && (
                <span className="flex items-center gap-1.5">
                  <Tag className="h-3 w-3" />
                  {blog.category}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <FileText className="h-3 w-3" />
                {blog.content.length} {t('admin.characters')}
              </span>
            </div>
          </div>
          <AdminButton onClick={onClose} adminVariant="icon" size="sm" className="rounded-md p-2">
            <X className="h-5 w-5" />
          </AdminButton>
        </div>

        {/* 正文 */}
        <div className="custom-scrollbar flex-1 overflow-y-auto p-6">
          {blog.content ? (
            <StoryRichContent content={blog.content} className="story-rich-content--article" />
          ) : (
            <p className="text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>
              {t('admin.no_content')}
            </p>
          )}
        </div>

        {/* 底部提示 */}
        <div className="border-t bg-muted/20 p-4" style={{ borderColor: 'var(--border)' }}>
          <p className="text-center text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
            {t('admin.draft_preview_hint')}
          </p>
        </div>
      </div>
    </div>
  )
}
