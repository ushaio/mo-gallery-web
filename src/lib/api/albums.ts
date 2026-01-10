import { apiRequest, apiRequestData } from './core'
import type { AlbumDto } from './types'

export async function getAlbums(): Promise<AlbumDto[]> {
  return apiRequestData<AlbumDto[]>('/api/albums')
}

export async function getAlbum(id: string): Promise<AlbumDto> {
  return apiRequestData<AlbumDto>(`/api/albums/${encodeURIComponent(id)}`)
}

export async function getAdminAlbums(token: string): Promise<AlbumDto[]> {
  return apiRequestData<AlbumDto[]>('/api/admin/albums', {}, token)
}

export async function createAlbum(
  token: string,
  data: { name: string; description?: string; coverUrl?: string; isPublished: boolean; sortOrder?: number; photoIds?: string[] },
): Promise<AlbumDto> {
  return apiRequestData<AlbumDto>(
    '/api/admin/albums',
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
    token,
  )
}

export async function updateAlbum(
  token: string,
  id: string,
  data: { name?: string; description?: string; coverUrl?: string; isPublished?: boolean; sortOrder?: number },
): Promise<AlbumDto> {
  return apiRequestData<AlbumDto>(
    `/api/admin/albums/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(data),
    },
    token,
  )
}

export async function deleteAlbum(token: string, id: string): Promise<void> {
  await apiRequest(
    `/api/admin/albums/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
    token,
  )
}

export async function reorderAlbums(
  token: string,
  items: { id: string; sortOrder: number }[],
): Promise<void> {
  await apiRequest(
    '/api/admin/albums/reorder',
    {
      method: 'PATCH',
      body: JSON.stringify({ items }),
    },
    token,
  )
}

export async function addPhotosToAlbum(
  token: string,
  albumId: string,
  photoIds: string[],
): Promise<AlbumDto> {
  return apiRequestData<AlbumDto>(
    `/api/admin/albums/${encodeURIComponent(albumId)}/photos`,
    {
      method: 'POST',
      body: JSON.stringify({ photoIds }),
    },
    token,
  )
}

export async function removePhotoFromAlbum(
  token: string,
  albumId: string,
  photoId: string,
): Promise<AlbumDto> {
  return apiRequestData<AlbumDto>(
    `/api/admin/albums/${encodeURIComponent(albumId)}/photos/${encodeURIComponent(photoId)}`,
    { method: 'DELETE' },
    token,
  )
}

export async function setAlbumCover(
  token: string,
  albumId: string,
  photoId: string,
): Promise<AlbumDto> {
  return apiRequestData<AlbumDto>(
    `/api/admin/albums/${encodeURIComponent(albumId)}/cover`,
    {
      method: 'PATCH',
      body: JSON.stringify({ photoId }),
    },
    token,
  )
}