import type { Metadata } from 'next'
import { queryFeaturedPhotos, queryPhotosWithMeta, queryPublishedAlbums } from '~/server/lib/queries'
import type { PhotoDto } from '@/lib/api/types'
import type { AlbumWithKind } from '@/lib/album-kind'
import { CuratedContent } from './CuratedContent'

const description = '摄影作品集策展展示：专题系列、精选代表作与完整影像语境。'

export const metadata: Metadata = {
  title: '策展 · 作品集',
  description,
  alternates: { canonical: '/curated' },
  openGraph: {
    title: '策展 · 作品集 | Curated Portfolio',
    description,
    url: '/curated',
    type: 'website',
  },
}

export default async function CuratedPage() {
  // 数据库不可用时优雅降级到空数组，让页面骨架仍可渲染
  let albums: AlbumWithKind[] = []
  let featured: PhotoDto[] = []
  let recent: { data: PhotoDto[] } = { data: [] }
  try {
    const [a, f, r] = await Promise.all([
      queryPublishedAlbums(),
      queryFeaturedPhotos(),
      queryPhotosWithMeta({ page: 1, pageSize: 24 }),
    ])
    albums = a
    featured = f
    recent = { data: r.data }
  } catch {
    // 数据库连接失败时保持空数组，UI 会显示 empty state
  }

  // 去重合并：精选优先，再用最近公开照片补充，展示丰富的策展单幅
  const seen = new Set<string>()
  const photos: PhotoDto[] = []
  for (const p of [...featured, ...recent.data]) {
    if (seen.has(p.id)) continue
    seen.add(p.id)
    photos.push(p)
    if (photos.length >= 24) break
  }

  return <CuratedContent albums={albums} photos={photos} />
}
