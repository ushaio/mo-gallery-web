import type { PhotoDto } from '@/lib/api'

const MARKDOWN_IMAGE_PATTERN = /!\[[^\]]*\]\(([^)]+)\)/g

export function buildStoryMarkdownImage(options: {
  url: string
  alt?: string
}) {
  const alt = (options.alt || '').replace(/\]/g, '\\]')
  return `\n![${alt}](${options.url})\n`
}

export function getStoryMarkdownImageUrls(content: string) {
  const urls = new Set<string>()

  for (const match of content.matchAll(MARKDOWN_IMAGE_PATTERN)) {
    const url = match[1]?.trim()
    if (!url) continue

    if (/^(https?:\/\/|uploading:\/\/)/i.test(url)) {
      continue
    }

    urls.add(url)
  }

  return urls
}

export function findStoryPhotoById(photos: PhotoDto[], photoId?: string) {
  if (!photoId) return null
  return photos.find((photo) => photo.id === photoId) ?? null
}
