import 'server-only'
import { Hono } from 'hono'
import { db } from '~/server/lib/db'
import { authMiddleware, AuthVariables } from './middleware/auth'
import { z } from 'zod'

const albums = new Hono<{ Variables: AuthVariables }>()

// Validation schemas
const CreateAlbumSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  coverUrl: z.string().url().optional().nullable(),
  isPublished: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
  photoIds: z.array(z.string().uuid()).optional(),
})

const UpdateAlbumSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  coverUrl: z.string().url().optional().nullable(),
  isPublished: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
})

const AddPhotosSchema = z.object({
  photoIds: z.array(z.string().uuid()).min(1),
})

// Public endpoints
albums.get('/albums', async (c) => {
  try {
    const albumsList = await db.album.findMany({
      where: { isPublished: true },
      include: {
        photos: {
          include: { categories: true },
        },
        _count: {
          select: { photos: true },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    })

    const data = albumsList.map((album) => ({
      ...album,
      photoCount: album._count.photos,
      photos: album.photos.map((p) => ({
        ...p,
        category: p.categories.map((c) => c.name).join(','),
      })),
    }))

    return c.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('Get albums error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

albums.get('/albums/:id', async (c) => {
  try {
    const id = c.req.param('id')

    const album = await db.album.findUnique({
      where: { id, isPublished: true },
      include: {
        photos: {
          include: { categories: true },
        },
        _count: {
          select: { photos: true },
        },
      },
    })

    if (!album) {
      return c.json({ error: 'Album not found' }, 404)
    }

    const data = {
      ...album,
      photoCount: album._count.photos,
      photos: album.photos.map((p) => ({
        ...p,
        category: p.categories.map((c) => c.name).join(','),
      })),
    }

    return c.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('Get album error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Protected admin endpoints
albums.use('/admin/*', authMiddleware)

albums.get('/admin/albums', async (c) => {
  try {
    const albumsList = await db.album.findMany({
      include: {
        photos: {
          include: { categories: true },
        },
        _count: {
          select: { photos: true },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    })

    const data = albumsList.map((album) => ({
      ...album,
      photoCount: album._count.photos,
      photos: album.photos.map((p) => ({
        ...p,
        category: p.categories.map((c) => c.name).join(','),
      })),
    }))

    return c.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('Get admin albums error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

albums.post('/admin/albums', async (c) => {
  try {
    const body = await c.req.json()
    const validated = CreateAlbumSchema.parse(body)

    const album = await db.album.create({
      data: {
        name: validated.name,
        description: validated.description,
        coverUrl: validated.coverUrl,
        isPublished: validated.isPublished,
        sortOrder: validated.sortOrder,
        photos: validated.photoIds
          ? {
              connect: validated.photoIds.map((id) => ({ id })),
            }
          : undefined,
      },
      include: {
        photos: {
          include: { categories: true },
        },
        _count: {
          select: { photos: true },
        },
      },
    })

    const data = {
      ...album,
      photoCount: album._count.photos,
      photos: album.photos.map((p) => ({
        ...p,
        category: p.categories.map((c) => c.name).join(','),
      })),
    }

    return c.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('Create album error:', error)
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.issues }, 400)
    }
    return c.json({ error: 'Internal server error' }, 500)
  }
})

albums.patch('/admin/albums/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const validated = UpdateAlbumSchema.parse(body)

    const album = await db.album.update({
      where: { id },
      data: validated,
      include: {
        photos: {
          include: { categories: true },
        },
        _count: {
          select: { photos: true },
        },
      },
    })

    const data = {
      ...album,
      photoCount: album._count.photos,
      photos: album.photos.map((p) => ({
        ...p,
        category: p.categories.map((c) => c.name).join(','),
      })),
    }

    return c.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('Update album error:', error)
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.issues }, 400)
    }
    return c.json({ error: 'Internal server error' }, 500)
  }
})

albums.delete('/admin/albums/:id', async (c) => {
  try {
    const id = c.req.param('id')

    await db.album.delete({
      where: { id },
    })

    return c.json({
      success: true,
      message: 'Album deleted successfully',
    })
  } catch (error) {
    console.error('Delete album error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Add photos to album
albums.post('/admin/albums/:id/photos', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const validated = AddPhotosSchema.parse(body)

    const album = await db.album.update({
      where: { id },
      data: {
        photos: {
          connect: validated.photoIds.map((photoId) => ({ id: photoId })),
        },
      },
      include: {
        photos: {
          include: { categories: true },
        },
        _count: {
          select: { photos: true },
        },
      },
    })

    const data = {
      ...album,
      photoCount: album._count.photos,
      photos: album.photos.map((p) => ({
        ...p,
        category: p.categories.map((c) => c.name).join(','),
      })),
    }

    return c.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('Add photos to album error:', error)
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.issues }, 400)
    }
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Remove photo from album
albums.delete('/admin/albums/:albumId/photos/:photoId', async (c) => {
  try {
    const albumId = c.req.param('albumId')
    const photoId = c.req.param('photoId')

    const album = await db.album.update({
      where: { id: albumId },
      data: {
        photos: {
          disconnect: { id: photoId },
        },
      },
      include: {
        photos: {
          include: { categories: true },
        },
        _count: {
          select: { photos: true },
        },
      },
    })

    const data = {
      ...album,
      photoCount: album._count.photos,
      photos: album.photos.map((p) => ({
        ...p,
        category: p.categories.map((c) => c.name).join(','),
      })),
    }

    return c.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('Remove photo from album error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Set album cover from a photo
albums.patch('/admin/albums/:id/cover', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const { photoId } = body

    // Get photo URL
    const photo = await db.photo.findUnique({
      where: { id: photoId },
      select: { thumbnailUrl: true, url: true },
    })

    if (!photo) {
      return c.json({ error: 'Photo not found' }, 404)
    }

    const album = await db.album.update({
      where: { id },
      data: {
        coverUrl: photo.thumbnailUrl || photo.url,
      },
      include: {
        photos: {
          include: { categories: true },
        },
        _count: {
          select: { photos: true },
        },
      },
    })

    const data = {
      ...album,
      photoCount: album._count.photos,
      photos: album.photos.map((p) => ({
        ...p,
        category: p.categories.map((c) => c.name).join(','),
      })),
    }

    return c.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('Set album cover error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export default albums
