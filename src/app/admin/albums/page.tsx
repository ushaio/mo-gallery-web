import { redirect } from 'next/navigation'

export default function AlbumsPage() {
  redirect('/admin/library?view=albums')
}
