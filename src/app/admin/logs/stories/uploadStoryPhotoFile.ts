import { extractExifToJson, stripGpsFromExifJson } from '@/lib/image-compress'
import { calculateFileHash } from '@/lib/file-hash'
import { stripGpsData } from '@/lib/privacy-strip'
import { checkDuplicatePhoto, uploadPhotoWithProgress, type PhotoDto } from '@/lib/api'
import type { UploadSettings } from '@/components/admin/ImageUploadSettingsModal'

interface UploadStoryPhotoFileParams {
  token: string
  file: File
  settings: UploadSettings
  findExistingPhotoById: (photoId: string) => Promise<PhotoDto | null>
  onProgress?: (progress: number) => void
}

export interface UploadStoryPhotoFileResult {
  photo: PhotoDto
  reusedDuplicate: boolean
}

export async function uploadStoryPhotoFile({
  token,
  file,
  settings,
  findExistingPhotoById,
  onProgress,
}: UploadStoryPhotoFileParams): Promise<UploadStoryPhotoFileResult> {
  const fileHash = await calculateFileHash(file)

  try {
    const duplicate = await checkDuplicatePhoto(token, fileHash)
    if (duplicate.isDuplicate && duplicate.existingPhoto) {
      const existingPhoto = await findExistingPhotoById(duplicate.existingPhoto.id)
      if (existingPhoto) {
        onProgress?.(100)
        return { photo: existingPhoto, reusedDuplicate: true }
      }
    }
  } catch (error) {
    console.warn('Duplicate check failed; continuing with upload:', error)
  }

  let exifJsonString: string | undefined
  try {
    let exifJson = await extractExifToJson(file)
    if (settings.stripGps) exifJson = stripGpsFromExifJson(exifJson)
    if (Object.keys(exifJson).length > 0) exifJsonString = JSON.stringify(exifJson)
  } catch {
    // The server extracts EXIF from the uploaded file when this is unavailable.
  }

  const fileToUpload = settings.stripGps ? await stripGpsData(file) : file
  const photo = await uploadPhotoWithProgress({
    token,
    file: fileToUpload,
    title: file.name.replace(/\.[^/.]+$/, ''),
    category: settings.categories?.length ? settings.categories : settings.category,
    storage_provider: settings.storageProvider,
    storage_source_id: settings.storageSourceId,
    storage_path: settings.storagePath,
    storage_path_full: settings.storagePathFull,
    show_flag: settings.showFlag,
    compression_mode: settings.compressionMode,
    compression_format: settings.compressionFormat,
    max_size_mb: settings.maxSizeMB,
    exif_json: exifJsonString,
    strip_gps: settings.stripGps ? 'true' : undefined,
    file_hash: fileHash,
    onProgress,
  })

  return { photo, reusedDuplicate: false }
}
