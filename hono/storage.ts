import 'server-only'
import { Hono } from 'hono'
import { db } from '~/server/lib/db'
import { authMiddleware, AuthVariables } from './middleware/auth'
import { StorageProviderFactory, getStorageConfig } from '~/server/lib/storage'
import path from 'path'

const storage = new Hono<{ Variables: AuthVariables }>()
const THUMBNAIL_EXTENSION = '.avif'

function buildThumbnailKey(originalKey: string): string {
  const parsed = path.posix.parse(originalKey)
  const thumbnailFilename = `thumb-${parsed.name}${THUMBNAIL_EXTENSION}`
  return parsed.dir ? `${parsed.dir}/${thumbnailFilename}` : thumbnailFilename
}

storage.use('/admin/storage/*', authMiddleware)

type FileStatus = 'linked' | 'orphan' | 'missing' | 'missing_original' | 'missing_thumbnail'

interface FileWithStatus {
  key: string
  url: string
  size: number
  lastModified: Date
  status: FileStatus
  photoId?: string
  photoTitle?: string
  missingType?: 'original' | 'thumbnail' | 'both'
  hasThumb?: boolean
}

storage.get('/admin/storage/scan', async (c) => {
  const provider = c.req.query('provider') || 'local'
  const statusFilter = c.req.query('status') as FileStatus | undefined
  const search = c.req.query('search')?.toLowerCase()

  const storageConfig = await getStorageConfig(provider)
  const storageProvider = StorageProviderFactory.create(storageConfig)

  const listResult = await storageProvider.list({ fullScan: true })

  const dbPhotos = await db.photo.findMany({
    // Desktop plugin objects are owned by the Desktop process and must not be
    // interpreted as Web storage files during scans or cleanup.
    where: { storageProvider: provider, storageRuntime: 'web' },
    select: { id: true, title: true, path: true, thumbPath: true },
  })

  const keyToPhoto = new Map(dbPhotos.map(p => [p.path || '', p]))
  const storageKeys = new Set(listResult.files.map(f => f.key))

  const filesWithStatus: FileWithStatus[] = listResult.files
    .filter(f => !f.key.includes('thumb-'))
    .map(file => {
      const photo = keyToPhoto.get(file.key)
      const hasThumb = Boolean(photo?.thumbPath && storageKeys.has(photo.thumbPath))
      return {
        key: file.key,
        url: file.url,
        size: file.size,
        lastModified: file.lastModified,
        status: photo ? 'linked' : 'orphan' as FileStatus,
        photoId: photo?.id,
        photoTitle: photo?.title,
        hasThumb,
      }
    })

  const missingFiles: FileWithStatus[] = []
  for (const p of dbPhotos) {
    const key = p.path || ''
    const hasOriginal = storageKeys.has(key)
    const hasThumb = Boolean(p.thumbPath && storageKeys.has(p.thumbPath))

    if (!hasOriginal && !hasThumb) {
      missingFiles.push({
        key, url: '', size: 0, lastModified: new Date(),
        status: 'missing', photoId: p.id, photoTitle: p.title, missingType: 'both',
      })
    } else if (!hasOriginal) {
      missingFiles.push({
        key, url: '', size: 0, lastModified: new Date(),
        status: 'missing_original', photoId: p.id, photoTitle: p.title, missingType: 'original',
      })
    } else if (!hasThumb) {
      missingFiles.push({
        key, url: '', size: 0, lastModified: new Date(),
        status: 'missing_thumbnail', photoId: p.id, photoTitle: p.title, missingType: 'thumbnail',
      })
    }
  }

  let allFiles = [...filesWithStatus, ...missingFiles]
  if (statusFilter) {
    allFiles = allFiles.filter(f => f.status === statusFilter)
  }
  if (search) {
    allFiles = allFiles.filter(f =>
      f.key.toLowerCase().includes(search) ||
      f.photoTitle?.toLowerCase().includes(search)
    )
  }

  const stats = {
    total: filesWithStatus.length + missingFiles.length,
    linked: filesWithStatus.filter(f => f.status === 'linked').length,
    orphan: filesWithStatus.filter(f => f.status === 'orphan').length,
    missing: missingFiles.filter(f => f.status === 'missing').length,
    missingOriginal: missingFiles.filter(f => f.status === 'missing_original').length,
    missingThumbnail: missingFiles.filter(f => f.status === 'missing_thumbnail').length,
  }

  return c.json({
    success: true,
    data: {
      files: allFiles,
      stats,
    },
  })
})

storage.post('/admin/storage/cleanup', async (c) => {
  const body = await c.req.json()
  const { keys, provider } = body

  if (!keys || !Array.isArray(keys) || keys.length === 0) {
    return c.json({ error: 'keys array is required' }, 400)
  }

  const protectedPhotos = await db.photo.findMany({
    where: {
      storageRuntime: 'desktop-plugin',
      OR: [
        { path: { in: keys } },
        { thumbPath: { in: keys } },
      ],
    },
    select: { path: true },
  })
  if (protectedPhotos.length > 0) {
    return c.json({
      error: 'DESKTOP_PLUGIN_SOURCE_READ_ONLY',
      message: 'Desktop plugin objects must be cleaned up from the Desktop client',
    }, 409)
  }

  const storageConfig = await getStorageConfig(provider || 'local')
  const storageProvider = StorageProviderFactory.create(storageConfig)

  let deleted = 0
  let failed = 0
  const errors: string[] = []

  for (const key of keys) {
    try {
      const thumbKey = buildThumbnailKey(key)
      await storageProvider.delete(key, thumbKey)
      deleted++
    } catch (error: unknown) {
      failed++
      errors.push(`${key}: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  return c.json({
    success: true,
    data: { deleted, failed, errors },
  })
})

storage.post('/admin/storage/fix-missing', async (c) => {
  const body = await c.req.json()
  const { photoIds } = body

  if (!photoIds || !Array.isArray(photoIds)) {
    return c.json({ error: 'photoIds array is required' }, 400)
  }

  const result = await db.photo.deleteMany({
    where: { id: { in: photoIds }, storageRuntime: 'web' },
  })

  return c.json({
    success: true,
    data: { deleted: result.count },
  })
})

export default storage
