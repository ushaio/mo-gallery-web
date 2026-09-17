import { apiRequest, apiRequestData } from './core'
import type { FriendLinkDto } from './types'

export async function getFriendLinks(): Promise<FriendLinkDto[]> {
  return apiRequestData<FriendLinkDto[]>('/api/friends')
}

export async function getAdminFriendLinks(token: string): Promise<FriendLinkDto[]> {
  return apiRequestData<FriendLinkDto[]>('/api/admin/friends', {}, token)
}

export async function createFriendLink(
  token: string,
  data: {
    name: string
    url: string
    description?: string
    avatar?: string
    featured?: boolean
    sortOrder?: number
    isActive?: boolean
  },
): Promise<FriendLinkDto> {
  return apiRequestData<FriendLinkDto>(
    '/api/admin/friends',
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
    token,
  )
}

export async function updateFriendLink(
  token: string,
  id: string,
  data: {
    name?: string
    url?: string
    description?: string
    avatar?: string
    featured?: boolean
    sortOrder?: number
    isActive?: boolean
  },
): Promise<FriendLinkDto> {
  return apiRequestData<FriendLinkDto>(
    `/api/admin/friends/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(data),
    },
    token,
  )
}

export async function deleteFriendLink(token: string, id: string): Promise<void> {
  await apiRequest(
    `/api/admin/friends/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
    token,
  )
}

export async function reorderFriendLinks(
  token: string,
  items: { id: string; sortOrder: number }[],
): Promise<void> {
  await apiRequest(
    '/api/admin/friends/reorder',
    {
      method: 'PATCH',
      body: JSON.stringify({ items }),
    },
    token,
  )
}