import imageCompression from 'browser-image-compression'

export type CompressionMode = 'none' | 'compress'

export interface CompressionOptions {
  mode?: CompressionMode
  maxSizeMB?: number
  maxWidthOrHeight?: number
  fileType?: string
  quality?: number
}

const COMPRESS_DEFAULTS = {
  maxSizeMB: 0,
  maxWidthOrHeight: 4096,
  fileType: 'image/avif',
  quality: 0.9,
}

const MIN_QUALITY = 0.45
const MIN_LONG_EDGE = 1280
const KEEP_RESOLUTION_SENTINEL = 9999

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

    const outputName = replaceExtension(file.name, extensionForType(options.fileType))
    const output = new File([blob], outputName, {
      type: options.fileType,
      lastModified: Date.now(),
    })

    return output.size < file.size ? output : file
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

export function mapCompressionProgress(
  passIndex: number,
  totalPasses: number,
  onProgress?: (progress: number) => void
): (progress: number) => void {
  if (!onProgress) {
    return () => {}
  }

  const safeTotalPasses = Math.max(totalPasses, 1)
  const clampedPassIndex = Math.min(Math.max(passIndex, 0), safeTotalPasses - 1)
  const passStart = (clampedPassIndex / safeTotalPasses) * 100
  const passRange = 100 / safeTotalPasses
  let lastProgress = Math.round(passStart)

  return (progress: number) => {
    const clampedProgress = Math.min(Math.max(progress, 0), 100)
    const mappedProgress = Math.round(passStart + (clampedProgress / 100) * passRange)
    lastProgress = Math.max(lastProgress, mappedProgress)
    onProgress(lastProgress)
  }
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

  const maxSizeMB = options.maxSizeMB ?? COMPRESS_DEFAULTS.maxSizeMB
  const hasTargetSize = Number.isFinite(maxSizeMB) && maxSizeMB > 0
  const requestedMax = options.maxWidthOrHeight
  const keepResolution = !requestedMax || !Number.isFinite(requestedMax)
  const maxWidthOrHeight = keepResolution ? KEEP_RESOLUTION_SENTINEL : requestedMax
  const fileType = options.fileType ?? COMPRESS_DEFAULTS.fileType
  const quality = normalizeQuality(options.quality)

  if (!hasTargetSize) {
    const output = await encodeImageByQuality(sourceFile, {
      fileType,
      maxWidthOrHeight,
      quality,
    })
    onProgress?.(100)
    return output
  }

  const maxSizeBytes = maxSizeMB * 1024 * 1024
  const totalPasses = keepResolution ? 8 : 4

  if (sourceFile.size <= maxSizeBytes) {
    onProgress?.(100)
    return sourceFile
  }

  const baseOptions = {
    maxSizeMB,
    maxWidthOrHeight,
    fileType,
    useWebWorker: true,
    preserveExif: true,
  }

  let blob: Blob = await imageCompression(sourceFile, {
    ...baseOptions,
    initialQuality: 1.0,
    alwaysKeepResolution: keepResolution,
    onProgress: mapCompressionProgress(0, totalPasses, onProgress),
  })

  if (blob.size > maxSizeBytes) {
    let passIndex = 1
    let quality = 0.9
    let longEdge = maxWidthOrHeight

    while (blob.size > maxSizeBytes && passIndex < totalPasses) {
      if (quality > MIN_QUALITY) {
        quality = Math.max(MIN_QUALITY, quality - 0.08)
      } else {
        const sizeRatio = Math.sqrt(maxSizeBytes / blob.size)
        longEdge = Math.max(
          MIN_LONG_EDGE,
          Math.floor(longEdge * Math.max(0.72, Math.min(sizeRatio, 0.9))),
        )
      }

      const nextBlob = await imageCompression(sourceFile, {
        ...baseOptions,
        initialQuality: quality,
        maxWidthOrHeight: longEdge,
        alwaysKeepResolution: false,
        onProgress: mapCompressionProgress(passIndex, totalPasses, onProgress),
      })

      if (nextBlob.size >= blob.size && longEdge <= MIN_LONG_EDGE && quality <= MIN_QUALITY) break
      blob = nextBlob
      passIndex += 1
    }
  }

  onProgress?.(100)

  const outputName = replaceExtension(sourceFile.name, extensionForType(fileType))
  return new File([blob], outputName, { type: fileType, lastModified: Date.now() })
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
