import { parseMediaEmbedInfo } from '@mo-gallery/tiptap-editor/media-embed'
import { safeMediaUrl } from './media-url'

export type MediaProvider = 'spotify' | 'netease' | 'youtube' | 'bilibili' | 'vimeo' | 'iframe'

export interface MediaEmbedData {
  src: string
  provider: MediaProvider
  height?: number
}

interface ParsedMediaEmbed {
  src: string
  kind: 'audio' | 'video'
  title?: string
  embed: MediaEmbedData
}

export function mediaProviderLabel(provider: MediaProvider, language: 'zh' | 'en' = 'zh'): string {
  const labels = { spotify: 'Spotify', netease: language === 'zh' ? '网易云音乐' : 'NetEase Music', youtube: 'YouTube', bilibili: 'Bilibili', vimeo: 'Vimeo', iframe: language === 'zh' ? '嵌入媒体' : 'Embedded media' }
  return labels[provider]
}

function safeEmbedUrl(value: string): string {
  const src = safeMediaUrl(value.startsWith('//') ? `https:${value}` : value)
  return /^https?:\/\//i.test(src) ? src : ''
}

function embedHeight(value: unknown): number | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined
  if (!/^\d+(?:px)?$/.test(String(value))) return undefined
  const height = Number.parseInt(String(value), 10)
  return height >= 80 && height <= 960 ? height : undefined
}

function parseVideoEmbed(src: string): ParsedMediaEmbed | null {
  const url = new URL(src)
  const host = url.hostname.toLowerCase()
  if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(host)) {
    const id = host === 'youtu.be' ? url.pathname.split('/')[1] : url.searchParams.get('v') ?? url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1]
    if (id && /^[\w-]{11}$/.test(id)) {
      const player = new URL(`https://www.youtube-nocookie.com/embed/${id}`)
      const start = url.searchParams.get('start') ?? url.searchParams.get('t')
      if (start && /^\d+s?$/.test(start)) player.searchParams.set('start', start.replace(/s$/, ''))
      return { src, kind: 'video', embed: { src: player.href, provider: 'youtube' } }
    }
  }
  if (['bilibili.com', 'www.bilibili.com', 'm.bilibili.com', 'player.bilibili.com'].includes(host)) {
    const bvid = url.searchParams.get('bvid') ?? url.pathname.match(/\/video\/(BV[\w]+)/)?.[1]
    const aid = url.searchParams.get('aid') ?? url.pathname.match(/\/video\/av(\d+)/)?.[1]
    const player = new URL('https://player.bilibili.com/player.html')
    if (bvid && /^BV[a-zA-Z0-9]{10}$/.test(bvid)) player.searchParams.set('bvid', bvid)
    else if (aid && /^\d+$/.test(aid)) player.searchParams.set('aid', aid)
    else return null
    const page = url.searchParams.get('p')
    if (page && /^[1-9]\d*$/.test(page)) player.searchParams.set('p', page)
    player.searchParams.set('autoplay', '0')
    return { src, kind: 'video', embed: { src: player.href, provider: 'bilibili' } }
  }
  if (['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'].includes(host)) {
    const match = url.pathname.match(/^\/(?:video\/)?(\d+)(?:\/([\da-f]+))?\/?$/i)
    if (match) {
      const player = new URL(`https://player.vimeo.com/video/${match[1]}`)
      const hash = url.searchParams.get('h') ?? match[2]
      if (hash && /^[\da-f]+$/i.test(hash)) player.searchParams.set('h', hash)
      return { src, kind: 'video', embed: { src: player.href, provider: 'vimeo' } }
    }
  }
  return null
}

/** Reuse TipTap's platform/iframe parser without importing its editor runtime. */
export function parseMediaEmbed(input: string): ParsedMediaEmbed | null {
  const raw = input.trim()
  if (!raw) return null
  // A mixed HTML paste must retain its surrounding text and other blocks.
  if (raw.includes('<') && !/^(?:<meta\b[^>]*>\s*)?<iframe\b[^>]*>(?:\s*<\/iframe\s*>)?$/i.test(raw)) return null
  const shared = parseMediaEmbedInfo(raw)
  const src = safeEmbedUrl(shared?.src ?? raw)
  if (!src) return null

  if (shared?.provider === 'spotify' || shared?.provider === 'netease') {
    const url = new URL(src)
    if (shared.provider === 'spotify' && !/^\/embed\/(track|album|playlist|episode|show|artist)\/[a-zA-Z0-9]+$/.test(url.pathname)) return null
    if (shared.provider === 'netease' && !/^\d+$/.test(url.searchParams.get('id') ?? '')) return null
    return {
      src: safeEmbedUrl(shared.url ?? src),
      kind: 'audio',
      embed: { src, provider: shared.provider, height: embedHeight(shared.height) },
    }
  }

  const video = parseVideoEmbed(src)
  if (video) return video
  if (!shared) return null
  return {
    src,
    kind: 'video',
    title: shared.title === 'Embedded media' ? undefined : shared.title,
    embed: { src, provider: 'iframe', height: embedHeight(shared.height) },
  }
}

export function normalizeMediaEmbed(value: unknown): MediaEmbedData | undefined {
  if (!value || typeof value !== 'object' || !('src' in value) || typeof value.src !== 'string') return undefined
  const src = safeEmbedUrl(value.src)
  if (!src) return undefined
  const known = parseMediaEmbed(src)
  return known?.embed ?? { src, provider: 'iframe', height: embedHeight('height' in value ? value.height : undefined) }
}
