import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Stories, notes, and updates from the gallery.',
  alternates: {
    canonical: '/blog',
  },
  openGraph: {
    title: 'Blog',
    description: 'Stories, notes, and updates from the gallery.',
    url: '/blog',
    type: 'website',
  },
}

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return children
}
