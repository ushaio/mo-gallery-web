import 'server-only'
import { Hono } from 'hono'
import { db, stories as storiesTable, photos, photoStories, categories, photoCategories, comments as commentsTable } from '~/server/lib/drizzle'
import { authMiddleware, AuthVariables } from './middleware/auth'
import { z } from 'zod'
import { eq, and, desc, inArray } from 'drizzle-orm'

const stories = new Hono<{ Variables: AuthVariables }>()

// Helper function to sort photos by the order stored in PhotoStories junction table
function sortPhotosByOrder<T extends { id: string }>(photos: T[], photoIds: string[]): T[] {
  return photoIds.map((orderId) => photos.find((p) => p.id === orderId)).filter((p): p is T => !!p)
}

// Validation schemas
const CreateStorySchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(50000),
  isPublished: z.boolean().default(false),
  photoIds: z.array(z.string().uuid()).optional(),
  coverPhotoId: z.string().uuid().optional().nullable(),
})

const UpdateStorySchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).max(50000).optional(),
  isPublished: z.boolean().optional(),
  coverPhotoId: z.string().uuid().optional().nullable(),
  createdAt: z.string().datetime().optional().nullable(),
})

const AddPhotosSchema = z.object({
  photoIds: z.array(z.string().uuid()).min(1),
})

const ReorderPhotosSchema = z.object({
  photoIds: z.array(z.string().uuid()).min(1),
})

// Helper to get story with photos and categories
async function getStoryWithDetails(storyId: string) {
  const story = await db.select().from(storiesTable).where(eq(storiesTable.id, storyId)).limit(1)
  if (story.length === 0) return null

  // Get photos in this story
  const storyPhotosList = await db
    .select({ photoId: photoStories.A })
    .from(photoStories)
    .where(eq(photoStories.B, storyId))

  const photoIds = storyPhotosList.map(sp => sp.photoId)
  
  if (photoIds.length === 0) {
    return {
      ...story[0],
      photos: [],
    }
  }

  // Get photos with their categories
  const photosList = await db
    .select()
    .from(photos)
    .where(inArray(photos.id, photoIds))

  // Get categories for each photo
  const photosWithCategories = await Promise.all(
    photosList.map(async (photo) => {
      const photoCats = await db
        .select({ name: categories.name })
        .from(photoCategories)
        .innerJoin(categories, eq(photoCategories.A, categories.id))
        .where(eq(photoCategories.B, photo.id))

      return {
        ...photo,
        category: photoCats.map(c => c.name).join(','),
        dominantColors: photo.dominantColors ? JSON.parse(photo.dominantColors) : [],
      }
    })
  )

  return {
    ...story[0],
    photos: photosWithCategories,
  }
}

