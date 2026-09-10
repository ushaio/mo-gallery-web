import type { BlogDto } from '@/lib/api/types'

export interface DesktopBlogSaveApi {
  UpdateBlog: (id: string, data: unknown) => Promise<BlogDto>
  CreateBlog: (data: unknown) => Promise<BlogDto>
}

interface PersistDesktopBlogOptions {
  api: DesktopBlogSaveApi
  blogId?: string
  data: unknown
}

export async function persistDesktopBlog({
  api,
  blogId,
  data,
}: PersistDesktopBlogOptions) {
  if (blogId) {
    return api.UpdateBlog(blogId, data)
  }

  return api.CreateBlog(data)
}
