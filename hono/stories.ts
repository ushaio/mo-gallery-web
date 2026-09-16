import 'server-only'
import { Hono } from 'hono'
import { z } from 'zod'
import { Prisma } from '@/generated/prisma/client'
import {
  ARTICLE_CONTENT_INCLUDE,
  ARTICLE_SAVE_TRANSACTION_OPTIONS,
  ArticleContentShape,
  EditorTypeSchema,
  MissingEditorContentError,
  articleContentData,
  hasArticleBody,
  mapArticleContent,
  validateArticleContent,
} from '~/server/lib/article-content'
import { db } from '~/server/lib/db'
import { createStoryAiStream, fetchStoryAiModels } from '~/server/lib/story-ai'
import { polishStoryAiPrompt } from '~/server/lib/story-ai-prompt'
import { authMiddleware, AuthVariables } from './middleware/auth'
import { resolvePhotoUrlsInto } from '~/server/lib/photo-urls'

const stories = new Hono<{ Variables: AuthVariables }>()

// Validation schemas
const CreateStorySchema = z.object({
  ...ArticleContentShape,
  editorType: EditorTypeSchema,
  title: z.string().min(1).max(200),
  isPublished: z.boolean().default(false),
  storyDate: z.string().datetime().optional(),
  photoIds: z.array(z.string().uuid()).optional(),
  coverPhotoId: z.string().uuid().optional().nullable(),
  coverCrop: z.object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().gt(0).max(1),
    height: z.number().gt(0).max(1),
  }).optional().nullable(),
}).strict().superRefine(validateArticleContent)

const UpdateStorySchema = z.object({
  ...ArticleContentShape,
  title: z.string().min(1).max(200).optional(),
  isPublished: z.boolean().optional(),
  coverPhotoId: z.string().uuid().optional().nullable(),
  coverCrop: z.object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().gt(0).max(1),
    height: z.number().gt(0).max(1),
  }).optional().nullable(),
  storyDate: z.string().datetime().optional().nullable(),
  createdAt: z.string().datetime().optional().nullable(),
}).strict().superRefine(validateArticleContent)

const AddPhotosSchema = z.object({
  photoIds: z.array(z.string().uuid()).min(1),
})

const ReorderPhotosSchema = z.object({
  photoIds: z.array(z.string().uuid()).min(1),
})

const StoryAiGenerateSchema = z.object({
  action: z.enum(['rewrite', 'expand', 'shorten', 'continue', 'summarize', 'custom']),
  model: z.string().max(200).optional(),
  prompt: z.string().max(2000).optional(),
  title: z.string().max(200).optional(),
  selectedText: z.string().max(6000).optional(),
  currentParagraph: z.string().max(4000).optional(),
  contextBefore: z.string().max(4000).optional(),
  contextAfter: z.string().max(4000).optional(),
})

const StoryAiPromptPolishSchema = z.object({
  text: z.string().min(1).max(2000),
  action: z.enum(['rewrite', 'expand', 'shorten', 'continue', 'summarize', 'custom']).optional(),
  hasSelection: z.boolean().optional(),
  model: z.string().max(200).optional(),
})

