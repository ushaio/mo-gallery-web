import 'server-only'
import { Hono } from 'hono'
import { db, settings as settingsTable, photos } from '~/server/lib/drizzle'
import { authMiddleware, AuthVariables } from './middleware/auth'
import { StorageProviderFactory, StorageConfig } from '~/server/lib/storage'
import path from 'path'
import { eq, inArray } from 'drizzle-orm'

const storage = new Hono<{ Variables: AuthVariables }>()

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

async function getStorageConfig(providerOverride?: string): Promise<StorageConfig> {
  const settings = await db.select().from(settingsTable)
  const settingsMap = Object.fromEntries(settings.map(s => [s.key, s.value]))

  const provider = (providerOverride || settingsMap.storage_provider || 'local') as 'local' | 'github' | 'r2'
  const config: StorageConfig = { provider }

  switch (provider) {
    case 'local':
      config.localBasePath = path.join(process.cwd(), 'public', 'uploads')
      config.localBaseUrl = '/uploads'
      break
    case 'github':
      config.githubToken = settingsMap.github_token
      config.githubRepo = settingsMap.github_repo
      config.githubPath = settingsMap.github_path || 'uploads'
      config.githubBranch = settingsMap.github_branch || 'main'
      config.githubAccessMethod = (settingsMap.github_access_method || 'jsdelivr') as 'raw' | 'jsdelivr' | 'pages'
      config.githubPagesUrl = settingsMap.github_pages_url
      break
    case 'r2':
      config.r2AccessKeyId = settingsMap.r2_access_key_id
      config.r2SecretAccessKey = settingsMap.r2_secret_access_key
      config.r2Bucket = settingsMap.r2_bucket
      config.r2Endpoint = settingsMap.r2_endpoint
      config.r2PublicUrl = settingsMap.r2_public_url
      config.r2Path = settingsMap.r2_path
      break
  }

  return config
}

storage.get('/admin/storage/scan', async (c) => {
  const provider = c.req.query('provider') || 'local'
  const statusFilter = c.req.query('status') as FileStatus | undefined
  const search = c.req.query('search')?.toLowerCase()

  const storageConfig = await getStorageConfig(provider)
  const storageProvider = StorageProviderFactory.create(storageConfig)

  const listResult = await storageProvider.list({ fullScan: true })

  const dbPhotos = await db
    .select({
      id: photos.id,
      title: photos.title,
      storageKey: photos.storageKey,
      url: photos.url,
      thumbnailUrl: photos.thumbnailUrl,
    })
    .from(photos)
    .where(eq(photos.storageProvider, provider))

  const keyToPhoto = new Map(dbPhotos.map(p => [p.storageKey || p.url, p]))
  const storageKeys = new Set(listResult.files.map(f => f.key))

  // Helper to extract thumbnail key from thumbnailUrl
  const getThumbnailKeyFromUrl = (thumbnailUrl: string | null) => {
    if (!thumbnailUrl) return null
    // Extract key from URL - handle different URL formats
    // e.g., /uploads/thumb-xxx.jpg -> thumb-xxx.jpg
    // e.g., https://cdn.example.com/path/thumb-xxx.jpg -> path/thumb-xxx.jpg
    const match = thumbnailUrl.match(/(?:\/uploads\/|\/)?([^/]*thumb-[^/]+)$/)
    if (match) return match[1]
    // For full paths like path/to/thumb-xxx.jpg
    const lastSlash = thumbnailUrl.lastIndexOf('/')
    return lastSlash >= 0 ? thumbnailUrl.substring(lastSlash + 1) : thumbnailUrl
  }

  const filesWithStatus: FileWithStatus[] = listResult.files
    .filter(f => !f.key.includes('thumb-'))
    .map(file => {
      const photo = keyToPhoto.get(file.key)
      let hasThumb = false
      if (photo?.thumbnailUrl) {
        const thumbKey = getThumbnailKeyFromUrl(photo.thumbnailUrl)
        if (thumbKey) {
          hasThumb = Array.from(storageKeys).some(k => k.endsWith(thumbKey) || k === thumbKey)
        }
      }
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
    const key = p.storageKey || p.url
    const hasOriginal = storageKeys.has(key)
    
    // Check thumbnail by matching against storage keys
    let hasThumb = false
    if (p.thumbnailUrl) {
      const thumbKey = getThumbnailKeyFromUrl(p.thumbnailUrl)
      if (thumbKey) {
        // Check if any storage key ends with the thumbnail filename
        hasThumb = Array.from(storageKeys).some(k => k.endsWith(thumbKey) || k === thumbKey)
      }
    }

    if (!hasOriginal && !hasThumb) {
      missingFiles.push({
        key, url: p.url, size: 0, lastModified: new Date(),
        status: 'missing', photoId: p.id, photoTitle: p.title, missingType: 'both',
      })
    } else if (!hasOriginal) {
      missingFiles.push({
        key, url: p.url, size: 0, lastModified: new Date(),
        status: 'missing_original', photoId: p.id, photoTitle: p.title, missingType: 'original',
      })
    } else if (!hasThumb) {
      missingFiles.push({
        key, url: p.url, size: 0, lastModified: new Date(),
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

  const storageConfig = await getStorageConfig(provider || 'local')
  const storageProvider = StorageProviderFactory.create(storageConfig)

  let deleted = 0
  let failed = 0
  const errors: string[] = []

  for (const key of keys) {
    try {
      const lastSlash = key.lastIndexOf('/')
      const thumbKey = lastSlash >= 0
        ? `${key.substring(0, lastSlash + 1)}thumb-${key.substring(lastSlash + 1)}`
        : `thumb-${key}`
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

  const result = await db
    .delete(photos)
    .where(inArray(photos.id, photoIds))
    .returning()

  return c.json({
    success: true,
    data: { deleted: result.length },
  })
})

export default storage