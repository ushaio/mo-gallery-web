import { queryPhotosWithMeta, queryCategories } from '~/server/lib/queries'
import { GalleryContent } from './GalleryContent'
import type { GalleryView } from '@/components/gallery/GalleryHeader'

const PAGE_SIZE = 20

interface GalleryPageProps {
  searchParams: Promise<{ view?: string; photoId?: string }>
}

export default async function GalleryPage({ searchParams }: GalleryPageProps) {
  const { view, photoId } = await searchParams
  const isAlbumView = view === 'albums'

  const resolvedView: GalleryView = isAlbumView ? 'albums' : 'photos'

  const [photosResult, categories] = isAlbumView
    ? [null, []]
    : await Promise.all([
        queryPhotosWithMeta({ page: 1, pageSize: PAGE_SIZE }),
        queryCategories(),
      ])

  return (
    <GalleryContent
      initialPhotos={photosResult?.data ?? []}
      initialMeta={photosResult?.meta ?? null}
      initialCategories={categories}
      initialView={resolvedView}
      initialPhotoId={photoId}
    />
  )
}
