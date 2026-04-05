import { queryFeaturedPhotos } from '~/server/lib/queries'
import { HomeContent } from './HomeContent'

export default async function Home() {
  const featuredPhotos = await queryFeaturedPhotos()
  return <HomeContent initialPhotos={featuredPhotos} />
}
