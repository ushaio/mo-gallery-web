import { queryPhotosWithMeta, queryCategories } from '~/server/lib/queries'
import { GalleryContent } from './GalleryContent'

const PAGE_SIZE = 20

interface GalleryPageProps {
  searchParams: Promise<{ view?: string; photoId?: string }>
}

export default async function GalleryPage({ searchParams }: GalleryPageProps) {
  const { view, photoId } = await searchParams
  const isAlbumView = view === 'albums'

  // Only prefetch photos + categories for the photo view
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
      initialView={isAlbumView ? 'albums' : 'photos'}
      initialPhotoId={photoId}
    />
  )
}
