import type { Metadata } from 'next'

const siteTitle = process.env.SITE_TITLE || 'MO GALLERY'

// 故事页面 SEO 元数据配置
export const metadata: Metadata = {
  title: {
    default: 'Photo Stories',
    template: `%s | ${siteTitle}`,
  },
  description: 'Original photo essays and visual narratives told through images and words.',
  alternates: {
    canonical: '/story',
  },
  openGraph: {
    title: 'Photo Stories',
    description: 'Original photo essays and visual narratives told through images and words.',
    url: '/story',
    type: 'website',
  },
}

// 故事模块布局组件，直接渲染子页面
export default function StoryLayout({ children }: { children: React.ReactNode }) {
  return children
}
