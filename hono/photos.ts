import 'server-only'
import { Hono } from 'hono'
import { Prisma } from '@/generated/prisma/client'
import { db } from '~/server/lib/db'
import { authMiddleware, AuthVariables } from './middleware/auth'
import { extractExifData, parseExifJson, sanitizeJsonString } from '~/server/lib/exif'
import { extractDominantColors } from '~/server/lib/colors'
import {
  compressToTargetSize,
  enforceDimensionLimit,
  generateThumbnailBuffer,
  getMetadataAndThumbnail,
  withSharpTimeout,
  type CompressionOutputFormat,
} from '~/server/lib/image-processing'
import { normalizeMake, extractLensMakeFromModel, makeBrandKey } from '~/server/lib/equipment'
import { resolvePhotoUploadAssets } from '~/server/lib/photo-upload-assets'
import { invalidatePhotoUrlCache, resolvePhotoUrls } from '~/server/lib/photo-urls'
import { StorageProviderFactory, StorageError, getStorageConfig, getStorageConfigBySourceId } from '~/server/lib/storage'
import sharp from 'sharp'
import path from 'path'

const photos = new Hono<{ Variables: AuthVariables }>()
const THUMBNAIL_EXTENSION = '.avif'
const DEFAULT_AVIF_QUALITY = 82
const AVIF_CONTENT_TYPE = 'image/avif'
const DISPLAY_IMAGE_WIDTHS = [1280, 1920, 2560] as const
const DISPLAY_IMAGE_CACHE_LIMIT = 12
const displayImageCache = new Map<string, Promise<Buffer>>()

function buildThumbnailFilename(filename: string): string {
  const parsed = path.parse(filename)
  return `thumb-${parsed.name}${THUMBNAIL_EXTENSION}`
}

function replaceFileExtension(filename: string, extension: string): string {
  const parsed = path.parse(filename)
  return `${parsed.name}${extension}`
}

function buildThumbnailKey(originalKey: string): string {
  const parsed = path.posix.parse(originalKey)
  const thumbnailFilename = buildThumbnailFilename(parsed.base)
  return parsed.dir ? `${parsed.dir}/${thumbnailFilename}` : thumbnailFilename
}

function isValidDate(value: Date | undefined): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime())
}

// P2002 = unique constraint violation. Photo.fileHash 的唯一索引是并发
// 上传去重的最终兜底（应用层检查之间仍有竞态窗口）。
function isFileHashConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002' &&
    (error.meta?.target as string[] | string | undefined)?.includes('fileHash') === true
  )
}

function normalizeStorageKeyCandidate(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  const normalized = value.replace(/\\/g, '/').trim()
  if (!normalized) return undefined
  if (/^https?:\/\//i.test(normalized)) {
    try {
      return new URL(normalized).pathname.replace(/^\/+/, '')
    } catch {
      return normalized
    }
  }
  return normalized.replace(/^\/+/, '')
}

function deriveOriginalStorageKey(photo: {
  path?: string | null
}) {
  return normalizeStorageKeyCandidate(photo.path)
}

function deriveThumbnailStorageKey(photo: {
  path?: string | null
  thumbPath?: string | null
}) {
  if (photo.thumbPath) {
    const thumbFromPath = normalizeStorageKeyCandidate(photo.thumbPath)
    if (thumbFromPath) return thumbFromPath
  }

  const originalKey = normalizeStorageKeyCandidate(photo.path)
  return originalKey ? buildThumbnailKey(originalKey) : undefined
}

function isDesktopPluginPhoto(photo: { storageRuntime?: string | null }): boolean {
  return photo.storageRuntime === 'desktop-plugin'
}

function rejectDesktopPluginMutation(c: { json: (body: unknown, status?: number) => Response }) {
  return c.json({
    error: 'DESKTOP_PLUGIN_SOURCE_READ_ONLY',
    message: 'Desktop plugin objects must be changed from the Desktop client',
  }, 409)
}

async function mapPhotoDto(
  photo: {
    categories: { name: string }[]
    dominantColors: string | null
    path?: string | null
    thumbPath?: string | null
    storageSourceId?: string | null
    storageProvider?: string | null
    storageUrlType?: string | null
    filmPhoto?: { filmRollId: string; filmRoll?: { name: string } | null } | null
  } & Record<string, unknown>
) {
  const { url, thumbnailUrl } = await resolvePhotoUrls(photo)
  return {
    ...photo,
    url,
    thumbnailUrl,
    category: photo.categories.map((c) => c.name).join(','),
    dominantColors: photo.dominantColors ? JSON.parse(photo.dominantColors) : null,
    photoType: photo.filmPhoto ? 'film' : 'digital',
    filmRollId: photo.filmPhoto?.filmRollId ?? null,
    filmRollName: photo.filmPhoto?.filmRoll?.name ?? null,
  }
}

async function setPhotoFilmRoll(photoId: string, filmRollId: string) {
  const existingFilmPhoto = await db.filmPhoto.findUnique({
    where: { photoId },
    select: { id: true, filmRollId: true },
  })

  if (existingFilmPhoto?.filmRollId === filmRollId) return

  const maxFrame = await db.filmPhoto.findFirst({
    where: { filmRollId },
    orderBy: { frameNumber: 'desc' },
    select: { frameNumber: true },
  })

  if (existingFilmPhoto) {
    await db.filmPhoto.update({
      where: { id: existingFilmPhoto.id },
      data: {
        filmRollId,
        frameNumber: (maxFrame?.frameNumber ?? 0) + 1,
      },
    })
    return
  }

  await db.filmPhoto.create({
    data: {
      photoId,
      filmRollId,
      frameNumber: (maxFrame?.frameNumber ?? 0) + 1,
    },
  })
}

async function setPhotoDigital(photoId: string) {
  await db.filmPhoto.deleteMany({ where: { photoId } })
}

/** Resolve storage config preferring storageSourceId, falling back to storageProvider string. */
async function resolveStorageConfig(photo: { storageSourceId?: string | null; storageProvider: string }) {
  if (photo.storageSourceId) {
    return getStorageConfigBySourceId(photo.storageSourceId)
  }
  return getStorageConfig(photo.storageProvider)
}

function normalizeDisplayImageWidth(value: string | undefined): number {
  const requestedWidth = Number.parseInt(value ?? '', 10)
  if (!Number.isFinite(requestedWidth)) return 1920

  return DISPLAY_IMAGE_WIDTHS.reduce((closest, width) => (
    Math.abs(width - requestedWidth) < Math.abs(closest - requestedWidth) ? width : closest
  ))
}

async function createDisplayImage(
  photo: {
    id: string
    url: string | null
    path: string | null
    storageProvider: string
    storageSourceId: string | null
    storageRuntime?: string | null
  },
  width: number,
): Promise<Buffer> {
  const storageKey = deriveOriginalStorageKey(photo)
  if (!storageKey) throw new Error(`Missing storage key for photo ${photo.id}`)

  let sourceBuffer: Buffer
  if (isDesktopPluginPhoto(photo)) {
    if (!photo.url) throw new Error(`Missing public URL for desktop plugin photo ${photo.id}`)
    const response = await fetch(photo.url)
    if (!response.ok) throw new Error(`Unable to fetch desktop plugin object (${response.status})`)
    sourceBuffer = Buffer.from(await response.arrayBuffer())
  } else {
    const storageConfig = await resolveStorageConfig(photo)
    const storage = StorageProviderFactory.create(storageConfig)
    sourceBuffer = await storage.download(storageKey)
  }

  return withSharpTimeout(
    sharp(sourceBuffer)
      .rotate()
      .resize(width, width, { fit: 'inside', withoutEnlargement: true })
      .avif({ quality: 80, effort: 4 })
      .toBuffer(),
    20_000,
  )
}

