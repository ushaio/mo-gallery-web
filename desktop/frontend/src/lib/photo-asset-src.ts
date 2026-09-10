import { resolveAssetUrl } from '@/lib/api'
import { GetStorageSources } from '../../wailsjs/go/main/App'
import type { Photo } from '@/types'

// Desktop-plugin storage sources (e.g. WebDAV on 坚果云 or fnOS) may have no
// web-fetchable URL: the cloud cannot resolve a public base and the WebDAV
// endpoint itself needs Basic Auth that <img> cannot supply. The desktop asset
// server exposes /__plugin-media/{sourceId}/{key} which streams the object
// through the plugin runtime with its credentials, so those photos render
// locally even when the cloud URL is null.
export function photoAssetSrc(photo: Pick<Photo, 'thumbnailUrl' | 'url' | 'thumbPath' | 'path' | 'storageRuntime' | 'storageSourceId'>): string {
  const webSrc = resolveAssetUrl(photo.thumbnailUrl || photo.url)
  if (webSrc) return webSrc
  if (photo.storageRuntime !== 'desktop-plugin' || !photo.storageSourceId) return webSrc
  const key = photo.thumbPath || photo.path
  if (!key) return webSrc
  return `/__plugin-media/${encodeURIComponent(photo.storageSourceId)}/${key
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/')}`
}

interface PluginSourceConfig {
  pluginId: string
  config?: Record<string, string>
}

// Base URL of a plugin source for assembling the provider's real object URL
// (e.g. https://dav.jianguoyun.com/dav). Falls back to the publicUrl prefix
// when the source configured one.
function sourceBaseUrl(source: PluginSourceConfig): string | null {
  const config = source.config ?? {}
  const base = source.pluginId === 'webdav'
    ? (config.publicUrl || config.url)
    : (config.publicUrl || config.endpoint)
  return base ? base.replace(/\/+$/, '') : null
}

// Resolve the provider's real, human-shareable URL for a desktop-plugin photo
// (used for display fields like 原图地址/缩略图地址). Returns null when no
// provider base can be derived — unlike photoAssetSrc this never falls back to
// the local proxy path, because the point is showing where the object lives.
export async function realPhotoUrl(photo: Pick<Photo, 'url' | 'thumbPath' | 'path' | 'storageRuntime' | 'storageSourceId'>): Promise<string | null> {
  if (photo.url) return resolveAssetUrl(photo.url)
  if (photo.storageRuntime !== 'desktop-plugin' || !photo.storageSourceId) return null
  const key = photo.thumbPath || photo.path
  if (!key) return null
  try {
    const sources = await GetStorageSources()
    const source = sources.find(candidate => candidate.id === photo.storageSourceId)
    if (!source) return null
    const base = sourceBaseUrl({ pluginId: source.type ?? source.pluginId ?? '', config: source.config })
    if (!base) return null
    const basePath = (source.config?.basePath || '').replace(/^\/+|\/+$/g, '')
    const prefix = basePath ? `${basePath}/` : ''
    return `${base}/${prefix}${key.split('/').map(segment => encodeURIComponent(segment)).join('/')}`
  } catch {
    return null
  }
}
