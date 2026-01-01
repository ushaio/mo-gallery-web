import 'server-only'
import { Hono } from 'hono'
import { db } from '~/server/lib/db'
import { authMiddleware, AuthVariables } from './middleware/auth'
import { verifyToken } from '~/server/lib/jwt'
import { z } from 'zod'

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

// Get comment settings (public)
comments.get('/comments/settings', (c) => {
  return c.json({
    success: true,
    data: {
      linuxdoOnly: LINUXDO_COMMENTS_ONLY,
    },
  })
})

// Public endpoints - Get approved comments for a photo
comments.get('/photos/:photoId/comments', async (c) => {
  const photoId = c.req.param('photoId')

  const commentsList = await db.comment.findMany({
    where: { photoId, status: 'approved' },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      author: true,
      content: true,
      createdAt: true,
    },
  })

  return c.json({ success: true, data: commentsList })
})

// Public endpoint - Submit a new comment
comments.post('/photos/:photoId/comments', async (c) => {
  const photoId = c.req.param('photoId')
  const body = await c.req.json()
  const validated = CreateCommentSchema.parse(body)

  // Check if Linux DO only mode is enabled
  if (LINUXDO_COMMENTS_ONLY) {
    const authHeader = c.req.header('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Login required to comment' }, 401)
    }

    try {
      const payload = verifyToken(authHeader.substring(7))
      if (payload.oauthProvider !== 'linuxdo') {
        return c.json({ error: 'Linux DO account required to comment' }, 403)
      }
    } catch {
      return c.json({ error: 'Invalid token' }, 401)
    }
  }

  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown'

  const photo = await db.photo.findUnique({ where: { id: photoId } })
  if (!photo) {
    return c.json({ error: 'Photo not found' }, 404)
  }

  const moderationSetting = await db.setting.findUnique({
    where: { key: 'comment_moderation' },
  })
  const requiresModeration = moderationSetting?.value === 'true'

  const comment = await db.comment.create({
    data: {
      photoId,
      author: validated.author,
      email: validated.email,
      content: validated.content,
      status: requiresModeration ? 'pending' : 'approved',
      ip,
    },
  })

  return c.json({
    success: true,
    data: {
      id: comment.id,
      author: comment.author,
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
  const limit = parseInt(c.req.query('limit') || '20')
  const skip = (page - 1) * limit

  const where: Record<string, string> = {}
  if (status) where.status = status
  if (photoId) where.photoId = photoId

  const [total, commentsList] = await Promise.all([
    db.comment.count({ where }),
    db.comment.findMany({
      where,
      include: {
        photo: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
  ])

  return c.json({
    success: true,
    data: commentsList,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  })
})

// Update comment status (admin)
comments.patch('/admin/comments/:id/status', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const validated = UpdateCommentStatusSchema.parse(body)

  const comment = await db.comment.update({
    where: { id },
    data: { status: validated.status },
  })

  return c.json({ success: true, data: comment })
})

// Delete comment (admin)
comments.delete('/admin/comments/:id', async (c) => {
  const id = c.req.param('id')
  await db.comment.delete({ where: { id } })
  return c.json({ success: true, message: 'Comment deleted successfully' })
})

export default comments
