import type { Metadata } from 'next'

// 故事页面 SEO 元数据配置
export const metadata: Metadata = {
  title: 'Story',
  description: 'Photo stories and visual narratives.',
  alternates: {
    canonical: '/story',
  },
  openGraph: {
    title: 'Story',
    description: 'Photo stories and visual narratives.',
    url: '/story',
    type: 'website',
  },
}

// 故事模块布局组件，直接渲染子页面
export default function StoryLayout({ children }: { children: React.ReactNode }) {
  return children
}