import { queryBlogs, queryStories } from '~/server/lib/queries'

const escapeXml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;')

export async function GET() {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || 'http://localhost:3000').replace(/\/+$/, '')
  const [blogs, stories] = await Promise.all([queryBlogs(), queryStories()])
  const items = [
    ...blogs.map((item) => ({ ...item, link: `${siteUrl}/blog/${item.id}`, kind: 'Blog' })),
    ...stories.map((item) => ({ ...item, link: `${siteUrl}/story/${item.id}`, kind: 'Story' })),
  ].sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()).slice(0, 50)

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml('MO Gallery')}</title>
    <link>${escapeXml(siteUrl)}</link>
    <description>${escapeXml('Stories, blogs and visual notes from MO Gallery')}</description>
    <language>zh-CN</language>
    ${items.map((item) => `<item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.link)}</link>
      <guid isPermaLink="true">${escapeXml(item.link)}</guid>
      <description>${escapeXml(item.kind)}</description>
      <pubDate>${new Date(item.updatedAt || item.createdAt).toUTCString()}</pubDate>
    </item>`).join('\n    ')}
  </channel>
</rss>`

  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } })
}
