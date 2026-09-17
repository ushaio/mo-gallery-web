import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkDirective from 'remark-directive'
import { normalizeMediaEmbed, parseMediaEmbed } from './media-embed'
import { safeMediaUrl } from './media-url'
import type { MediaEmbedData } from './media-embed'

export { safeMediaUrl } from './media-url'

export const MEDIA_KINDS = ['image', 'gallery', 'video', 'audio', 'link', 'file'] as const
export type MediaKind = typeof MEDIA_KINDS[number]

export interface MediaImage {
  src: string
  alt?: string | null
  photoId?: string
}

export interface MediaCardData {
  kind: MediaKind | 'upload'
  src?: string
  title?: string
  caption?: string
  photoId?: string
  images?: MediaImage[]
  embed?: MediaEmbedData
  width?: number
  thumbnail?: string
  uploadId?: string
  status?: 'uploading' | 'failed'
}

export type MediaUrlResolver = (src: string, photoId?: string) => string

export interface MarkdownTree {
  type: string
  name?: string
  value?: string
  alt?: string | null
  attributes?: Record<string, string | null | undefined> | null
  children?: MarkdownTree[]
  data?: object
}

const parser = unified().use(remarkParse).use(remarkDirective)

export function walkMarkdown(node: MarkdownTree, visit: (node: MarkdownTree) => void) {
  visit(node)
  node.children?.forEach((child) => walkMarkdown(child, visit))
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function normalizeMedia(value: unknown): MediaCardData {
  const input = record(value)
  const kind = input.kind === 'upload' || MEDIA_KINDS.includes(input.kind as MediaKind)
    ? input.kind as MediaCardData['kind']
    : 'link'
  const supportsEmbed = kind === 'audio' || kind === 'video' || kind === 'link'
  const parsed = supportsEmbed ? parseMediaEmbed(text(input.src)) : null
  const embed = supportsEmbed ? parsed?.embed ?? normalizeMediaEmbed(input.embed) : undefined
  const width = typeof input.width === 'number' || typeof input.width === 'string' ? Number(input.width) : 0
  return {
    kind: parsed?.kind ?? kind,
    src: parsed?.src ?? safeMediaUrl(text(input.src)),
    title: text(input.title) || parsed?.title || '',
    caption: text(input.caption),
    photoId: text(input.photoId),
    ...(embed ? { embed } : {}),
    ...(kind === 'image' && Number.isFinite(width) && width > 0 && width <= 4096 ? { width: Math.round(width) } : {}),
    ...(safeMediaUrl(text(input.thumbnail)) ? { thumbnail: safeMediaUrl(text(input.thumbnail)) } : {}),
    ...(Array.isArray(input.images) ? {
      images: input.images.map((entry) => {
        const image = record(entry)
        return { src: safeMediaUrl(text(image.src)), alt: text(image.alt), photoId: text(image.photoId) }
      }).filter((image) => image.src || image.photoId),
    } : {}),
    ...(kind === 'upload' ? {
      uploadId: text(input.uploadId),
      status: input.status === 'failed' ? 'failed' : 'uploading',
    } : {}),
  }
}

export function mediaToAttributes(value: MediaCardData): Record<string, string> {
  const media = normalizeMedia(value)
  const attrs: Record<string, string> = { kind: media.kind }
  for (const key of ['src', 'title', 'caption', 'photoId', 'uploadId', 'status', 'thumbnail'] as const) {
    if (media[key]) attrs[key] = media[key]
  }
  if (media.kind === 'gallery') attrs.images = JSON.stringify(media.images ?? [])
  if (media.embed) attrs.embed = JSON.stringify(media.embed)
  if (media.width) attrs.width = String(media.width)
  return attrs
}

export function mediaFromAttributes(value: unknown): MediaCardData {
  const attrs = record(value)
  let images: unknown = []
  let embed: unknown
  if (typeof attrs.images === 'string') {
    try { images = JSON.parse(attrs.images) } catch { /* Invalid galleries render an empty card. */ }
  }
  if (typeof attrs.embed === 'string') {
    try { embed = JSON.parse(attrs.embed) } catch { /* Invalid embeds fall back to the source link. */ }
  }
  return normalizeMedia({ ...attrs, images, embed })
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/\n/g, '&#10;').replace(/\r/g, '&#13;')
}

/** A remark directive, parsed and serialized by Milkdown's Markdown pipeline. */
export function buildMediaMarkdown(media: MediaCardData): string {
  const attrs = Object.entries(mediaToAttributes(media)).map(([key, value]) => `${key}="${escapeAttribute(value)}"`).join(' ')
  return `\n\n::media{${attrs}}\n\n`
}

export function getMilkdownMedia(markdown: string): MediaCardData[] {
  const media: MediaCardData[] = []
  walkMarkdown(parser.parse(markdown), (node) => {
    if (node.type === 'leafDirective' && node.name === 'media') media.push(mediaFromAttributes(node.attributes))
  })
  return media
}

export function getMilkdownPhotoIds(markdown: string): Set<string> {
  const ids = new Set<string>()
  for (const media of getMilkdownMedia(markdown)) {
    if (media.photoId) ids.add(media.photoId)
    media.images?.forEach((image) => { if (image.photoId) ids.add(image.photoId) })
  }
  return ids
}

export function hasPendingMilkdownUploads(markdown: string): boolean {
  return getMilkdownMedia(markdown).some((media) => media.kind === 'upload')
}

export function getMilkdownText(markdown: string): string {
  const parts: string[] = []
  walkMarkdown(parser.parse(markdown), (node) => {
    if (node.type === 'text' || node.type === 'code' || node.type === 'inlineCode') parts.push(node.value ?? '')
    if (node.type === 'image') parts.push(node.alt ?? '')
    if (node.type === 'leafDirective' && node.name === 'media') {
      const media = mediaFromAttributes(node.attributes)
      parts.push(media.title ?? '', media.caption ?? '')
    }
  })
  return parts.filter(Boolean).join(' ').trim()
}

export function mediaEmbedUrl(src: string): string | null {
  return parseMediaEmbed(src)?.embed.src ?? null
}
