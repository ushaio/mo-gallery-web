export type CompressionMode = 'none' | 'compress'

export interface CompressionOptions {
  mode?: CompressionMode
  maxSizeMB?: number
  maxWidthOrHeight?: number
  fileType?: string
  quality?: number
}

/**
 * EXIF data serialized as JSON for transmission to the server.
 *
 * Browser-side compression (Canvas decode + WASM AVIF encode) discards all
 * EXIF, so we read EXIF from the original file before compression and send it
 * alongside the compressed file via FormData `exif_json`. The server parses it
 * with parseExifJson (mirrors extractExifData's return shape).
 */
export interface ExifJsonData {
  cameraMake?: string
  cameraModel?: string
  lens?: string
  focalLength?: string
  aperture?: string
  shutterSpeed?: string
  iso?: number
  takenAt?: string // Raw EXIF date string; server-side parseExifDate handles parsing
  orientation?: number
  software?: string
  exifRaw?: string
  gps?: string
}

/**
 * Read EXIF from the original file before compression and return it as JSON.
 * Compression (Canvas/AVIF) would otherwise discard all EXIF metadata.
 *
 * Uses a dynamic import of exifreader to keep the initial browser bundle small.
 * Returns an empty object on any failure so upload never blocks on EXIF read.
 */
export async function extractExifToJson(file: File): Promise<ExifJsonData> {
  try {
    const ExifReader = (await import('exifreader')).default
    const tags = ExifReader.load(await file.arrayBuffer(), { expanded: true })
    const data: ExifJsonData = {}

    if (tags.exif?.Make?.description) data.cameraMake = tags.exif.Make.description
    if (tags.exif?.Model?.description) data.cameraModel = tags.exif.Model.description
    if (tags.exif?.LensModel?.description) data.lens = tags.exif.LensModel.description
    if (tags.exif?.FocalLength?.description) data.focalLength = tags.exif.FocalLength.description
    if (tags.exif?.FNumber?.description) data.aperture = `f/${tags.exif.FNumber.description}`
    if (tags.exif?.ExposureTime?.description) data.shutterSpeed = tags.exif.ExposureTime.description
    if (tags.exif?.ISOSpeedRatings?.description) {
      const iso = parseInt(tags.exif.ISOSpeedRatings.description, 10)
      if (!Number.isNaN(iso)) data.iso = iso
    }
    if (tags.exif?.DateTimeOriginal?.description) {
      // Keep the raw string; the server reuses parseExifDate for validation.
      data.takenAt = tags.exif.DateTimeOriginal.description
    }
    if (tags.exif?.Orientation?.value) data.orientation = tags.exif.Orientation.value
    if (tags.exif?.Software?.description) data.software = tags.exif.Software.description

    if (tags.gps) {
      const gps: Record<string, unknown> = {}
      if (tags.gps.Latitude !== undefined) gps.latitude = tags.gps.Latitude
      if (tags.gps.Longitude !== undefined) gps.longitude = tags.gps.Longitude
      if (tags.gps.Altitude !== undefined) gps.altitude = tags.gps.Altitude
      if (Object.keys(gps).length > 0) data.gps = JSON.stringify(gps)
    }

    // exifRaw mirrors the structure produced by server-side extractExifData
    // so downstream display logic stays consistent.
    data.exifRaw = JSON.stringify({
      camera: { make: data.cameraMake, model: data.cameraModel, lens: data.lens },
      settings: {
        focalLength: data.focalLength,
        aperture: tags.exif?.FNumber?.description,
        shutterSpeed: data.shutterSpeed,
        iso: tags.exif?.ISOSpeedRatings?.description,
      },
      image: { orientation: tags.exif?.Orientation?.description },
      other: { software: data.software },
    })

    return data
  } catch {
    return {}
  }
}

/**
 * Remove the GPS field from EXIF JSON (client-side GPS stripping).
 * Used when the user enables "remove location" — the server also strips GPS
 * as a fallback via the strip_gps flag.
 */
export function stripGpsFromExifJson(exif: ExifJsonData): ExifJsonData {
  if (!exif.gps) return exif
  const rest = { ...exif }
  delete rest.gps
  return rest
}

const COMPRESS_DEFAULTS = {
  maxSizeMB: 0,
  maxWidthOrHeight: 4096,
  fileType: 'image/avif',
  // Canvas quality uses 0-1; WASM AVIF quality uses 0-100. We keep the option
  // in the 0-1 range internally and convert when calling the WASM encoder.
  // 0.63 maps to AVIF quality 63 — visually lossless with good compression.
  quality: 0.63,
}

// Backward compat: legacy values 'quality'/'size' map to 'compress'
export function normalizeCompressionMode(value: unknown): CompressionMode {
  if (value === 'none') return 'none'
  if (value === 'compress' || value === 'quality' || value === 'size') return 'compress'
  return 'none'
}

function replaceExtension(filename: string, extension: string) {
  return filename.replace(/\.[^.]*$/,'') + extension
}

function extensionForType(fileType: string): string {
  switch (fileType) {
    case 'image/webp': return '.webp'
    case 'image/jpeg': return '.jpg'
    case 'image/png': return '.png'
    case 'image/avif': return '.avif'
    default: return ''
  }
}

function normalizeQuality(value: number | undefined) {
  if (!Number.isFinite(value)) return COMPRESS_DEFAULTS.quality
  return Math.max(0.1, Math.min(1, value as number))
}

