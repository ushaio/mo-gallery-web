'use client'

import { memo, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { resolveAssetUrl } from '@/lib/api/core'
import type { PhotoDto } from '@/lib/api/types'
import './story-rich-content.css'

interface StoryRichContentProps {
  content: string
  photos: PhotoDto[]
  cdnDomain?: string
  className?: string
}

const HTML_TAG_PATTERN = /<\/?[a-z][\s\S]*>/i
const HTML_ANCHOR_PATTERN = /<a\b([^>]*?)href=(['"])(.*?)\2([^>]*)>/gi
const HTML_IMAGE_TAG_PATTERN = /<img\b[^>]*>/gi

function normalizeImageWidth(width?: number | string) {
  if (typeof width === 'number' && Number.isFinite(width)) return Math.max(160, Math.round(width))
  if (typeof width === 'string') {
    const parsed = Number.parseInt(width, 10)
    if (Number.isFinite(parsed)) return Math.max(160, parsed)
  }
  return undefined
}

function parseMarkdownImageSrc(rawSrc: string): { url: string; width?: number } {
  const trimmed = rawSrc.trim()
  const match = trimmed.match(/^(.+?)\s*=\s*(\d+)x\s*$/)
  if (!match) return { url: trimmed, width: undefined }

  const parsed = Number.parseInt(match[2], 10)
  return { url: match[1].trim(), width: Number.isFinite(parsed) ? Math.max(160, parsed) : undefined }
}

function resolveStoryAssetUrl(rawUrl: string, photos: PhotoDto[], cdnDomain?: string) {
  const trimmed = rawUrl.trim()
  const matchedPhoto = photos.find((photo) => photo.url === trimmed || photo.thumbnailUrl === trimmed)

  if (matchedPhoto) return resolveAssetUrl(matchedPhoto.url, cdnDomain)
  if (/^(https?:\/\/|data:|blob:|uploading:\/\/)/i.test(trimmed)) return trimmed
  return resolveAssetUrl(trimmed, cdnDomain)
}

function normalizeHtmlImageTag(tag: string, photos: PhotoDto[], cdnDomain?: string) {
  const srcMatch = tag.match(/\bsrc=(['"])(.*?)\1/i)
  if (!srcMatch) return tag

  const resolvedSrc = resolveStoryAssetUrl(srcMatch[2], photos, cdnDomain)
  const widthMatch = tag.match(/\bwidth=(?:(['"])(\d+)\1|(\d+))/i)
  const alignMatch = tag.match(/\bdata-align=(['"])(.*?)\1/i)
  const styleMatch = tag.match(/\bstyle=(['"])(.*?)\1/i)
  const normalizedWidth = normalizeImageWidth(widthMatch?.[2] || widthMatch?.[3])
  const align = alignMatch?.[2]

  const styleParts: string[] = []
  if (styleMatch?.[2]) styleParts.push(styleMatch[2].trim().replace(/;?$/, ';'))
  if (normalizedWidth) styleParts.push(`width:${normalizedWidth}px;`)
  styleParts.push('display:inline-block;')
  styleParts.push('vertical-align:top;')
  styleParts.push('margin:0 0.75rem 0.75rem 0;')
  styleParts.push('max-width:100%;')
  styleParts.push('height:auto;')

  if (align === 'center') {
    styleParts.push('display:block;')
    styleParts.push('margin-left:auto;')
    styleParts.push('margin-right:auto;')
  } else if (align === 'right') {
    styleParts.push('display:block;')
    styleParts.push('margin-left:auto;')
    styleParts.push('margin-right:0;')
  }

  let nextTag = tag.replace(srcMatch[0], `src="${resolvedSrc}"`)
  if (styleMatch) {
    nextTag = nextTag.replace(styleMatch[0], `style="${styleParts.join(' ')}"`)
  } else {
    nextTag = nextTag.replace(/<img/i, `<img style="${styleParts.join(' ')}"`)
  }

  return nextTag
}

function resolveStoryHtml(content: string, photos: PhotoDto[], cdnDomain?: string) {
  const withResolvedLinks = content.replace(
    HTML_ANCHOR_PATTERN,
    (_match, beforeHref: string, quote: string, href: string, afterHref: string) => {
      if (!/^https?:\/\//i.test(href) || /target=|rel=/i.test(`${beforeHref} ${afterHref}`)) {
        return `<a${beforeHref}href=${quote}${href}${quote}${afterHref}>`
      }
      return `<a${beforeHref}href=${quote}${href}${quote}${afterHref} target="_blank" rel="noreferrer">`
    }
  )

  return withResolvedLinks.replace(HTML_IMAGE_TAG_PATTERN, (tag) => normalizeHtmlImageTag(tag, photos, cdnDomain))
}

function createMarkdownComponents(photos: PhotoDto[], cdnDomain?: string) {
  return {
    img: ({ src, alt, width }: React.ComponentProps<'img'>) => {
      const rawSrc = typeof src === 'string' ? src.trim() : ''
      const { url: parsedUrl, width: parsedWidth } = parseMarkdownImageSrc(rawSrc)
      const resolvedSrc = resolveStoryAssetUrl(parsedUrl, photos, cdnDomain)
      const matchedPhoto = photos.find((photo) => photo.url === parsedUrl || photo.thumbnailUrl === parsedUrl)
      const normalizedWidth = parsedWidth ?? normalizeImageWidth(width)

      return (
        <img
          src={resolvedSrc}
          alt={alt ?? matchedPhoto?.title ?? ''}
          width={normalizedWidth}
          style={normalizedWidth ? {
            display: 'inline-block',
            verticalAlign: 'top',
            margin: '0 0.75rem 0.75rem 0',
            width: `${normalizedWidth}px`,
            maxWidth: '100%',
            height: 'auto',
          } : {
            display: 'inline-block',
            verticalAlign: 'top',
            margin: '0 0.75rem 0.75rem 0',
            maxWidth: '100%',
            height: 'auto',
          }}
        />
      )
    },
    a: ({ children, href }: React.ComponentProps<'a'>) => (
      <a href={href} target="_blank" rel="noreferrer">{children}</a>
    ),
  }
}

export const StoryRichContent = memo(function StoryRichContent({
  content,
  photos,
  cdnDomain,
  className = '',
}: StoryRichContentProps) {
  const markdownComponents = useMemo(
    () => createMarkdownComponents(photos, cdnDomain),
    [photos, cdnDomain],
  )
  const isHtmlContent = HTML_TAG_PATTERN.test(content)
  const rootClassName = ['story-rich-content', className].filter(Boolean).join(' ')
  const resolvedHtml = useMemo(() => {
    if (!isHtmlContent) return null
    return resolveStoryHtml(content, photos, cdnDomain)
  }, [cdnDomain, content, isHtmlContent, photos])

  if (isHtmlContent) {
    return (
      <div className={rootClassName}>
        <div className="story-rich-html" dangerouslySetInnerHTML={{ __html: resolvedHtml ?? '' }} />
      </div>
    )
  }

  return (
    <div className={rootClassName}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  )
})

export default StoryRichContent
