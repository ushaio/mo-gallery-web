import type { Metadata } from 'next'
import { queryPhotosWithMeta, queryTags } from '~/server/lib/queries'
import { GalleryContent } from './GalleryContent'
import type { GalleryView } from '@/components/gallery/GalleryHeader'

const PAGE_SIZE = 40

const description = 'Explore original photography organized by tag, album, and visual theme.'

export const metadata: Metadata = {
  title: 'Photography Gallery',
  description,
  alternates: { canonical: '/gallery' },
  openGraph: {
    title: 'Photography Gallery',
    description,
    url: '/gallery',
    type: 'website',
  },
}

interface GalleryPageProps {
  searchParams: Promise<{ view?: string; photoId?: string }>
}

export default async function GalleryPage({ searchParams }: GalleryPageProps) {
  const { view, photoId } = await searchParams
  const isAlbumView = view === 'albums'

  const resolvedView: GalleryView = isAlbumView ? 'albums' : 'photos'

  const [photosResult, tags] = isAlbumView
    ? [null, []]
    : await Promise.all([
        queryPhotosWithMeta({ page: 1, pageSize: PAGE_SIZE }),
        queryTags(),
      ])

  return (
    <GalleryContent
      initialPhotos={photosResult?.data ?? []}
      initialMeta={photosResult?.meta ?? null}
      initialTags={tags}
      initialView={resolvedView}
      initialPhotoId={photoId}
    />
  )
}
