import type { Metadata } from 'next'

const siteTitle = process.env.SITE_TITLE || 'MO GALLERY'

export const metadata: Metadata = {
  title: {
    default: 'Photography Journal',
    template: `%s | ${siteTitle}`,
  },
  description: 'Notes, essays, and updates on photography and the creative process.',
  alternates: {
    canonical: '/blog',
  },
  openGraph: {
    title: 'Photography Journal',
    description: 'Notes, essays, and updates on photography and the creative process.',
    url: '/blog',
    type: 'website',
  },
}

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return children
}
