import 'server-only'
import { Hono } from 'hono'
import { db } from '~/server/lib/db'
import { authMiddleware, AuthVariables } from './middleware/auth'

type Cursor = { updatedAt: string; id: string }
const changes = new Hono<{ Variables: AuthVariables }>()

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url')
}

function decodeCursor(value: string | undefined): Cursor | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<Cursor>
    if (typeof parsed.updatedAt !== 'string' || typeof parsed.id !== 'string') return null
    if (!Number.isFinite(Date.parse(parsed.updatedAt)) || !parsed.id) return null
    return { updatedAt: parsed.updatedAt, id: parsed.id }
  } catch {
    return null
  }
}

changes.get('/admin/photos/changes', authMiddleware, async (c) => {
  const cursorValue = c.req.query('cursor')
  const cursor = decodeCursor(cursorValue)
  if (cursorValue && !cursor) return c.json({ error: 'Invalid cursor' }, 400)
  const requestedLimit = Number.parseInt(c.req.query('limit') ?? '200', 10)
  const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 200, 1), 500)

  const changesPage = await db.photoChange.findMany({
    where: cursor ? {
      OR: [
        { updatedAt: { gt: new Date(cursor.updatedAt) } },
        { updatedAt: new Date(cursor.updatedAt), id: { gt: cursor.id } },
      ],
    } : undefined,
    orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
    take: limit + 1,
  })
  const hasMore = changesPage.length > limit
  const page = hasMore ? changesPage.slice(0, limit) : changesPage
  const last = page.at(-1)
  return c.json({
    success: true,
    data: {
      items: page.map((item) => ({
        id: item.photoId,
        path: item.path,
        thumbPath: item.thumbPath,
        storageSourceId: item.storageSourceId,
        storagePluginId: item.storagePluginId,
        storageUrlType: item.storageUrlType,
        updatedAt: item.updatedAt.toISOString(),
        deletedAt: item.deletedAt?.toISOString() ?? null,
      })),
      nextCursor: last ? encodeCursor({ updatedAt: last.updatedAt.toISOString(), id: last.id }) : (cursorValue ?? null),
      hasMore,
    },
  })
})

export default changes
