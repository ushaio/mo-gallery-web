import { queryFilmRollsWithPhotos } from '~/server/lib/queries'
import { FilmPageContent } from './FilmPageContent'

export default async function FilmPage() {
  const rolls = await queryFilmRollsWithPhotos()

  return <FilmPageContent initialRolls={rolls} />
}