async function encodeImageByQuality(
  file: File,
  options: {
    fileType: string
    maxWidthOrHeight: number
    quality: number
  },
): Promise<File> {
  const bitmap = await createImageBitmap(file)

  try {
    const scale = Math.min(
      1,
      options.maxWidthOrHeight / Math.max(bitmap.width, bitmap.height),
    )
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d')
    if (!context) throw new Error('Failed to create canvas context')
    context.drawImage(bitmap, 0, 0, width, height)

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (result) resolve(result)
          else reject(new Error('Failed to compress image'))
        },
        options.fileType,
        options.quality,
      )
    })

    if (blob.type && blob.type !== options.fileType) return file

    const outputName = replaceExtension(file.name, extensionForType(options.fileType))
    const output = new File([blob], outputName, {
      type: options.fileType,
      lastModified: Date.now(),
    })

    if (file.type === options.fileType && output.size >= file.size) return file
    return output
  } finally {
    bitmap.close()
  }
}

export async function convertImageToJpeg(file: File, quality = 0.92): Promise<File> {
  const bitmap = await createImageBitmap(file)

  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Failed to create canvas context')

    context.drawImage(bitmap, 0, 0)
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (result) resolve(result)
          else reject(new Error('Failed to convert image'))
        },
        'image/jpeg',
        quality,
      )
    })

    return new File([blob], replaceExtension(file.name, '.jpg'), {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    })
  } finally {
    bitmap.close()
  }
}

/**
 * Encode ImageData to AVIF using @jsquash/avif (WASM libavif).
 *
 * The WASM module (~700KB) is loaded lazily via dynamic import so it never
 * affects first paint — it is only fetched when the user actually compresses
 * an image. libavif produces higher-quality, more consistent AVIF output than
 * the browser's built-in Canvas AVIF encoder (which varies between Chrome and
 * Safari, and is unavailable entirely on Safari < 16.4).
 *
 * @param quality 0-100 (NOT 0-1 like Canvas). ~63 = visually lossless.
 * @param speed 0-10, lower = slower + higher quality. Default 6.
 */
async function encodeAvifWithWasm(
  imageData: ImageData,
  options: { quality: number; speed?: number } = { quality: 63 },
): Promise<ArrayBuffer> {
  const { encode } = await import('@jsquash/avif')
  return encode(imageData, {
    quality: options.quality,
    speed: options.speed ?? 6,
    subsample: 1, // YUV422 — balances quality and size
  })
}

export async function compressImage(
  file: File,
  options: CompressionOptions = {},
  onProgress?: (progress: number) => void
): Promise<File> {
  const mode = normalizeCompressionMode(options.mode ?? 'compress')
  const sourceFile = file.type === 'image/bmp' ? await convertImageToJpeg(file) : file

  if (mode === 'none') {
    onProgress?.(100)
    return sourceFile
  }

  // Target size (maxSizeMB) is no longer enforced by client-side multi-pass
  // iteration. The frontend does a single high-quality encode; the server's
  // compressToTargetSize (hono/photos.ts) iteratively re-encodes if the upload
  // still exceeds the target.
  const requestedMax = options.maxWidthOrHeight
  const keepResolution = !requestedMax || !Number.isFinite(requestedMax)
  const maxWidthOrHeight = keepResolution ? 4096 : requestedMax
  const fileType = options.fileType ?? COMPRESS_DEFAULTS.fileType
  const quality = normalizeQuality(options.quality)

  // Non-AVIF output falls back to Canvas toBlob (e.g. WebP/JPEG export).
  if (fileType !== 'image/avif') {
    const output = await encodeImageByQuality(sourceFile, {
      fileType,
      maxWidthOrHeight,
      quality,
    })
    onProgress?.(100)
    return output
  }

  // AVIF output: decode + resize via Canvas, then encode via WASM libavif.
  onProgress?.(20)
  const bitmap = await createImageBitmap(sourceFile)
  try {
    const scale = Math.min(1, maxWidthOrHeight / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Failed to create canvas context')
    ctx.drawImage(bitmap, 0, 0, width, height)
    const imageData = ctx.getImageData(0, 0, width, height)

    onProgress?.(50)
    // WASM AVIF quality is 0-100; convert from internal 0-1 range.
    const avifQuality = Math.round(quality * 100)
    const avifBuffer = await encodeAvifWithWasm(imageData, { quality: avifQuality })

    onProgress?.(90)
    const blob = new Blob([avifBuffer], { type: 'image/avif' })
    const outputName = replaceExtension(sourceFile.name, extensionForType('image/avif'))
    const output = new File([blob], outputName, {
      type: 'image/avif',
      lastModified: Date.now(),
    })

    // If re-encoding an AVIF source produced a larger file, keep the original.
    if (sourceFile.type === 'image/avif' && output.size >= sourceFile.size) {
      return sourceFile
    }
    onProgress?.(100)
    return output
  } finally {
    bitmap.close()
  }
}

export async function compressImages(
  files: File[],
  options: CompressionOptions = {},
  onProgress?: (current: number, total: number) => void
): Promise<File[]> {
  const results: File[] = []
  for (let i = 0; i < files.length; i++) {
    results.push(await compressImage(files[i], options))
    onProgress?.(i + 1, files.length)
  }
  return results
}
