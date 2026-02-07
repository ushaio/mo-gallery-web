import 'server-only'
import { Hono } from 'hono'
import { db, albums as albumsTable, photos, albumPhotos, categories, photoCategories } from '~/server/lib/drizzle'
import { authMiddleware, AuthVariables } from './middleware/auth'
import { z } from 'zod'
import { eq, and, desc, asc, count, sql, inArray } from 'drizzle-orm'

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

// Helper to handle errors
const handleError = (c: any, error: unknown, entityName = 'Record') => {
  console.error(`${entityName} operation error:`, error)
  if (error instanceof z.ZodError) {
    return c.json({ error: 'Validation error', details: error.issues }, 400)
  }
  return c.json({ error: 'Internal server error' }, 500)
}

// Helper to get album with photos and categories
async function getAlbumWithDetails(albumId: string) {
  const album = await db.select().from(albumsTable).where(eq(albumsTable.id, albumId)).limit(1)
  if (album.length === 0) return null

  // Get photos in this album
  const albumPhotosList = await db
    .select({
      photoId: albumPhotos.B,
    })
    .from(albumPhotos)
    .where(eq(albumPhotos.A, albumId))

  const photoIds = albumPhotosList.map(ap => ap.photoId)
  
  if (photoIds.length === 0) {
    return {
      ...album[0],
      photoCount: 0,
      photos: [],
    }
  }

  // Get photos with their categories
  const photosList = await db
    .select({
      id: photos.id,
      title: photos.title,
      url: photos.url,
      thumbnailUrl: photos.thumbnailUrl,
      width: photos.width,
      height: photos.height,
      isFeatured: photos.isFeatured,
      takenAt: photos.takenAt,
      createdAt: photos.createdAt,
    })
    .from(photos)
    .where(inArray(photos.id, photoIds))

  // Get categories for each photo
  const photosWithCategories = await Promise.all(
    photosList.map(async (photo) => {
      const photoCats = await db
        .select({
          name: categories.name,
        })
        .from(photoCategories)
        .innerJoin(categories, eq(photoCategories.A, categories.id))
        .where(eq(photoCategories.B, photo.id))

      return {
        ...photo,
        category: photoCats.map(c => c.name).join(','),
      }
    })
  )

  return {
    ...album[0],
    photoCount: photosList.length,
    photos: photosWithCategories,
  }
}

