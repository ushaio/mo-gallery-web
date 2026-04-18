const SPOTIFY_BASE_URL = 'https://open.spotify.com'
const SPOTIFY_ALLOWED_TYPES = new Set(['track', 'album', 'playlist', 'episode', 'show', 'artist'])

export interface SpotifyEmbedInfo {
  type: string
  id: string
  url: string
  embedUrl: string
  height: number
}

function buildSpotifyEmbedInfo(type: string, id: string): SpotifyEmbedInfo {
  const normalizedType = type.toLowerCase()
  const normalizedId = id.trim()

  return {
    type: normalizedType,
    id: normalizedId,
    url: `${SPOTIFY_BASE_URL}/${normalizedType}/${normalizedId}`,
    embedUrl: `${SPOTIFY_BASE_URL}/embed/${normalizedType}/${normalizedId}`,
    height: normalizedType === 'track' ? 152 : 352,
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

export function parseSpotifyEmbedInfo(rawValue: string): SpotifyEmbedInfo | null {
  const value = rawValue.trim()
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
