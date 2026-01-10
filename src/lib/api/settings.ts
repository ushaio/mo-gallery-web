import { apiRequestData } from './core'
import type { AdminSettingsDto, PublicSettingsDto } from './types'

export async function getAdminSettings(token: string): Promise<AdminSettingsDto> {
  return apiRequestData<AdminSettingsDto>('/api/admin/settings', {}, token)
}

export async function getPublicSettings(): Promise<PublicSettingsDto> {
  try {
    return await apiRequestData<PublicSettingsDto>('/api/settings/public')
  } catch {
    return {
      site_title: 'MO GALLERY',
      cdn_domain: '',
      linuxdo_only: false,
    }
  }
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