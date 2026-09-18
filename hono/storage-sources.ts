import 'server-only'
import { Hono } from 'hono'
import { db } from '~/server/lib/db'
import { authMiddleware, AuthVariables } from './middleware/auth'
import {
  encryptStoredSecret,
  redactStoredSecret,
  REDACTED_SECRET,
} from '~/server/lib/stored-secrets'
import { invalidatePhotoUrlCache } from '~/server/lib/photo-urls'

const storageSources = new Hono<{ Variables: AuthVariables }>()

function serializeSource<T extends { accessKey: string | null; secretKey: string | null }>(source: T) {
  return {
    ...source,
    accessKey: redactStoredSecret(source.accessKey),
    secretKey: redactStoredSecret(source.secretKey),
  }
}

storageSources.use('/admin/storage-sources/*', authMiddleware)
storageSources.use('/admin/storage-sources', authMiddleware)

// List all storage sources
storageSources.get('/admin/storage-sources', async (c) => {
  const sources = await db.storageSource.findMany({
    orderBy: { createdAt: 'asc' },
  })
  return c.json({ success: true, data: sources.map(serializeSource) })
})

storageSources.get('/admin/storage-sources/:id', async (c) => {
  const source = await db.storageSource.findUnique({ where: { id: c.req.param('id') } })
  if (!source) return c.json({ error: 'Not found' }, 404)
  return c.json({ success: true, data: serializeSource(source) })
})

// Normalize an incoming vendor id. Kept free-form (rather than a closed enum)
// because new providers appear faster than we can fingerprint them, and the
// Desktop may explicitly name one we do not know yet.
function normalizeVendor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().toLowerCase()
  return trimmed || null
}

// Types that are already unambiguous get their vendor derived, so both ends
// store the same string: the Desktop labels a GitHub source 'github' via
// InferVendor, and a source left vendor-less here would disagree with it.
// S3-compatible products cannot be told apart without the endpoint (which the
// Desktop fingerprints), so s3 is left to the explicit value rather than guessed.
function defaultVendorForType(type: string): string | null {
  if (type === 'github') return 'github'
  if (type === 'local') return 'local'
  return null
}

// Create a storage source
storageSources.post('/admin/storage-sources', async (c) => {
  const body = await c.req.json()
  const { id, name, type, vendor, accessKey, secretKey, bucket, region, endpoint, publicUrl, basePath, branch, accessMethod } = body

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

  // An explicit id is used when a Desktop plugin source mirrors its public
  // config to the cloud so photos registered by the Desktop resolve their URLs.
  if (id && await db.storageSource.findUnique({ where: { id } })) {
    return c.json({ error: 'Storage source with this id already exists' }, 409)
  }

  const source = await db.storageSource.create({
    data: {
      ...(id ? { id } : {}),
      name,
      type,
      vendor: normalizeVendor(vendor) ?? defaultVendorForType(type),
      accessKey: encryptStoredSecret(accessKey),
      secretKey: encryptStoredSecret(secretKey),
      bucket: bucket || null,
      region: region || null,
      endpoint: endpoint || null,
      publicUrl: publicUrl || null,
      basePath: basePath || null,
      branch: branch || null,
      accessMethod: accessMethod || null,
    },
  })

  // Photo URLs are derived from the source configuration. Clear any cached
  // source config so newly registered photos and existing links see the same
  // base URL immediately.
  invalidatePhotoUrlCache()

  return c.json({ success: true, data: serializeSource(source) }, 201)
})

// Update a storage source
storageSources.patch('/admin/storage-sources/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()

  const source = await db.storageSource.findUnique({ where: { id } })
  if (!source) return c.json({ error: 'Not found' }, 404)

  const { name, vendor, accessKey, secretKey, bucket, region, endpoint, publicUrl, basePath, branch, accessMethod } = body

  const updated = await db.storageSource.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(vendor !== undefined && { vendor: normalizeVendor(vendor) }),
      ...(accessKey !== undefined && accessKey !== REDACTED_SECRET
        && { accessKey: encryptStoredSecret(accessKey) }),
      ...(secretKey !== undefined && secretKey !== REDACTED_SECRET
        && { secretKey: encryptStoredSecret(secretKey) }),
      ...(bucket !== undefined && { bucket: bucket || null }),
      ...(region !== undefined && { region: region || null }),
      ...(endpoint !== undefined && { endpoint: endpoint || null }),
      ...(publicUrl !== undefined && { publicUrl: publicUrl || null }),
      ...(basePath !== undefined && { basePath: basePath || null }),
      ...(branch !== undefined && { branch: branch || null }),
      ...(accessMethod !== undefined && { accessMethod: accessMethod || null }),
    },
  })

  // Existing Photo rows keep only relative paths and this source id. The next
  // URL resolution must use the updated public address/branch/path prefix.
  invalidatePhotoUrlCache()

  return c.json({ success: true, data: serializeSource(updated) })
})

// Delete a storage source
storageSources.delete('/admin/storage-sources/:id', async (c) => {
  const id = c.req.param('id')

  const source = await db.storageSource.findUnique({ where: { id } })
  if (!source) return c.json({ error: 'Not found' }, 404)

  const photoCount = await db.photo.count({
    where: { storageSourceId: id },
  })
  if (photoCount > 0) {
    return c.json(
      { error: `Storage source is still used by ${photoCount} photo(s)` },
      409
    )
  }

  await db.storageSource.delete({ where: { id } })
  invalidatePhotoUrlCache()
  return c.json({ success: true })
})

export default storageSources
