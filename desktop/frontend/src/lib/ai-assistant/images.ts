import { toast } from 'sonner'
import { DownloadMessageImageToLocal } from '../../../wailsjs/go/main/App'
import { parseLocalLibraryError } from '@/features/local-library/api'
import type { MessageImageRef } from './types'

export function getMessageImages(metadata: unknown): MessageImageRef[] {
  if (!metadata || typeof metadata !== 'object' || !('images' in metadata)) return []
  const images = (metadata as { images?: unknown }).images
  if (!Array.isArray(images)) return []
  return images.flatMap((image) => {
    if (typeof image === 'string') return image ? [{ url: image }] : []
    if (image && typeof image === 'object' && 'url' in image && typeof image.url === 'string' && image.url) {
      return [{
        url: image.url,
        ...('photoId' in image && typeof image.photoId === 'string' ? { photoId: image.photoId } : {}),
      }]
    }
    return []
  })
}

export async function downloadMessageImageToLocal(imageUrl: string, t: (key: string) => string): Promise<void> {
  try {
    const filePath = await DownloadMessageImageToLocal(imageUrl)
    if (filePath) toast.success(t('admin.ai_downloaded_to_local'))
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('admin.ai_download_to_local_failed'))
    throw error
  }
}

export function formatAiLibraryError(cause: unknown): string {
  const error = parseLocalLibraryError(cause)
  if (error.code !== 'LIBRARY_LOCKED') return error.message
  const ownerPID = typeof error.details?.ownerPid === 'number' ? error.details.ownerPid : null
  return ownerPID === null
    ? error.message
    : `${error.message}(占用进程 PID:${ownerPID})`
}

export function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error('图片读取失败'))
    reader.onerror = () => reject(reader.error || new Error('图片读取失败'))
    reader.readAsDataURL(file)
  })
}
