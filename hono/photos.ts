import 'server-only'
import { Hono } from 'hono'
import { db } from '~/server/lib/db'
import { authMiddleware, AuthVariables } from './middleware/auth'
import { extractExifData } from '~/server/lib/exif'
import { extractDominantColors } from '~/server/lib/colors'
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
        include: { categories: true },
        orderBy: { createdAt: 'desc' },
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
        include: { categories: true },
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
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
      include: { categories: true },
      take: 6,
      orderBy: { createdAt: 'desc' },
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

photos.post('/admin/photos', async (c) => {
  try {
    const formData = await c.req.formData()
    const file = formData.get('file') as File
    const title = formData.get('title') as string
    const category = formData.get('category') as string
    const storageProvider = formData.get('storage_provider') as string
    const storagePath = formData.get('storage_path') as string

    if (!file || !title) {
      return c.json({ error: 'File and title are required' }, 400)
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
        // EXIF data
        cameraMake: exifData.cameraMake,
        cameraModel: exifData.cameraModel,
        lens: exifData.lens,
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
      include: { categories: true },
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
    const deleteFromStorage = c.req.query('deleteFromStorage') === 'true'
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

      // Only delete files from storage if user explicitly requested it
      if (deleteFromStorage) {
        // Get storage configuration for the provider used by this photo
        const storageConfig = await getStorageConfig(photo.storageProvider)

        // Create storage provider instance
        const storage = StorageProviderFactory.create(storageConfig)

        // Delete files from storage
        const thumbnailKey = photo.thumbnailUrl
          ? photo.thumbnailUrl.split('/').pop()
          : undefined

        await storage.delete(photo.storageKey || photo.url, thumbnailKey)
      } else {
        console.log(
          `Skipping file deletion for photo ${id} (deleteFromStorage=${deleteFromStorage})`
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
      include: { categories: true }
    })

    return c.json({
      success: true,
      data: {
        ...photo,
        category: photo.categories.map((c) => c.name).join(','),
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

    const photos = await db.photo.findMany({
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
    
    for (const photo of photos) {
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
    const photos = await db.photo.findMany({
      where: {
        storageProvider: storageProvider as 'local' | 'github' | 'r2',
      },
    })

    let updated = 0
    let failed = 0

    // Update URLs for each photo
    for (const photo of photos) {
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

export default photos
