import { resolveAssetUrl } from '@/lib/api/core'
import type { PhotoDto } from '@/lib/api/types'

const MARKDOWN_IMAGE_PATTERN = /!\[[^\]]*\]\(([^)]+)\)/g
const HTML_IMAGE_TAG_PATTERN = /<img\b[^>]*>/gi
const HTML_IMAGE_PHOTO_ID_PATTERN = /\bdata-photo-id=(['"])(.*?)\1/i
const HTML_IMAGE_SRC_PATTERN = /\bsrc=(['"])(.*?)\1/i
const HTML_IMAGE_WIDTH_PATTERN = /\bwidth=(?:(['"])(\d+)\1|(\d+))/i

export function escapeHtmlAttribute(value: string) {
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
  photoId?: string
}) {
  const alt = escapeHtmlAttribute(options.alt || '')
  const src = escapeHtmlAttribute(options.url)
  const widthAttr = Number.isFinite(options.width) ? ` width="${Math.max(40, Math.round(options.width as number))}"` : ''
  const photoIdAttr = options.photoId ? ` data-photo-id="${escapeHtmlAttribute(options.photoId)}"` : ''
  return `\n<p style="text-align: center"><img src="${src}" alt="${alt}"${photoIdAttr}${widthAttr}></p>\n`
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

  for (const match of content.matchAll(HTML_IMAGE_TAG_PATTERN)) {
    if (HTML_IMAGE_PHOTO_ID_PATTERN.test(match[0])) {
      continue
    }

    const rawSrc = match[0].match(HTML_IMAGE_SRC_PATTERN)?.[2] || ''
    const url = normalizeStoryImageUrl(rawSrc)
    if (!url) continue

    if (/^uploading:\/\//i.test(url)) {
      continue
    }

    urls.add(url)
  }

  return urls
}

export function getStoryReferencedPhotoIds(content: string) {
  const photoIds = new Set<string>()

  for (const match of content.matchAll(HTML_IMAGE_TAG_PATTERN)) {
    const photoId = match[0].match(HTML_IMAGE_PHOTO_ID_PATTERN)?.[2]?.trim()
    if (!photoId) continue
    photoIds.add(photoId)
  }

  return photoIds
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
  return content.replace(HTML_IMAGE_TAG_PATTERN, (tag) => {
    let nextTag = tag

    const widthMatch = nextTag.match(HTML_IMAGE_WIDTH_PATTERN)
    const rawWidth = widthMatch?.[2] || widthMatch?.[3]
    if (rawWidth) {
      const normalizedWidth = Math.max(40, Number.parseInt(rawWidth, 10) || 80)
      nextTag = nextTag.replace(HTML_IMAGE_WIDTH_PATTERN, `width="${normalizedWidth}"`)
    }

    if (HTML_IMAGE_PHOTO_ID_PATTERN.test(nextTag)) {
      nextTag = nextTag.replace(/\s*\bsrc=(['"])(.*?)\1/i, '')
    }

    return nextTag.replace(/\s+>/g, '>')
  })
}

export function hydrateStoryContentImages(content: string, photos: PhotoDto[], cdnDomain?: string) {
  return content.replace(HTML_IMAGE_TAG_PATTERN, (tag) => {
    const photoId = tag.match(HTML_IMAGE_PHOTO_ID_PATTERN)?.[2]?.trim()
    if (!photoId) {
      return tag
    }

    const photo = findStoryPhotoById(photos, photoId)
    if (!photo) {
      return tag
    }

    const resolvedSrc = resolveAssetUrl(photo.url, cdnDomain)
    if (HTML_IMAGE_SRC_PATTERN.test(tag)) {
      return tag.replace(HTML_IMAGE_SRC_PATTERN, `src="${resolvedSrc}"`)
    }

    return tag.replace(/<img/i, `<img src="${resolvedSrc}"`)
  })
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

export function findStoryPhotoByImageUrl(
  photos: PhotoDto[],
  imageUrl?: string | null,
  cdnDomain?: string,
) {
  const normalizedTarget = normalizeStoryImageUrl(imageUrl || '')
  if (!normalizedTarget) return null

  const targetCandidates = new Set([
    normalizedTarget,
    stripOrigin(normalizedTarget),
  ])

  for (const photo of photos) {
    const candidates = getStoryImageMatchCandidates({
      url: photo.url,
      thumbnailUrl: photo.thumbnailUrl,
      cdnDomain,
    })

    for (const candidate of candidates) {
      if (targetCandidates.has(candidate)) {
        return photo
      }
    }
  }

  return null
}

export interface StoryPhotoIndex {
  findById(photoId?: string | null): PhotoDto | null
  findByExactUrl(url?: string | null): PhotoDto | null
  findByImageUrl(url?: string | null): PhotoDto | null
}

export function buildStoryPhotoIndex(photos: PhotoDto[], cdnDomain?: string): StoryPhotoIndex {
  const byId = new Map<string, PhotoDto>()
  const byExactUrl = new Map<string, PhotoDto>()
  const byCandidate = new Map<string, PhotoDto>()

  for (const photo of photos) {
    if (photo.id) byId.set(photo.id, photo)
    if (photo.url && !byExactUrl.has(photo.url)) byExactUrl.set(photo.url, photo)
    if (photo.thumbnailUrl && !byExactUrl.has(photo.thumbnailUrl)) byExactUrl.set(photo.thumbnailUrl, photo)

    const candidates = getStoryImageMatchCandidates({
      url: photo.url,
      thumbnailUrl: photo.thumbnailUrl,
      cdnDomain,
    })
    for (const candidate of candidates) {
      if (!byCandidate.has(candidate)) byCandidate.set(candidate, photo)
    }
  }

  return {
    findById(photoId) {
      if (!photoId) return null
      return byId.get(photoId) ?? null
    },
    findByExactUrl(url) {
      if (!url) return null
      return byExactUrl.get(url) ?? null
    },
    findByImageUrl(url) {
      const normalized = normalizeStoryImageUrl(url || '')
      if (!normalized) return null
      return byCandidate.get(normalized) ?? byCandidate.get(stripOrigin(normalized)) ?? null
    },
  }
}