// Public endpoints
photos.get('/photos', async (c) => {
  try {
    const category = c.req.query('category')
    const limitStr = c.req.query('limit')
    const pageStr = c.req.query('page')
    const pageSizeStr = c.req.query('pageSize')
    const allStr = c.req.query('all') // If 'true', return all photos without pagination
    
    const where =
      category && category !== '全部'
        ? { categories: { some: { name: category } } }
        : {}

    // If 'all=true', return all photos without pagination (for admin use)
    if (allStr === 'true') {
      const photosList = await db.photo.findMany({
        where,
        include: {
          categories: true,
          camera: true,
          lens: true,
          filmPhoto: { include: { filmRoll: { select: { name: true } } } },
        },
        orderBy: [
          { takenAt: { sort: 'desc', nulls: 'last' } },
          { createdAt: 'desc' },
        ],
      })

      const data = await Promise.all(photosList.map((p) => mapPhotoDto(p)))

      return c.json({
        success: true,
        data,
      })
    }

    // Support both old limit-only mode and new pagination mode
    const page = pageStr ? parseInt(pageStr) : 1
    const pageSize = pageSizeStr ? parseInt(pageSizeStr) : (limitStr ? parseInt(limitStr) : 20)
    const skip = (page - 1) * pageSize
    const publicWhere = { ...where, showFlag: true }

    // Get total count and photos in parallel
    const [total, photosList] = await Promise.all([
      db.photo.count({ where: publicWhere }),
      db.photo.findMany({
        where: publicWhere,
        omit: { exifRaw: true },
        include: {
          categories: true,
          camera: true,
          lens: true,
          filmPhoto: { include: { filmRoll: { select: { name: true } } } },
        },
        skip,
        take: pageSize,
        orderBy: [
          { takenAt: { sort: 'desc', nulls: 'last' } },
          { createdAt: 'desc' },
        ],
      })
    ])

    const data = await Promise.all(photosList.map((p) => mapPhotoDto(p)))

    return c.json({
      success: true,
      data,
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
        hasMore: page * pageSize < total,
      }
    })
  } catch (error) {
    console.error('Get photos error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// ─── 管理端照片列表（不过滤 showFlag，支持分页） ──────
photos.get('/admin/photos', authMiddleware, async (c) => {
  try {
    const category = c.req.query('category')
    const search = c.req.query('search')
    const photoType = c.req.query('photoType')
    const formats = c.req.query('formats')
    const featured = c.req.query('featured')
    const pageStr = c.req.query('page')
    const pageSizeStr = c.req.query('pageSize')
    const sortBy = c.req.query('sortBy') || 'createdAt'
    const sortOrder = c.req.query('sortOrder') || 'desc'

    const page = pageStr ? parseInt(pageStr) : 1
    const pageSize = pageSizeStr ? parseInt(pageSizeStr) : 50
    const skip = (page - 1) * pageSize

    // 构造查询条件（不过滤 showFlag）
    const where: Prisma.PhotoWhereInput = {}
    if (category && category !== '全部') {
      where.categories = { some: { name: category } }
    }
    if (search) {
      where.title = { contains: search, mode: 'insensitive' }
    }
    if (photoType === 'film') {
      where.filmPhoto = { isNot: null }
    } else if (photoType === 'digital') {
      where.filmPhoto = { is: null }
    }
    if (formats) {
      const formatSuffixes = [...new Set(formats
        .split(',')
        .map((format) => format.trim().toLocaleLowerCase())
        .filter((format) => ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'tiff', 'tif', 'heic', 'heif'].includes(format))
        .flatMap((format) => format === 'jpg' || format === 'jpeg'
          ? ['.jpg', '.jpeg']
          : format === 'tiff' || format === 'tif'
            ? ['.tif', '.tiff']
            : format === 'heic' || format === 'heif'
              ? ['.heic', '.heif']
              : [`.${format}`]))]

      if (formatSuffixes.length > 0) {
        where.AND = [{
          OR: formatSuffixes.flatMap((suffix) => [
            { path: { endsWith: suffix, mode: 'insensitive' as const } },
          ]),
        }]
      }
    }
    if (featured === 'true') {
      where.isFeatured = true
    } else if (featured === 'false') {
      where.isFeatured = false
    }

    // 排序
    const sortDirection: Prisma.SortOrder = sortOrder === 'asc' ? 'asc' : 'desc'
    const orderBy: Prisma.PhotoOrderByWithRelationInput[] = sortBy === 'takenAt'
      ? [{ takenAt: { sort: sortDirection, nulls: 'last' } }, { createdAt: 'desc' }]
      : [{ createdAt: sortDirection }]

    const [total, photosList] = await Promise.all([
      db.photo.count({ where }),
      db.photo.findMany({
        where,
        omit: { exifRaw: true },
        include: {
          categories: true,
          camera: true,
          lens: true,
          filmPhoto: { include: { filmRoll: { select: { name: true } } } },
        },
        skip,
        take: pageSize,
        orderBy,
      })
    ])

    const data = await Promise.all(photosList.map((p) => mapPhotoDto(p)))

    return c.json({
      success: true,
      data,
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
        hasMore: page * pageSize < total,
      }
    })
  } catch (error) {
    console.error('Get admin photos error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// ─── 管理端单张照片详情 ──────────────────────────────
photos.get('/admin/photos/:id', authMiddleware, async (c) => {
  try {
    const id = c.req.param('id')
    const photo = await db.photo.findUnique({
      where: { id },
      include: {
        categories: true,
        camera: true,
        lens: true,
        filmPhoto: { include: { filmRoll: { select: { name: true } } } },
      },
    })
    if (!photo) {
      return c.json({ error: 'Photo not found' }, 404)
    }
    return c.json({ success: true, data: await mapPhotoDto(photo) })
  } catch (error) {
    console.error('Get admin photo error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

photos.get('/photos/featured', async (c) => {
  try {
    const photosList = await db.photo.findMany({
      where: { isFeatured: true, showFlag: true },
      omit: { exifRaw: true },
      include: {
        categories: true,
        camera: true,
        lens: true,
        filmPhoto: { include: { filmRoll: { select: { name: true } } } },
      },
      take: 6,
      orderBy: [
        { takenAt: { sort: 'desc', nulls: 'last' } },
        { createdAt: 'desc' },
      ],
    })

    const data = await Promise.all(photosList.map((p) => mapPhotoDto(p)))

    return c.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('Get featured photos error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

photos.get('/photos/:id/display', async (c) => {
  const id = c.req.param('id')
  const width = normalizeDisplayImageWidth(c.req.query('width'))

  try {
    const photo = await db.photo.findUnique({
      where: { id },
      select: {
        id: true,
        path: true,
        storageProvider: true,
        storageSourceId: true,
        storageRuntime: true,
        storageUrlType: true,
      },
    })

    if (!photo) {
      return c.json({ error: 'Photo not found' }, 404)
    }

    const { url } = await resolvePhotoUrls(photo)
    const sourceKey = photo.path || ''
    const cacheKey = `${photo.id}:${sourceKey}:${width}`
    let displayImagePromise = displayImageCache.get(cacheKey)

    if (!displayImagePromise) {
      displayImagePromise = createDisplayImage({ ...photo, url }, width)
      displayImageCache.set(cacheKey, displayImagePromise)

      while (displayImageCache.size > DISPLAY_IMAGE_CACHE_LIMIT) {
        const oldestKey = displayImageCache.keys().next().value
        if (typeof oldestKey !== 'string') break
        displayImageCache.delete(oldestKey)
      }
    }

    try {
      const displayImage = await displayImagePromise
      return c.body(new Uint8Array(displayImage), 200, {
        'Content-Type': AVIF_CONTENT_TYPE,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      })
    } catch (error) {
      displayImageCache.delete(cacheKey)
      throw error
    }
  } catch (error) {
    console.error('Get display photo error:', error)
    return c.json({ error: 'Unable to prepare display photo' }, 500)
  }
})

photos.get('/categories', async (c) => {
  try {
    const categories = await db.category.findMany({
      select: { name: true },
    })

    const data = categories.map((c) => c.name)

    return c.json({
      success: true,
      data: ['全部', ...data],
    })
  } catch (error) {
    console.error('Get categories error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Protected endpoints
photos.use('/admin/*', authMiddleware)

// Check for duplicate photos by file hash
photos.post('/admin/photos/check-duplicate', async (c) => {
  try {
    const body = await c.req.json()
    const { fileHash, fileHashes } = body

    // Support both single hash and batch check
    if (fileHashes && Array.isArray(fileHashes)) {
      // Batch check: return all duplicates found
      const existingPhotos = await db.photo.findMany({
        where: {
          fileHash: { in: fileHashes },
        },
        select: {
          id: true,
          title: true,
          path: true,
          thumbPath: true,
          storageSourceId: true,
          storageProvider: true,
          storageUrlType: true,
          fileHash: true,
          createdAt: true,
        },
      })

      // Resolve display URLs from storage paths + source config.
      const resolvedPhotos = await Promise.all(existingPhotos.map(async (photo) => {
        const { url, thumbnailUrl } = await resolvePhotoUrls(photo)
        return { ...photo, url, thumbnailUrl }
      }))

      // Create a map of hash -> photo for easy lookup
      const duplicateMap: Record<string, {
        id: string
        title: string
        thumbnailUrl: string | null
        url: string | null
        createdAt: Date
      }> = {}

      resolvedPhotos.forEach((photo) => {
        if (photo.fileHash) {
          duplicateMap[photo.fileHash] = {
            id: photo.id,
            title: photo.title,
            thumbnailUrl: photo.thumbnailUrl,
            url: photo.url,
            createdAt: photo.createdAt,
          }
        }
      })

      return c.json({
        success: true,
        data: {
          duplicates: duplicateMap,
          hasDuplicates: existingPhotos.length > 0,
        },
      })
    }

    // Single hash check (backward compatible)
    if (!fileHash) {
      return c.json({ error: 'fileHash or fileHashes is required' }, 400)
    }

    const existingPhoto = await db.photo.findFirst({
      where: { fileHash },
      select: {
        id: true,
        title: true,
        path: true,
        thumbPath: true,
        storageSourceId: true,
        storageProvider: true,
        storageUrlType: true,
        createdAt: true,
      },
    })

    const existingPhotoDto = existingPhoto
      ? {
          ...existingPhoto,
          ...(await resolvePhotoUrls(existingPhoto)),
        }
      : undefined

    return c.json({
      success: true,
      data: {
        isDuplicate: !!existingPhoto,
        existingPhoto: existingPhotoDto,
      },
    })
  } catch (error) {
    console.error('Check duplicate error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// ─── 注册已上传的照片（Go 桌面端处理文件+存储后调用） ─────────
photos.post('/admin/photos/register', async (c) => {
  try {
    const body = await c.req.json()

    const {
      title: titleRaw,
      path,
      thumbPath,
      storageProvider,
      storageRuntime,
      storagePluginId,
      storageSourceId,
      storageUrlType,
      storageUrlExpiresAt,
      width,
      height,
      size,
      fileHash,
      showFlag = true,
      originFlag = 'web',
      category,
      filmRollId,
      // EXIF 数据
      exif,
      // 主色
      dominantColors,
    } = body

    const title = titleRaw?.trim() || 'Untitled'

    if (storageRuntime !== undefined && storageRuntime !== null && storageRuntime !== 'web' && storageRuntime !== 'desktop-plugin') {
      return c.json({ error: 'storageRuntime must be web or desktop-plugin' }, 400)
    }
    const normalizedStorageRuntime = storageRuntime === 'desktop-plugin' ? 'desktop-plugin' : 'web'
    if (!path) {
      return c.json({ error: 'path is required' }, 400)
    }
    if (normalizedStorageRuntime === 'desktop-plugin' && !storagePluginId) {
      return c.json({ error: 'storagePluginId is required for desktop-plugin photos' }, 400)
    }
    if (normalizedStorageRuntime === 'desktop-plugin' && !storageSourceId) {
      return c.json({ error: 'storageSourceId is required for desktop-plugin photos' }, 400)
    }
    const normalizedStorageUrlType = ['public', 'signed', 'temporary', 'local'].includes(storageUrlType)
      ? storageUrlType
      : storageUrlType
        ? null
        : 'public'
    if (normalizedStorageUrlType === null) {
      return c.json({ error: 'storageUrlType must be public, signed, temporary, or local' }, 400)
    }
    const parsedStorageUrlExpiresAt = storageUrlExpiresAt ? new Date(storageUrlExpiresAt) : null
    if (storageUrlExpiresAt && !isValidDate(parsedStorageUrlExpiresAt ?? undefined)) {
      return c.json({ error: 'storageUrlExpiresAt must be a valid date' }, 400)
    }

    // 重复检查
    if (fileHash) {
      const existing = await db.photo.findFirst({
        where: { fileHash },
        select: { id: true, title: true },
      })
      if (existing) {
        return c.json({
          error: 'DUPLICATE_PHOTO',
          message: `A photo with the same content already exists: "${existing.title}"`,
          existingPhotoId: existing.id,
        }, 409)
      }
    }

    // 胶卷检查
    if (filmRollId) {
      const roll = await db.filmRoll.findUnique({ where: { id: filmRollId }, select: { id: true } })
      if (!roll) {
        return c.json({ error: 'Film roll not found' }, 404)
      }
    }

    // 设备 upsert
    let cameraId: string | null = null
    if (exif?.cameraMake) {
      const normalizedMake = normalizeMake(exif.cameraMake) || exif.cameraMake
      const brandKey = makeBrandKey(normalizedMake)
      if (brandKey) {
        const camera = await db.camera.upsert({
          where: { id: brandKey },
          update: { name: normalizedMake },
          create: { id: brandKey, name: normalizedMake },
        })
        cameraId = camera.id
      }
    }

    let lensId: string | null = null
    if (exif?.lensModel) {
      const lensMake = normalizeMake(extractLensMakeFromModel(exif.lensModel))
      const brandKey = makeBrandKey(lensMake)
      if (brandKey && lensMake) {
        const lens = await db.lens.upsert({
          where: { id: brandKey },
          update: { name: lensMake },
          create: { id: brandKey, name: lensMake },
        })
        lensId = lens.id
      }
    }

    // 分类
    const categoriesArray = category
      ? category.split(',').map((c: string) => c.trim()).filter((c: string) => c.length > 0)
      : []

    // 创建照片记录（fileHash 唯一索引兜底并发注册竞态）
    const createPhotoRecord = () => db.photo.create({
      data: {
        title,
        path: path || null,
        thumbPath: thumbPath || null,
        originFlag: ['web', 'mobile', 'desktop'].includes(originFlag) ? originFlag : 'web',
        storageProvider: storageProvider || 'local',
        storageRuntime: normalizedStorageRuntime,
        storagePluginId: normalizedStorageRuntime === 'desktop-plugin' ? storagePluginId : null,
        storageSourceId: storageSourceId || null,
        storageUrlType: normalizedStorageUrlType,
        storageUrlExpiresAt: parsedStorageUrlExpiresAt,
        width: width || 0,
        height: height || 0,
        size: size || null,
        isFeatured: false,
        showFlag,
        dominantColors: dominantColors?.length > 0 ? JSON.stringify(dominantColors) : null,
        fileHash: fileHash || null,
        cameraId,
        lensId,
        cameraMake: exif?.cameraMake || null,
        cameraModel: exif?.cameraModel || null,
        lensModel: exif?.lensModel || null,
        focalLength: exif?.focalLength || null,
        aperture: exif?.aperture || null,
        shutterSpeed: exif?.shutterSpeed || null,
        iso: exif?.iso || null,
        takenAt: exif?.takenAt ? new Date(exif.takenAt) : null,
        gps: sanitizeJsonString(exif?.gps) || null,
        orientation: exif?.orientation || null,
        software: exif?.software || null,
        exifRaw: sanitizeJsonString(exif?.raw) || null,
        categories: {
          connectOrCreate: categoriesArray.map((name: string) => ({
            where: { name },
            create: { name },
          })),
        },
      },
      include: {
        categories: true,
        camera: true,
        lens: true,
        filmPhoto: { include: { filmRoll: { select: { name: true } } } },
      },
    })

    let photo: Awaited<ReturnType<typeof createPhotoRecord>>
    try {
      photo = await createPhotoRecord()
    } catch (error) {
      if (isFileHashConflict(error)) {
        const existing = fileHash
          ? await db.photo.findFirst({ where: { fileHash }, select: { id: true, title: true } })
          : null
        return c.json({
          error: 'DUPLICATE_PHOTO',
          message: `A photo with the same content already exists${existing ? `: "${existing.title}"` : ''}`,
          existingPhotoId: existing?.id,
        }, 409)
      }
      throw error
    }

    // 胶卷关联
    if (filmRollId) {
      await setPhotoFilmRoll(photo.id, filmRollId)
      const withFilmRoll = await db.photo.findUnique({
        where: { id: photo.id },
        include: {
          categories: true,
          camera: true,
          lens: true,
          filmPhoto: { include: { filmRoll: { select: { name: true } } } },
        },
      })
      if (withFilmRoll) {
        return c.json({ success: true, data: await mapPhotoDto(withFilmRoll) })
      }
    }

    return c.json({ success: true, data: await mapPhotoDto(photo) })
  } catch (error) {
    console.error('Register photo error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return c.json({ error: message }, 500)
  }
})

photos.post('/admin/photos', async (c) => {
  try {
    const startedAt = Date.now()
    const allowedOriginFlags = new Set(['web', 'mobile', 'desktop'])
    const formData = await c.req.formData()
    const file = formData.get('file') as File
    const titleRaw = formData.get('title') as string
    const title = titleRaw?.trim() || 'Untitled'
    const category = formData.get('category') as string
    const storageSourceId = formData.get('storage_source_id') as string | null
    const storageProvider = formData.get('storage_provider') as string
    const storagePath = formData.get('storage_path') as string
    const storagePathFull = formData.get('storage_path_full') === 'true'
    const fileHash = formData.get('file_hash') as string | null
    const filmRollId = formData.get('film_roll_id') as string | null
    const showFlag = formData.get('show_flag') !== 'false'
    const compressionMode = formData.get('compression_mode') as string | null
    const compressionFormatInput = formData.get('compression_format') as string | null
    const compressionFormat: CompressionOutputFormat = compressionFormatInput === 'webp' ? 'webp' : 'avif'
    const compressionContentType = compressionFormat === 'webp' ? 'image/webp' : 'image/avif'
    const compressionExtension = compressionFormat === 'webp' ? '.webp' : '.avif'
    const maxSizeMBInput = formData.get('max_size_mb')
    const maxSizeMB = typeof maxSizeMBInput === 'string' ? Number(maxSizeMBInput) : undefined
    const shouldCompressOriginal = compressionMode === 'compress'
    const originFlagInput = formData.get('origin_flag')
    const originFlag =
      typeof originFlagInput === 'string' && allowedOriginFlags.has(originFlagInput)
        ? originFlagInput
        : 'web'

    if (!file) {
      return c.json({ error: 'File is required' }, 400)
    }

    // Explicit body size guard (Vercel plan limits are enforced upstream, but
    // self-hosted Node has no default cap).
    const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_MB) || 50 * 1024 * 1024
    if (file.size > MAX_UPLOAD_BYTES) {
      return c.json(
        { error: `File too large. Max ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)}MB` },
        413,
      )
    }

    console.info('[upload] request received', {
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      storageSourceId,
      storageProvider: storageProvider || undefined,
      storagePath: storagePath || undefined,
      storagePathFull,
      filmRollId: filmRollId || undefined,
    })

    if (filmRollId) {
      const roll = await db.filmRoll.findUnique({ where: { id: filmRollId }, select: { id: true } })
      if (!roll) {
        return c.json({ error: 'Film roll not found' }, 404)
      }
    }

    // Check for duplicate if fileHash is provided
    if (fileHash) {
      const existingPhoto = await db.photo.findFirst({
        where: { fileHash },
        select: { id: true, title: true },
      })
      
      if (existingPhoto) {
        return c.json({
          error: 'DUPLICATE_PHOTO',
          message: `A photo with the same content already exists: "${existingPhoto.title}"`,
          existingPhotoId: existingPhoto.id,
        }, 409)
      }
    }

    // Process image buffer
    const arrayBuffer = await file.arrayBuffer()
    let buffer: Buffer<ArrayBufferLike> = Buffer.from(arrayBuffer)
    let originalContentType = file.type
    let originalFilename = file.name
    const targetMaxSizeMB = Number.isFinite(maxSizeMB) && maxSizeMB !== undefined && maxSizeMB > 0
      ? maxSizeMB
      : null
    // Always generate a real ≤800px thumbnail, including compress mode.
    // Reusing the compressed original as the thumbnail (the old behavior)
    // put 12MP images into the gallery grid: each one costs 300-400ms of
    // decode when it scrolls into view, which freezes scrolling.
    const reuseUploadedFileAsThumbnail = false

    // P0: Extract EXIF BEFORE compression — sharp AVIF encoding discards EXIF.
    // Prefer exif_json transmitted from the frontend (read before browser-side
    // compression); fall back to extracting from the raw uploaded buffer.
    const exifJsonRaw = formData.get('exif_json') as string | null
    const stripGpsFlag = formData.get('strip_gps') === 'true'

    let exifData: Awaited<ReturnType<typeof extractExifData>>
    if (exifJsonRaw) {
      try {
        exifData = parseExifJson(exifJsonRaw)
      } catch {
        exifData = await extractExifData(buffer)
      }
    } else {
      exifData = await extractExifData(buffer)
    }

    // Server-side GPS stripping fallback (covers cases where the frontend
    // could not read/strip EXIF, or uploads bypassed the client).
    if (stripGpsFlag && exifData.gps) {
      exifData.gps = undefined
    }

    // Downscale oversized images before heavy AVIF encoding to avoid
    // serverless timeouts on very large source files.
    try {
      buffer = await withSharpTimeout(enforceDimensionLimit(buffer))
    } catch (error) {
      console.warn('[upload] Dimension limit enforcement failed:', error)
    }

    if (shouldCompressOriginal && file.type !== compressionContentType) {
      try {
        buffer = await withSharpTimeout(
          compressionFormat === 'webp'
            ? sharp(buffer).rotate().webp({ quality: DEFAULT_AVIF_QUALITY }).toBuffer()
            : sharp(buffer).rotate().avif({ quality: DEFAULT_AVIF_QUALITY }).toBuffer(),
        )
        originalContentType = compressionContentType
        originalFilename = replaceFileExtension(file.name, compressionExtension)
      } catch (error) {
        console.warn(`[upload] Server ${compressionFormat.toUpperCase()} compression failed, keeping uploaded file:`, error)
      }
    }

    // P1: Target-size fallback — if the client could not hit max_size_mb (or
    // uploaded uncompressed), iteratively re-encode toward the target.
    if (targetMaxSizeMB && buffer.length > targetMaxSizeMB * 1024 * 1024) {
      try {
        buffer = await withSharpTimeout(compressToTargetSize(buffer, targetMaxSizeMB, { format: compressionFormat }))
        originalContentType = compressionContentType
        originalFilename = replaceFileExtension(file.name, compressionExtension)
      } catch (error) {
        console.warn('[upload] Target size compression failed:', error)
      }
    }

    console.info('[upload] file buffered', {
      fileName: originalFilename,
      fileSize: buffer.length,
      contentType: originalContentType,
      maxSizeMB: targetMaxSizeMB,
      elapsedMs: Date.now() - startedAt,
    })

    // Run these operations in parallel:
    // 1. Get storage configuration
    // 2. Get metadata and generate a separate thumbnail only when needed
    //    (EXIF already extracted above, before compression)
    const [storageConfig, { metadata, thumbnailBuffer }] = await Promise.all([
      storageSourceId
        ? getStorageConfigBySourceId(storageSourceId)
        : getStorageConfig(storageProvider || undefined),
      getMetadataAndThumbnail(buffer, { generateThumbnail: !reuseUploadedFileAsThumbnail }),
    ])

    console.info('[upload] image processed', {
      fileName: originalFilename,
      width: metadata.width,
      height: metadata.height,
      thumbnailSize: thumbnailBuffer?.length ?? buffer.length,
      reusedOriginalAsThumbnail: reuseUploadedFileAsThumbnail,
      provider: storageConfig.provider,
      elapsedMs: Date.now() - startedAt,
    })

    // Create storage provider instance
    const storage = StorageProviderFactory.create(storageConfig)

    // Validate provider
    storage.validateConfig()

    // Generate random filename
    const randomName = Array(32)
      .fill(null)
      .map(() => Math.round(Math.random() * 16).toString(16))
      .join('')
    const ext = path.extname(originalFilename)
    const filename = `${randomName}${ext}`
    const thumbnailFilename = buildThumbnailFilename(filename)

    // Split categories by comma and trim
    const categoriesArray = category
      ? category
          .split(',')
          .map((c) => c.trim())
          .filter((c) => c.length > 0)
      : []

    const uploadAssets = resolvePhotoUploadAssets({
      reuseUploadedFileAsThumbnail,
      originalBuffer: buffer,
      thumbnailBuffer,
      thumbnailFilename,
      storagePath,
      storagePathFull,
      thumbnailContentType: AVIF_CONTENT_TYPE,
    })

    // 二次去重：同一文件的并发上传可能同时通过请求开始时的检查
    // （图片处理耗时几十秒）。在写入存储/数据库前复查，把竞态窗口
    // 从整个处理时长缩小到毫秒级，也避免产生孤儿存储文件。
    if (fileHash) {
      const existingPhoto = await db.photo.findFirst({
        where: { fileHash },
        select: { id: true, title: true },
      })
      if (existingPhoto) {
        return c.json({
          error: 'DUPLICATE_PHOTO',
          message: `A photo with the same content already exists: "${existingPhoto.title}"`,
          existingPhotoId: existingPhoto.id,
        }, 409)
      }
    }

    // Use the generated thumbnail for color extraction when available to avoid
    // decoding the large original image again inside a constrained serverless function.
    const [uploadResult, dominantColors] = await Promise.all([
      storage.upload(
        {
          buffer,
          filename,
          path: storagePath,
          contentType: originalContentType,
          useFullPath: storagePathFull,
        },
        uploadAssets.thumbnailUpload
      ),
      extractDominantColors(uploadAssets.dominantColorBuffer),
    ])

    console.info('[upload] storage upload complete', {
      fileName: originalFilename,
      key: uploadResult.key,
      thumbnailKey: uploadResult.thumbnailKey,
      dominantColors: dominantColors.length,
      elapsedMs: Date.now() - startedAt,
    })

    // Find or create camera record (brand-based)
    let cameraId: string | null = null
    if (exifData.cameraMake) {
      const normalizedMake = normalizeMake(exifData.cameraMake) || exifData.cameraMake
      const brandKey = makeBrandKey(normalizedMake)
      if (brandKey) {
        const camera = await db.camera.upsert({
          where: { id: brandKey },
          update: { name: normalizedMake },
          create: {
            id: brandKey,
            name: normalizedMake,
          },
        })
        cameraId = camera.id
      }
    }

    // Find or create lens record (brand-based)
    let lensId: string | null = null
    if (exifData.lens) {
      const lensMake = normalizeMake(extractLensMakeFromModel(exifData.lens))
      const brandKey = makeBrandKey(lensMake)
      if (brandKey && lensMake) {
        const lens = await db.lens.upsert({
          where: { id: brandKey },
          update: { name: lensMake },
          create: {
            id: brandKey,
            name: lensMake,
          },
        })
        lensId = lens.id
      }
    }

    // Create photo record. fileHash 唯一索引兜底并发上传竞态：撞上冲突时
    // 清理刚上传的存储文件并按重复照片返回。
    const createPhotoRecord = () => db.photo.create({
      data: {
        title,
        path: uploadResult.key,
        thumbPath: uploadResult.thumbnailKey || null,
        originFlag,
        storageProvider: storageConfig.provider,
        storageSourceId: storageSourceId || null,
        width: metadata.width || 0,
        height: metadata.height || 0,
        size: buffer.length,
        isFeatured: false,
        showFlag,
        dominantColors: dominantColors.length > 0 ? JSON.stringify(dominantColors) : null,
        fileHash: fileHash || null,
        // Equipment relations
        cameraId,
        lensId,
        // EXIF data (raw)
        cameraMake: exifData.cameraMake,
        cameraModel: exifData.cameraModel,
        lensModel: exifData.lens,
        focalLength: exifData.focalLength,
        aperture: exifData.aperture,
        shutterSpeed: exifData.shutterSpeed,
        iso: exifData.iso,
        takenAt: isValidDate(exifData.takenAt) ? exifData.takenAt : undefined,
        gps: exifData.gps,
        orientation: exifData.orientation,
        software: exifData.software,
        exifRaw: exifData.exifRaw,
        categories: {
          connectOrCreate: categoriesArray.map((name: string) => ({
            where: { name },
            create: { name },
          })),
        },
      },
      include: {
        categories: true,
        camera: true,
        lens: true,
        filmPhoto: { include: { filmRoll: { select: { name: true } } } },
      },
    })

    let photo: Awaited<ReturnType<typeof createPhotoRecord>>
    try {
      photo = await createPhotoRecord()
    } catch (error) {
      if (isFileHashConflict(error)) {
        try {
          if (uploadResult.thumbnailKey) {
            await storage.delete(uploadResult.key, uploadResult.thumbnailKey)
          } else {
            await storage.delete(uploadResult.key)
          }
        } catch (cleanupError) {
          console.warn('[upload] duplicate race: failed to clean uploaded files:', cleanupError)
        }
        const existing = fileHash
          ? await db.photo.findFirst({ where: { fileHash }, select: { id: true, title: true } })
          : null
        return c.json({
          error: 'DUPLICATE_PHOTO',
          message: `A photo with the same content already exists${existing ? `: "${existing.title}"` : ''}`,
          existingPhotoId: existing?.id,
        }, 409)
      }
      throw error
    }

    if (filmRollId) {
      await setPhotoFilmRoll(photo.id, filmRollId)
      const photoWithFilmRoll = await db.photo.findUnique({
        where: { id: photo.id },
        include: {
          categories: true,
          camera: true,
          lens: true,
          filmPhoto: { include: { filmRoll: { select: { name: true } } } },
        },
      })

      if (photoWithFilmRoll) {
        return c.json({
          success: true,
          data: await mapPhotoDto(photoWithFilmRoll),
        })
      }
    }

    return c.json({
      success: true,
      data: await mapPhotoDto(photo),
    })
  } catch (error) {
    console.error('Upload photo error:', error)
    if (error instanceof StorageError) {
      return c.json({ error: error.message }, 400)
    }
    const message = error instanceof Error ? error.message : 'Internal server error'
    return c.json({ error: message }, 500)
  }
})

photos.delete('/admin/photos/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const deleteOriginal = c.req.query('deleteOriginal') === 'true'
    const deleteThumbnail = c.req.query('deleteThumbnail') === 'true'
    const forceDelete = c.req.query('force') === 'true'

    const photo = await db.photo.findUnique({
      where: { id },
      include: {
        stories: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    })

    if (photo) {
      // Check if photo has associated stories
      if (photo.stories.length > 0 && !forceDelete) {
        return c.json({
          success: false,
          error: 'PHOTO_HAS_STORIES',
          message: 'Photo has associated stories and cannot be deleted',
          stories: photo.stories,
        }, 400)
      }

      if (isDesktopPluginPhoto(photo) && (deleteOriginal || deleteThumbnail)) {
        return rejectDesktopPluginMutation(c)
      }

      // Delete files from storage based on user selection
      if (deleteOriginal || deleteThumbnail) {
        // Get storage configuration for the provider used by this photo
        const storageConfig = await resolveStorageConfig(photo)

        // Create storage provider instance
        const storage = StorageProviderFactory.create(storageConfig)

        // Derive thumbnail key from the original path
        let thumbnailKey: string | undefined
        if (deleteThumbnail && photo.path) {
          thumbnailKey = buildThumbnailKey(photo.path)
        }

        // Delete based on user selection
        const originalKey = deleteOriginal ? (photo.path || undefined) : undefined
        const thumbKey = deleteThumbnail ? thumbnailKey : undefined

        if (originalKey && thumbKey) {
          await storage.delete(originalKey, thumbKey)
        } else if (originalKey) {
          await storage.delete(originalKey)
        } else if (thumbKey) {
          await storage.delete(thumbKey)
        }
      } else {
        console.log(
          `Skipping file deletion for photo ${id} (deleteOriginal=${deleteOriginal}, deleteThumbnail=${deleteThumbnail})`
        )
      }

      // Always delete photo record from database
      await db.photo.delete({
        where: { id },
      })
    }

    return c.json({
      success: true,
      message: 'Photo deleted successfully',
    })
  } catch (error) {
    console.error('Delete photo error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

photos.post('/admin/photos/batch-delete', async (c) => {
  try {
    const body = await c.req.json()
    const { photoIds, deleteOriginal, deleteThumbnail, force } = body as {
      photoIds: string[]
      deleteOriginal?: boolean
      deleteThumbnail?: boolean
      force?: boolean
    }

    if (!photoIds || !Array.isArray(photoIds) || photoIds.length === 0) {
      return c.json({ error: 'photoIds must be a non-empty array' }, 400)
    }

    // Fetch all photos with their story associations
    const photosList = await db.photo.findMany({
      where: { id: { in: photoIds } },
      include: {
        stories: { select: { id: true, title: true } },
      },
    })

    const errors: string[] = []
    let deleted = 0
    let failed = 0

    // Filter out photos that have stories (unless force is true)
    const photosToDelete: typeof photosList = []
    for (const photo of photosList) {
      if (photo.stories.length > 0 && !force) {
        errors.push(`Photo "${photo.title}" (${photo.id}) has associated stories`)
        failed++
      } else if (isDesktopPluginPhoto(photo) && (deleteOriginal || deleteThumbnail)) {
        errors.push(`Photo "${photo.title}" (${photo.id}) is owned by a Desktop storage plugin`)
        failed++
      } else {
        photosToDelete.push(photo)
      }
    }

    // Track missing photos
    const foundIds = new Set(photosList.map((p) => p.id))
    for (const id of photoIds) {
      if (!foundIds.has(id)) {
        errors.push(`Photo ${id} not found`)
        failed++
      }
    }

    // Group photos by exact storage source so multi-instance providers stay isolated.
    const byStorageTarget = new Map<string, typeof photosToDelete>()
    for (const photo of photosToDelete) {
      const storageTarget = photo.storageSourceId
        ? `source:${photo.storageSourceId}`
        : `provider:${photo.storageProvider || 'default'}`
      if (!byStorageTarget.has(storageTarget)) {
        byStorageTarget.set(storageTarget, [])
      }
      byStorageTarget.get(storageTarget)!.push(photo)
    }

    // Process each storage target group in parallel
    const providerResults = await Promise.allSettled(
      Array.from(byStorageTarget.entries()).map(async ([storageTarget, providerPhotos]) => {
        let storage: ReturnType<typeof StorageProviderFactory.create> | null = null
        if (deleteOriginal || deleteThumbnail) {
          const storageConfig = storageTarget.startsWith('source:')
            ? await getStorageConfigBySourceId(storageTarget.slice('source:'.length))
            : await getStorageConfig(storageTarget === 'provider:default' ? undefined : storageTarget.slice('provider:'.length))
          storage = StorageProviderFactory.create(storageConfig)
        }

        // Delete photos within this provider group in parallel
        const photoResults = await Promise.allSettled(
          providerPhotos.map(async (photo) => {
            // Delete files from storage if requested
            if (storage && (deleteOriginal || deleteThumbnail)) {
              let thumbnailKey: string | undefined
              if (deleteThumbnail && photo.path) {
                thumbnailKey = buildThumbnailKey(photo.path)
              }

              const originalKey = deleteOriginal ? (photo.path || undefined) : undefined
              const thumbKey = deleteThumbnail ? thumbnailKey : undefined

              if (originalKey && thumbKey) {
                await storage.delete(originalKey, thumbKey)
              } else if (originalKey) {
                await storage.delete(originalKey)
              } else if (thumbKey) {
                await storage.delete(thumbKey)
              }
            }

            // Delete DB record
            await db.photo.delete({ where: { id: photo.id } })
            return photo.id
          })
        )

        return photoResults
      })
    )

    // Collect results from all provider groups
    for (const providerResult of providerResults) {
      if (providerResult.status === 'fulfilled') {
        for (const photoResult of providerResult.value) {
          if (photoResult.status === 'fulfilled') {
            deleted++
          } else {
            failed++
            errors.push(
              photoResult.reason instanceof Error
                ? photoResult.reason.message
                : String(photoResult.reason)
            )
          }
        }
      } else {
        // Entire provider group failed
        failed++
        errors.push(
          providerResult.reason instanceof Error
            ? providerResult.reason.message
            : String(providerResult.reason)
        )
      }
    }

    return c.json({
      success: true,
      data: { deleted, failed, errors },
    })
  } catch (error) {
    console.error('Batch delete photos error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

photos.post('/admin/photos/batch-update-type', async (c) => {
  try {
    const body = await c.req.json()
    const photoIds = Array.isArray(body.photoIds)
      ? body.photoIds.filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
      : []
    const photoType = body.photoType === 'digital' || body.photoType === 'film' ? body.photoType : undefined
    const filmRollId = typeof body.filmRollId === 'string' && body.filmRollId.length > 0
      ? body.filmRollId
      : null

    if (photoIds.length === 0) {
      return c.json({ error: 'Photo IDs are required' }, 400)
    }
    if (!photoType) {
      return c.json({ error: 'Photo type is required' }, 400)
    }
    if (photoType === 'film') {
      if (!filmRollId) {
        return c.json({ error: 'Film photos must be assigned to a film roll' }, 400)
      }
      const roll = await db.filmRoll.findUnique({ where: { id: filmRollId }, select: { id: true } })
      if (!roll) {
        return c.json({ error: 'Film roll not found' }, 404)
      }
    }

    const existingPhotos = await db.photo.findMany({
      where: { id: { in: photoIds } },
      select: { id: true },
    })
    const existingPhotoIds = new Set(existingPhotos.map((photo) => photo.id))
    const errors = photoIds
      .filter((id: string) => !existingPhotoIds.has(id))
      .map((id: string) => `${id}: Photo not found`)

    for (const photoId of existingPhotoIds) {
      try {
        if (photoType === 'film' && filmRollId) {
          await setPhotoFilmRoll(photoId, filmRollId)
        } else {
          await setPhotoDigital(photoId)
        }
      } catch (error) {
        errors.push(`${photoId}: ${error instanceof Error ? error.message : 'Failed to update photo type'}`)
      }
    }

    return c.json({
      success: true,
      data: {
        updated: existingPhotoIds.size - (errors.length - (photoIds.length - existingPhotoIds.size)),
        failed: errors.length,
        errors,
      },
    })
  } catch (error) {
    console.error('Batch update photo type error:', error)
    return c.json({ error: error instanceof Error ? error.message : 'Internal server error' }, 500)
  }
})

photos.post('/admin/photos/batch-update-taken-at', async (c) => {
  try {
    const body = await c.req.json()
    const photoIds = Array.isArray(body.photoIds)
      ? body.photoIds.filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
      : []
    const takenAt = typeof body.takenAt === 'string' ? new Date(body.takenAt) : undefined

    if (photoIds.length === 0) {
      return c.json({ error: 'Photo IDs are required' }, 400)
    }
    if (!isValidDate(takenAt)) {
      return c.json({ error: 'Valid date taken is required' }, 400)
    }

    const existingPhotos = await db.photo.findMany({
      where: { id: { in: photoIds } },
      select: { id: true },
    })
    const existingPhotoIds = new Set(existingPhotos.map((photo) => photo.id))
    const errors = photoIds
      .filter((id: string) => !existingPhotoIds.has(id))
      .map((id: string) => `${id}: Photo not found`)

    const result = existingPhotoIds.size > 0
      ? await db.photo.updateMany({
          where: { id: { in: Array.from(existingPhotoIds) } },
          data: { takenAt },
        })
      : { count: 0 }

    return c.json({
      success: true,
      data: {
        updated: result.count,
        failed: errors.length,
        errors,
      },
    })
  } catch (error) {
    console.error('Batch update photo taken date error:', error)
    return c.json({ error: error instanceof Error ? error.message : 'Internal server error' }, 500)
  }
})

photos.post('/admin/photos/batch-update-show-flag', async (c) => {
  try {
    const body = await c.req.json()
    const photoIds = Array.isArray(body.photoIds)
      ? body.photoIds.filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
      : []
    const showFlag = typeof body.showFlag === 'boolean' ? body.showFlag : undefined

    if (photoIds.length === 0) {
      return c.json({ error: 'Photo IDs are required' }, 400)
    }
    if (showFlag === undefined) {
      return c.json({ error: 'Gallery visibility is required' }, 400)
    }

    const existingPhotos = await db.photo.findMany({
      where: { id: { in: photoIds } },
      select: { id: true },
    })
    const existingPhotoIds = new Set(existingPhotos.map((photo) => photo.id))
    const errors = photoIds
      .filter((id: string) => !existingPhotoIds.has(id))
      .map((id: string) => `${id}: Photo not found`)

    const result = existingPhotoIds.size > 0
      ? await db.photo.updateMany({
          where: { id: { in: Array.from(existingPhotoIds) } },
          data: { showFlag },
        })
      : { count: 0 }

    return c.json({
      success: true,
      data: {
        updated: result.count,
        failed: errors.length,
        errors,
      },
    })
  } catch (error) {
    console.error('Batch update photo gallery visibility error:', error)
    return c.json({ error: error instanceof Error ? error.message : 'Internal server error' }, 500)
  }
})

photos.patch('/admin/photos/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const requestedPhotoType =
      body.photoType === 'digital' || body.photoType === 'film'
        ? body.photoType
        : undefined
    const requestedFilmRollId =
      body.filmRollId === null || typeof body.filmRollId === 'string'
        ? body.filmRollId
        : undefined

    // Build update data
    const updateData: Record<string, unknown> = {}

    if (body.title !== undefined) updateData.title = body.title
    if (body.isFeatured !== undefined) updateData.isFeatured = body.isFeatured
    if (body.showFlag !== undefined) updateData.showFlag = Boolean(body.showFlag)
    if (body.takenAt !== undefined) updateData.takenAt = body.takenAt ? new Date(body.takenAt) : null

    // Handle storage path change (move file)
    if (body.storagePath !== undefined) {
      const photo = await db.photo.findUnique({ where: { id } })
      if (!photo) {
        return c.json({ error: 'Photo not found' }, 404)
      }
      if (isDesktopPluginPhoto(photo)) {
        return rejectDesktopPluginMutation(c)
      }

      const storageConfig = await resolveStorageConfig(photo)
      const storage = StorageProviderFactory.create(storageConfig)

      // Derive thumbnail key
      const originalKey = deriveOriginalStorageKey(photo)
      if (!originalKey) {
        return c.json({ error: 'Photo storage key is missing' }, 400)
      }

      const thumbnailKey = deriveThumbnailStorageKey(photo)

      const moveResult = await storage.move(
        originalKey,
        body.storagePath,
        thumbnailKey
      )

      updateData.path = moveResult.newKey
      if (moveResult.newThumbnailKey) {
        updateData.thumbPath = moveResult.newThumbnailKey
      }
    }

    // Handle category update
    if (body.category !== undefined) {
      const categoriesArray = body.category
        ? body.category
            .split(',')
            .map((c: string) => c.trim())
            .filter((c: string) => c.length > 0)
        : []

      // First disconnect all existing categories
      await db.photo.update({
        where: { id },
        data: {
          categories: {
            set: [], // Clear existing
          },
        },
      })

      // Then connect or create new ones
      if (categoriesArray.length > 0) {
        updateData.categories = {
          connectOrCreate: categoriesArray.map((name: string) => ({
            where: { name },
            create: { name },
          })),
        }
      }
    }

    if (requestedPhotoType === 'film') {
      if (!requestedFilmRollId) {
        return c.json({ error: 'Film photos must be assigned to a film roll' }, 400)
      }

      const roll = await db.filmRoll.findUnique({
        where: { id: requestedFilmRollId },
        select: { id: true },
      })

      if (!roll) {
        return c.json({ error: 'Film roll not found' }, 404)
      }
      await setPhotoFilmRoll(id, requestedFilmRollId)
    } else if (requestedPhotoType === 'digital') {
      await setPhotoDigital(id)
    }

    const photo = await db.photo.update({
      where: { id },
      data: updateData,
      include: {
        categories: true,
        camera: true,
        lens: true,
        filmPhoto: { include: { filmRoll: { select: { name: true } } } },
      }
    })

    return c.json({
      success: true,
      data: await mapPhotoDto(photo),
    })
  } catch (error) {
    console.error('Update photo error:', error)
    if (error instanceof StorageError) {
      return c.json({ error: error.message }, 400)
    }
    return c.json({ error: error instanceof Error ? error.message : 'Internal server error' }, 500)
  }
})

// Check if photos have associated stories
photos.get('/admin/photos/:id/stories', async (c) => {
  try {
    const id = c.req.param('id')
    
    const photo = await db.photo.findUnique({
      where: { id },
      include: {
        stories: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    })

    if (!photo) {
      return c.json({ error: 'Photo not found' }, 404)
    }

    return c.json({
      success: true,
      data: {
        stories: photo.stories,
      },
    })
  } catch (error) {
    console.error('Get photo stories error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Check multiple photos for associated stories
photos.post('/admin/photos/check-stories', async (c) => {
  try {
    const body = await c.req.json()
    const { photoIds } = body

    if (!photoIds || !Array.isArray(photoIds)) {
      return c.json({ error: 'photoIds array is required' }, 400)
    }

    const photosList = await db.photo.findMany({
      where: { id: { in: photoIds } },
      include: {
        stories: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    })

    // Group photos by their associated stories
    const photosWithStories: { photoId: string; photoTitle: string; stories: { id: string; title: string }[] }[] = []
    
    for (const photo of photosList) {
      if (photo.stories.length > 0) {
        photosWithStories.push({
          photoId: photo.id,
          photoTitle: photo.title,
          stories: photo.stories,
        })
      }
    }

    return c.json({
      success: true,
      data: {
        photosWithStories,
        hasBlockingStories: photosWithStories.length > 0,
      },
    })
  } catch (error) {
    console.error('Check photos stories error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

photos.post('/admin/photos/batch-update-urls', async (c) => {
  // Photo URLs are now derived from the storage source's public config at read
  // time, so changing e.g. `s3_public_url` re-derives every URL automatically
  // without rewriting rows. This endpoint is kept as a compatibility no-op that
  // drops the cached base-URL configs so the new base takes effect immediately.
  try {
    const body = await c.req.json()
    const { storageProvider, oldPublicUrl, newPublicUrl } = body

    if (!storageProvider || !oldPublicUrl || !newPublicUrl) {
      return c.json({ error: 'Missing required parameters' }, 400)
    }

    invalidatePhotoUrlCache()

    return c.json({
      success: true,
      data: { updated: 0, failed: 0 },
    })
  } catch (error) {
    console.error('Batch update URLs error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Reanalyze dominant colors for a photo
photos.post('/admin/photos/:id/reanalyze-colors', async (c) => {
  try {
    const id = c.req.param('id')

    const photo = await db.photo.findUnique({ where: { id } })
    if (!photo) {
      return c.json({ error: 'Photo not found' }, 404)
    }

    if (isDesktopPluginPhoto(photo)) {
      return rejectDesktopPluginMutation(c)
    }

    // Get storage config and download the image
    const storageConfig = await resolveStorageConfig(photo)
    const storage = StorageProviderFactory.create(storageConfig)

    const buffer = await storage.download(photo.path || '')
    if (!buffer) {
      return c.json({ error: 'Failed to download image' }, 500)
    }

    // Extract dominant colors
    const dominantColors = await extractDominantColors(buffer)

    // Update database
    const updated = await db.photo.update({
      where: { id },
      data: {
        dominantColors: dominantColors.length > 0 ? JSON.stringify(dominantColors) : null,
      },
      include: { categories: true, camera: true, lens: true },
    })

    return c.json({
      success: true,
      data: {
        ...updated,
        category: updated.categories.map((c) => c.name).join(','),
        dominantColors,
      },
    })
  } catch (error) {
    console.error('Reanalyze colors error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Reupload missing file for existing photo record
photos.post('/admin/photos/:id/reupload', async (c) => {
  try {
    const id = c.req.param('id')
    const missingType = c.req.query('type') as 'original' | 'thumbnail' | 'both' | undefined

    const photo = await db.photo.findUnique({
      where: { id },
      include: { categories: true },
    })
    if (!photo) {
      return c.json({ error: 'Photo not found' }, 404)
    }

    if (isDesktopPluginPhoto(photo)) {
      return rejectDesktopPluginMutation(c)
    }

    const formData = await c.req.formData()
    const file = formData.get('file') as File
    if (!file) {
      return c.json({ error: 'File is required' }, 400)
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const storageConfig = await resolveStorageConfig(photo)
    const storage = StorageProviderFactory.create(storageConfig)
    storage.validateConfig()

    const storageKey = photo.path || ''
    const lastSlash = storageKey.lastIndexOf('/')
    const storagePath = lastSlash >= 0 ? storageKey.substring(0, lastSlash) : ''
    const filename = lastSlash >= 0 ? storageKey.substring(lastSlash + 1) : storageKey
    const thumbnailFilename = buildThumbnailFilename(filename)

    const uploadOriginal = !missingType || missingType === 'original' || missingType === 'both'
    const uploadThumb = !missingType || missingType === 'thumbnail' || missingType === 'both'

    let exifData = null
    let metadata = null
    let thumbnailBuffer = null
    let dominantColors: string[] = []

    if (uploadOriginal) {
      [exifData, { metadata, thumbnailBuffer }] = await Promise.all([
        extractExifData(buffer),
        getMetadataAndThumbnail(buffer, { generateThumbnail: uploadThumb }),
      ])
      dominantColors = await extractDominantColors(buffer)
    } else if (uploadThumb) {
      thumbnailBuffer = await generateThumbnailBuffer(buffer)
    }

    let uploadResult
    if (uploadOriginal && uploadThumb && thumbnailBuffer) {
      uploadResult = await storage.upload(
        { buffer, filename, path: storagePath, contentType: file.type },
        { buffer: thumbnailBuffer, filename: thumbnailFilename, path: storagePath, contentType: AVIF_CONTENT_TYPE }
      )
    } else if (uploadOriginal) {
      uploadResult = await storage.upload({ buffer, filename, path: storagePath, contentType: file.type })
    } else if (uploadThumb && thumbnailBuffer) {
      uploadResult = await storage.upload({ buffer: thumbnailBuffer, filename: thumbnailFilename, path: storagePath, contentType: AVIF_CONTENT_TYPE })
    }

    const updateData: Record<string, unknown> = {}
    if (uploadOriginal && uploadResult) {
      updateData.path = uploadResult.key
      updateData.width = metadata?.width || photo.width
      updateData.height = metadata?.height || photo.height
      updateData.size = buffer.length
      if (dominantColors.length > 0) updateData.dominantColors = JSON.stringify(dominantColors)
      if (exifData) {
        updateData.cameraMake = exifData.cameraMake
        updateData.cameraModel = exifData.cameraModel
        updateData.lensModel = exifData.lens
        updateData.focalLength = exifData.focalLength
        updateData.aperture = exifData.aperture
        updateData.shutterSpeed = exifData.shutterSpeed
        updateData.iso = exifData.iso
        if (isValidDate(exifData.takenAt)) {
          updateData.takenAt = exifData.takenAt
        }
        updateData.gps = exifData.gps
        updateData.orientation = exifData.orientation
        updateData.software = exifData.software
        updateData.exifRaw = exifData.exifRaw

        // Update equipment relations
        if (exifData.cameraMake) {
          const normalizedMake = normalizeMake(exifData.cameraMake) || exifData.cameraMake
          const brandKey = makeBrandKey(normalizedMake)
          if (brandKey) {
            const camera = await db.camera.upsert({
              where: { id: brandKey },
              update: { name: normalizedMake },
              create: {
                id: brandKey,
                name: normalizedMake,
              },
            })
            updateData.cameraId = camera.id
          }
        }

        if (exifData.lens) {
          const lensMake = normalizeMake(extractLensMakeFromModel(exifData.lens))
          const brandKey = makeBrandKey(lensMake)
          if (brandKey && lensMake) {
            const lens = await db.lens.upsert({
              where: { id: brandKey },
              update: { name: lensMake },
              create: {
                id: brandKey,
                name: lensMake,
              },
            })
            updateData.lensId = lens.id
          }
        }
      }
    }
    if (uploadThumb && uploadResult?.thumbnailKey) {
      updateData.thumbPath = uploadResult.thumbnailKey
    } else if (uploadThumb && !uploadOriginal && uploadResult) {
      updateData.thumbPath = uploadResult.key
    }

    const updated = await db.photo.update({
      where: { id },
      data: updateData,
      include: { categories: true, camera: true, lens: true },
    })

    return c.json({
      success: true,
      data: {
        ...updated,
        category: updated.categories.map((c) => c.name).join(','),
        dominantColors: updated.dominantColors ? JSON.parse(updated.dominantColors) : null,
      },
    })
  } catch (error) {
    console.error('Reupload photo error:', error)
    if (error instanceof StorageError) {
      return c.json({ error: error.message }, 400)
    }
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Generate thumbnail for existing photo
photos.post('/admin/photos/:id/generate-thumbnail', async (c) => {
  try {
    const id = c.req.param('id')
    const photo = await db.photo.findUnique({ where: { id } })
    if (!photo) return c.json({ error: 'Photo not found' }, 404)

    if (isDesktopPluginPhoto(photo)) {
      return rejectDesktopPluginMutation(c)
    }

    const storageConfig = await resolveStorageConfig(photo)
    const storage = StorageProviderFactory.create(storageConfig)

    const buffer = await storage.download(photo.path || '')
    if (!buffer) return c.json({ error: 'Failed to download image' }, 500)

    const thumbnailBuffer = await generateThumbnailBuffer(buffer)

    const storageKey = photo.path || ''
    const lastSlash = storageKey.lastIndexOf('/')
    const storagePath = lastSlash >= 0 ? storageKey.substring(0, lastSlash) : ''
    const filename = lastSlash >= 0 ? storageKey.substring(lastSlash + 1) : storageKey
    const thumbnailFilename = buildThumbnailFilename(filename)

    const uploadResult = await storage.upload({
      buffer: thumbnailBuffer,
      filename: thumbnailFilename,
      path: storagePath,
      contentType: AVIF_CONTENT_TYPE,
    })

    const updated = await db.photo.update({
      where: { id },
      data: { thumbPath: uploadResult.key },
      include: {
        categories: true,
        camera: true,
        lens: true,
        filmPhoto: { include: { filmRoll: { select: { name: true } } } },
      },
    })

    return c.json({
      success: true,
      data: await mapPhotoDto(updated),
    })
  } catch (error) {
    console.error('Generate thumbnail error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export default photos
