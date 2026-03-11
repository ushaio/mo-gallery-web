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
    img: ({ src, alt }: React.ComponentProps<'img'>) => {
      const rawSrc = typeof src === 'string' ? src.trim() : ''
      const matchedPhoto = photos.find((photo) => photo.url === rawSrc || photo.thumbnailUrl === rawSrc)
      const resolvedSrc = matchedPhoto
        ? resolveAssetUrl(matchedPhoto.url, cdnDomain)
        : rawSrc.startsWith('http://') || rawSrc.startsWith('https://') || rawSrc.startsWith('data:') || rawSrc.startsWith('blob:')
          ? rawSrc
          : resolveAssetUrl(rawSrc, cdnDomain)

      return (
        <img
          src={resolvedSrc}
          alt={alt ?? matchedPhoto?.title ?? ''}
          className="my-6 w-full rounded-lg border border-border object-cover"
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
