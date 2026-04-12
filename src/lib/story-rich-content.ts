import type { PhotoDto } from '@/lib/api/types'

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
  const width = Number.isFinite(options.width) ? Math.max(40, Math.round(options.width as number)) : 80
  return `\n<p style="text-align: center"><img src="${src}" alt="${alt}" width="${width}"></p>\n`
}

/** @deprecated Use buildStoryHtmlImage instead */
export const buildStoryMarkdownImage = buildStoryHtmlImage

export function getStoryMarkdownImageUrls(content: string) {
  const urls = new Set<string>()

  for (const match of content.matchAll(MARKDOWN_IMAGE_PATTERN)) {
    const rawUrl = match[1]?.trim()
    if (!rawUrl) continue

    const url = normalizeStoryImageUrl(rawUrl)
    if (!url) continue

    if (/^uploading:\/\//i.test(url)) {
      continue
    }

    urls.add(url)
  }

  for (const match of content.matchAll(HTML_IMAGE_PATTERN)) {
    const url = normalizeStoryImageUrl(match[2] || '')
    if (!url) continue

    if (/^uploading:\/\//i.test(url)) {
      continue
    }

    urls.add(url)
  }

  return urls
}

function normalizeStoryImageUrl(url: string) {
  return url
    .trim()
    .replace(/\s+=\d*x\s*$/, '')
    .replace(/\\/g, '/')
    .replace(/(?<!:)\/{2,}/g, '/')
}

function stripOrigin(url: string) {
  if (!/^(https?:)?\/\//i.test(url)) return url

  try {
    const parsed = new URL(url)
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return url.replace(/^(https?:)?\/\/[^/]+/i, '')
  }
}

function joinCdnUrl(cdnDomain: string, path: string) {
  const trimmedDomain = cdnDomain.trim().replace(/\/+$/, '')
  if (!trimmedDomain) return path

  if (/^(https?:)?\/\//i.test(path)) {
    return path
  }

  return `${trimmedDomain}${path.startsWith('/') ? path : `/${path}`}`
}

export function getStoryImageMatchCandidates(options: {
  url?: string | null
  thumbnailUrl?: string | null
  cdnDomain?: string | null
}) {
  const candidates = new Set<string>()

  for (const rawValue of [options.url, options.thumbnailUrl]) {
    if (!rawValue) continue

    const normalized = normalizeStoryImageUrl(rawValue)
    if (!normalized) continue

    candidates.add(normalized)
    candidates.add(stripOrigin(normalized))

    if (options.cdnDomain) {
      const cdnUrl = normalizeStoryImageUrl(joinCdnUrl(options.cdnDomain, normalized))
      candidates.add(cdnUrl)
      candidates.add(stripOrigin(cdnUrl))
    }
  }

  return candidates
}

export function normalizeStoryContentImages(content: string) {
  return content.replace(
    HTML_IMAGE_WIDTH_PATTERN,
    (_match, beforeSrc: string, quote: string, src: string, betweenSrcAndWidth: string, _widthQuote: string | undefined, quotedWidth: string | undefined, unquotedWidth: string | undefined, afterWidth: string) => {
      const width = quotedWidth ?? unquotedWidth ?? '480'
      const normalizedWidth = Math.max(40, Number.parseInt(width, 10) || 80)
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
