import type { Metadata } from 'next'

const description = 'Discover friends and fellow creators connected through photography.'

export const metadata: Metadata = {
  title: 'Friends & Creators',
  description,
  alternates: { canonical: '/they' },
  openGraph: {
    title: 'Friends & Creators',
    description,
    url: '/they',
    type: 'website',
  },
}

export default function TheyLayout({ children }: { children: React.ReactNode }) {
  return children
}
