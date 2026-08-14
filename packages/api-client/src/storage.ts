import { apiRequestData, buildQuery } from './core'
import type { StorageScanResult } from './types'

export async function scanStorage(
  token: string,
  params: { provider: string; status?: string; search?: string },
): Promise<StorageScanResult> {
  const query = buildQuery(params)
  return apiRequestData<StorageScanResult>(`/api/admin/storage/scan${query}`, {}, token)
}

export async function cleanupStorage(
  token: string,
  keys: string[],
  provider: string,
): Promise<{ deleted: number; failed: number; errors: string[] }> {
  return apiRequestData<{ deleted: number; failed: number; errors: string[] }>(
    '/api/admin/storage/cleanup',
    {
      method: 'POST',
      body: JSON.stringify({ keys, provider }),
    },
    token,
  )
}

export async function fixMissingPhotos(
  token: string,
  photoIds: string[],
): Promise<{ deleted: number }> {
  return apiRequestData<{ deleted: number }>(
    '/api/admin/storage/fix-missing',
    {
      method: 'POST',
      body: JSON.stringify({ photoIds }),
    },
    token,
  )
}