import { queryPhotosWithMeta } from '~/server/lib/queries'
import { FilmPageContent } from './FilmPageContent'

const PAGE_SIZE = 60

export default async function FilmPage() {
  const photosResult = await queryPhotosWithMeta({ page: 1, pageSize: PAGE_SIZE })

  return (
    <FilmPageContent
      initialPhotos={photosResult.data}
      initialMeta={photosResult.meta}
    />
  )
}
