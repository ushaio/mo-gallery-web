import 'server-only'
import sharp, { type Metadata } from 'sharp'

// Thumbnail constants (shared across all thumbnail generation paths)
const THUMBNAIL_SIZE = 800
const THUMBNAIL_AVIF_QUALITY = 72

// Server-side AVIF compression constants
const SERVER_AVIF_DEFAULT_QUALITY = 82
const SERVER_AVIF_MIN_QUALITY = 40
const SERVER_AVIF_QUALITY_STEP = 8
const SERVER_AVIF_MAX_ROUNDS = 4
const SERVER_AVIF_MIN_LONG_EDGE = 1280

// Serverless safeguards
const SERVER_MAX_IMAGE_DIMENSION = 8000 // Downscale images larger than this
const SERVER_SHARP_TIMEOUT_MS = 25000 // Leave headroom under Vercel's 60s maxDuration

/**
 * Generate an 800px AVIF (quality 72) thumbnail from an image buffer.
 * Used by the main upload, reupload, and generate-thumbnail endpoints.
 */
export async function generateThumbnailBuffer(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .avif({ quality: THUMBNAIL_AVIF_QUALITY })
    .toBuffer()
}

/**
 * Read metadata and optionally generate a thumbnail from the same buffer,
 * reusing a single sharp input decode via clone() to avoid decoding twice.
 */
export async function getMetadataAndThumbnail(
  buffer: Buffer,
  options: { generateThumbnail: boolean },
): Promise<{ metadata: Metadata; thumbnailBuffer: Buffer | null }> {
  const sharpInstance = sharp(buffer)
  const [metadata, thumbnailBuffer] = await Promise.all([
    sharpInstance.metadata(),
    options.generateThumbnail
      ? sharpInstance
          .clone()
          .rotate()
          .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: 'inside', withoutEnlargement: true })
          .avif({ quality: THUMBNAIL_AVIF_QUALITY })
          .toBuffer()
      : Promise.resolve(null),
  ])
  return { metadata, thumbnailBuffer }
}

/**
 * Iteratively compress an AVIF buffer toward a target size.
 *
 * Strategy: lower quality first (step 8, floor 40), then shrink the long edge
 * once quality bottoms out. Each round re-encodes from the original buffer to
 * avoid cumulative artifacting. Capped at 4 rounds to stay within serverless
 * timeouts.
 */
export async function compressToTargetSize(
  buffer: Buffer,
  targetSizeMB: number,
  options: { maxRounds?: number; minQuality?: number } = {},
): Promise<Buffer> {
  const targetBytes = targetSizeMB * 1024 * 1024
  if (buffer.length <= targetBytes) return buffer

  const maxRounds = Math.min(options.maxRounds ?? SERVER_AVIF_MAX_ROUNDS, SERVER_AVIF_MAX_ROUNDS)
  const minQuality = options.minQuality ?? SERVER_AVIF_MIN_QUALITY

  let current = buffer
  let quality = SERVER_AVIF_DEFAULT_QUALITY
  let longEdge: number | null = null // null = not yet downscaled

  for (let round = 0; round < maxRounds; round++) {
    if (current.length <= targetBytes) break

    if (quality > minQuality) {
      quality = Math.max(minQuality, quality - SERVER_AVIF_QUALITY_STEP)
    } else if (longEdge === null) {
      // Quality floored — start shrinking dimensions
      const meta = await sharp(current).metadata()
      const maxSide = Math.max(meta.width ?? 0, meta.height ?? 0)
      if (maxSide <= SERVER_AVIF_MIN_LONG_EDGE) break
      longEdge = Math.max(SERVER_AVIF_MIN_LONG_EDGE, Math.floor(maxSide * 0.8))
    } else if (longEdge > SERVER_AVIF_MIN_LONG_EDGE) {
      longEdge = Math.max(SERVER_AVIF_MIN_LONG_EDGE, Math.floor(longEdge * 0.8))
    } else {
      break // Hit the floor on both quality and dimensions
    }

    let pipeline = sharp(buffer).rotate()
    if (longEdge !== null) {
      pipeline = pipeline.resize(longEdge, longEdge, { fit: 'inside', withoutEnlargement: true })
    }
    current = await pipeline.avif({ quality }).toBuffer()
  }

  return current
}

/**
 * Wrap a sharp operation with a timeout to avoid hanging inside a serverless
 * function. Vercel maxDuration is 60s; we reserve 25s for sharp and leave the
 * rest for formData parsing, DB writes, and storage uploads.
 */
export async function withSharpTimeout<T>(
  promise: Promise<T>,
  timeoutMs = SERVER_SHARP_TIMEOUT_MS,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Sharp operation timed out')), timeoutMs)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * Downscale images whose longest edge exceeds maxDimension.
 * EXIF is not preserved here — callers extract EXIF before calling this.
 */
export async function enforceDimensionLimit(
  buffer: Buffer,
  maxDimension = SERVER_MAX_IMAGE_DIMENSION,
): Promise<Buffer> {
  const meta = await sharp(buffer).metadata()
  const maxSide = Math.max(meta.width ?? 0, meta.height ?? 0)
  if (maxSide <= maxDimension) return buffer
  return sharp(buffer)
    .rotate()
    .resize(maxDimension, maxDimension, { fit: 'inside', withoutEnlargement: true })
    .toBuffer()
}
