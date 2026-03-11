import type { PhotoDto } from '@/lib/api'

export type StoryDirectiveType = 'photo' | 'gallery'

export interface StoryDirectiveToken {
  type: StoryDirectiveType
  attrs: Record<string, string>
}

export interface StoryMarkdownToken {
  type: 'markdown'
  content: string
}

export interface StoryDirectiveBlockToken {
  type: 'directive'
  directive: StoryDirectiveToken
}

export type StoryContentToken = StoryMarkdownToken | StoryDirectiveBlockToken

const DIRECTIVE_PATTERN = /^::(photo|gallery)\{(.*)\}$/
const ATTRIBUTE_PATTERN = /(\w+)\s*=\s*"([^"]*)"/g

export function parseStoryDirective(line: string): StoryDirectiveToken | null {
  const trimmed = line.trim()
  const match = DIRECTIVE_PATTERN.exec(trimmed)
  if (!match) return null

  const [, type, rawAttrs] = match
  const attrs: Record<string, string> = {}

  for (const attrMatch of rawAttrs.matchAll(ATTRIBUTE_PATTERN)) {
    const [, key, value] = attrMatch
    attrs[key] = value
  }

  return {
    type: type as StoryDirectiveType,
    attrs,
  }
}

export function tokenizeStoryContent(content: string): StoryContentToken[] {
  if (!content.trim()) return []

  const lines = content.split(/\r?\n/)
  const tokens: StoryContentToken[] = []
  let markdownBuffer: string[] = []

  const pushMarkdown = () => {
    if (markdownBuffer.length === 0) return
    const markdown = markdownBuffer.join('\n').trim()
    markdownBuffer = []
    if (!markdown) return
    tokens.push({ type: 'markdown', content: markdown })
  }

  for (const line of lines) {
    const directive = parseStoryDirective(line)
    if (directive) {
      pushMarkdown()
      tokens.push({
        type: 'directive',
        directive,
      })
      continue
    }

    markdownBuffer.push(line)
  }

  pushMarkdown()
  return tokens
}

export function buildPhotoDirective(options: {
  photoId?: string
  url?: string
  caption?: string
  align?: 'left' | 'right' | 'center' | 'full'
  size?: 'sm' | 'md' | 'lg' | 'full'
}) {
  const attrs = [
    options.photoId ? `photoId="${options.photoId}"` : null,
    options.url ? `url="${options.url}"` : null,
    options.caption ? `caption="${options.caption}"` : null,
    options.align ? `align="${options.align}"` : null,
    options.size ? `size="${options.size}"` : null,
  ].filter(Boolean)

  return `\n::photo{${attrs.join(' ')}}\n`
}

export function buildGalleryDirective(options: {
  photoIds?: string[]
  urls?: string[]
  columns?: '2' | '3'
}) {
  const attrs = [
    options.photoIds?.length ? `photoIds="${options.photoIds.join(',')}"` : null,
    options.urls?.length ? `urls="${options.urls.join(',')}"` : null,
    options.columns ? `columns="${options.columns}"` : null,
  ].filter(Boolean)

  return `\n::gallery{${attrs.join(' ')}}\n`
}

export function getStoryDirectivePhotoIds(content: string) {
  const photoIds = new Set<string>()

  for (const token of tokenizeStoryContent(content)) {
    if (token.type !== 'directive') continue

    if (token.directive.type === 'photo' && token.directive.attrs.photoId) {
      photoIds.add(token.directive.attrs.photoId)
    }

    if (token.directive.type === 'gallery' && token.directive.attrs.photoIds) {
      token.directive.attrs.photoIds
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
        .forEach((photoId) => photoIds.add(photoId))
    }
  }

  return photoIds
}

export function findStoryPhotoById(photos: PhotoDto[], photoId?: string) {
  if (!photoId) return null
  return photos.find((photo) => photo.id === photoId) ?? null
}
