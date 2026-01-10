import { apiRequest, apiRequestData, buildQuery } from './core'
import type { CommentDto, PaginationMeta, PublicCommentDto } from './types'

export async function getComments(
  token: string,
  params?: { status?: string; photoId?: string; page?: number; limit?: number },
): Promise<{ data: CommentDto[]; meta: PaginationMeta }> {
  const query = buildQuery(params || {})
  const envelope = await apiRequest(`/api/admin/comments${query}`, {}, token)

  if (!('data' in envelope) || !('meta' in envelope)) {
    if ('data' in envelope) {
      return {
        data: envelope.data as CommentDto[],
        meta: { total: (envelope.data as CommentDto[]).length, page: 1, limit: 1000, totalPages: 1 },
      }
    }
    throw new Error('Unexpected API response')
  }

  return {
    data: envelope.data as CommentDto[],
    meta: envelope.meta as PaginationMeta,
  }
}

export async function updateCommentStatus(
  token: string,
  id: string,
  status: 'approved' | 'rejected',
): Promise<CommentDto> {
  return apiRequestData<CommentDto>(
    `/api/admin/comments/${encodeURIComponent(id)}/status`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    },
    token,
  )
}

export async function deleteComment(token: string, id: string): Promise<void> {
  await apiRequest(
    `/api/admin/comments/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
    token,
  )
}

export async function getPhotoComments(photoId: string): Promise<PublicCommentDto[]> {
  return apiRequestData<PublicCommentDto[]>(`/api/photos/${encodeURIComponent(photoId)}/comments`)
}

export async function getStoryComments(storyId: string): Promise<PublicCommentDto[]> {
  return apiRequestData<PublicCommentDto[]>(`/api/stories/${encodeURIComponent(storyId)}/comments`)
}

export async function submitPhotoComment(
  photoId: string,
  data: { author: string; email?: string; content: string },
  token?: string | null,
): Promise<{ id: string; author: string; content: string; createdAt: string; status: string }> {
  const response = await apiRequest(
    `/api/photos/${encodeURIComponent(photoId)}/comments`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
    token,
  )
  if (!('data' in response)) {
    throw new Error('Unexpected API response')
  }
  return response.data as { id: string; author: string; content: string; createdAt: string; status: string }
}