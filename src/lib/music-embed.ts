export type MusicEmbedProvider = 'spotify' | 'netease'

export interface MusicEmbedInfo {
  provider: MusicEmbedProvider
  providerLabel: string
  title: string
  url: string
  embedUrl: string
  height: number
  allow?: string
  allowFullScreen?: boolean
  frameBorder?: string
  marginWidth?: string
  marginHeight?: string
}

const SPOTIFY_BASE_URL = 'https://open.spotify.com'
const SPOTIFY_ALLOWED_TYPES = new Set(['track', 'album', 'playlist', 'episode', 'show', 'artist'])
const NETEASE_HOSTS = new Set(['music.163.com', 'y.music.163.com'])
const NETEASE_OUTCHAIN_HEIGHT = '66'

function decodeHtmlAttribute(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim()
}

function extractInputUrl(rawValue: string) {
  const trimmed = rawValue.trim()
  if (!trimmed) {
    return ''
  }

  const iframeMatch = trimmed.match(/<iframe\b[^>]*\bsrc=(['"]?)([^'">\s]+)\1/i)
  const extracted = iframeMatch?.[2] || trimmed
  const decoded = decodeHtmlAttribute(extracted)

  if (decoded.startsWith('//')) {
    return `https:${decoded}`
  }

  return decoded
}

function buildSpotifyEmbedInfo(type: string, id: string): MusicEmbedInfo {
  const normalizedType = type.toLowerCase()
  const normalizedId = id.trim()
  const height = normalizedType === 'track' ? 152 : 352

  return {
    provider: 'spotify',
    providerLabel: 'Spotify',
    title: `Spotify ${normalizedType}`,
    url: `${SPOTIFY_BASE_URL}/${normalizedType}/${normalizedId}`,
    embedUrl: `${SPOTIFY_BASE_URL}/embed/${normalizedType}/${normalizedId}?utm_source=generator`,
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

function parseSpotifyMusicEmbed(rawValue: string): MusicEmbedInfo | null {
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

function buildNetEaseSongEmbedInfo(songId: string): MusicEmbedInfo {
  const normalizedId = songId.trim()

  return {
    provider: 'netease',
    providerLabel: 'NetEase Music',
    title: 'NetEase Music song',
    url: `https://music.163.com/#/song?id=${normalizedId}`,
    embedUrl: `https://music.163.com/outchain/player?type=2&id=${normalizedId}&auto=0&height=${NETEASE_OUTCHAIN_HEIGHT}`,
    height: 86,
    frameBorder: '0',
    marginWidth: '0',
    marginHeight: '0',
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

function parseNetEaseMusicEmbed(rawValue: string): MusicEmbedInfo | null {
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

export function parseMusicEmbedInfo(rawValue: string): MusicEmbedInfo | null {
  return parseSpotifyMusicEmbed(rawValue) || parseNetEaseMusicEmbed(rawValue)
}

export function parseMusicEmbedInfoByProvider(
  provider: string | null | undefined,
  rawValue: string,
): MusicEmbedInfo | null {
  if (provider === 'spotify') {
    return parseSpotifyMusicEmbed(rawValue)
  }

  if (provider === 'netease') {
    return parseNetEaseMusicEmbed(rawValue)
  }

  return parseMusicEmbedInfo(rawValue)
}
