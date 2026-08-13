import { redirect } from 'next/navigation'

export default function FilmRollsPage() {
  redirect('/admin/library?view=film-rolls')
}
