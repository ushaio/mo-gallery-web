import { apiRequest, apiRequestData } from './core'
import type { BlogDto } from './types'

export async function getBlogs(limit?: number): Promise<BlogDto[]> {
  const query = limit ? `?limit=${limit}` : ''
  return apiRequestData<BlogDto[]>(`/api/blogs${query}`)
}

export async function getBlog(id: string): Promise<BlogDto> {
  return apiRequestData<BlogDto>(`/api/blogs/${encodeURIComponent(id)}`)
}

export async function getBlogCategories(): Promise<string[]> {
  return apiRequestData<string[]>('/api/blogs/categories/list')
}

export async function getAdminBlogs(token: string): Promise<BlogDto[]> {
  return apiRequestData<BlogDto[]>('/api/admin/blogs', {}, token)
}

export async function createBlog(
  token: string,
  data: { title: string; content: string; category?: string; tags?: string; isPublished: boolean },
): Promise<BlogDto> {
  return apiRequestData<BlogDto>(
    '/api/admin/blogs',
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
    token,
  )
}

export async function updateBlog(
  token: string,
  id: string,
  data: { title?: string; content?: string; category?: string; tags?: string; isPublished?: boolean },
): Promise<BlogDto> {
  return apiRequestData<BlogDto>(
    `/api/admin/blogs/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(data),
    },
    token,
  )
}

export async function deleteBlog(token: string, id: string): Promise<void> {
  await apiRequest(
    `/api/admin/blogs/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
    token,
  )
}