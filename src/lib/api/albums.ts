import { apiRequestData } from './core'
import type { AlbumKind, AlbumWithKind } from '@/lib/album-kind'

// 其余相册接口直接用共享实现（shared 是唯一可编辑源头，这里只做转出）。
export {
  getAlbums,
  getAlbum,
  getAdminAlbums,
  getAdminAlbum,
  deleteAlbum,
  reorderAlbums,
  addPhotosToAlbum,
  removePhotoFromAlbum,
  setAlbumCover,
} from '@mo-gallery/api-client/albums'

/**
 * 相册写入载荷。
 *
 * 共享包的 `createAlbum` / `updateAlbum` 还没带 `type`（那两处的类型要给 Desktop / App
 * 同步镜像才会生效），所以 Web 侧在这里本地实现这两个写接口，只多一个 `type`。
 * 服务端 `hono/albums.ts` 的 zod 校验与此一致：`general | normal | curated`，
 * 省略时按 `general` 处理。
 */
type AlbumWritePayload = {
  name?: string
  description?: string | null
  coverUrl?: string | null
  location?: string | null
  isPublished?: boolean
  sortOrder?: number
  type?: AlbumKind
  photoIds?: string[]
}

export async function createAlbum(
  token: string,
  data: AlbumWritePayload & { name: string },
): Promise<AlbumWithKind> {
  return apiRequestData<AlbumWithKind>(
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
  data: AlbumWritePayload,
): Promise<AlbumWithKind> {
  return apiRequestData<AlbumWithKind>(
    `/api/admin/albums/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(data),
    },
    token,
  )
}
