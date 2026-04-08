import 'server-only'
import { Hono } from 'hono'
import { db } from '~/server/lib/db'
import { authMiddleware, AuthVariables } from './middleware/auth'
import { z } from 'zod'
import { Prisma } from '@prisma/client'

const filmRolls = new Hono<{ Variables: AuthVariables }>()

const FilmRollSchema = z.object({
  name: z.string().min(1).max(200),
  brand: z.string().min(1).max(100),
  iso: z.number().int().min(1).max(102400),
  frameCount: z.number().int().min(1).max(1000),
  notes: z.string().max(2000).optional().nullable(),
  shootDate: z.string().datetime({ offset: true }).optional().nullable(),
  endDate: z.string().datetime({ offset: true }).optional().nullable(),
})

const UpdateFilmRollSchema = FilmRollSchema.partial()

// Auth for admin routes
filmRolls.use('/admin/*', authMiddleware)

// Public: list all film rolls (with photo count)
filmRolls.get('/film-rolls', async (c) => {
  try {
    const rolls = await db.filmRoll.findMany({
      orderBy: [{ shootDate: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      include: {
        _count: { select: { filmPhotos: true } },
      },
    })

    const data = rolls.map((r) => ({
      ...r,
      shootDate: r.shootDate?.toISOString() ?? null,
      endDate: r.endDate?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      photoCount: r._count.filmPhotos,
      _count: undefined,
    }))

    return c.json({ success: true, data })
  } catch (error) {
    console.error('List film rolls error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Public: get single film roll with photos
filmRolls.get('/film-rolls/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const roll = await db.filmRoll.findUnique({
      where: { id },
      include: {
        filmPhotos: {
          orderBy: { frameNumber: 'asc' },
          include: {
            photo: {
              include: { categories: true, camera: true, lens: true },
            },
          },
        },
      },
    })

    if (!roll) {
      return c.json({ error: 'Film roll not found' }, 404)
    }

    const data = {
      ...roll,
      shootDate: roll.shootDate?.toISOString() ?? null,
      endDate: roll.endDate?.toISOString() ?? null,
      createdAt: roll.createdAt.toISOString(),
      updatedAt: roll.updatedAt.toISOString(),
      filmPhotos: roll.filmPhotos.map((fp) => ({
        ...fp,
        createdAt: fp.createdAt.toISOString(),
        photo: {
          ...fp.photo,
          category: fp.photo.categories.map((c) => c.name).join(','),
          dominantColors: fp.photo.dominantColors ? JSON.parse(fp.photo.dominantColors) : null,
          createdAt: fp.photo.createdAt.toISOString(),
          takenAt: fp.photo.takenAt?.toISOString() ?? undefined,
          categories: undefined,
        },
      })),
    }

    return c.json({ success: true, data })
  } catch (error) {
    console.error('Get film roll error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Admin: create film roll
filmRolls.post('/admin/film-rolls', async (c) => {
  try {
    const body = await c.req.json()
    const parsed = FilmRollSchema.parse(body)

    const roll = await db.filmRoll.create({
      data: {
        name: parsed.name,
        brand: parsed.brand,
        iso: parsed.iso,
        frameCount: parsed.frameCount,
        notes: parsed.notes ?? null,
        shootDate: parsed.shootDate ? new Date(parsed.shootDate) : null,
        endDate: parsed.endDate ? new Date(parsed.endDate) : null,
      },
    })

    return c.json({
      success: true,
      data: {
        ...roll,
        shootDate: roll.shootDate?.toISOString() ?? null,
        endDate: roll.endDate?.toISOString() ?? null,
        createdAt: roll.createdAt.toISOString(),
        updatedAt: roll.updatedAt.toISOString(),
        photoCount: 0,
      },
    }, 201)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.issues }, 400)
    }
    console.error('Create film roll error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Admin: update film roll
filmRolls.patch('/admin/film-rolls/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const parsed = UpdateFilmRollSchema.parse(body)

    const roll = await db.filmRoll.update({
      where: { id },
      data: {
        ...(parsed.name !== undefined && { name: parsed.name }),
        ...(parsed.brand !== undefined && { brand: parsed.brand }),
        ...(parsed.iso !== undefined && { iso: parsed.iso }),
        ...(parsed.frameCount !== undefined && { frameCount: parsed.frameCount }),
        ...(parsed.notes !== undefined && { notes: parsed.notes }),
        ...('shootDate' in parsed && { shootDate: parsed.shootDate ? new Date(parsed.shootDate) : null }),
        ...('endDate' in parsed && { endDate: parsed.endDate ? new Date(parsed.endDate) : null }),
      },
      include: { _count: { select: { filmPhotos: true } } },
    })

    return c.json({
      success: true,
      data: {
        ...roll,
        shootDate: roll.shootDate?.toISOString() ?? null,
        endDate: roll.endDate?.toISOString() ?? null,
        createdAt: roll.createdAt.toISOString(),
        updatedAt: roll.updatedAt.toISOString(),
        photoCount: roll._count.filmPhotos,
        _count: undefined,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.issues }, 400)
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return c.json({ error: 'Film roll not found' }, 404)
    }
    console.error('Update film roll error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Admin: delete film roll (cascades to FilmPhoto, NOT to Photo)
filmRolls.delete('/admin/film-rolls/:id', async (c) => {
  try {
    const id = c.req.param('id')
    await db.filmRoll.delete({ where: { id } })
    return c.json({ success: true })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return c.json({ error: 'Film roll not found' }, 404)
    }
    console.error('Delete film roll error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export default filmRolls
