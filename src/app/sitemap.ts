import type { MetadataRoute } from 'next'
import { querySitemapContent } from '~/server/lib/queries'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || 'http://localhost:3000').replace(/\/+$/, '')
  const routes = [
    '',
    '/gallery',
    '/gallery/film',
    '/curated',
    '/blog',
    '/story',
    '/about',
    '/they',
  ]

  const staticEntries: MetadataRoute.Sitemap = routes.map((path) => ({
    url: `${siteUrl}${path}`,
    changeFrequency: 'weekly',
    priority: path === '' ? 1 : 0.7,
  }))

  try {
    const { albums, blogs, stories } = await querySitemapContent()
    const dynamicEntries: MetadataRoute.Sitemap = [
      ...albums.map(({ id, updatedAt }) => ({ url: `${siteUrl}/gallery/albums/${id}`, lastModified: updatedAt, changeFrequency: 'monthly' as const, priority: 0.6 })),
      ...blogs.map(({ id, updatedAt }) => ({ url: `${siteUrl}/blog/${id}`, lastModified: updatedAt, changeFrequency: 'monthly' as const, priority: 0.6 })),
      ...stories.map(({ id, updatedAt }) => ({ url: `${siteUrl}/story/${id}`, lastModified: updatedAt, changeFrequency: 'monthly' as const, priority: 0.6 })),
    ]
    return [...staticEntries, ...dynamicEntries]
  } catch {
    return staticEntries
  }
}
