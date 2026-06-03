import { z } from 'zod'

import type { AlbumDto } from '@/lib/api/types'

const ALBUM_PREVIEW_TTL_MS = 10 * 60 * 1000

const albumPreviewSchema = z.object({
  id: z.string(),
  name: z.string(),
  photos: z.array(z.unknown()),
}).passthrough()

const expiringAlbumPreviewSchema = z.object({
  value: albumPreviewSchema,
  expiresAt: z.number(),
})

function getSessionStorage() {
  if (typeof window === 'undefined') return null
  return window.sessionStorage
}

function getAlbumPreviewKey(albumId: string) {
  return `gallery:album-preview:${albumId}`
}

function getLegacyAlbumPreviewKey(albumId: string) {
  return `album_preview_${albumId}`
}

export function setAlbumPreview(albumId: string, album: AlbumDto) {
  const storage = getSessionStorage()
  if (!storage) return false

  try {
    storage.setItem(
      getAlbumPreviewKey(albumId),
      JSON.stringify({
        value: album,
        expiresAt: Date.now() + ALBUM_PREVIEW_TTL_MS,
      })
    )
    return true
  } catch {
    return false
  }
}

export function getAlbumPreview(albumId: string): AlbumDto | null {
  const storage = getSessionStorage()
  if (!storage) return null

  const key = getAlbumPreviewKey(albumId)

  try {
    const raw = storage.getItem(key)
    storage.removeItem(key)

    if (raw) {
      const parsed = expiringAlbumPreviewSchema.safeParse(JSON.parse(raw))
      if (parsed.success && parsed.data.expiresAt >= Date.now()) {
        return parsed.data.value as unknown as AlbumDto
      }
    }
  } catch {}

  try {
    const legacyKey = getLegacyAlbumPreviewKey(albumId)
    const legacyRaw = storage.getItem(legacyKey)
    storage.removeItem(legacyKey)

    if (!legacyRaw) return null

    const parsed = albumPreviewSchema.safeParse(JSON.parse(legacyRaw))
    return parsed.success ? (parsed.data as unknown as AlbumDto) : null
  } catch {
    return null
  }
}
