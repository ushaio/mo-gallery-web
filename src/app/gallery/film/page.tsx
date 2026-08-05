import type { Metadata } from 'next'
import { queryFilmRollsWithPhotos } from '~/server/lib/queries'
import { FilmPageContent } from './FilmPageContent'

const description = 'Browse film photography by roll, camera, stock, and shooting date.'

export const metadata: Metadata = {
  title: 'Film Photography Archive',
  description,
  alternates: { canonical: '/gallery/film' },
  openGraph: {
    title: 'Film Photography Archive',
    description,
    url: '/gallery/film',
    type: 'website',
  },
}

export default async function FilmPage() {
  const rolls = await queryFilmRollsWithPhotos()

  return <FilmPageContent initialRolls={rolls} />
}
