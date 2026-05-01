'use client'

import { memo, useCallback, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { resolveAssetUrl } from '@/lib/api/core'
import { resolveStoredMediaEmbedInfo } from '@/lib/media-embed'
import type { PhotoDto } from '@/lib/api/types'
import {
  buildStoryPhotoIndex,
  escapeHtmlAttribute,
  type StoryPhotoIndex,
} from '@/lib/story-rich-content'
import './story-rich-content.css'

interface StoryRichContentProps {
  content: string
  photos: PhotoDto[]
  cdnDomain?: string
  className?: string
  onPhotoClick?: (photo: PhotoDto) => void
}

const HTML_TAG_PATTERN = /<\/?[a-z][\s\S]*>/i
const HTML_ANCHOR_PATTERN = /<a\b([^>]*?)href=(['"])(.*?)\2([^>]*)>/gi
const HTML_IMAGE_TAG_PATTERN = /<img\b[^>]*>/gi
const HTML_HR_TAG_PATTERN = /<hr\b[^>]*\/?>/gi
const HTML_MEDIA_EMBED_PATTERN = /<div\b[^>]*data-type=(['"])(?:media-embed|music-embed|spotify-embed)\1[^>]*>\s*<\/div>/gi
const HTML_STORY_LINK_CARD_PATTERN = /<div\b[^>]*data-type=(['"])story-link-card\1[^>]*>\s*<\/div>/gi

const IMG_SRC_ATTR_PATTERN = /\bsrc=(['"])(.*?)\1/i
const IMG_PHOTO_ID_ATTR_PATTERN = /\bdata-photo-id=(['"])(.*?)\1/i
const IMG_WIDTH_ATTR_PATTERN = /\bwidth=(?:(['"])(\d+)\1|(\d+))/i
const IMG_ALIGN_ATTR_PATTERN = /\bdata-align=(['"])(.*?)\1/i
const IMG_STYLE_ATTR_PATTERN = /\bstyle=(['"])(.*?)\1/i
const IMG_ALT_ATTR_PATTERN = /\balt=(['"])(.*?)\1/i
const IMG_TAG_PREFIX_PATTERN = /<img/i
const EMBED_PROVIDER_ATTR_PATTERN = /\bdata-provider=(['"])(.*?)\1/i
const EMBED_URL_ATTR_PATTERN = /\bdata-url=(['"])(.*?)\1/i
const EMBED_SRC_ATTR_PATTERN = /\bdata-src=(['"])(.*?)\1/i
const EMBED_TITLE_ATTR_PATTERN = /\bdata-title=(['"])(.*?)\1/i
const EMBED_HEIGHT_ATTR_PATTERN = /\bdata-height=(['"])(.*?)\1/i
const EMBED_ALLOW_ATTR_PATTERN = /\bdata-allow=(['"])(.*?)\1/i
const EMBED_ALLOW_FULLSCREEN_ATTR_PATTERN = /\bdata-allowfullscreen=(['"])(.*?)\1/i
const EMBED_FRAME_BORDER_ATTR_PATTERN = /\bdata-frameborder=(['"])(.*?)\1/i
const EMBED_MARGIN_WIDTH_ATTR_PATTERN = /\bdata-marginwidth=(['"])(.*?)\1/i
const EMBED_MARGIN_HEIGHT_ATTR_PATTERN = /\bdata-marginheight=(['"])(.*?)\1/i
const EMBED_SCROLLING_ATTR_PATTERN = /\bdata-scrolling=(['"])(.*?)\1/i
const EMBED_BORDER_ATTR_PATTERN = /\bdata-border=(['"])(.*?)\1/i
const EMBED_FRAME_SPACING_ATTR_PATTERN = /\bdata-framespacing=(['"])(.*?)\1/i
const STORY_CARD_STORY_ID_ATTR_PATTERN = /\bdata-story-id=(['"])(.*?)\1/i
const STORY_CARD_URL_ATTR_PATTERN = /\bdata-url=(['"])(.*?)\1/i
const STORY_CARD_TITLE_ATTR_PATTERN = /\bdata-title=(['"])(.*?)\1/i
const STORY_CARD_SUMMARY_ATTR_PATTERN = /\bdata-summary=(['"])(.*?)\1/i
const STORY_CARD_COVER_ATTR_PATTERN = /\bdata-cover-url=(['"])(.*?)\1/i
const STORY_CARD_DATE_ATTR_PATTERN = /\bdata-date=(['"])(.*?)\1/i
const STORY_CARD_PUBLISHED_ATTR_PATTERN = /\bdata-published=(['"])(.*?)\1/i
const EXTERNAL_URL_PATTERN = /^(https?:\/\/|data:|blob:|uploading:\/\/)/i
const MARKDOWN_IMAGE_WIDTH_PATTERN = /^(.+?)\s*=\s*(\d+)x\s*$/

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
  const match = trimmed.match(MARKDOWN_IMAGE_WIDTH_PATTERN)
  if (!match) return { url: trimmed, width: undefined }

  const parsed = Number.parseInt(match[2], 10)
  return { url: match[1].trim(), width: Number.isFinite(parsed) ? Math.max(160, parsed) : undefined }
}

function resolveStoryAssetUrl(rawUrl: string, index: StoryPhotoIndex, cdnDomain?: string, photoId?: string) {
  const matchedById = index.findById(photoId)
  if (matchedById) return resolveAssetUrl(matchedById.url, cdnDomain)

  const trimmed = rawUrl.trim()
  const matchedPhoto = index.findByExactUrl(trimmed)

  if (matchedPhoto) return resolveAssetUrl(matchedPhoto.url, cdnDomain)
  if (EXTERNAL_URL_PATTERN.test(trimmed)) return trimmed
  return resolveAssetUrl(trimmed, cdnDomain)
}

function normalizeHtmlImageTag(tag: string, index: StoryPhotoIndex, cdnDomain?: string) {
  const srcMatch = tag.match(IMG_SRC_ATTR_PATTERN)
  const photoId = tag.match(IMG_PHOTO_ID_ATTR_PATTERN)?.[2]?.trim()
  const matchedPhoto = index.findById(photoId)
  if (!srcMatch && !photoId) return tag

  const resolvedSrc = resolveStoryAssetUrl(srcMatch?.[2] || '', index, cdnDomain, photoId)
  const widthMatch = tag.match(IMG_WIDTH_ATTR_PATTERN)
  const alignMatch = tag.match(IMG_ALIGN_ATTR_PATTERN)
  const styleMatch = tag.match(IMG_STYLE_ATTR_PATTERN)
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

  let nextTag = srcMatch
    ? tag.replace(srcMatch[0], `src="${resolvedSrc}"`)
    : tag.replace(IMG_TAG_PREFIX_PATTERN, `<img src="${resolvedSrc}"`)
  const altMatch = tag.match(IMG_ALT_ATTR_PATTERN)
  if ((!altMatch || !altMatch[2]) && matchedPhoto?.title) {
    const escapedAlt = escapeHtmlAttribute(matchedPhoto.title)
    nextTag = altMatch
      ? nextTag.replace(altMatch[0], `alt="${escapedAlt}"`)
      : nextTag.replace(IMG_TAG_PREFIX_PATTERN, `<img alt="${escapedAlt}"`)
  }

  if (matchedPhoto && !photoId) {
    nextTag = nextTag.replace(IMG_TAG_PREFIX_PATTERN, `<img data-photo-id="${escapeHtmlAttribute(matchedPhoto.id)}"`)
  }

  if (styleMatch) {
    nextTag = nextTag.replace(styleMatch[0], `style="${styleParts.join(' ')}"`)
  } else {
    nextTag = nextTag.replace(IMG_TAG_PREFIX_PATTERN, `<img style="${styleParts.join(' ')}"`)
  }

  return nextTag
}

function buildMediaEmbedHtml(tag: string) {
  const provider = tag.match(EMBED_PROVIDER_ATTR_PATTERN)?.[2]?.trim() || ''
  const url = tag.match(EMBED_URL_ATTR_PATTERN)?.[2]?.trim() || ''
  const embedInfo = resolveStoredMediaEmbedInfo({
    provider,
    url,
    src: tag.match(EMBED_SRC_ATTR_PATTERN)?.[2]?.trim() || '',
    title: tag.match(EMBED_TITLE_ATTR_PATTERN)?.[2]?.trim() || '',
    height: tag.match(EMBED_HEIGHT_ATTR_PATTERN)?.[2]?.trim() || '',
    allow: tag.match(EMBED_ALLOW_ATTR_PATTERN)?.[2]?.trim() || '',
    allowFullScreen: tag.match(EMBED_ALLOW_FULLSCREEN_ATTR_PATTERN)?.[2] === 'true',
    frameBorder: tag.match(EMBED_FRAME_BORDER_ATTR_PATTERN)?.[2]?.trim() || '',
    marginWidth: (() => {
      const value = tag.match(EMBED_MARGIN_WIDTH_ATTR_PATTERN)?.[2]?.trim()
      return value ? Number.parseInt(value, 10) : undefined
    })(),
    marginHeight: (() => {
      const value = tag.match(EMBED_MARGIN_HEIGHT_ATTR_PATTERN)?.[2]?.trim()
      return value ? Number.parseInt(value, 10) : undefined
    })(),
    scrolling: tag.match(EMBED_SCROLLING_ATTR_PATTERN)?.[2]?.trim() || '',
    border: tag.match(EMBED_BORDER_ATTR_PATTERN)?.[2]?.trim() || '',
    frameSpacing: tag.match(EMBED_FRAME_SPACING_ATTR_PATTERN)?.[2]?.trim() || '',
  })
  if (!embedInfo) {
    return tag
  }

  const escapedUrl = embedInfo.url ? escapeHtmlAttribute(embedInfo.url) : ''
  const escapedEmbedUrl = escapeHtmlAttribute(embedInfo.src)
  const escapedProviderAttribute = embedInfo.provider ? ` data-provider="${escapeHtmlAttribute(embedInfo.provider)}"` : ''
  const escapedTitle = escapeHtmlAttribute(embedInfo.title)
  const frameBorderAttribute = embedInfo.frameBorder ? ` frameborder="${escapeHtmlAttribute(embedInfo.frameBorder)}"` : ''
  const marginWidthAttribute = embedInfo.marginWidth !== undefined ? ` marginwidth="${escapeHtmlAttribute(String(embedInfo.marginWidth))}"` : ''
  const marginHeightAttribute = embedInfo.marginHeight !== undefined ? ` marginheight="${escapeHtmlAttribute(String(embedInfo.marginHeight))}"` : ''
  const allowAttribute = embedInfo.allow ? ` allow="${escapeHtmlAttribute(embedInfo.allow)}"` : ''
  const allowFullScreenAttribute = embedInfo.allowFullScreen ? ' allowfullscreen' : ''
  const scrollingAttribute = embedInfo.scrolling ? ` scrolling="${escapeHtmlAttribute(embedInfo.scrolling)}"` : ''
  const borderAttribute = embedInfo.border ? ` border="${escapeHtmlAttribute(embedInfo.border)}"` : ''
  const frameSpacingAttribute = embedInfo.frameSpacing ? ` framespacing="${escapeHtmlAttribute(embedInfo.frameSpacing)}"` : ''
  const styleAttribute = embedInfo.provider === 'spotify' ? ' style="border-radius:12px"' : ''
  const dataUrlAttribute = escapedUrl ? ` data-media-url="${escapedUrl}"` : ''

  return `
    <div class="story-media-card" data-type="media-embed"${escapedProviderAttribute}>
      <iframe
        src="${escapedEmbedUrl}"
        title="${escapedTitle}"
        width="100%"
        ${embedInfo.height ? `height="${escapeHtmlAttribute(embedInfo.height)}"` : ''}
        ${dataUrlAttribute}
        loading="lazy"
        ${allowAttribute}${allowFullScreenAttribute}${frameBorderAttribute}${marginWidthAttribute}${marginHeightAttribute}${scrollingAttribute}${borderAttribute}${frameSpacingAttribute}${styleAttribute}
      ></iframe>
    </div>
  `
}

function formatStoryCardDate(value: string) {
  if (!value) return ''
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function buildStoryLinkCardHtml(tag: string) {
  const storyId = tag.match(STORY_CARD_STORY_ID_ATTR_PATTERN)?.[2]?.trim() || ''
  const url = tag.match(STORY_CARD_URL_ATTR_PATTERN)?.[2]?.trim() || (storyId ? `/story/${storyId}` : '#')
  const title = tag.match(STORY_CARD_TITLE_ATTR_PATTERN)?.[2]?.trim() || 'Untitled story'
  const summary = tag.match(STORY_CARD_SUMMARY_ATTR_PATTERN)?.[2]?.trim() || ''
  const coverUrl = tag.match(STORY_CARD_COVER_ATTR_PATTERN)?.[2]?.trim() || ''
  const date = formatStoryCardDate(tag.match(STORY_CARD_DATE_ATTR_PATTERN)?.[2]?.trim() || '')
  const isPublished = tag.match(STORY_CARD_PUBLISHED_ATTR_PATTERN)?.[2] !== 'false'

  return `
    <a class="story-link-card" data-type="story-link-card" href="${escapeHtmlAttribute(url)}" target="_blank" rel="noreferrer">
      ${coverUrl ? `<img class="story-link-card__cover" src="${escapeHtmlAttribute(coverUrl)}" alt="">` : ''}
      <span class="story-link-card__body">
        <span class="story-link-card__eyebrow"><span>Story</span>${isPublished ? '' : '<span>Draft</span>'}</span>
        <span class="story-link-card__title">${escapeHtmlAttribute(title)}</span>
        ${summary ? `<span class="story-link-card__summary">${escapeHtmlAttribute(summary)}</span>` : ''}
        ${date ? `<span class="story-link-card__meta">${escapeHtmlAttribute(date)}</span>` : ''}
      </span>
    </a>
  `
}

function resolveStoryHtml(content: string, index: StoryPhotoIndex, cdnDomain?: string) {
  const withResolvedLinks = content.replace(
    HTML_ANCHOR_PATTERN,
    (_match, beforeHref: string, quote: string, href: string, afterHref: string) => {
      if (!/^https?:\/\//i.test(href) || /target=|rel=/i.test(`${beforeHref} ${afterHref}`)) {
        return `<a${beforeHref}href=${quote}${href}${quote}${afterHref}>`
      }
      return `<a${beforeHref}href=${quote}${href}${quote}${afterHref} target="_blank" rel="noreferrer">`
    }
  )

  return withResolvedLinks
    .replace(HTML_IMAGE_TAG_PATTERN, (tag) => normalizeHtmlImageTag(tag, index, cdnDomain))
    .replace(HTML_MEDIA_EMBED_PATTERN, (tag) => buildMediaEmbedHtml(tag))
    .replace(HTML_STORY_LINK_CARD_PATTERN, (tag) => buildStoryLinkCardHtml(tag))
    .replace(HTML_HR_TAG_PATTERN, (tag) => {
      if (/\bstyle=/i.test(tag)) return tag
      return tag.replace(/<hr/i, '<hr style="border: none; border-top: 1px solid currentColor; margin: 2rem 0;"')
    })
}

function createMarkdownComponents(index: StoryPhotoIndex, cdnDomain?: string) {
  return {
    img: ({ src, alt, width }: React.ComponentProps<'img'>) => {
      const rawSrc = typeof src === 'string' ? src.trim() : ''
      const { url: parsedUrl, width: parsedWidth } = parseMarkdownImageSrc(rawSrc)
      const resolvedSrc = resolveStoryAssetUrl(parsedUrl, index, cdnDomain)
      const matchedPhoto = index.findByImageUrl(parsedUrl)
      const normalizedWidth = parsedWidth ?? normalizeImageWidth(width)

      return (
        <img
          src={resolvedSrc}
          alt={alt ?? matchedPhoto?.title ?? ''}
          data-photo-id={matchedPhoto?.id ?? undefined}
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
  onPhotoClick,
}: StoryRichContentProps) {
  const photoIndex = useMemo(
    () => buildStoryPhotoIndex(photos, cdnDomain),
    [photos, cdnDomain],
  )
  const markdownComponents = useMemo(
    () => createMarkdownComponents(photoIndex, cdnDomain),
    [photoIndex, cdnDomain],
  )
  const isHtmlContent = HTML_TAG_PATTERN.test(content)
  const rootClassName = ['story-rich-content', onPhotoClick ? 'story-rich-content--interactive' : '', className].filter(Boolean).join(' ')
  const resolvedHtml = useMemo(() => {
    if (!isHtmlContent) return null
    return resolveStoryHtml(content, photoIndex, cdnDomain)
  }, [cdnDomain, content, isHtmlContent, photoIndex])
  const handleContentClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!onPhotoClick) return

    const target = event.target
    if (!(target instanceof HTMLElement)) {
      return
    }

    const imageElement = target.closest('img')
    if (!(imageElement instanceof HTMLImageElement)) {
      return
    }

    const photoId = imageElement.getAttribute('data-photo-id')?.trim()
    const matchedById = photoIndex.findById(photoId)
    if (matchedById) {
      onPhotoClick(matchedById)
      return
    }

    const imageSrc = imageElement.getAttribute('src')
    const matchedByUrl = photoIndex.findByImageUrl(imageSrc)
    if (matchedByUrl) {
      onPhotoClick(matchedByUrl)
    }
  }, [onPhotoClick, photoIndex])

  if (isHtmlContent) {
    return (
      <div className={rootClassName} onClick={handleContentClick}>
        <div className="story-rich-html" dangerouslySetInnerHTML={{ __html: resolvedHtml ?? '' }} />
      </div>
    )
  }

  return (
    <div className={rootClassName} onClick={handleContentClick}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  )
})

export default StoryRichContent
