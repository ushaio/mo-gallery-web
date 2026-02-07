import 'server-only'
import { Hono } from 'hono'
import { db, cameras, lenses, photos } from '~/server/lib/drizzle'
import { authMiddleware, AuthVariables } from './middleware/auth'
import { eq, sql } from 'drizzle-orm'

const equipment = new Hono<{ Variables: AuthVariables }>()

/**
 * 获取所有相机列表（公开 API）
 * 用于筛选下拉
 */
equipment.get('/cameras', async (c) => {
  try {
    const camerasList = await db
      .select({
        id: cameras.id,
        name: cameras.name,
        photoCount: sql<number>`cast(count(${photos.id}) as int)`,
      })
      .from(cameras)
      .leftJoin(photos, eq(cameras.id, photos.cameraId))
      .groupBy(cameras.id, cameras.name)
      .orderBy(cameras.name)

    const data = camerasList.map((camera) => ({
      id: camera.id,
      name: camera.name,
      displayName: camera.name,
      photoCount: camera.photoCount,
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
    const lensesList = await db
      .select({
        id: lenses.id,
        name: lenses.name,
        photoCount: sql<number>`cast(count(${photos.id}) as int)`,
      })
      .from(lenses)
      .leftJoin(photos, eq(lenses.id, photos.lensId))
      .groupBy(lenses.id, lenses.name)
      .orderBy(lenses.name)

    const data = lensesList.map((lens) => ({
      id: lens.id,
      name: lens.name,
      displayName: lens.name,
      photoCount: lens.photoCount,
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
    
    const [camera] = await db
      .select({
        id: cameras.id,
        name: cameras.name,
        photoCount: sql<number>`cast(count(${photos.id}) as int)`,
      })
      .from(cameras)
      .leftJoin(photos, eq(cameras.id, photos.cameraId))
      .where(eq(cameras.id, id))
      .groupBy(cameras.id, cameras.name)
      .limit(1)

    if (!camera) {
      return c.json({ error: 'Camera not found' }, 404)
    }

    return c.json({
      success: true,
      data: {
        id: camera.id,
        name: camera.name,
        displayName: camera.name,
        photoCount: camera.photoCount,
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
    
    const [lens] = await db
      .select({
        id: lenses.id,
        name: lenses.name,
        photoCount: sql<number>`cast(count(${photos.id}) as int)`,
      })
      .from(lenses)
      .leftJoin(photos, eq(lenses.id, photos.lensId))
      .where(eq(lenses.id, id))
      .groupBy(lenses.id, lenses.name)
      .limit(1)

    if (!lens) {
      return c.json({ error: 'Lens not found' }, 404)
    }

    return c.json({
      success: true,
      data: {
        id: lens.id,
        name: lens.name,
        displayName: lens.name,
        photoCount: lens.photoCount,
      },
    })
  } catch (error) {
    console.error('Get lens error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export default equipment