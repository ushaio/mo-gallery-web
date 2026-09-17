import { apiRequestData } from './core'
import type { AdminSettingsDto } from './types'

export async function getAdminSettings(token: string): Promise<AdminSettingsDto> {
  return apiRequestData<AdminSettingsDto>('/api/admin/settings', {}, token)
}

export async function updateAdminSettings(
  token: string,
  patch: Partial<AdminSettingsDto>,
): Promise<AdminSettingsDto> {
  return apiRequestData<AdminSettingsDto>(
    '/api/admin/settings',
    {
      method: 'PATCH',
      body: JSON.stringify(patch),
    },
    token,
  )
}