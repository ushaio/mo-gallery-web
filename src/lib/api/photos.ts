import { ApiUnauthorizedError, apiRequest, apiRequestData, apiRequestWithMeta, buildApiUrl, buildQuery, extractErrorMessage } from './core'
import type { PhotoDto, PhotoPaginationMeta, PhotoDeleteError, PhotoWithStories } from './types'

// Duplicate check types
export interface DuplicateCheckResult {
  isDuplicate: boolean
  existingPhoto?: {
    id: string
    title: string
    thumbnailUrl: string | null
    url: string
    createdAt: string
  }
}

export interface BatchDuplicateCheckResult {
  duplicates: Record<string, {
    id: string
    title: string
    thumbnailUrl: string | null
    url: string
    createdAt: string
  }>
  hasDuplicates: boolean
}

export async function getCategories(): Promise<string[]> {
  return apiRequestData<string[]>('/api/categories')
}

export async function getPhotos(params?: {
  category?: string
  limit?: number
  page?: number
  pageSize?: number
  all?: boolean
}): Promise<PhotoDto[]> {
  const category = params?.category && params.category !== '全部' ? params.category : undefined
  const query = buildQuery({
    category,
    limit: params?.limit,
    page: params?.page,
    pageSize: params?.pageSize,
    all: params?.all ? 'true' : undefined,
  })
  return apiRequestData<PhotoDto[]>(`/api/photos${query}`)
}

export async function getPhotosWithMeta(params?: {
  category?: string
  page?: number
  pageSize?: number
}): Promise<{ data: PhotoDto[]; meta: PhotoPaginationMeta }> {
  const category = params?.category && params.category !== '全部' ? params.category : undefined
  const query = buildQuery({
    category,
    page: params?.page,
    pageSize: params?.pageSize,
  })
  return apiRequestWithMeta<PhotoDto[], PhotoPaginationMeta>(`/api/photos${query}`)
}

export async function getFeaturedPhotos(): Promise<PhotoDto[]> {
  return apiRequestData<PhotoDto[]>('/api/photos/featured')
}

// Check for duplicate photos by file hash (single)
export async function checkDuplicatePhoto(
  token: string,
  fileHash: string
): Promise<DuplicateCheckResult> {
  return apiRequestData<DuplicateCheckResult>(
    '/api/admin/photos/check-duplicate',
    {
      method: 'POST',
      body: JSON.stringify({ fileHash }),
    },
    token,
  )
}

// Check for duplicate photos by file hashes (batch)
export async function checkDuplicatePhotos(
  token: string,
  fileHashes: string[]
): Promise<BatchDuplicateCheckResult> {
  return apiRequestData<BatchDuplicateCheckResult>(
    '/api/admin/photos/check-duplicate',
    {
      method: 'POST',
      body: JSON.stringify({ fileHashes }),
    },
    token,
  )
}

export async function uploadPhoto(input: {
  token: string
  file: File
  title: string
  category: string | string[]
  storage_provider?: string
  storage_path?: string
  file_hash?: string
}): Promise<PhotoDto> {
  const form = new FormData()
  form.set('file', input.file)
  form.set('title', input.title)
  const categoryValue = Array.isArray(input.category) ? input.category.join(',') : input.category
  form.set('category', categoryValue)
  if (input.storage_provider) form.set('storage_provider', input.storage_provider)
  if (input.storage_path) form.set('storage_path', input.storage_path)
  if (input.file_hash) form.set('file_hash', input.file_hash)

  return apiRequestData<PhotoDto>(
    '/api/admin/photos',
    { method: 'POST', body: form },
    input.token,
  )
}

