import 'server-only'
import { Hono } from 'hono'
import { db } from '~/server/lib/db'
import { authMiddleware, AuthVariables } from './middleware/auth'
import {
  StorageError,
  StorageProviderFactory,
  getStorageConfig,
  getStorageConfigBySourceId,
  type ListResult,
  type StorageConfig,
  type StorageProvider,
} from '~/server/lib/storage'
import path from 'path'

const storage = new Hono<{ Variables: AuthVariables }>()
const THUMBNAIL_EXTENSION = '.avif'

function buildThumbnailKey(originalKey: string): string {
  const parsed = path.posix.parse(originalKey)
  const thumbnailFilename = `thumb-${parsed.name}${THUMBNAIL_EXTENSION}`
  return parsed.dir ? `${parsed.dir}/${thumbnailFilename}` : thumbnailFilename
}

storage.use('/admin/storage/*', authMiddleware)

// `provider` on these endpoints is either a builtin provider type
// (local / s3 / github) or a StorageSource id. The builtin type is what
// Photo.storageProvider stores, but its credentials live in StorageSource:
// since the 2026-04 storage-source migration the flat s3_* / github_* Setting
// keys are only the one-time snapshot that migration copied out, and the admin
// UI never writes them again (Settings -> Storage saves through
// /api/admin/storage-sources). Reading that frozen snapshot made every scan of
// a provider configured afterwards hit the object store with stale credentials
// and fail upstream (401 Unauthorized).
const BUILTIN_PROVIDERS = new Set(['local', 's3', 'github'])

interface ResolvedStorage {
  provider: StorageProvider
  config: StorageConfig
  scanProvider: string
}

async function resolveStorageConfig(providerOrSourceId: string): Promise<ResolvedStorage> {
  if (!BUILTIN_PROVIDERS.has(providerOrSourceId)) {
    const config = await getStorageConfigBySourceId(providerOrSourceId)
    return {
      provider: StorageProviderFactory.create(config),
      config,
      scanProvider: config.provider || providerOrSourceId,
    }
  }

  // Several sources of one type can coexist: the admin form saves an empty
  // secret input as null, so a half-filled duplicate created later would shadow
  // the working source and make every scan die on "S3 Access Key ID is required".
  // Walk newest first and keep the first source that actually builds a provider;
  // the newest failure is reported only when none of them is usable, so the admin
  // is pointed at the source that needs fixing instead of a silent switch.
  const sources = await db.storageSource.findMany({
    where: { type: providerOrSourceId },
    orderBy: { updatedAt: 'desc' },
  })

  let firstFailure: unknown
  for (const source of sources) {
    try {
      const config = await getStorageConfigBySourceId(source.id)
      return {
        provider: StorageProviderFactory.create(config),
        config,
        scanProvider: providerOrSourceId,
      }
    } catch (error: unknown) {
      firstFailure ??= error
    }
  }
  if (firstFailure) throw firstFailure

  // Legacy flat settings stay as the fallback for deployments that never
  // created a StorageSource row.
  const config = await getStorageConfig(providerOrSourceId)
  return {
    provider: StorageProviderFactory.create(config),
    config,
    scanProvider: providerOrSourceId,
  }
}

// A raw failure reaches admin as "Internal server error" with no clue about
// which source or field is at fault. Name the target (never the secrets) and
// turn the well-known validation codes into the one action that fixes them.
function storageFailureHint(error: unknown): string {
  const name = error instanceof StorageError
    ? error.code
    : error instanceof Error
      ? error.name
      : ''

  switch (name) {
    case 'S3_ACCESS_KEY_MISSING':
    case 'S3_SECRET_KEY_MISSING':
    case 'StoredSecretDecryptionError':
      return ' This storage source has no usable credentials: open Settings -> Storage, select the source and re-enter its access key and secret.'
    case 'S3_BUCKET_MISSING':
    case 'S3_ENDPOINT_MISSING':
    case 'S3_PUBLIC_URL_MISSING':
      return ' This storage source is incomplete: fill in the missing field in Settings -> Storage.'
    default:
      return ''
  }
}

function describeStorageFailure(error: unknown, config: StorageConfig): string {
  const detail = error instanceof Error ? error.message : String(error)
  const target = config.provider === 's3'
    ? `endpoint=${config.s3Endpoint || '(unset)'} bucket=${config.s3Bucket || '(unset)'} region=${config.s3Region || 'auto'}`
    : config.provider === 'github'
      ? `repo=${config.githubRepo || '(unset)'} branch=${config.githubBranch || 'main'}`
      : `path=${config.localBasePath || '(unset)'}`

  const rejected = /401|403|unauthorized|accessdenied|signaturedoesnotmatch|invalidaccesskeyid/i.test(detail)
  const hint = rejected && config.provider === 's3'
    ? ' The object store rejected these credentials: check the access key, secret and region of this source in Settings -> Storage, and make sure the endpoint is the S3 API host rather than the public CDN domain.'
    : storageFailureHint(error)

  return `${config.provider} list failed (${target}): ${detail}${hint}`
}

// Resolution runs before any request is made, so it fails on a different class
// of problem (no source proves usable, credentials that cannot be decrypted).
function describeResolveFailure(error: unknown, providerOrSourceId: string): string {
  const detail = error instanceof Error ? error.message : String(error)
  return `storage provider "${providerOrSourceId}" is not usable: ${detail}${storageFailureHint(error)}`
}

type FileStatus = 'linked' | 'orphan' | 'missing' | 'missing_original' | 'missing_thumbnail'

interface FileWithStatus {
  key: string
  url: string
  /**
   * 缩略图地址（缩略图在存储里缺失时为 undefined）。
   * 列表每行只有 44px 的预览位，直接拉原图会把几 MB 的解码压在主线程上，
   * 快速滚动时来不及栅格化就会出现成片空白，所以行内优先用这个地址。
   */
  thumbnailUrl?: string
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

  let resolved: ResolvedStorage
  try {
    resolved = await resolveStorageConfig(provider)
  } catch (error: unknown) {
    return c.json({ error: describeResolveFailure(error, provider) }, 502)
  }
  const { provider: storageProvider, config: storageConfig, scanProvider } = resolved

  let listResult: ListResult
  try {
    listResult = await storageProvider.list({ fullScan: true })
  } catch (error: unknown) {
    return c.json({ error: describeStorageFailure(error, storageConfig) }, 502)
  }

  const dbPhotos = await db.photo.findMany({
    // Desktop plugin objects are owned by the Desktop process and must not be
    // interpreted as Web storage files during scans or cleanup.
    where: { storageProvider: scanProvider, storageRuntime: 'web' },
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
        // 缩略图必须真实存在于存储里才给地址，否则前端会去拉一个 404
        thumbnailUrl: hasThumb && photo?.thumbPath ? storageProvider.getUrl(photo.thumbPath) : undefined,
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

  // Resolve exactly like the scan does: scanning source A and then deleting
  // through a different config would delete the wrong objects (or 401 halfway
  // through a batch), so both endpoints must agree on where the objects live.
  let storageProvider: StorageProvider
  try {
    storageProvider = (await resolveStorageConfig(provider || 'local')).provider
  } catch (error: unknown) {
    return c.json({ error: describeResolveFailure(error, provider || 'local') }, 502)
  }

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
