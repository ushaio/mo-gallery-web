import { apiRequest, apiRequestData } from './core'
import type { StoryDto } from './types'

export async function getStories(sort?: 'storyDate' | 'createdAt'): Promise<StoryDto[]> {
  const params = sort ? `?sort=${sort}` : ''
  return apiRequestData<StoryDto[]>(`/api/stories${params}`)
}

export async function getStory(id: string): Promise<StoryDto> {
  return apiRequestData<StoryDto>(`/api/stories/${encodeURIComponent(id)}`)
}

export async function getPhotoStory(photoId: string): Promise<StoryDto | null> {
  try {
    return await apiRequestData<StoryDto>(`/api/photos/${encodeURIComponent(photoId)}/story`)
  } catch (error) {
    if (error instanceof Error && error.message.includes('404')) {
      return null
    }
    throw error
  }
}

export async function getAdminPhotoStory(token: string, photoId: string): Promise<StoryDto | null> {
  try {
    return await apiRequestData<StoryDto>(`/api/admin/photos/${encodeURIComponent(photoId)}/story`, {}, token)
  } catch (error) {
    if (error instanceof Error && error.message.includes('404')) {
      return null
    }
    throw error
  }
}

export async function getAdminStories(token: string): Promise<StoryDto[]> {
  return apiRequestData<StoryDto[]>('/api/admin/stories', {}, token)
}

export async function createStory(
  token: string,
  data: { title: string; content: string; isPublished: boolean; photoIds?: string[]; coverPhotoId?: string; storyDate?: string },
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
  data: { title?: string; content?: string; isPublished?: boolean; coverPhotoId?: string | null; storyDate?: string | null },
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