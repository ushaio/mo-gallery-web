import 'server-only'
import { Hono } from 'hono'
import { db, friendLinks } from '~/server/lib/drizzle'
import { authMiddleware, AuthVariables } from './middleware/auth'
import { z } from 'zod'
import { eq, desc, asc } from 'drizzle-orm'

const friends = new Hono<{ Variables: AuthVariables }>()

// Validation schemas
const CreateFriendLinkSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url().max(500),
  description: z.string().max(500).optional().nullable(),
  avatar: z.string().url().max(500).optional().nullable(),
  featured: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
})

const UpdateFriendLinkSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  url: z.string().url().max(500).optional(),
  description: z.string().max(500).optional().nullable(),
  avatar: z.string().url().max(500).optional().nullable(),
  featured: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
})

// Public endpoint - Get active friend links
friends.get('/friends', async (c) => {
  try {
    const friendLinksList = await db
      .select()
      .from(friendLinks)
      .where(eq(friendLinks.isActive, true))
      .orderBy(desc(friendLinks.featured), asc(friendLinks.sortOrder), desc(friendLinks.createdAt))

    return c.json({
      success: true,
      data: friendLinksList,
    })
  } catch (error) {
    console.error('Get friend links error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Protected admin endpoints
friends.use('/admin/*', authMiddleware)

// Get all friend links (admin)
friends.get('/admin/friends', async (c) => {
  try {
    const friendLinksList = await db
      .select()
      .from(friendLinks)
      .orderBy(asc(friendLinks.sortOrder), desc(friendLinks.createdAt))

    return c.json({
      success: true,
      data: friendLinksList,
    })
  } catch (error) {
    console.error('Get admin friend links error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Create friend link (admin)
friends.post('/admin/friends', async (c) => {
  try {
    const body = await c.req.json()
    const validated = CreateFriendLinkSchema.parse(body)

    const [friendLink] = await db.insert(friendLinks)
      .values(validated)
      .returning()

    return c.json({
      success: true,
      data: friendLink,
    })
  } catch (error) {
    console.error('Create friend link error:', error)
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.issues }, 400)
    }
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Reorder friend links (admin) - MUST be before /:id route
friends.patch('/admin/friends/reorder', async (c) => {
  try {
    const body = await c.req.json()
    const { items } = body as { items: { id: string; sortOrder: number }[] }

    if (!Array.isArray(items)) {
      return c.json({ error: 'Invalid items array' }, 400)
    }

    // Update each item's sort order
    await Promise.all(
      items.map((item) =>
        db.update(friendLinks)
          .set({ sortOrder: item.sortOrder, updatedAt: new Date() })
          .where(eq(friendLinks.id, item.id))
      )
    )

    return c.json({
      success: true,
      message: 'Friend links reordered successfully',
    })
  } catch (error) {
    console.error('Reorder friend links error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Update friend link (admin)
friends.patch('/admin/friends/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const validated = UpdateFriendLinkSchema.parse(body)

    const [friendLink] = await db.update(friendLinks)
      .set({ ...validated, updatedAt: new Date() })
      .where(eq(friendLinks.id, id))
      .returning()

    return c.json({
      success: true,
      data: friendLink,
    })
  } catch (error) {
    console.error('Update friend link error:', error)
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.issues }, 400)
    }
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Delete friend link (admin)
friends.delete('/admin/friends/:id', async (c) => {
  try {
    const id = c.req.param('id')

    await db.delete(friendLinks)
      .where(eq(friendLinks.id, id))

    return c.json({
      success: true,
      message: 'Friend link deleted successfully',
    })
  } catch (error) {
    console.error('Delete friend link error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export default friends
