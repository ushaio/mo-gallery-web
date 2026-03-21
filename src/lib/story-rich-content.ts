import type { PhotoDto } from '@/lib/api'

const MARKDOWN_IMAGE_PATTERN = /!\[[^\]]*\]\(([^)]+)\)/g
const HTML_IMAGE_PATTERN = /<img\b[^>]*\bsrc=(['"])(.*?)\1[^>]*>/gi
const HTML_IMAGE_WIDTH_PATTERN = /<img\b([^>]*?)\bsrc=(['"])(.*?)\2([^>]*?)\swidth=(?:(['"])(\d+)\5|(\d+))([^>]*?)\/?>/gi

function escapeHtmlAttribute(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function buildStoryHtmlImage(options: {
  url: string
  alt?: string
  width?: number
}) {
  const alt = escapeHtmlAttribute(options.alt || '')
  const src = escapeHtmlAttribute(options.url)
  const width = Number.isFinite(options.width) ? Math.max(160, Math.round(options.width as number)) : 480
  return `\n<img src="${src}" alt="${alt}" width="${width}">\n`
}

/** @deprecated Use buildStoryHtmlImage instead */
export const buildStoryMarkdownImage = buildStoryHtmlImage

export function getStoryMarkdownImageUrls(content: string) {
  const urls = new Set<string>()

  for (const match of content.matchAll(MARKDOWN_IMAGE_PATTERN)) {
    const rawUrl = match[1]?.trim()
    if (!rawUrl) continue

    const url = rawUrl.replace(/\s+=\d*x\s*$/, '').trim()
    if (!url) continue

    if (/^(https?:\/\/|uploading:\/\/)/i.test(url)) {
      continue
    }

    urls.add(url)
  }

  for (const match of content.matchAll(HTML_IMAGE_PATTERN)) {
    const url = match[2]?.trim()
    if (!url) continue

    if (/^(https?:\/\/|uploading:\/\/)/i.test(url)) {
      continue
    }

    urls.add(url)
  }

  return urls
}

export function normalizeStoryContentImages(content: string) {
  return content.replace(
    HTML_IMAGE_WIDTH_PATTERN,
    (_match, beforeSrc: string, quote: string, src: string, betweenSrcAndWidth: string, _widthQuote: string | undefined, quotedWidth: string | undefined, unquotedWidth: string | undefined, afterWidth: string) => {
      const width = quotedWidth ?? unquotedWidth ?? '480'
      const normalizedWidth = Math.max(160, Number.parseInt(width, 10) || 480)
      const trimmedBefore = beforeSrc.trim()
      const trimmedBetween = betweenSrcAndWidth.trim()
      const trimmedAfter = afterWidth.trim().replace(/\/$/, '').trim()
      const attrs = [trimmedBefore, `src=${quote}${src}${quote}`, trimmedBetween, `width="${normalizedWidth}"`, trimmedAfter]
        .filter(Boolean)
        .join(' ')
      return `<img ${attrs}>`
    }
  )
}

export function countStoryCharacters(content?: string | null) {
  return stripStoryContentToPlainText(content).length
}

export function stripStoryContentToPlainText(content?: string | null) {
  return (content || '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[#*_`>\-\[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function buildStoryPreviewText(content?: string | null, maxLength?: number) {
  const plainText = stripStoryContentToPlainText(content)

  if (!maxLength || plainText.length <= maxLength) {
    return plainText
  }

  return `${plainText.slice(0, maxLength).trimEnd()}...`
}

export function findStoryPhotoById(photos: PhotoDto[], photoId?: string) {
  if (!photoId) return null
  return photos.find((photo) => photo.id === photoId) ?? null
}
