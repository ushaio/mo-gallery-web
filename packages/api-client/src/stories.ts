import { ApiRequestError, apiRequest, apiRequestData } from './core'
import type { EditorType, StoryCoverCropValue, StoryDto, TiptapJsonContent } from './types'

export async function getStories(): Promise<StoryDto[]> {
  return apiRequestData<StoryDto[]>('/api/stories')
}

/**
 * 读取叙事详情。
 *
 * 不传 token 时按访客口径（不可见叙事返回 404）；传入作者/所有者 token 时，
 * 服务端会把该身份计入可见性判断，允许作者本人查看自己的不可见叙事。
 * 该端点对无权限凭证一律降级为访客视角，不会返回 401。
 */
export async function getStory(id: string, token?: string | null): Promise<StoryDto> {
  return apiRequestData<StoryDto>(`/api/stories/${encodeURIComponent(id)}`, {}, token)
}

export async function getPhotoStory(photoId: string, signal?: AbortSignal): Promise<StoryDto | null> {
  try {
    return await apiRequestData<StoryDto>(
      `/api/photos/${encodeURIComponent(photoId)}/story`,
      { signal },
    )
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) {
      return null
    }
    throw error
  }
}

export async function getAdminPhotoStory(token: string, photoId: string): Promise<StoryDto | null> {
  try {
    return await apiRequestData<StoryDto>(`/api/admin/photos/${encodeURIComponent(photoId)}/story`, {}, token)
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) {
      return null
    }
    throw error
  }
}

export async function getAdminStories(token: string): Promise<StoryDto[]> {
  return apiRequestData<StoryDto[]>('/api/admin/stories', {}, token)
}

export async function getAdminStory(token: string, id: string): Promise<StoryDto> {
  return apiRequestData<StoryDto>(`/api/admin/stories/${encodeURIComponent(id)}`, {}, token)
}

export async function createStory(
  token: string,
  data: {
    title: string
    editorType: EditorType
    tiptapContent?: string
    tiptapContentJson?: TiptapJsonContent | null
    milkContent?: string | null
    isPublished: boolean
    photoIds?: string[]
    coverPhotoId?: string
    coverCrop?: StoryCoverCropValue | null
    storyDate?: string
  },
): Promise<StoryDto> {
  return apiRequestData<StoryDto>(
    '/api/admin/stories',
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
    token,
  )
}

export async function updateStory(
  token: string,
  id: string,
  data: {
    title?: string
    editorType?: EditorType
    tiptapContent?: string
    tiptapContentJson?: TiptapJsonContent | null
    milkContent?: string | null
    isPublished?: boolean
    coverPhotoId?: string | null
    coverCrop?: StoryCoverCropValue | null
    createdAt?: string | null
    storyDate?: string | null
  },
): Promise<StoryDto> {
  return apiRequestData<StoryDto>(
    `/api/admin/stories/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(data),
    },
    token,
  )
}

export async function deleteStory(token: string, id: string): Promise<void> {
  await apiRequest(
    `/api/admin/stories/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
    token,
  )
}

export async function addPhotosToStory(
  token: string,
  storyId: string,
  photoIds: string[],
): Promise<StoryDto> {
  return apiRequestData<StoryDto>(
    `/api/admin/stories/${encodeURIComponent(storyId)}/photos`,
    {
      method: 'POST',
      body: JSON.stringify({ photoIds }),
    },
    token,
  )
}

export async function removePhotoFromStory(
  token: string,
  storyId: string,
  photoId: string,
): Promise<StoryDto> {
  return apiRequestData<StoryDto>(
    `/api/admin/stories/${encodeURIComponent(storyId)}/photos/${encodeURIComponent(photoId)}`,
    { method: 'DELETE' },
    token,
  )
}

export async function reorderStoryPhotos(
  token: string,
  storyId: string,
  photoIds: string[],
): Promise<StoryDto> {
  return apiRequestData<StoryDto>(
    `/api/admin/stories/${encodeURIComponent(storyId)}/photos/reorder`,
    {
      method: 'PATCH',
      body: JSON.stringify({ photoIds }),
    },
    token,
  )
}
