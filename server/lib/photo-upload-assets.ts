import type { UploadFileInput, UploadResult } from './storage/types'

export function resolvePhotoUploadAssets({
  reuseUploadedFileAsThumbnail,
  originalBuffer,
  thumbnailBuffer,
  thumbnailFilename,
  storagePath,
  storagePathFull,
  thumbnailContentType,
}: {
  reuseUploadedFileAsThumbnail: boolean
  originalBuffer: Buffer
  thumbnailBuffer: Buffer | null
  thumbnailFilename: string
  storagePath?: string
  storagePathFull?: boolean
  thumbnailContentType: string
}): {
  thumbnailUpload?: UploadFileInput
  dominantColorBuffer: Buffer
} {
  if (reuseUploadedFileAsThumbnail) {
    return {
      thumbnailUpload: undefined,
      dominantColorBuffer: originalBuffer,
    }
  }

  if (!thumbnailBuffer) {
    throw new Error('Thumbnail buffer is required when uploading a separate thumbnail')
  }

  return {
    thumbnailUpload: {
      buffer: thumbnailBuffer,
      filename: thumbnailFilename,
      path: storagePath,
      contentType: thumbnailContentType,
      useFullPath: storagePathFull,
    },
    dominantColorBuffer: thumbnailBuffer,
  }
}

export function resolvePhotoThumbnailUrl(
  uploadResult: UploadResult,
  reuseUploadedFileAsThumbnail: boolean,
): string | undefined {
  return reuseUploadedFileAsThumbnail ? uploadResult.url : uploadResult.thumbnailUrl
}