export function uploadPhotoWithProgress(input: {
  token: string
  file: File
  title: string
  category?: string | string[]
  storage_provider?: string
  storage_path?: string
  file_hash?: string
  onProgress?: (progress: number) => void
}): Promise<PhotoDto> {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.set('file', input.file)
    form.set('title', input.title)
    if (input.category) {
      const categoryValue = Array.isArray(input.category) ? input.category.join(',') : input.category
      form.set('category', categoryValue)
    }
    if (input.storage_provider) form.set('storage_provider', input.storage_provider)
    if (input.storage_path) form.set('storage_path', input.storage_path)
    if (input.file_hash) form.set('file_hash', input.file_hash)

    const xhr = new XMLHttpRequest()
    const url = buildApiUrl('/api/admin/photos')

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && input.onProgress) {
        const progress = Math.round((event.loaded / event.total) * 100)
        input.onProgress(progress)
      }
    })

    xhr.addEventListener('load', () => {
      if (xhr.status === 401) {
        reject(new ApiUnauthorizedError('Token invalid or expired'))
        return
      }

      try {
        const response = JSON.parse(xhr.responseText)
        if (xhr.status >= 200 && xhr.status < 300) {
          if (response.success === false) {
            reject(new Error(extractErrorMessage(response) ?? 'Upload failed'))
          } else if (response.data) {
            resolve(response.data as PhotoDto)
          } else {
            resolve(response as PhotoDto)
          }
        } else {
          reject(new Error(extractErrorMessage(response) ?? `Upload failed (${xhr.status})`))
        }
      } catch {
        reject(new Error('Invalid response from server'))
      }
    })

    xhr.addEventListener('error', () => {
      reject(new Error('Network error during upload'))
    })

    xhr.addEventListener('abort', () => {
      reject(new Error('Upload aborted'))
    })

    xhr.open('POST', url)
    xhr.setRequestHeader('Authorization', `Bearer ${input.token}`)
    xhr.send(form)
  })
}

export async function deletePhoto(input: {
  token: string
  id: string
  deleteOriginal?: boolean
  deleteThumbnail?: boolean
  force?: boolean
}): Promise<void> {
  const params = new URLSearchParams()
  if (input.deleteOriginal) params.set('deleteOriginal', 'true')
  if (input.deleteThumbnail) params.set('deleteThumbnail', 'true')
  if (input.force) params.set('force', 'true')
  const queryParam = params.toString() ? `?${params.toString()}` : ''
  await apiRequest(
    `/api/admin/photos/${encodeURIComponent(input.id)}${queryParam}`,
    { method: 'DELETE' },
    input.token,
  )
}

export async function checkPhotoStories(
  token: string,
  photoId: string,
): Promise<{ id: string; title: string }[] | null> {
  try {
    const result = await apiRequestData<{ stories: { id: string; title: string }[] }>(
      `/api/admin/photos/${encodeURIComponent(photoId)}/stories`,
      {},
      token,
    )
    return result.stories.length > 0 ? result.stories : null
  } catch {
    return null
  }
}

export async function checkPhotosStories(
  token: string,
  photoIds: string[],
): Promise<{ photosWithStories: PhotoWithStories[]; hasBlockingStories: boolean }> {
  const result = await apiRequestData<{
    photosWithStories: PhotoWithStories[]
    hasBlockingStories: boolean
  }>(
    '/api/admin/photos/check-stories',
    {
      method: 'POST',
      body: JSON.stringify({ photoIds }),
    },
    token,
  )
  return result
}

export async function reanalyzePhotoColors(token: string, photoId: string): Promise<PhotoDto> {
  return apiRequestData<PhotoDto>(
    `/api/admin/photos/${encodeURIComponent(photoId)}/reanalyze-colors`,
    { method: 'POST' },
    token,
  )
}

export async function updatePhoto(input: {
  token: string
  id: string
  patch: {
    title?: string
    isFeatured?: boolean
    category?: string
    takenAt?: string | null
    storagePath?: string
  }
}): Promise<PhotoDto> {
  return apiRequestData<PhotoDto>(
    `/api/admin/photos/${encodeURIComponent(input.id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(input.patch),
    },
    input.token,
  )
}

export async function batchUpdatePhotoUrls(
  token: string,
  params: {
    storageProvider?: string
    oldPublicUrl?: string
    newPublicUrl?: string
  },
): Promise<{ updated: number; failed: number }> {
  return apiRequestData<{ updated: number; failed: number }>(
    '/api/admin/photos/batch-update-urls',
    {
      method: 'POST',
      body: JSON.stringify(params),
    },
    token,
  )
}

export async function generateThumbnail(token: string, photoId: string): Promise<PhotoDto> {
  return apiRequestData<PhotoDto>(
    `/api/admin/photos/${encodeURIComponent(photoId)}/generate-thumbnail`,
    { method: 'POST' },
    token,
  )
}

export type { PhotoDeleteError }