import type { BlogDto } from '@/lib/api/types'

export interface DesktopBlogSaveApi {
  UpdateBlog: (id: string, data: unknown) => Promise<void>
  CreateBlog: (data: unknown) => Promise<Pick<BlogDto, 'id'>>
}

interface PersistDesktopBlogOptions {
  api: DesktopBlogSaveApi
  blogId?: string
  data: unknown
  onCreated: (blogId: string) => void
}

export async function persistDesktopBlog({
  api,
  blogId,
  data,
  onCreated,
}: PersistDesktopBlogOptions) {
  if (blogId) {
    await api.UpdateBlog(blogId, data)
    return blogId
  }

  const createdBlog = await api.CreateBlog(data)
  onCreated(createdBlog.id)
  return createdBlog.id
}