// Public endpoints
stories.get('/stories', async (c) => {
  try {
    const storiesList = await db
      .select()
      .from(storiesTable)
      .where(eq(storiesTable.isPublished, true))
      .orderBy(desc(storiesTable.createdAt))

    const data = await Promise.all(
      storiesList.map(story => getStoryWithDetails(story.id))
    )

    return c.json({
      success: true,
      data: data.filter(Boolean),
    })
  } catch (error) {
    console.error('Get stories error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

stories.get('/stories/:id', async (c) => {
  try {
    const id = c.req.param('id')

    const story = await db
      .select()
      .from(storiesTable)
      .where(and(
        eq(storiesTable.id, id),
        eq(storiesTable.isPublished, true)
      ))
      .limit(1)

    if (story.length === 0) {
      return c.json({ error: 'Story not found' }, 404)
    }

    const data = await getStoryWithDetails(id)

    return c.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('Get story error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Get all comments for a story (all photos in the story)
stories.get('/stories/:id/comments', async (c) => {
  try {
    const id = c.req.param('id')

    // Find the story and get all its photo IDs
    const story = await db
      .select()
      .from(storiesTable)
      .where(and(
        eq(storiesTable.id, id),
        eq(storiesTable.isPublished, true)
      ))
      .limit(1)

    if (story.length === 0) {
      return c.json({ error: 'Story not found' }, 404)
    }

    const storyPhotosList = await db
      .select({ photoId: photoStories.A })
      .from(photoStories)
      .where(eq(photoStories.B, id))

    const photoIds = storyPhotosList.map(sp => sp.photoId)

    if (photoIds.length === 0) {
      return c.json({ success: true, data: [] })
    }

    // Get all approved comments for these photos
    const commentsList = await db
      .select({
        id: commentsTable.id,
        author: commentsTable.author,
        avatarUrl: commentsTable.avatarUrl,
        content: commentsTable.content,
        createdAt: commentsTable.createdAt,
        photoId: commentsTable.photoId,
      })
      .from(commentsTable)
      .where(and(
        inArray(commentsTable.photoId, photoIds),
        eq(commentsTable.status, 'approved')
      ))
      .orderBy(desc(commentsTable.createdAt))

    return c.json({
      success: true,
      data: commentsList,
    })
  } catch (error) {
    console.error('Get story comments error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Get story for a specific photo
stories.get('/photos/:photoId/story', async (c) => {
  try {
    const photoId = c.req.param('photoId')

    // Find story containing this photo
    const storyPhoto = await db
      .select({ storyId: photoStories.B })
      .from(photoStories)
      .where(eq(photoStories.A, photoId))
      .limit(1)

    if (storyPhoto.length === 0) {
      return c.json({ error: 'No story found for this photo' }, 404)
    }

    const story = await db
      .select()
      .from(storiesTable)
      .where(and(
        eq(storiesTable.id, storyPhoto[0].storyId),
        eq(storiesTable.isPublished, true)
      ))
      .limit(1)

    if (story.length === 0) {
      return c.json({ error: 'No story found for this photo' }, 404)
    }

    const data = await getStoryWithDetails(story[0].id)

    return c.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('Get photo story error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Protected admin endpoints
stories.use('/admin/*', authMiddleware)

// Get story for a specific photo (admin - includes unpublished)
stories.get('/admin/photos/:photoId/story', async (c) => {
  try {
    const photoId = c.req.param('photoId')

    // Find story containing this photo
    const storyPhoto = await db
      .select({ storyId: photoStories.B })
      .from(photoStories)
      .where(eq(photoStories.A, photoId))
      .limit(1)

    if (storyPhoto.length === 0) {
      return c.json({ error: 'No story found for this photo' }, 404)
    }

    const data = await getStoryWithDetails(storyPhoto[0].storyId)

    return c.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('Get admin photo story error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

stories.get('/admin/stories', async (c) => {
  try {
    const storiesList = await db
      .select()
      .from(storiesTable)
      .orderBy(desc(storiesTable.createdAt))

    const data = await Promise.all(
      storiesList.map(story => getStoryWithDetails(story.id))
    )

    return c.json({
      success: true,
      data: data.filter(Boolean),
    })
  } catch (error) {
    console.error('Get admin stories error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

stories.post('/admin/stories', async (c) => {
  try {
    const body = await c.req.json()
    const validated = CreateStorySchema.parse(body)

    const [story] = await db.insert(storiesTable)
      .values({
        title: validated.title,
        content: validated.content,
        isPublished: validated.isPublished,
        coverPhotoId: validated.coverPhotoId,
      })
      .returning()

    // Connect photos if provided
    if (validated.photoIds && validated.photoIds.length > 0) {
      await Promise.all(
        validated.photoIds.map(photoId =>
          db.insert(photoStories)
            .values({ A: photoId, B: story.id })
            .onConflictDoNothing()
        )
      )
    }

    const data = await getStoryWithDetails(story.id)

    return c.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('Create story error:', error)
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.issues }, 400)
    }
    return c.json({ error: 'Internal server error' }, 500)
  }
})

stories.patch('/admin/stories/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const validated = UpdateStorySchema.parse(body)

    const updateData: Record<string, unknown> = { updatedAt: new Date() }
    if (validated.title !== undefined) updateData.title = validated.title
    if (validated.content !== undefined) updateData.content = validated.content
    if (validated.isPublished !== undefined) updateData.isPublished = validated.isPublished
    if (validated.coverPhotoId !== undefined) updateData.coverPhotoId = validated.coverPhotoId
    if (validated.createdAt !== undefined) {
      updateData.createdAt = validated.createdAt ? new Date(validated.createdAt) : new Date()
    }

    const [story] = await db.update(storiesTable)
      .set(updateData)
      .where(eq(storiesTable.id, id))
      .returning()

    const data = await getStoryWithDetails(story.id)

    return c.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('Update story error:', error)
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.issues }, 400)
    }
    return c.json({ error: 'Internal server error' }, 500)
  }
})

stories.delete('/admin/stories/:id', async (c) => {
  try {
    const id = c.req.param('id')

    await db.delete(storiesTable)
      .where(eq(storiesTable.id, id))

    return c.json({
      success: true,
      message: 'Story deleted successfully',
    })
  } catch (error) {
    console.error('Delete story error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Add photos to story
stories.post('/admin/stories/:id/photos', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const validated = AddPhotosSchema.parse(body)

    // Add photos to story
    await Promise.all(
      validated.photoIds.map(photoId =>
        db.insert(photoStories)
          .values({ A: photoId, B: id })
          .onConflictDoNothing()
      )
    )

    const data = await getStoryWithDetails(id)

    return c.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('Add photos to story error:', error)
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.issues }, 400)
    }
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Remove photo from story
stories.delete('/admin/stories/:storyId/photos/:photoId', async (c) => {
  try {
    const storyId = c.req.param('storyId')
    const photoId = c.req.param('photoId')

    await db.delete(photoStories)
      .where(and(
        eq(photoStories.A, photoId),
        eq(photoStories.B, storyId)
      ))

    const data = await getStoryWithDetails(storyId)

    return c.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('Remove photo from story error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Reorder photos in story
stories.patch('/admin/stories/:id/photos/reorder', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const validated = ReorderPhotosSchema.parse(body)

    // First, disconnect all photos from the story
    await db.delete(photoStories)
      .where(eq(photoStories.B, id))

    // Then, reconnect photos in the new order
    await Promise.all(
      validated.photoIds.map(photoId =>
        db.insert(photoStories)
          .values({ A: photoId, B: id })
      )
    )

    const data = await getStoryWithDetails(id)

    return c.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('Reorder story photos error:', error)
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.issues }, 400)
    }
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export default stories
