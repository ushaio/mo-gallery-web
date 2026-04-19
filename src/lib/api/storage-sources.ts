import { apiRequest, apiRequestData } from './core'
import type { StorageSourceDto, StorageSourceCreateDto, StorageSourceUpdateDto } from './types'

export async function getStorageSources(token: string): Promise<StorageSourceDto[]> {
  return apiRequestData<StorageSourceDto[]>('/api/admin/storage-sources', {}, token)
}

export async function createStorageSource(
  token: string,
  data: StorageSourceCreateDto,
): Promise<StorageSourceDto> {
  return apiRequestData<StorageSourceDto>(
    '/api/admin/storage-sources',
    { method: 'POST', body: JSON.stringify(data) },
    token,
  )
}

export async function updateStorageSource(
  token: string,
  id: string,
  data: StorageSourceUpdateDto,
): Promise<StorageSourceDto> {
  return apiRequestData<StorageSourceDto>(
    `/api/admin/storage-sources/${id}`,
    { method: 'PATCH', body: JSON.stringify(data) },
    token,
  )
}

export async function deleteStorageSource(token: string, id: string): Promise<void> {
  await apiRequest(`/api/admin/storage-sources/${id}`, { method: 'DELETE' }, token)
}
