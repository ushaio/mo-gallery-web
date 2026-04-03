import 'server-only'
import { Hono } from 'hono'
import { db } from '~/server/lib/db'
import { authMiddleware, AuthVariables } from './middleware/auth'

const storageSources = new Hono<{ Variables: AuthVariables }>()

storageSources.use('/admin/storage-sources/*', authMiddleware)
storageSources.use('/admin/storage-sources', authMiddleware)

// List all storage sources
storageSources.get('/admin/storage-sources', async (c) => {
  const sources = await db.storageSource.findMany({
    orderBy: { createdAt: 'asc' },
  })
  return c.json({ success: true, data: sources })
})

// Create a storage source
storageSources.post('/admin/storage-sources', async (c) => {
  const body = await c.req.json()
  const { name, type, accessKey, secretKey, bucket, region, endpoint, publicUrl, basePath, branch, accessMethod } = body

  if (!name || !type) {
    return c.json({ error: 'name and type are required' }, 400)
  }
  if (!['local', 'github', 's3'].includes(type)) {
    return c.json({ error: 'type must be local, github, or s3' }, 400)
  }

  // Local: only one instance allowed
  if (type === 'local') {
    const existing = await db.storageSource.findFirst({ where: { type: 'local' } })
    if (existing) {
      return c.json({ error: 'A local storage source already exists' }, 409)
    }
  }

  const source = await db.storageSource.create({
    data: {
      name,
      type,
      accessKey: accessKey || null,
      secretKey: secretKey || null,
      bucket: bucket || null,
      region: region || null,
      endpoint: endpoint || null,
      publicUrl: publicUrl || null,
      basePath: basePath || null,
      branch: branch || null,
      accessMethod: accessMethod || null,
    },
  })

  return c.json({ success: true, data: source }, 201)
})

// Update a storage source
storageSources.patch('/admin/storage-sources/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()

  const source = await db.storageSource.findUnique({ where: { id } })
  if (!source) return c.json({ error: 'Not found' }, 404)

  const { name, accessKey, secretKey, bucket, region, endpoint, publicUrl, basePath, branch, accessMethod } = body

  const updated = await db.storageSource.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(accessKey !== undefined && { accessKey: accessKey || null }),
      ...(secretKey !== undefined && { secretKey: secretKey || null }),
      ...(bucket !== undefined && { bucket: bucket || null }),
      ...(region !== undefined && { region: region || null }),
      ...(endpoint !== undefined && { endpoint: endpoint || null }),
      ...(publicUrl !== undefined && { publicUrl: publicUrl || null }),
      ...(basePath !== undefined && { basePath: basePath || null }),
      ...(branch !== undefined && { branch: branch || null }),
      ...(accessMethod !== undefined && { accessMethod: accessMethod || null }),
    },
  })

  return c.json({ success: true, data: updated })
})

// Delete a storage source
storageSources.delete('/admin/storage-sources/:id', async (c) => {
  const id = c.req.param('id')

  const source = await db.storageSource.findUnique({ where: { id } })
  if (!source) return c.json({ error: 'Not found' }, 404)

  await db.storageSource.delete({ where: { id } })
  return c.json({ success: true })
})

export default storageSources
