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
import { authMiddleware, AuthVariables } from './middleware/auth'

const blogs = new Hono<{ Variables: AuthVariables }>()

// Validation schemas
const CreateBlogSchema = z.object({
  ...ArticleContentShape,
  editorType: EditorTypeSchema,
  title: z.string().min(1).max(200),
  category: z.string().default('未分类'),
  tags: z.string().default(''),
  isPublished: z.boolean().default(false),
}).strict().superRefine(validateArticleContent)

const UpdateBlogSchema = z.object({
  ...ArticleContentShape,
  title: z.string().min(1).max(200).optional(),
  category: z.string().optional(),
  tags: z.string().optional(),
  isPublished: z.boolean().optional(),
}).strict().superRefine(validateArticleContent)

// Public endpoints - Get published blogs
blogs.get('/blogs', async (c) => {
  try {
    const limit = c.req.query('limit')
    const limitNum = limit ? parseInt(limit) : undefined

    const blogsList = await db.blog.findMany({
      where: { isPublished: true },
      include: ARTICLE_CONTENT_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: limitNum,
    })

    return c.json({
      success: true,
      data: blogsList.map((blog) => mapArticleContent(blog)),
    })
  } catch (error) {
    console.error('Get blogs error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Public endpoint - Get single blog
blogs.get('/blogs/:id', async (c) => {
  try {
    const id = c.req.param('id')

    const blog = await db.blog.findUnique({
      where: { id, isPublished: true },
      include: ARTICLE_CONTENT_INCLUDE,
    })

    if (!blog) {
      return c.json({ error: 'Blog not found' }, 404)
    }

    return c.json({
      success: true,
      data: mapArticleContent(blog),
    })
  } catch (error) {
    console.error('Get blog error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Public endpoint - Get blog categories
blogs.get('/blogs/categories/list', async (c) => {
  try {
    const categories = await db.blog.findMany({
      where: { isPublished: true },
      select: { category: true },
      distinct: ['category'],
    })

    const categoryList = categories.map(c => c.category).filter(Boolean)

    return c.json({
      success: true,
      data: categoryList,
    })
  } catch (error) {
    console.error('Get blog categories error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Protected admin endpoints
blogs.use('/admin/*', authMiddleware)

// Get all blogs (admin)
blogs.get('/admin/blogs', async (c) => {
  try {
    const blogsList = await db.blog.findMany({
      orderBy: { createdAt: 'desc' },
      include: ARTICLE_CONTENT_INCLUDE,
    })

    return c.json({
      success: true,
      data: blogsList.map((blog) => mapArticleContent(blog, true)),
    })
  } catch (error) {
    console.error('Get admin blogs error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Get a single blog (admin)
blogs.get('/admin/blogs/:id', async (c) => {
  try {
    const blog = await db.blog.findUnique({
      where: { id: c.req.param('id') },
      include: ARTICLE_CONTENT_INCLUDE,
    })
    if (!blog) return c.json({ error: 'Blog not found' }, 404)
    return c.json({ success: true, data: mapArticleContent(blog, true) })
  } catch (error) {
    console.error('Get admin blog error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Create blog (admin)
blogs.post('/admin/blogs', async (c) => {
  try {
    const body = await c.req.json()
    const validated = CreateBlogSchema.parse(body)

    const blog = await db.blog.create({
      data: {
        title: validated.title,
        category: validated.category,
        tags: validated.tags,
        isPublished: validated.isPublished,
        editorType: validated.editorType,
        contents: { create: articleContentData(validated) },
      },
      include: ARTICLE_CONTENT_INCLUDE,
    })

    return c.json({
      success: true,
      data: mapArticleContent(blog, true),
    })
  } catch (error) {
    console.error('Create blog error:', error)
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.issues }, 400)
    }
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Update blog (admin)
blogs.patch('/admin/blogs/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const validated = UpdateBlogSchema.parse(body)

    const updateData: Prisma.BlogUpdateInput = {}
    if (validated.title !== undefined) updateData.title = validated.title
    if (validated.category !== undefined) updateData.category = validated.category
    if (validated.tags !== undefined) updateData.tags = validated.tags
    if (validated.isPublished !== undefined) updateData.isPublished = validated.isPublished

    const editorType = validated.editorType
    const savesBody = hasArticleBody(validated)
    if (editorType !== undefined) {
      updateData.editorType = editorType
      if (savesBody) {
        const content = articleContentData({ ...validated, editorType })
        updateData.contents = {
          upsert: {
            where: { blogId_editorType: { blogId: id, editorType } },
            create: content,
            update: content,
          },
        }
      }
    }

    const blog = await db.$transaction(async (tx) => {
      if (editorType !== undefined && !savesBody) {
        const existing = await tx.blog.findUniqueOrThrow({
          where: { id },
          select: { contents: { where: { editorType }, select: { id: true } } },
        })
        if (existing.contents.length === 0) throw new MissingEditorContentError(editorType)
      }
      return tx.blog.update({
        where: { id },
        data: updateData,
        include: ARTICLE_CONTENT_INCLUDE,
      })
    }, ARTICLE_SAVE_TRANSACTION_OPTIONS)

    return c.json({
      success: true,
      data: mapArticleContent(blog, true),
    })
  } catch (error) {
    console.error('Update blog error:', error)
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.issues }, 400)
    }
    if (error instanceof MissingEditorContentError) {
      return c.json({ error: error.message, code: 'EDITOR_CONTENT_MISSING' }, 409)
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return c.json({ error: 'Blog not found' }, 404)
    }
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Delete blog (admin)
blogs.delete('/admin/blogs/:id', async (c) => {
  try {
    const id = c.req.param('id')

    await db.blog.delete({
      where: { id },
    })

    return c.json({
      success: true,
      message: 'Blog deleted successfully',
    })
  } catch (error) {
    console.error('Delete blog error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export default blogs