// Public endpoints
albums.get('/albums', async (c) => {
  try {
    const albumsList = await db
      .select()
      .from(albumsTable)
      .where(eq(albumsTable.isPublished, true))
      .orderBy(asc(albumsTable.sortOrder), desc(albumsTable.createdAt))

    const data = await Promise.all(
      albumsList.map(album => getAlbumWithDetails(album.id))
    )

    return c.json({
      success: true,
      data: data.filter(Boolean),
    })
  } catch (error) {
    console.error('Get albums error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

albums.get('/albums/:id', async (c) => {
  try {
    const id = c.req.param('id')

    const album = await db
      .select()
      .from(albumsTable)
      .where(and(
        eq(albumsTable.id, id),
        eq(albumsTable.isPublished, true)
      ))
      .limit(1)

    if (album.length === 0) {
      return c.json({ error: 'Album not found' }, 404)
    }

    const data = await getAlbumWithDetails(id)

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

// Batch reorder albums - MUST be before :id routes
albums.patch('/admin/albums/reorder', async (c) => {
  try {
    const body = await c.req.json()
    const { items } = z.object({
      items: z.array(z.object({
        id: z.string().uuid(),
        sortOrder: z.number().int(),
      })),
    }).parse(body)

    await Promise.all(
      items.map((item) =>
        db.update(albumsTable)
          .set({ sortOrder: item.sortOrder, updatedAt: new Date() })
          .where(eq(albumsTable.id, item.id))
      )
    )

    return c.json({
      success: true,
      message: 'Albums reordered successfully',
    })
  } catch (error) {
    return handleError(c, error, 'Album')
  }
})

albums.get('/admin/albums', async (c) => {
  try {
    const albumsList = await db
      .select()
      .from(albumsTable)
      .orderBy(asc(albumsTable.sortOrder), desc(albumsTable.createdAt))

    const data = await Promise.all(
      albumsList.map(album => getAlbumWithDetails(album.id))
    )

    return c.json({
      success: true,
      data: data.filter(Boolean),
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

    const [album] = await db.insert(albumsTable)
      .values({
        name: validated.name,
        description: validated.description,
        coverUrl: validated.coverUrl,
        isPublished: validated.isPublished,
        sortOrder: validated.sortOrder,
      })
      .returning()

    // Connect photos if provided
    if (validated.photoIds && validated.photoIds.length > 0) {
      await Promise.all(
        validated.photoIds.map(photoId =>
          db.insert(albumPhotos)
            .values({ A: album.id, B: photoId })
            .onConflictDoNothing()
        )
      )
    }

    const data = await getAlbumWithDetails(album.id)

    return c.json({
      success: true,
      data,
    })
  } catch (error) {
    return handleError(c, error, 'Album or Photo')
  }
})

albums.patch('/admin/albums/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const validated = UpdateAlbumSchema.parse(body)

    const [album] = await db.update(albumsTable)
      .set({ ...validated, updatedAt: new Date() })
      .where(eq(albumsTable.id, id))
      .returning()

    const data = await getAlbumWithDetails(album.id)

    return c.json({
      success: true,
      data,
    })
  } catch (error) {
    return handleError(c, error, 'Album')
  }
})

albums.delete('/admin/albums/:id', async (c) => {
  try {
    const id = c.req.param('id')

    await db.delete(albumsTable)
      .where(eq(albumsTable.id, id))

    return c.json({
      success: true,
      message: 'Album deleted successfully',
    })
  } catch (error) {
    return handleError(c, error, 'Album')
  }
})

// Add photos to album
albums.post('/admin/albums/:id/photos', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const validated = AddPhotosSchema.parse(body)

    // Add photos to album
    await Promise.all(
      validated.photoIds.map(photoId =>
        db.insert(albumPhotos)
          .values({ A: id, B: photoId })
          .onConflictDoNothing()
      )
    )

    const data = await getAlbumWithDetails(id)

    return c.json({
      success: true,
      data,
    })
  } catch (error) {
    return handleError(c, error, 'Album or Photo')
  }
})

// Remove photo from album
albums.delete('/admin/albums/:albumId/photos/:photoId', async (c) => {
  try {
    const albumId = c.req.param('albumId')
    const photoId = c.req.param('photoId')

    await db.delete(albumPhotos)
      .where(and(
        eq(albumPhotos.A, albumId),
        eq(albumPhotos.B, photoId)
      ))

    const data = await getAlbumWithDetails(albumId)

    return c.json({
      success: true,
      data,
    })
  } catch (error) {
    return handleError(c, error, 'Album or Photo')
  }
})

// Set album cover from a photo
albums.patch('/admin/albums/:id/cover', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const { photoId } = body

    // Get photo URL
    const [photo] = await db
      .select({
        thumbnailUrl: photos.thumbnailUrl,
        url: photos.url,
      })
      .from(photos)
      .where(eq(photos.id, photoId))
      .limit(1)

    if (!photo) {
      return c.json({ error: 'Photo not found' }, 404)
    }

    const [album] = await db.update(albumsTable)
      .set({
        coverUrl: photo.thumbnailUrl || photo.url,
        updatedAt: new Date(),
      })
      .where(eq(albumsTable.id, id))
      .returning()

    const data = await getAlbumWithDetails(album.id)

    return c.json({
      success: true,
      data,
    })
  } catch (error) {
    return handleError(c, error, 'Album')
  }
})

export default albums
