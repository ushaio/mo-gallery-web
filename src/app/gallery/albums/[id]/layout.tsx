import type { Metadata } from 'next'

import { queryAlbumMetadata } from '~/server/lib/queries'

interface AlbumDetailLayoutProps {
  children: React.ReactNode
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: AlbumDetailLayoutProps): Promise<Metadata> {
  const { id } = await params
  const album = await queryAlbumMetadata(id)

  if (!album) {
    return {
      title: 'Album Not Found',
      robots: { index: false, follow: false },
    }
  }

  const description = album.description?.slice(0, 160).trim()
    || `View the ${album.name} photography album.`

  return {
    title: `${album.name} Photo Album`,
    description,
    alternates: { canonical: `/gallery/albums/${id}` },
    openGraph: {
      title: album.name,
      description,
      url: `/gallery/albums/${id}`,
      type: 'website',
      images: album.coverUrl ? [{ url: album.coverUrl, alt: album.name }] : undefined,
    },
  }
}

export default function AlbumDetailLayout({ children }: AlbumDetailLayoutProps) {
  return children
}
