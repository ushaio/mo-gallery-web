import 'server-only'
import { Hono } from 'hono'
import { db } from '~/server/lib/db'
import { authMiddleware, AuthVariables } from './middleware/auth'
import { extractExifData } from '~/server/lib/exif'
import { extractDominantColors } from '~/server/lib/colors'
import { normalizeMake, extractLensMakeFromModel, makeBrandKey } from '~/server/lib/equipment'
import { StorageProviderFactory, StorageConfig, StorageError } from '~/server/lib/storage'
import sharp from 'sharp'
import path from 'path'

const photos = new Hono<{ Variables: AuthVariables }>()

/**
 * Build storage configuration from database settings
 */
async function getStorageConfig(
  providerOverride?: string
): Promise<StorageConfig> {
  // Fetch all settings
  const settings = await db.setting.findMany()
  const settingsMap = Object.fromEntries(
    settings.map((s) => [s.key, s.value])
  )

  const provider = (
    providerOverride ||
    settingsMap.storage_provider ||
    'local'
  ) as 'local' | 'github' | 'r2'

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
      config.githubAccessMethod = (settingsMap.github_access_method ||
        'jsdelivr') as 'raw' | 'jsdelivr' | 'pages'
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
        include: { categories: true, camera: true, lens: true },
        orderBy: [
          { takenAt: { sort: 'desc', nulls: 'last' } },
          { createdAt: 'desc' },
        ],
      })

      const data = photosList.map((p) => ({
        ...p,
        category: p.categories.map((c) => c.name).join(','),
        dominantColors: p.dominantColors ? JSON.parse(p.dominantColors) : null,
      }))

      return c.json({
        success: true,
        data,
      })
    }

    // Support both old limit-only mode and new pagination mode
    const page = pageStr ? parseInt(pageStr) : 1
    const pageSize = pageSizeStr ? parseInt(pageSizeStr) : (limitStr ? parseInt(limitStr) : 20)
    const skip = (page - 1) * pageSize

    // Get total count and photos in parallel
    const [total, photosList] = await Promise.all([
      db.photo.count({ where }),
      db.photo.findMany({
        where,
        include: { categories: true, camera: true, lens: true },
        skip,
        take: pageSize,
        orderBy: [
          { takenAt: { sort: 'desc', nulls: 'last' } },
          { createdAt: 'desc' },
        ],
      })
    ])

    const data = photosList.map((p) => ({
      ...p,
      category: p.categories.map((c) => c.name).join(','),
      dominantColors: p.dominantColors ? JSON.parse(p.dominantColors) : null,
    }))

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

