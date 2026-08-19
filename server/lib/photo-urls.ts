import 'server-only'
import {
  getStorageConfig,
  getStorageConfigBySourceId,
  type StorageConfig,
} from '~/server/lib/storage'

/**
 * Photo storage URL resolution.
 *
 * The Photo row stores only the relative storage paths (`path` for the
 * original, `thumbPath` for the thumbnail) plus the storage source reference.
 * The base URL that prefixes them comes from the storage source's public
 * configuration, so changing a source's public address immediately re-derives
 * every photo URL without rewriting any row.
 */

export interface PhotoUrlInput {
  path?: string | null
  thumbPath?: string | null
  storageSourceId?: string | null
  storageProvider?: string | null
  storageUrlType?: string | null
}

/** Secret-free prefix used to assemble `baseUrl + "/" + path` for each provider. */
export function deriveBaseUrl(config: StorageConfig): string | null {
  switch (config.provider) {
    case 'local':
      return (config.localBaseUrl || '/uploads').replace(/\/+$/, '')
    case 's3':
      return config.s3PublicUrl ? config.s3PublicUrl.replace(/\/+$/, '') : null
    case 'github': {
      if (!config.githubRepo || !config.githubRepo.includes('/')) return null
      const [owner, repo] = config.githubRepo.split('/')
      const branch = config.githubBranch || 'main'
      if (config.githubAccessMethod === 'raw') {
        return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}`
      }
      if (config.githubAccessMethod === 'pages') {
        return config.githubPagesUrl ? config.githubPagesUrl.replace(/\/+$/, '') : null
      }
      return `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}`
    }
    default:
      return null
  }
}

export function joinBaseUrl(base: string | null, path: string | null | undefined): string | null {
  if (!base || !path) return null
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

// ─── Config loading with a short in-memory cache ─────────────────────────
// Storage source public config changes rarely; a 60s TTL keeps list reads from
// turning into one DB lookup per photo without holding stale bases for long.
const CONFIG_CACHE_TTL_MS = 60_000

const configCache = new Map<string, { expiresAt: number; promise: Promise<StorageConfig | null> }>()

async function loadConfig(photo: PhotoUrlInput): Promise<StorageConfig | null> {
  const key = photo.storageSourceId
    ? `src:${photo.storageSourceId}`
    : `prov:${photo.storageProvider || 'local'}`

  const now = Date.now()
  const cached = configCache.get(key)
  if (cached && cached.expiresAt > now) {
    return cached.promise
  }

  const promise = (async (): Promise<StorageConfig | null> => {
    if (photo.storageSourceId) {
      try {
        return await getStorageConfigBySourceId(photo.storageSourceId)
      } catch {
        // Desktop-plugin sources that were not yet mirrored to the cloud fall
        // back to the legacy settings-based config so display still works.
      }
    }
    try {
      return await getStorageConfig(photo.storageProvider || undefined)
    } catch {
      return null
    }
  })().catch(() => null)

  configCache.set(key, { expiresAt: now + CONFIG_CACHE_TTL_MS, promise })
  return promise
}

/** Drop the cached base-URL configs so the next reads re-derive from current sources. */
export function invalidatePhotoUrlCache(): void {
  configCache.clear()
}

/**
 * Resolve the public URL(s) of a photo from its storage paths and source.
 *
 * Only statically-derivable URL types are resolved here. Signed/temporary URLs
 * are generated on demand by the storage backend and cannot be reproduced from
 * `path` + base, so they resolve to `null`.
 */
export async function resolvePhotoUrls(
  photo: PhotoUrlInput,
): Promise<{ url: string | null; thumbnailUrl: string | null }> {
  const urlType = photo.storageUrlType || 'public'
  if (urlType !== 'public' && urlType !== 'local') {
    return { url: null, thumbnailUrl: null }
  }

  const config = await loadConfig(photo)
  // Local storage has a stable web mount even when its settings lookup is
  // temporarily unavailable. Keep legacy/local photos renderable while the
  // cached configuration is being refreshed.
  const base = config
    ? deriveBaseUrl(config)
    : photo.storageProvider === 'local'
      ? '/uploads'
      : null
  return {
    url: joinBaseUrl(base, photo.path),
    thumbnailUrl: joinBaseUrl(base, photo.thumbPath),
  }
}

/** Attach derived `url`/`thumbnailUrl` to a photo object without mutating it. */
export async function resolvePhotoUrlsInto<T extends PhotoUrlInput>(
  photo: T,
): Promise<T & { url: string | null; thumbnailUrl: string | null }> {
  return { ...photo, ...(await resolvePhotoUrls(photo)) }
}
