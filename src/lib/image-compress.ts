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

  if (mode === 'none') {
    onProgress?.(100)
    return file
  }

  const preset = PRESETS[mode]
  const maxSizeMB = options.maxSizeMB ?? preset.maxSizeMB ?? 4
  const maxWidthOrHeight = options.maxWidthOrHeight ?? preset.maxWidthOrHeight ?? 4096
  const initialQuality = options.initialQuality ?? preset.initialQuality ?? 0.8
  const maxSizeBytes = maxSizeMB * 1024 * 1024
  const totalPasses = mode === 'quality' ? 2 : 1

  // Skip if already smaller than target
  if (file.size <= maxSizeBytes) {
    onProgress?.(100)
    return file
  }

  const baseOptions = {
    maxSizeMB,
    maxWidthOrHeight,
    initialQuality,
    useWebWorker: true,
    preserveExif: true,
  }

  let blob: Blob = await imageCompression(file, {
    ...baseOptions,
    alwaysKeepResolution: mode === 'quality',
    onProgress: mapCompressionProgress(0, totalPasses, onProgress),
  })

  // Quality mode keeps resolution first; fall back to resizing if still over target
  if (mode === 'quality' && blob.size > maxSizeBytes) {
    blob = await imageCompression(file, {
      ...baseOptions,
      alwaysKeepResolution: false,
      onProgress: mapCompressionProgress(1, totalPasses, onProgress),
    })
  }

  onProgress?.(100)

  return new File([blob], file.name, { type: blob.type, lastModified: Date.now() })
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
