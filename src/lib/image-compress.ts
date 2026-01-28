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

export async function compressImage(
  file: File,
  options: CompressionOptions = {},
  onProgress?: (progress: number) => void
): Promise<File> {
  const mode = options.mode || 'balanced'

  if (mode === 'none') {
    onProgress?.(100)
    return file
  }

  const preset = PRESETS[mode]
  const maxSizeMB = options.maxSizeMB ?? preset.maxSizeMB ?? 4
  const maxWidthOrHeight = options.maxWidthOrHeight ?? preset.maxWidthOrHeight ?? 4096
  const initialQuality = options.initialQuality ?? preset.initialQuality ?? 0.8

  // Skip if already smaller than target
  if (file.size <= maxSizeMB * 1024 * 1024) {
    onProgress?.(100)
    return file
  }

  const blob = await imageCompression(file, {
    maxSizeMB,
    maxWidthOrHeight,
    initialQuality,
    useWebWorker: true,
    preserveExif: true,
    alwaysKeepResolution: mode === 'quality',
    onProgress: onProgress,
  })

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