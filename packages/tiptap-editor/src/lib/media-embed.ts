export type MediaEmbedProvider = 'spotify' | 'netease'

export interface MediaEmbedInfo {
  provider?: MediaEmbedProvider
  providerLabel?: string
  title: string
  url?: string
  src: string
  height?: string
  allow?: string
  allowFullScreen?: boolean
  frameBorder?: string
  marginWidth?: number
  marginHeight?: number
  scrolling?: string
  border?: string
  frameSpacing?: string
}

export interface StoredMediaEmbedAttrs {
  provider?: string | null
  url?: string | null
  src?: string | null
  title?: string | null
  height?: string | null
  allow?: string | null
  allowFullScreen?: boolean | null
  frameBorder?: string | null
  marginWidth?: number | null
  marginHeight?: number | null
  scrolling?: string | null
  border?: string | null
  frameSpacing?: string | null
}

const SPOTIFY_BASE_URL = 'https://open.spotify.com'
const SPOTIFY_ALLOWED_TYPES = new Set(['track', 'album', 'playlist', 'episode', 'show', 'artist'])
const NETEASE_HOSTS = new Set(['music.163.com', 'y.music.163.com'])
const NETEASE_OUTCHAIN_HEIGHT = '66'
const IFRAME_SRC_PATTERN = /<iframe\b[^>]*\bsrc=(['"]?)([^'">\s]+)\1/i
const IFRAME_ATTRIBUTE_PATTERN = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:=(['"])(.*?)\2|=([^\s"'=<>`]+))?/g

function decodeHtmlAttribute(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim()
}

function normalizePossibleUrl(value: string) {
  const decoded = decodeHtmlAttribute(value)
  if (decoded.startsWith('//')) {
    return `https:${decoded}`
  }
  return decoded
}

function extractInputUrl(rawValue: string) {
  const trimmed = rawValue.trim()
  if (!trimmed) {
    return ''
  }

  const iframeMatch = trimmed.match(IFRAME_SRC_PATTERN)
  const extracted = iframeMatch?.[2] || trimmed
  return normalizePossibleUrl(extracted)
}

function parseIframeAttributes(rawValue: string) {
  const iframeMatch = rawValue.trim().match(/<iframe\b([^>]*)>/i)
  if (!iframeMatch) {
    return null
  }

  const attrs: Record<string, string | boolean> = {}
  let match: RegExpExecArray | null
  while ((match = IFRAME_ATTRIBUTE_PATTERN.exec(iframeMatch[1])) !== null) {
    const name = match[1].toLowerCase()
    const rawValuePart = match[3] ?? match[4]
    attrs[name] = rawValuePart === undefined ? true : decodeHtmlAttribute(rawValuePart)
  }

  return attrs
}

function buildSpotifyEmbedInfo(type: string, id: string): MediaEmbedInfo {
  const normalizedType = type.toLowerCase()
  const normalizedId = id.trim()
  const height = normalizedType === 'track' ? '152' : '352'
  const url = `${SPOTIFY_BASE_URL}/${normalizedType}/${normalizedId}`

  return {
    provider: 'spotify',
    providerLabel: 'Spotify',
    title: `Spotify ${normalizedType}`,
    url,
    src: `${SPOTIFY_BASE_URL}/embed/${normalizedType}/${normalizedId}?utm_source=generator`,
    height,
    allow: 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture',
    allowFullScreen: true,
    frameBorder: '0',
  }
}

function parseSpotifyPathname(pathname: string) {
  const segments = pathname
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)

  const afterLocaleIndex = segments[0]?.startsWith('intl-') ? 1 : 0
  const resourceStartIndex = segments[afterLocaleIndex] === 'embed' ? afterLocaleIndex + 1 : afterLocaleIndex
  const type = segments[resourceStartIndex]?.toLowerCase()
  const id = segments[resourceStartIndex + 1]

  if (!type || !id || !SPOTIFY_ALLOWED_TYPES.has(type)) {
    return null
  }

  return { type, id }
}

function parseSpotifyEmbed(rawValue: string): MediaEmbedInfo | null {
  const value = extractInputUrl(rawValue)
  if (!value) {
    return null
  }

  const uriMatch = value.match(/^spotify:(track|album|playlist|episode|show|artist):([a-zA-Z0-9]+)$/i)
  if (uriMatch) {
    return buildSpotifyEmbedInfo(uriMatch[1], uriMatch[2])
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(value)
  } catch {
    return null
  }

  if (parsedUrl.hostname !== 'open.spotify.com') {
    return null
  }

  const pathInfo = parseSpotifyPathname(parsedUrl.pathname)
  if (!pathInfo) {
    return null
  }

  return buildSpotifyEmbedInfo(pathInfo.type, pathInfo.id)
}

function buildNetEaseSongEmbedInfo(songId: string): MediaEmbedInfo {
  const normalizedId = songId.trim()

  return {
    provider: 'netease',
    providerLabel: 'NetEase Music',
    title: 'NetEase Music song',
    url: `https://music.163.com/#/song?id=${normalizedId}`,
    src: `https://music.163.com/outchain/player?type=2&id=${normalizedId}&auto=0&height=${NETEASE_OUTCHAIN_HEIGHT}`,
    height: '86',
    frameBorder: '0',
    marginWidth: 0,
    marginHeight: 0,
  }
}

function parseNetEaseHash(hashValue: string) {
  const normalizedHash = hashValue.replace(/^#/, '').trim()
  if (!normalizedHash) {
    return null
  }

  const hashPath = normalizedHash.startsWith('/') ? normalizedHash : `/${normalizedHash}`
  const [pathname, search = ''] = hashPath.split('?')
  const searchParams = new URLSearchParams(search)
  const songId = searchParams.get('id')?.trim()

  if ((pathname === '/song' || pathname === '/m/song') && songId) {
    return buildNetEaseSongEmbedInfo(songId)
  }

  return null
}

function parseNetEaseEmbed(rawValue: string): MediaEmbedInfo | null {
  const value = extractInputUrl(rawValue)
  if (!value) {
    return null
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(value)
  } catch {
    return null
  }

  if (!NETEASE_HOSTS.has(parsedUrl.hostname)) {
    return null
  }

  if (parsedUrl.pathname === '/outchain/player') {
    const songId = parsedUrl.searchParams.get('id')?.trim()
    const type = parsedUrl.searchParams.get('type')?.trim()

    if (songId && type === '2') {
      return buildNetEaseSongEmbedInfo(songId)
    }
  }

  if ((parsedUrl.pathname === '/song' || parsedUrl.pathname === '/m/song')) {
    const songId = parsedUrl.searchParams.get('id')?.trim()
    if (songId) {
      return buildNetEaseSongEmbedInfo(songId)
    }
  }

  return parseNetEaseHash(parsedUrl.hash)
}

function parseGenericIframeEmbed(rawValue: string): MediaEmbedInfo | null {
  const attrs = parseIframeAttributes(rawValue)
  if (!attrs) {
    return null
  }

  const src = typeof attrs.src === 'string' ? normalizePossibleUrl(attrs.src) : ''
  if (!src) {
    return null
  }

  return {
    title: typeof attrs.title === 'string' && attrs.title.trim() ? attrs.title.trim() : 'Embedded media',
    src,
    height: typeof attrs.height === 'string' ? attrs.height : undefined,
    allow: typeof attrs.allow === 'string' ? attrs.allow : undefined,
    allowFullScreen: attrs.allowfullscreen === true || attrs.allowfullscreen === 'true',
    frameBorder: typeof attrs.frameborder === 'string' ? attrs.frameborder : undefined,
    marginWidth: typeof attrs.marginwidth === 'string' ? Number.parseInt(attrs.marginwidth, 10) : undefined,
    marginHeight: typeof attrs.marginheight === 'string' ? Number.parseInt(attrs.marginheight, 10) : undefined,
    scrolling: typeof attrs.scrolling === 'string' ? attrs.scrolling : undefined,
    border: typeof attrs.border === 'string' ? attrs.border : undefined,
    frameSpacing: typeof attrs.framespacing === 'string' ? attrs.framespacing : undefined,
  }
}

function normalizeStoredString(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

export function parseMediaEmbedInfo(rawValue: string): MediaEmbedInfo | null {
  return parseSpotifyEmbed(rawValue) || parseNetEaseEmbed(rawValue) || parseGenericIframeEmbed(rawValue)
}

export function parseMediaEmbedInfoByProvider(
  provider: string | null | undefined,
  rawValue: string,
): MediaEmbedInfo | null {
  if (provider === 'spotify') {
    return parseSpotifyEmbed(rawValue)
  }

  if (provider === 'netease') {
    return parseNetEaseEmbed(rawValue)
  }

  return parseMediaEmbedInfo(rawValue)
}

export function resolveStoredMediaEmbedInfo(attrs: StoredMediaEmbedAttrs): MediaEmbedInfo | null {
  const provider = normalizeStoredString(attrs.provider)
  const url = normalizeStoredString(attrs.url)
  const src = normalizeStoredString(attrs.src)

  if (provider && url) {
    const providerInfo = parseMediaEmbedInfoByProvider(provider, url)
    if (providerInfo) {
      return providerInfo
    }
  }

  if (!src) {
    return null
  }

  return {
    provider: provider === 'spotify' || provider === 'netease' ? provider : undefined,
    title: normalizeStoredString(attrs.title) || 'Embedded media',
    url,
    src: normalizePossibleUrl(src),
    height: normalizeStoredString(attrs.height),
    allow: normalizeStoredString(attrs.allow),
    allowFullScreen: attrs.allowFullScreen === true,
    frameBorder: normalizeStoredString(attrs.frameBorder),
    marginWidth: typeof attrs.marginWidth === 'number' ? attrs.marginWidth : undefined,
    marginHeight: typeof attrs.marginHeight === 'number' ? attrs.marginHeight : undefined,
    scrolling: normalizeStoredString(attrs.scrolling),
    border: normalizeStoredString(attrs.border),
    frameSpacing: normalizeStoredString(attrs.frameSpacing),
  }
}
