import 'server-only'
import { Hono } from 'hono'
import { db } from '~/server/lib/db'
import { authMiddleware, AuthVariables } from './middleware/auth'

const equipment = new Hono<{ Variables: AuthVariables }>()

/**
 * 获取所有相机列表（公开 API）
 * 用于筛选下拉
 */
equipment.get('/cameras', async (c) => {
  try {
    const cameras = await db.camera.findMany({
      orderBy: [{ name: 'asc' }],
      select: {
        id: true,
        name: true,
        _count: {
          select: { photos: true },
        },
      },
    })

    const data = cameras.map((camera) => ({
      id: camera.id,
      name: camera.name,
      displayName: camera.name,
      photoCount: camera._count.photos,
    }))

    return c.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('Get cameras error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

/**
 * 获取所有镜头列表（公开 API）
 * 用于筛选下拉
 */
equipment.get('/lenses', async (c) => {
  try {
    const lenses = await db.lens.findMany({
      orderBy: [{ name: 'asc' }],
      select: {
        id: true,
        name: true,
        _count: {
          select: { photos: true },
        },
      },
    })

    const data = lenses.map((lens) => ({
      id: lens.id,
      name: lens.name,
      displayName: lens.name,
      photoCount: lens._count.photos,
    }))

    return c.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('Get lenses error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Protected endpoints for admin
equipment.use('/admin/*', authMiddleware)

/**
 * 获取相机详情
 */
equipment.get('/admin/cameras/:id', async (c) => {
  try {
    const id = c.req.param('id')

    const camera = await db.camera.findUnique({
      where: { id },
      include: {
        _count: {
          select: { photos: true },
        },
      },
    })

    if (!camera) {
      return c.json({ error: 'Camera not found' }, 404)
    }

    return c.json({
      success: true,
      data: {
        id: camera.id,
        name: camera.name,
        displayName: camera.name,
        photoCount: camera._count.photos,
      },
    })
  } catch (error) {
    console.error('Get camera error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

/**
 * 获取镜头详情
 */
equipment.get('/admin/lenses/:id', async (c) => {
  try {
    const id = c.req.param('id')

    const lens = await db.lens.findUnique({
      where: { id },
      include: {
        _count: {
          select: { photos: true },
        },
      },
    })

    if (!lens) {
      return c.json({ error: 'Lens not found' }, 404)
    }

    return c.json({
      success: true,
      data: {
        id: lens.id,
        name: lens.name,
        displayName: lens.name,
        photoCount: lens._count.photos,
      },
    })
  } catch (error) {
    console.error('Get lens error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export default equipment
