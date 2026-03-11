'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { resolveAssetUrl, type PhotoDto } from '@/lib/api'

interface StoryRichContentProps {
  content: string
  photos: PhotoDto[]
  cdnDomain?: string
  className?: string
}

function normalizeImageWidth(width?: number | string) {
  if (typeof width === 'number' && Number.isFinite(width)) {
    return Math.max(160, Math.round(width))
  }

  if (typeof width === 'string') {
    const parsed = Number.parseInt(width, 10)
    if (Number.isFinite(parsed)) {
      return Math.max(160, parsed)
    }
  }

  return undefined
}

/**
 * 从 Markdown 图片 src 中提取真正的 URL 和可选的宽度
 * 支持格式: "https://example.com/image.jpg =480x" -> { url: "https://example.com/image.jpg", width: 480 }
 */
function parseMarkdownImageSrc(rawSrc: string): { url: string; width?: number } {
  const trimmed = rawSrc.trim()
  const match = trimmed.match(/^(.+?)\s*=\s*(\d+)x\s*$/)
  if (match) {
    const parsed = Number.parseInt(match[2], 10)
    return {
      url: match[1].trim(),
      width: Number.isFinite(parsed) ? Math.max(160, parsed) : undefined,
    }
  }
  return { url: trimmed, width: undefined }
}

function createMarkdownComponents(photos: PhotoDto[], cdnDomain?: string) {
  return {
    p: ({ children }: React.ComponentProps<'p'>) => (
      <p className="mb-5 text-base leading-8 text-foreground/90 last:mb-0">{children}</p>
    ),
    h1: ({ children }: React.ComponentProps<'h1'>) => (
      <h1 className="mb-6 mt-10 text-4xl font-serif font-light tracking-tight">{children}</h1>
    ),
    h2: ({ children }: React.ComponentProps<'h2'>) => (
      <h2 className="mb-5 mt-10 text-3xl font-serif font-light tracking-tight">{children}</h2>
    ),
    h3: ({ children }: React.ComponentProps<'h3'>) => (
      <h3 className="mb-4 mt-8 text-2xl font-serif font-light tracking-tight">{children}</h3>
    ),
    ul: ({ children }: React.ComponentProps<'ul'>) => (
      <ul className="mb-5 list-disc space-y-2 pl-6 text-foreground/90">{children}</ul>
    ),
    ol: ({ children }: React.ComponentProps<'ol'>) => (
      <ol className="mb-5 list-decimal space-y-2 pl-6 text-foreground/90">{children}</ol>
    ),
    blockquote: ({ children }: React.ComponentProps<'blockquote'>) => (
      <blockquote className="mb-6 border-l-2 border-primary/40 pl-5 italic text-muted-foreground">
        {children}
      </blockquote>
    ),
    code: ({ children, className }: React.ComponentProps<'code'>) => {
      const isBlock = className?.includes('language-')
      if (isBlock) {
        return (
          <code className="block overflow-x-auto rounded-lg bg-muted px-4 py-3 text-sm">
            {children}
          </code>
        )
      }

      return <code className="rounded bg-muted px-1.5 py-0.5 text-sm">{children}</code>
    },
    a: ({ children, href }: React.ComponentProps<'a'>) => (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="text-primary underline underline-offset-4"
      >
        {children}
      </a>
    ),
    img: ({ src, alt, width }: React.ComponentProps<'img'>) => {
      const rawSrc = typeof src === 'string' ? src.trim() : ''
      const { url: parsedUrl, width: parsedWidth } = parseMarkdownImageSrc(rawSrc)
      const matchedPhoto = photos.find((photo) => photo.url === parsedUrl || photo.thumbnailUrl === parsedUrl)
      const resolvedSrc = matchedPhoto
        ? resolveAssetUrl(matchedPhoto.url, cdnDomain)
        : parsedUrl.startsWith('http://') || parsedUrl.startsWith('https://') || parsedUrl.startsWith('data:') || parsedUrl.startsWith('blob:')
          ? parsedUrl
          : resolveAssetUrl(parsedUrl, cdnDomain)
      const normalizedWidth = parsedWidth ?? normalizeImageWidth(width)

      return (
        <img
          src={resolvedSrc}
          alt={alt ?? matchedPhoto?.title ?? ''}
          width={normalizedWidth}
          className="my-6 max-w-full rounded-lg border border-border object-contain"
          style={normalizedWidth ? { width: `${normalizedWidth}px`, maxWidth: '100%', height: 'auto' } : undefined}
        />
      )
    },
  }
}

export function StoryRichContent({
  content,
  photos,
  cdnDomain,
  className = '',
}: StoryRichContentProps) {
  const markdownComponents = createMarkdownComponents(photos, cdnDomain)

  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  )
}

export default StoryRichContent
