/**
 * Backfill real thumbnails for photos whose thumbnailUrl points at the
 * original file (legacy compress-mode uploads reused the compressed original
 * as the "thumbnail", which puts 12MP images into the gallery grid — each
 * costs 300-400ms of decode when scrolled into view and freezes scrolling).
 *
 * For every photo with thumbnailUrl missing or equal to url:
 *   download original -> 800px AVIF q72 (same recipe as
 *   server/lib/image-processing.ts generateThumbnailBuffer) -> upload as
 *   thumb-<name>.avif next to the original -> update Photo.thumbnailUrl.
 *
 * Originals are never modified. Rollback: set thumbnailUrl back to url and
 * delete the thumb-* objects (the script prints every write it makes).
 *
 * Usage:
 *   npx tsx scripts/backfill-thumbnails.ts           # dry run (read-only)
 *   npx tsx scripts/backfill-thumbnails.ts --apply   # actually write
 */
import fs from 'node:fs'
import path from 'node:path'
import posix from 'node:path/posix'
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { PrismaPg } from '@prisma/adapter-pg'
import sharp from 'sharp'
import { PrismaClient } from '../src/generated/prisma/client'

const APPLY = process.argv.includes('--apply')
const CONCURRENCY = 3
const THUMBNAIL_SIZE = 800
const THUMBNAIL_AVIF_QUALITY = 72

// dotenv is not a direct dependency; parse .env the simple way.
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!match) continue
    const key = match[1]
    let value = match[2]
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
}

interface S3Target {
  client: S3Client
  bucket: string
  publicUrl: string
}

function normalizeKeyCandidate(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  const normalized = value.replace(/\\/g, '/').trim()
  if (!normalized) return undefined
  if (/^https?:\/\//i.test(normalized)) {
    try {
      return decodeURIComponent(new URL(normalized).pathname.replace(/^\/+/, ''))
    } catch {
      return normalized
    }
  }
  return normalized.replace(/^\/+/, '')
}

function buildThumbnailKey(originalKey: string): string {
  const parsed = posix.parse(originalKey)
  const filename = `thumb-${parsed.name}.avif`
  return parsed.dir ? `${parsed.dir}/${filename}` : filename
}

async function main() {
  loadEnv()
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set')

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
  const prisma = new PrismaClient({ adapter })

  const photos = await prisma.photo.findMany({
    select: {
      id: true,
      title: true,
      url: true,
      thumbnailUrl: true,
      storageProvider: true,
      storageSourceId: true,
      storageKey: true,
      width: true,
      height: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  const targets = photos.filter((p) => !p.thumbnailUrl || p.thumbnailUrl === p.url)
  console.log(`photos total: ${photos.length}, need thumbnail backfill: ${targets.length}`)
  if (targets.length === 0) {
    await prisma.$disconnect()
    return
  }

  // Resolve S3 config per storage source (or legacy Setting table).
  const sources = await prisma.storageSource.findMany()
  const settings = Object.fromEntries((await prisma.setting.findMany()).map((s) => [s.key, s.value]))
  const s3Cache = new Map<string, S3Target>()

  function getS3Target(photo: (typeof targets)[number]): S3Target | { skip: string } {
    const cacheKey = photo.storageSourceId ?? `provider:${photo.storageProvider}`
    const cached = s3Cache.get(cacheKey)
    if (cached) return cached

    let cfg: { type: string; accessKey?: string | null; secretKey?: string | null; bucket?: string | null; region?: string | null; endpoint?: string | null; publicUrl?: string | null }
    if (photo.storageSourceId) {
      const source = sources.find((s) => s.id === photo.storageSourceId)
      if (!source) return { skip: `storage source ${photo.storageSourceId} not found` }
      cfg = source
    } else {
      cfg = {
        type: settings.storage_provider || 'local',
        accessKey: settings.s3_access_key_id,
        secretKey: settings.s3_secret_access_key,
        bucket: settings.s3_bucket,
        endpoint: settings.s3_endpoint,
        publicUrl: settings.s3_public_url,
        region: undefined,
      }
    }

    if (cfg.type !== 's3') return { skip: `provider "${cfg.type}" not supported by this script` }
    if (!cfg.accessKey || !cfg.secretKey || !cfg.bucket || !cfg.endpoint || !cfg.publicUrl) {
      return { skip: 'incomplete s3 config' }
    }

    const target: S3Target = {
      client: new S3Client({
        region: cfg.region || 'auto',
        endpoint: cfg.endpoint,
        credentials: { accessKeyId: cfg.accessKey, secretAccessKey: cfg.secretKey },
      }),
      bucket: cfg.bucket,
      publicUrl: cfg.publicUrl.replace(/\/+$/, ''),
    }
    s3Cache.set(cacheKey, target)
    return target
  }

  let ok = 0
  let skipped = 0
  let failed = 0

  async function processPhoto(photo: (typeof targets)[number]) {
    const label = `${photo.title} (${photo.width}x${photo.height})`
    const target = getS3Target(photo)
    if ('skip' in target) {
      skipped++
      console.log(`SKIP  ${label}: ${target.skip}`)
      return
    }

    const originalKey = normalizeKeyCandidate(photo.storageKey) ?? normalizeKeyCandidate(photo.url)
    if (!originalKey) {
      skipped++
      console.log(`SKIP  ${label}: cannot derive storage key from "${photo.url}"`)
      return
    }
    const thumbKey = buildThumbnailKey(originalKey)
    const thumbUrl = `${target.publicUrl}/${thumbKey}`

    if (!APPLY) {
      let exists = false
      try {
        await target.client.send(new HeadObjectCommand({ Bucket: target.bucket, Key: thumbKey }))
        exists = true
      } catch {
        exists = false
      }
      console.log(`PLAN  ${label}`)
      console.log(`      ${originalKey} -> ${thumbKey}${exists ? '  (thumb object already exists, will overwrite)' : ''}`)
      ok++
      return
    }

    try {
      const res = await target.client.send(new GetObjectCommand({ Bucket: target.bucket, Key: originalKey }))
      const original = Buffer.from(await res.Body!.transformToByteArray())
      const thumb = await sharp(original)
        .rotate()
        .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: 'inside', withoutEnlargement: true })
        .avif({ quality: THUMBNAIL_AVIF_QUALITY })
        .toBuffer()
      await target.client.send(new PutObjectCommand({
        Bucket: target.bucket,
        Key: thumbKey,
        Body: thumb,
        ContentType: 'image/avif',
      }))
      await prisma.photo.update({ where: { id: photo.id }, data: { thumbnailUrl: thumbUrl } })
      ok++
      console.log(`DONE  ${label}: ${(original.length / 1024).toFixed(0)}KB -> ${(thumb.length / 1024).toFixed(0)}KB  ${thumbUrl}`)
    } catch (error) {
      failed++
      console.error(`FAIL  ${label}:`, error instanceof Error ? error.message : error)
    }
  }

  const queue = [...targets]
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    for (let photo = queue.shift(); photo; photo = queue.shift()) {
      await processPhoto(photo)
    }
  }))

  console.log(`\n${APPLY ? 'applied' : 'dry run'}: ok=${ok} skipped=${skipped} failed=${failed}`)
  if (!APPLY) console.log('re-run with --apply to write thumbnails and update the database')
  await prisma.$disconnect()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
