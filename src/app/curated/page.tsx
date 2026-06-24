import { queryFeaturedPhotos, queryPhotosWithMeta } from '~/server/lib/queries'
import type { PhotoDto } from '@/lib/api/types'
import { CuratedContent } from './CuratedContent'

export const metadata = {
  title: '精选 | Curated',
  description: '一组安静的影像——光线、阴影，以及二者之间的对话。',
}

export default async function CuratedPage() {
  // 数据库不可用时优雅降级到空数组，让页面骨架仍可渲染
  let featured: PhotoDto[] = []
  let recent: { data: PhotoDto[] } = { data: [] }
  try {
    const [f, r] = await Promise.all([
      queryFeaturedPhotos(),
      queryPhotosWithMeta({ page: 1, pageSize: 12 }),
    ])
    featured = f
    recent = { data: r.data }
  } catch {
    // 数据库连接失败时保持空数组，UI 会显示 empty state
  }

  // 去重合并：精选优先，再用最近公开照片补足到 12 张
  const seen = new Set<string>()
  const photos: PhotoDto[] = []
  for (const p of [...featured, ...recent.data]) {
    if (seen.has(p.id)) continue
    seen.add(p.id)
    photos.push(p)
    if (photos.length >= 12) break
  }

  return <CuratedContent photos={photos} />
}