photos.get('/photos/featured', async (c) => {
  try {
    const photosList = await db.photo.findMany({
      where: { isFeatured: true },
      include: { categories: true, camera: true, lens: true },
      take: 6,
      orderBy: [
        { takenAt: { sort: 'desc', nulls: 'last' } },
        { createdAt: 'desc' },
      ],
    })

    const data = photosList.map((p) => ({
      ...p,
      category: p.categories.map((c) => c.name).join(','),
      dominantColors: p.dominantColors ? JSON.parse(p.dominantColors) : null,
    }))

    return c.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('Get featured photos error:', error)
    return c.json({ error: 'Internal server error' }, 500)
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
          thumbnailUrl: true,
          url: true,
          fileHash: true,
          createdAt: true,
        },
      })

      // Create a map of hash -> photo for easy lookup
      const duplicateMap: Record<string, {
        id: string
        title: string
        thumbnailUrl: string | null
        url: string
        createdAt: Date
      }> = {}
      
      existingPhotos.forEach((photo) => {
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
        thumbnailUrl: true,
        url: true,
        createdAt: true,
      },
    })

    return c.json({
      success: true,
      data: {
        isDuplicate: !!existingPhoto,
        existingPhoto,
      },
    })
  } catch (error) {
    console.error('Check duplicate error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

photos.post('/admin/photos', async (c) => {
  try {
    const formData = await c.req.formData()
    const file = formData.get('file') as File
    const titleRaw = formData.get('title') as string
    const title = titleRaw?.trim() || 'Untitled'
    const category = formData.get('category') as string
    const storageProvider = formData.get('storage_provider') as string
    const storagePath = formData.get('storage_path') as string
    const fileHash = formData.get('file_hash') as string | null

    if (!file) {
      return c.json({ error: 'File is required' }, 400)
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
    const buffer = Buffer.from(arrayBuffer)

    // Run these operations in parallel:
    // 1. Get storage configuration
    // 2. Extract EXIF data
    // 3. Get metadata + generate thumbnail
    const [storageConfig, exifData, { metadata, thumbnailBuffer }] = await Promise.all([
      getStorageConfig(storageProvider || undefined),
      extractExifData(buffer),
      (async () => {
        const sharpInstance = sharp(buffer)
        const [metadata, thumbnailBuffer] = await Promise.all([
          sharpInstance.metadata(),
          sharp(buffer)
            .rotate() // Auto-rotate based on EXIF orientation
            .resize(800, 800, {
              fit: 'inside',
              withoutEnlargement: true,
            })
            .jpeg({ quality: 80 })
            .toBuffer(),
        ])
        return { metadata, thumbnailBuffer }
      })(),
    ])

    // Create storage provider instance
    const storage = StorageProviderFactory.create(storageConfig)

    // Validate provider
    storage.validateConfig()

    // Generate random filename
    const randomName = Array(32)
      .fill(null)
      .map(() => Math.round(Math.random() * 16).toString(16))
      .join('')
    const ext = path.extname(file.name)
    const filename = `${randomName}${ext}`
    const thumbnailFilename = `thumb-${filename}`

    // Upload via storage provider (original + thumbnail in parallel)
    const uploadResult = await storage.upload(
      {
        buffer,
        filename,
        path: storagePath,
        contentType: file.type,
      },
      {
        buffer: thumbnailBuffer,
        filename: thumbnailFilename,
        path: storagePath,
        contentType: 'image/jpeg',
      }
    )

    // Split categories by comma and trim
    const categoriesArray = category
      ? category
          .split(',')
          .map((c) => c.trim())
          .filter((c) => c.length > 0)
      : []

    // Extract dominant colors from the image
    const dominantColors = await extractDominantColors(buffer)

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

    // Create photo record
    const photo = await db.photo.create({
      data: {
        title,
        url: uploadResult.url,
        thumbnailUrl: uploadResult.thumbnailUrl,
        storageProvider: storageConfig.provider,
        storageKey: uploadResult.key,
        width: metadata.width || 0,
        height: metadata.height || 0,
        size: buffer.length,
        isFeatured: false,
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
        takenAt: exifData.takenAt,
        latitude: exifData.latitude,
        longitude: exifData.longitude,
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
      include: { categories: true, camera: true, lens: true },
    })

    return c.json({
      success: true,
      data: {
        ...photo,
        category: photo.categories.map((c) => c.name).join(','),
      },
    })
  } catch (error) {
    console.error('Upload photo error:', error)
    if (error instanceof StorageError) {
      return c.json({ error: error.message }, 400)
    }
    return c.json({ error: 'Internal server error' }, 500)
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

      // Delete files from storage based on user selection
      if (deleteOriginal || deleteThumbnail) {
        // Get storage configuration for the provider used by this photo
        const storageConfig = await getStorageConfig(photo.storageProvider)

        // Create storage provider instance
        const storage = StorageProviderFactory.create(storageConfig)

        // Derive thumbnail key from storage key
        let thumbnailKey: string | undefined
        if (deleteThumbnail && photo.storageKey) {
          const lastSlashIndex = photo.storageKey.lastIndexOf('/')
          if (lastSlashIndex >= 0) {
            const pathPart = photo.storageKey.substring(0, lastSlashIndex + 1)
            const filenamePart = photo.storageKey.substring(lastSlashIndex + 1)
            thumbnailKey = `${pathPart}thumb-${filenamePart}`
          } else {
            thumbnailKey = `thumb-${photo.storageKey}`
          }
        }

        // Delete based on user selection
        const originalKey = deleteOriginal ? (photo.storageKey || photo.url) : undefined
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

photos.patch('/admin/photos/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()

    // Build update data
    const updateData: Record<string, unknown> = {}

    if (body.title !== undefined) updateData.title = body.title
    if (body.isFeatured !== undefined) updateData.isFeatured = body.isFeatured
    if (body.takenAt !== undefined) updateData.takenAt = body.takenAt ? new Date(body.takenAt) : null

    // Handle storage path change (move file)
    if (body.storagePath !== undefined) {
      const photo = await db.photo.findUnique({ where: { id } })
      if (!photo) {
        return c.json({ error: 'Photo not found' }, 404)
      }

      const storageConfig = await getStorageConfig(photo.storageProvider)
      const storage = StorageProviderFactory.create(storageConfig)

      // Derive thumbnail key
      let thumbnailKey: string | undefined
      if (photo.storageKey) {
        const lastSlash = photo.storageKey.lastIndexOf('/')
        if (lastSlash >= 0) {
          thumbnailKey = `${photo.storageKey.substring(0, lastSlash + 1)}thumb-${photo.storageKey.substring(lastSlash + 1)}`
        } else {
          thumbnailKey = `thumb-${photo.storageKey}`
        }
      }

      const moveResult = await storage.move(
        photo.storageKey || photo.url,
        body.storagePath,
        thumbnailKey
      )

      updateData.url = moveResult.newUrl
      updateData.storageKey = moveResult.newKey
      if (moveResult.newThumbnailUrl) {
        updateData.thumbnailUrl = moveResult.newThumbnailUrl
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

    const photo = await db.photo.update({
      where: { id },
      data: updateData,
      include: { categories: true, camera: true, lens: true }
    })

    return c.json({
      success: true,
      data: {
        ...photo,
        category: photo.categories.map((c) => c.name).join(','),
        dominantColors: photo.dominantColors ? JSON.parse(photo.dominantColors) : null,
      },
    })
  } catch (error) {
    console.error('Update photo error:', error)
    return c.json({ error: 'Internal server error' }, 500)
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
  try {
    const body = await c.req.json()
    const { storageProvider, oldPublicUrl, newPublicUrl } = body

    if (!storageProvider || !oldPublicUrl || !newPublicUrl) {
      return c.json({ error: 'Missing required parameters' }, 400)
    }

    // Find all photos using this storage provider
    const photosList = await db.photo.findMany({
      where: {
        storageProvider: storageProvider as 'local' | 'github' | 'r2',
      },
    })

    let updated = 0
    let failed = 0

    // Update URLs for each photo
    for (const photo of photosList) {
      try {
        // Replace old URL with new URL in both url and thumbnailUrl
        const newUrl = photo.url.replace(oldPublicUrl, newPublicUrl)
        const newThumbnailUrl = photo.thumbnailUrl
          ? photo.thumbnailUrl.replace(oldPublicUrl, newPublicUrl)
          : photo.thumbnailUrl

        await db.photo.update({
          where: { id: photo.id },
          data: {
            url: newUrl,
            thumbnailUrl: newThumbnailUrl,
          },
        })

        updated++
      } catch (error) {
        console.error(`Failed to update photo ${photo.id}:`, error)
        failed++
      }
    }

    return c.json({
      success: true,
      data: { updated, failed },
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

    // Get storage config and download the image
    const storageConfig = await getStorageConfig(photo.storageProvider)
    const storage = StorageProviderFactory.create(storageConfig)
    
    const buffer = await storage.download(photo.storageKey || photo.url)
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

    const formData = await c.req.formData()
    const file = formData.get('file') as File
    if (!file) {
      return c.json({ error: 'File is required' }, 400)
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const storageConfig = await getStorageConfig(photo.storageProvider)
    const storage = StorageProviderFactory.create(storageConfig)
    storage.validateConfig()

    const storageKey = photo.storageKey || ''
    const lastSlash = storageKey.lastIndexOf('/')
    const storagePath = lastSlash >= 0 ? storageKey.substring(0, lastSlash) : ''
    const filename = lastSlash >= 0 ? storageKey.substring(lastSlash + 1) : storageKey
    const thumbnailFilename = `thumb-${filename}`

    const uploadOriginal = !missingType || missingType === 'original' || missingType === 'both'
    const uploadThumb = !missingType || missingType === 'thumbnail' || missingType === 'both'

    let exifData = null
    let metadata = null
    let thumbnailBuffer = null
    let dominantColors: string[] = []

    if (uploadOriginal) {
      [exifData, { metadata, thumbnailBuffer }] = await Promise.all([
        extractExifData(buffer),
        (async () => {
          const sharpInstance = sharp(buffer)
          const [meta, thumb] = await Promise.all([
            sharpInstance.metadata(),
            uploadThumb ? sharp(buffer).rotate().resize(800, 800, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer() : null,
          ])
          return { metadata: meta, thumbnailBuffer: thumb }
        })(),
      ])
      dominantColors = await extractDominantColors(buffer)
    } else if (uploadThumb) {
      thumbnailBuffer = await sharp(buffer).rotate().resize(800, 800, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer()
    }

    let uploadResult
    if (uploadOriginal && uploadThumb && thumbnailBuffer) {
      uploadResult = await storage.upload(
        { buffer, filename, path: storagePath, contentType: file.type },
        { buffer: thumbnailBuffer, filename: thumbnailFilename, path: storagePath, contentType: 'image/jpeg' }
      )
    } else if (uploadOriginal) {
      uploadResult = await storage.upload({ buffer, filename, path: storagePath, contentType: file.type })
    } else if (uploadThumb && thumbnailBuffer) {
      uploadResult = await storage.upload({ buffer: thumbnailBuffer, filename: thumbnailFilename, path: storagePath, contentType: 'image/jpeg' })
    }

    const updateData: Record<string, unknown> = {}
    if (uploadOriginal && uploadResult) {
      updateData.url = uploadResult.url
      updateData.storageKey = uploadResult.key
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
        updateData.takenAt = exifData.takenAt
        updateData.latitude = exifData.latitude
        updateData.longitude = exifData.longitude
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
    if (uploadThumb && uploadResult?.thumbnailUrl) {
      updateData.thumbnailUrl = uploadResult.thumbnailUrl
    } else if (uploadThumb && !uploadOriginal && uploadResult) {
      updateData.thumbnailUrl = uploadResult.url
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

    const storageConfig = await getStorageConfig(photo.storageProvider)
    const storage = StorageProviderFactory.create(storageConfig)

    const buffer = await storage.download(photo.storageKey || photo.url)
    if (!buffer) return c.json({ error: 'Failed to download image' }, 500)

    const thumbnailBuffer = await sharp(buffer)
      .rotate()
      .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer()

    const storageKey = photo.storageKey || ''
    const lastSlash = storageKey.lastIndexOf('/')
    const storagePath = lastSlash >= 0 ? storageKey.substring(0, lastSlash) : ''
    const filename = lastSlash >= 0 ? storageKey.substring(lastSlash + 1) : storageKey
    const thumbnailFilename = `thumb-${filename}`

    const uploadResult = await storage.upload({
      buffer: thumbnailBuffer,
      filename: thumbnailFilename,
      path: storagePath,
      contentType: 'image/jpeg',
    })

    const updated = await db.photo.update({
      where: { id },
      data: { thumbnailUrl: uploadResult.url },
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
    console.error('Generate thumbnail error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export default photos
