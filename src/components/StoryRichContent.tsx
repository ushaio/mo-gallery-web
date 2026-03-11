'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { resolveAssetUrl, type PhotoDto } from '@/lib/api'
import {
  findStoryPhotoById,
  tokenizeStoryContent,
  type StoryDirectiveToken,
} from '@/lib/story-rich-content'

interface StoryRichContentProps {
  content: string
  photos: PhotoDto[]
  cdnDomain?: string
  className?: string
}

const markdownComponents = {
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
  img: ({ src, alt }: React.ComponentProps<'img'>) => (
    <img
      src={src}
      alt={alt ?? ''}
      className="my-6 w-full rounded-lg border border-border object-cover"
    />
  ),
}

function getPhotoUrl(photo: PhotoDto, cdnDomain?: string, thumbnail = false) {
  const url = thumbnail ? photo.thumbnailUrl || photo.url : photo.url
  return resolveAssetUrl(url, cdnDomain)
}

function getPhotoSizeClass(size?: string) {
  switch (size) {
    case 'sm':
      return 'max-w-sm'
    case 'lg':
      return 'max-w-3xl'
    case 'full':
      return 'max-w-none'
    case 'md':
    default:
      return 'max-w-2xl'
  }
}

function getPhotoAlignClass(align?: string) {
  switch (align) {
    case 'left':
      return 'md:mr-auto'
    case 'right':
      return 'md:ml-auto'
    case 'center':
      return 'mx-auto'
    case 'full':
      return 'mx-auto'
    default:
      return 'mx-auto'
  }
}

function StoryDirectivePhoto({
  directive,
  photos,
  cdnDomain,
}: {
  directive: StoryDirectiveToken
  photos: PhotoDto[]
  cdnDomain?: string
}) {
  const photo = findStoryPhotoById(photos, directive.attrs.photoId)
  const externalUrl = directive.attrs.url?.trim()
  const src = photo ? getPhotoUrl(photo, cdnDomain) : externalUrl
  const caption = directive.attrs.caption || photo?.title || ''

  if (!src) {
    return (
      <div className="my-8 rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
        图片块未找到可用图片源，请检查 `photoId` 或 `url`。
      </div>
    )
  }

  return (
    <figure
      className={`my-8 w-full ${getPhotoSizeClass(directive.attrs.size)} ${getPhotoAlignClass(directive.attrs.align)}`}
    >
      <img
        src={src}
        alt={caption}
        className="w-full rounded-xl border border-border bg-muted/20 object-cover shadow-sm"
      />
      {caption ? (
        <figcaption className="mt-3 text-center text-sm text-muted-foreground">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  )
}

function StoryDirectiveGallery({
  directive,
  photos,
  cdnDomain,
}: {
  directive: StoryDirectiveToken
  photos: PhotoDto[]
  cdnDomain?: string
}) {
  const photoItems = (directive.attrs.photoIds || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((photoId) => findStoryPhotoById(photos, photoId))
    .filter((photo): photo is PhotoDto => photo !== null)
    .map((photo) => ({
      key: photo.id,
      src: getPhotoUrl(photo, cdnDomain, true),
      alt: photo.title,
    }))

  const urlItems = (directive.attrs.urls || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((url, index) => ({
      key: `${url}-${index}`,
      src: url,
      alt: `external-${index + 1}`,
    }))

  const items = [...photoItems, ...urlItems]
  const columns = directive.attrs.columns === '3' ? 'md:grid-cols-3' : 'md:grid-cols-2'

  if (items.length === 0) {
    return (
      <div className="my-8 rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
        图库块未找到可用图片，请检查 `photoIds` 或 `urls`。
      </div>
    )
  }

  return (
    <div className={`my-10 grid grid-cols-1 gap-4 ${columns}`}>
      {items.map((item) => (
        <div key={item.key} className="overflow-hidden rounded-xl border border-border bg-muted/20">
          <img src={item.src} alt={item.alt} className="aspect-[4/3] w-full object-cover" />
        </div>
      ))}
    </div>
  )
}

export function StoryRichContent({
  content,
  photos,
  cdnDomain,
  className = '',
}: StoryRichContentProps) {
  const tokens = tokenizeStoryContent(content)

  return (
    <div className={className}>
      {tokens.map((token, index) => {
        if (token.type === 'markdown') {
          return (
            <ReactMarkdown
              key={`markdown-${index}`}
              remarkPlugins={[remarkGfm]}
              components={markdownComponents}
            >
              {token.content}
            </ReactMarkdown>
          )
        }

        if (token.directive.type === 'photo') {
          return (
            <StoryDirectivePhoto
              key={`directive-${index}`}
              directive={token.directive}
              photos={photos}
              cdnDomain={cdnDomain}
            />
          )
        }

        if (token.directive.type === 'gallery') {
          return (
            <StoryDirectiveGallery
              key={`directive-${index}`}
              directive={token.directive}
              photos={photos}
              cdnDomain={cdnDomain}
            />
          )
        }

        return null
      })}
    </div>
  )
}

export default StoryRichContent
