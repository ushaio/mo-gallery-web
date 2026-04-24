import imageCompression from 'browser-image-compression'

export type CompressionMode = 'none' | 'quality' | 'size'

export interface CompressionOptions {
  mode?: CompressionMode
  maxSizeMB?: number
  maxWidthOrHeight?: number
  initialQuality?: number
}

const PRESETS: Record<CompressionMode, Partial<CompressionOptions>> = {
  none: {},
  quality: { maxSizeMB: 8, maxWidthOrHeight: 8192, initialQuality: 0.92 },
  size: { maxSizeMB: 1.5, maxWidthOrHeight: 2048, initialQuality: 0.65 },
}

const MIN_QUALITY = 0.45
const MIN_LONG_EDGE = 1280

function replaceExtension(filename: string, extension: string) {
  return filename.replace(/\.[^.]*$/, '') + extension
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
  const mode = options.mode || 'quality'
  const sourceFile = file.type === 'image/bmp' ? await convertImageToJpeg(file) : file

  if (mode === 'none') {
    onProgress?.(100)
    return sourceFile
  }

  const preset = PRESETS[mode]
  const maxSizeMB = options.maxSizeMB ?? preset.maxSizeMB ?? 4
  const maxWidthOrHeight = options.maxWidthOrHeight ?? preset.maxWidthOrHeight ?? 4096
  const initialQuality = options.initialQuality ?? preset.initialQuality ?? 0.8
  const maxSizeBytes = maxSizeMB * 1024 * 1024
  const totalPasses = mode === 'quality' ? 8 : 4

  // Skip if already smaller than target
  if (sourceFile.size <= maxSizeBytes) {
    onProgress?.(100)
    return sourceFile
  }

  const baseOptions = {
    maxSizeMB,
    maxWidthOrHeight,
    initialQuality,
    useWebWorker: true,
    preserveExif: true,
  }

  let blob: Blob = await imageCompression(sourceFile, {
    ...baseOptions,
    alwaysKeepResolution: mode === 'quality',
    onProgress: mapCompressionProgress(0, totalPasses, onProgress),
  })

  if (blob.size > maxSizeBytes) {
    let passIndex = 1
    let quality = Math.min(initialQuality, 0.86)
    let longEdge = maxWidthOrHeight

    while (blob.size > maxSizeBytes && passIndex < totalPasses) {
      const sizeRatio = Math.sqrt(maxSizeBytes / blob.size)
      quality = Math.max(MIN_QUALITY, Math.min(quality - 0.08, quality * 0.92))
      longEdge = Math.max(
        MIN_LONG_EDGE,
        Math.floor(longEdge * Math.max(0.72, Math.min(sizeRatio, 0.9))),
      )

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

  return new File([blob], sourceFile.name, { type: blob.type, lastModified: Date.now() })
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