// Public endpoints
stories.get('/stories', async (c) => {
  try {
    const storiesList = await db.story.findMany({
      where: { isPublished: true },
      include: {
        ...ARTICLE_CONTENT_INCLUDE,
        photos: {
          include: { tags: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const data = await Promise.all(storiesList.map(async (story) => ({
      ...mapArticleContent(story),
      photos: await Promise.all(story.photos.map(async (p) => ({
        ...(await resolvePhotoUrlsInto(p)),
        tags: p.tags.map((c) => c.name).join(','),
        dominantColors: p.dominantColors ? JSON.parse(p.dominantColors) : [],
      }))),
    })))

    return c.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('Get stories error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

stories.get('/stories/:id', async (c) => {
  try {
    const id = c.req.param('id')

    const story = await db.story.findUnique({
      where: { id, isPublished: true },
      include: {
        ...ARTICLE_CONTENT_INCLUDE,
        photos: {
          include: { tags: true },
        },
      },
    })

    if (!story) {
      return c.json({ error: 'Story not found' }, 404)
    }

    const data = {
      ...mapArticleContent(story),
      photos: await Promise.all(story.photos.map(async (p) => ({
        ...(await resolvePhotoUrlsInto(p)),
        tags: p.tags.map((c) => c.name).join(','),
        dominantColors: p.dominantColors ? JSON.parse(p.dominantColors) : [],
      }))),
    }

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
    const story = await db.story.findUnique({
      where: { id, isPublished: true },
      select: {
        photos: {
          select: { id: true },
        },
      },
    })

    if (!story) {
      return c.json({ error: 'Story not found' }, 404)
    }

    const photoIds = story.photos.map((p) => p.id)

    // Get all approved comments for these photos
    const commentsList = await db.comment.findMany({
      where: {
        photoId: { in: photoIds },
        status: 'approved',
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        author: true,
        avatarUrl: true,
        content: true,
        createdAt: true,
        photoId: true,
      },
    })

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

    const story = await db.story.findFirst({
      where: {
        isPublished: true,
        photos: {
          some: { id: photoId },
        },
      },
      include: {
        ...ARTICLE_CONTENT_INCLUDE,
        photos: {
          include: { tags: true },
        },
      },
    })

    if (!story) {
      return c.json({ error: 'No story found for this photo' }, 404)
    }

    const data = {
      ...mapArticleContent(story),
      photos: await Promise.all(story.photos.map(async (p) => ({
        ...(await resolvePhotoUrlsInto(p)),
        tags: p.tags.map((c) => c.name).join(','),
      }))),
    }

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

    const story = await db.story.findFirst({
      where: {
        photos: {
          some: { id: photoId },
        },
      },
      include: {
        ...ARTICLE_CONTENT_INCLUDE,
        photos: {
          include: { tags: true },
        },
      },
    })

    if (!story) {
      return c.json({ error: 'No story found for this photo' }, 404)
    }

    const data = {
      ...mapArticleContent(story, true),
      photos: await Promise.all(story.photos.map(async (p) => ({
        ...(await resolvePhotoUrlsInto(p)),
        tags: p.tags.map((c) => c.name).join(','),
      }))),
    }

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
    const storiesList = await db.story.findMany({
      include: {
        ...ARTICLE_CONTENT_INCLUDE,
        photos: {
          include: { tags: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const data = await Promise.all(storiesList.map(async (story) => ({
      ...mapArticleContent(story, true),
      photos: await Promise.all(story.photos.map(async (p) => ({
        ...(await resolvePhotoUrlsInto(p)),
        tags: p.tags.map((c) => c.name).join(','),
      }))),
    })))

    return c.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('Get admin stories error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

stories.get('/admin/stories/:id', async (c) => {
  try {
    const id = c.req.param('id')

    const story = await db.story.findUnique({
      where: { id },
      include: {
        ...ARTICLE_CONTENT_INCLUDE,
        photos: {
          include: { tags: true },
        },
      },
    })

    if (!story) {
      return c.json({ error: 'Story not found' }, 404)
    }

    const data = {
      ...mapArticleContent(story, true),
      photos: await Promise.all(story.photos.map(async (p) => ({
        ...(await resolvePhotoUrlsInto(p)),
        tags: p.tags.map((c) => c.name).join(','),
      }))),
    }

    return c.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('Get admin story error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

stories.post('/admin/stories', async (c) => {
  try {
    const body = await c.req.json()
    const validated = CreateStorySchema.parse(body)

    const story = await db.story.create({
      data: {
        title: validated.title,
        editorType: validated.editorType,
        contents: { create: articleContentData(validated) },
        isPublished: validated.isPublished,
        storyDate: validated.storyDate ? new Date(validated.storyDate) : undefined,
        coverPhotoId: validated.coverPhotoId,
        coverCrop:
          validated.coverCrop === undefined
            ? undefined
            : validated.coverCrop === null
              ? Prisma.JsonNull
              : validated.coverCrop,
        photos: validated.photoIds
          ? {
              connect: validated.photoIds.map((id) => ({ id })),
            }
          : undefined,
      },
      include: {
        ...ARTICLE_CONTENT_INCLUDE,
        photos: {
          include: { tags: true },
        },
      },
    })

    const data = {
      ...mapArticleContent(story, true),
      photos: await Promise.all(story.photos.map(async (p) => ({
        ...(await resolvePhotoUrlsInto(p)),
        tags: p.tags.map((c) => c.name).join(','),
      }))),
    }

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

    const updateData: Prisma.StoryUpdateInput = {}
    if (validated.title !== undefined) updateData.title = validated.title
    if (validated.isPublished !== undefined) updateData.isPublished = validated.isPublished
    if (validated.coverPhotoId !== undefined) updateData.coverPhotoId = validated.coverPhotoId
    if (validated.coverCrop !== undefined) {
      updateData.coverCrop =
        validated.coverCrop === null ? Prisma.JsonNull : validated.coverCrop
    }
    if (validated.storyDate !== undefined) {
      updateData.storyDate = validated.storyDate ? new Date(validated.storyDate) : new Date()
    } else if (validated.createdAt !== undefined) {
      updateData.storyDate = validated.createdAt ? new Date(validated.createdAt) : new Date()
    }

    const editorType = validated.editorType
    const savesBody = hasArticleBody(validated)
    if (editorType !== undefined) {
      updateData.editorType = editorType
      if (savesBody) {
        const content = articleContentData({ ...validated, editorType })
        updateData.contents = {
          upsert: {
            where: { storyId_editorType: { storyId: id, editorType } },
            create: content,
            update: content,
          },
        }
      }
    }

    const story = await db.$transaction(async (tx) => {
      if (editorType !== undefined && !savesBody) {
        const existing = await tx.story.findUniqueOrThrow({
          where: { id },
          select: { contents: { where: { editorType }, select: { id: true } } },
        })
        if (existing.contents.length === 0) throw new MissingEditorContentError(editorType)
      }
      return tx.story.update({
        where: { id },
        data: updateData,
        include: {
          ...ARTICLE_CONTENT_INCLUDE,
          photos: { include: { tags: true } },
        },
      })
    }, ARTICLE_SAVE_TRANSACTION_OPTIONS)

    const data = {
      ...mapArticleContent(story, true),
      photos: await Promise.all(story.photos.map(async (p) => ({
        ...(await resolvePhotoUrlsInto(p)),
        tags: p.tags.map((c) => c.name).join(','),
      }))),
    }

    return c.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('Update story error:', error)
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.issues }, 400)
    }
    if (error instanceof MissingEditorContentError) {
      return c.json({ error: error.message, code: 'EDITOR_CONTENT_MISSING' }, 409)
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return c.json({ error: 'Story not found' }, 404)
    }
    return c.json({ error: 'Internal server error' }, 500)
  }
})

stories.delete('/admin/stories/:id', async (c) => {
  try {
    const id = c.req.param('id')

    await db.story.delete({
      where: { id },
    })

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

    const story = await db.story.update({
      where: { id },
      data: {
        photos: {
          connect: validated.photoIds.map((photoId) => ({ id: photoId })),
        },
      },
      include: {
        ...ARTICLE_CONTENT_INCLUDE,
        photos: {
          include: { tags: true },
        },
      },
    })

    const data = {
      ...mapArticleContent(story, true),
      photos: await Promise.all(story.photos.map(async (p) => ({
        ...(await resolvePhotoUrlsInto(p)),
        tags: p.tags.map((c) => c.name).join(','),
      }))),
    }

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

    const story = await db.story.update({
      where: { id: storyId },
      data: {
        photos: {
          disconnect: { id: photoId },
        },
      },
      include: {
        ...ARTICLE_CONTENT_INCLUDE,
        photos: {
          include: { tags: true },
        },
      },
    })

    const data = {
      ...mapArticleContent(story, true),
      photos: await Promise.all(story.photos.map(async (p) => ({
        ...(await resolvePhotoUrlsInto(p)),
        tags: p.tags.map((c) => c.name).join(','),
      }))),
    }

    return c.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('Remove photo from story error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Reorder photos in story - single operation using set to replace the relation
stories.patch('/admin/stories/:id/photos/reorder', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const validated = ReorderPhotosSchema.parse(body)

    // Use set to replace the entire photos relation in one operation
    // Prisma handles the reorder atomically without needing disconnect first
    const story = await db.story.update({
      where: { id },
      data: {
        photos: {
          set: validated.photoIds.map((photoId) => ({ id: photoId })),
        },
      },
      include: {
        ...ARTICLE_CONTENT_INCLUDE,
        photos: {
          include: { tags: true },
        },
      },
    })

    const data = {
      ...mapArticleContent(story, true),
      photos: await Promise.all(story.photos.map(async (p) => ({
        ...(await resolvePhotoUrlsInto(p)),
        tags: p.tags.map((c) => c.name).join(','),
      }))),
    }

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

stories.post('/admin/stories/ai/generate', async (c) => {
  try {
    const body = await c.req.json()
    const validated = StoryAiGenerateSchema.parse(body)

    const stream = await createStoryAiStream(validated)
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    console.error('Story AI generate error:', error)
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.issues }, 400)
    }

    const message = error instanceof Error ? error.message : 'Internal server error'
    const status = message === 'AI service is not configured' ? 503 : 500
    return c.json({ error: message }, status)
  }
})

stories.post('/admin/stories/ai/polish-prompt', async (c) => {
  try {
    const body = await c.req.json()
    const validated = StoryAiPromptPolishSchema.parse(body)
    const text = await polishStoryAiPrompt(validated)

    return c.json({
      success: true,
      data: {
        text,
      },
    })
  } catch (error) {
    console.error('Polish story AI prompt error:', error)
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.issues }, 400)
    }

    const message = error instanceof Error ? error.message : 'Internal server error'
    const status = message === 'AI service is not configured' ? 503 : 500
    return c.json({ error: message }, status)
  }
})

stories.get('/admin/stories/ai/models', async (c) => {
  try {
    const data = await fetchStoryAiModels()
    return c.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('Story AI models error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    const status = message === 'AI service is not configured' ? 503 : 500
    return c.json({ error: message }, status)
  }
})

export default stories
