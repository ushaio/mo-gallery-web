import type { Metadata } from 'next'

const description = 'Meet the photographer behind the gallery and learn about the work.'

export const metadata: Metadata = {
  title: 'About the Photographer',
  description,
  alternates: { canonical: '/about' },
  openGraph: {
    title: 'About the Photographer',
    description,
    url: '/about',
    type: 'profile',
  },
}

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children
}
