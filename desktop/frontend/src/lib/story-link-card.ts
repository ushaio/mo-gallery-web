import type { StoryDto } from '@/lib/api/types'

export interface ParsedStoryLink {
  storyId: string
  url: string
}

export interface StoryLinkCardAttrs {
  storyId: string
  url: string
  title: string
  summary: string
  coverUrl?: string
  date?: string
  isPublished?: boolean
}

const STORY_PATH_PATTERN = /^\/story\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/)?$/i
const SUMMARY_MAX_LENGTH = 120

function getRuntimeHost() {
  if (typeof window === 'undefined') return undefined
  return window.location.host
}

export function parseStoryLink(rawUrl: string, siteHosts: string[] = []): ParsedStoryLink | null {
  const trimmed = rawUrl.trim()
  if (!trimmed) return null

  try {
    const url = new URL(trimmed)
    const runtimeHost = getRuntimeHost()
    const allowedHosts = new Set([runtimeHost, ...siteHosts.map((host) => host.trim()).filter(Boolean)].filter(Boolean))
    if (!allowedHosts.has(url.host)) return null

    const match = url.pathname.match(STORY_PATH_PATTERN)
    if (!match) return null

    return {
      storyId: match[1],
      url: `${url.origin}/story/${match[1]}`,
    }
  } catch {
    return null
  }
}

export function stripStoryContent(content: string) {
  return content
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function summarizeStoryContent(content: string, maxLength = SUMMARY_MAX_LENGTH) {
  const plainText = stripStoryContent(content)
  if (plainText.length <= maxLength) return plainText
  return `${plainText.slice(0, maxLength).trimEnd()}…`
}

export function getStoryCoverUrl(story: StoryDto) {
  const coverPhoto = story.photos.find((photo) => photo.id === story.coverPhotoId) || story.photos[0]
  return coverPhoto?.thumbnailUrl || coverPhoto?.url
}

export function buildStoryLinkCardAttrs(story: StoryDto, url: string): StoryLinkCardAttrs {
  return {
    storyId: story.id,
    url,
    title: story.title,
    summary: summarizeStoryContent(story.content),
    coverUrl: getStoryCoverUrl(story),
    date: story.storyDate || story.createdAt,
    isPublished: story.isPublished,
  }
}
