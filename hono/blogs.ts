import 'server-only'
import { Hono } from 'hono'
import { db, blogs as blogsTable } from '~/server/lib/drizzle'
import { authMiddleware, AuthVariables } from './middleware/auth'
import { z } from 'zod'
import { eq, and, desc, sql } from 'drizzle-orm'

const blogs = new Hono<{ Variables: AuthVariables }>()

// Validation schemas
const CreateBlogSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(50000),
  category: z.string().default('未分类'),
  tags: z.string().default(''),
  isPublished: z.boolean().default(false),
})

const UpdateBlogSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).max(50000).optional(),
  category: z.string().optional(),
  tags: z.string().optional(),
  isPublished: z.boolean().optional(),
})

// Public endpoints - Get published blogs
blogs.get('/blogs', async (c) => {
  try {
    const limit = c.req.query('limit')
    const limitNum = limit ? parseInt(limit) : undefined

    let query = db
      .select()
      .from(blogsTable)
      .where(eq(blogsTable.isPublished, true))
      .orderBy(desc(blogsTable.createdAt))

    if (limitNum) {
      query = query.limit(limitNum) as typeof query
    }

    const blogsList = await query

    return c.json({
      success: true,
      data: blogsList,
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

    const [blog] = await db
      .select()
      .from(blogsTable)
      .where(and(
        eq(blogsTable.id, id),
        eq(blogsTable.isPublished, true)
      ))
      .limit(1)

    if (!blog) {
      return c.json({ error: 'Blog not found' }, 404)
    }

    return c.json({
      success: true,
      data: blog,
    })
  } catch (error) {
    console.error('Get blog error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Public endpoint - Get blog categories
blogs.get('/blogs/categories/list', async (c) => {
  try {
    const categories = await db
      .selectDistinct({ category: blogsTable.category })
      .from(blogsTable)
      .where(eq(blogsTable.isPublished, true))

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
    const blogsList = await db
      .select()
      .from(blogsTable)
      .orderBy(desc(blogsTable.createdAt))

    return c.json({
      success: true,
      data: blogsList,
    })
  } catch (error) {
    console.error('Get admin blogs error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Create blog (admin)
blogs.post('/admin/blogs', async (c) => {
  try {
    const body = await c.req.json()
    const validated = CreateBlogSchema.parse(body)

    const [blog] = await db.insert(blogsTable)
      .values(validated)
      .returning()

    return c.json({
      success: true,
      data: blog,
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

    const [blog] = await db.update(blogsTable)
      .set({ ...validated, updatedAt: new Date() })
      .where(eq(blogsTable.id, id))
      .returning()

    return c.json({
      success: true,
      data: blog,
    })
  } catch (error) {
    console.error('Update blog error:', error)
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.issues }, 400)
    }
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Delete blog (admin)
blogs.delete('/admin/blogs/:id', async (c) => {
  try {
    const id = c.req.param('id')

    await db.delete(blogsTable)
      .where(eq(blogsTable.id, id))

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
