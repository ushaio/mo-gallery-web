import 'server-only'
import { Hono } from 'hono'
import { db, comments as commentsTable, photos, settings as settingsTable } from '~/server/lib/drizzle'
import { authMiddleware, AuthVariables } from './middleware/auth'
import { verifyToken } from '~/server/lib/jwt'
import { z } from 'zod'
import { eq, and, desc, count } from 'drizzle-orm'

const comments = new Hono<{ Variables: AuthVariables }>()

// Environment config
const LINUXDO_COMMENTS_ONLY = process.env.LINUXDO_COMMENTS_ONLY === 'true'

// Validation schemas
const CreateCommentSchema = z.object({
  author: z.string().min(1).max(100).trim(),
  email: z.string().email().optional(),
  content: z.string().min(1).max(2000).trim(),
})

const UpdateCommentStatusSchema = z.object({
  status: z.enum(['approved', 'rejected']),
})

// Public endpoints - Get approved comments for a photo
comments.get('/photos/:photoId/comments', async (c) => {
  const photoId = c.req.param('photoId')

  const commentsList = await db
    .select({
      id: commentsTable.id,
      author: commentsTable.author,
      avatarUrl: commentsTable.avatarUrl,
      content: commentsTable.content,
      createdAt: commentsTable.createdAt,
    })
    .from(commentsTable)
    .where(and(
      eq(commentsTable.photoId, photoId),
      eq(commentsTable.status, 'approved')
    ))
    .orderBy(desc(commentsTable.createdAt))

  return c.json({ success: true, data: commentsList })
})

// Public endpoint - Submit a new comment
comments.post('/photos/:photoId/comments', async (c) => {
  const photoId = c.req.param('photoId')
  const body = await c.req.json()
  const validated = CreateCommentSchema.parse(body)

  let avatarUrl: string | undefined = undefined

  // Check if Linux DO only mode is enabled
  if (LINUXDO_COMMENTS_ONLY) {
    const authHeader = c.req.header('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Login required to comment' }, 401)
    }

    try {
      const payload = verifyToken(authHeader.substring(7))
      // Allow admin users to comment even without Linux DO binding
      const isAdmin = payload.isAdmin === true
      if (!isAdmin && payload.oauthProvider !== 'linuxdo') {
        return c.json({ error: 'Linux DO account required to comment' }, 403)
      }
      // Get avatar URL from token payload or fetch from user record
      avatarUrl = payload.avatarUrl
    } catch {
      return c.json({ error: 'Invalid token' }, 401)
    }
  } else {
    // For non-Linux DO mode, check if user is logged in and get avatar
    const authHeader = c.req.header('Authorization')
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const payload = verifyToken(authHeader.substring(7))
        avatarUrl = payload.avatarUrl
      } catch {
        // Ignore token errors for non-required auth
      }
    }
  }

  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown'

  const photo = await db.select().from(photos).where(eq(photos.id, photoId)).limit(1)
  if (photo.length === 0) {
    return c.json({ error: 'Photo not found' }, 404)
  }

  const moderationSetting = await db.select().from(settingsTable).where(eq(settingsTable.key, 'comment_moderation')).limit(1)
  const requiresModeration = moderationSetting[0]?.value === 'true'

  const [comment] = await db.insert(commentsTable)
    .values({
      photoId,
      author: validated.author,
      email: validated.email,
      avatarUrl,
      content: validated.content,
      status: requiresModeration ? 'pending' : 'approved',
      ip,
    })
    .returning()

  return c.json({
    success: true,
    data: {
      id: comment.id,
      author: comment.author,
      avatarUrl: comment.avatarUrl,
      content: comment.content,
      createdAt: comment.createdAt.toISOString(),
      status: comment.status,
    },
    message: requiresModeration
      ? 'Comment submitted and pending approval'
      : 'Comment posted successfully',
  })
})

// Protected admin endpoints
comments.use('/admin/*', authMiddleware)

// Get all comments (admin)
comments.get('/admin/comments', async (c) => {
  const status = c.req.query('status')
  const photoId = c.req.query('photoId')
  const page = parseInt(c.req.query('page') || '1')
  const limitNum = parseInt(c.req.query('limit') || '20')
  const skip = (page - 1) * limitNum

  const conditions = []
  if (status) conditions.push(eq(commentsTable.status, status))
  if (photoId) conditions.push(eq(commentsTable.photoId, photoId))

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  const [totalResult, commentsList] = await Promise.all([
    db.select({ count: count() }).from(commentsTable).where(whereClause),
    db.select({
      id: commentsTable.id,
      photoId: commentsTable.photoId,
      author: commentsTable.author,
      email: commentsTable.email,
      avatarUrl: commentsTable.avatarUrl,
      content: commentsTable.content,
      status: commentsTable.status,
      ip: commentsTable.ip,
      createdAt: commentsTable.createdAt,
      updatedAt: commentsTable.updatedAt,
      photo: {
        id: photos.id,
        title: photos.title,
      },
    })
    .from(commentsTable)
    .leftJoin(photos, eq(commentsTable.photoId, photos.id))
    .where(whereClause)
    .orderBy(desc(commentsTable.createdAt))
    .limit(limitNum)
    .offset(skip)
  ])

  const total = totalResult[0]?.count || 0

  return c.json({
    success: true,
    data: commentsList,
    meta: {
      total,
      page,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    },
  })
})

// Update comment status (admin)
comments.patch('/admin/comments/:id/status', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const validated = UpdateCommentStatusSchema.parse(body)

  const [comment] = await db.update(commentsTable)
    .set({ 
      status: validated.status,
      updatedAt: new Date(),
    })
    .where(eq(commentsTable.id, id))
    .returning()

  return c.json({ success: true, data: comment })
})

// Delete comment (admin)
comments.delete('/admin/comments/:id', async (c) => {
  const id = c.req.param('id')
  await db.delete(commentsTable).where(eq(commentsTable.id, id))
  return c.json({ success: true, message: 'Comment deleted successfully' })
})

export default comments
