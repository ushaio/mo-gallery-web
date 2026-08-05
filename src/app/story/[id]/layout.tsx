import type { Metadata } from 'next'

import { stripStoryContentToPlainText } from '@/lib/story-rich-content'
import { queryStory } from '~/server/lib/queries'

interface StoryDetailLayoutProps {
  children: React.ReactNode
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: StoryDetailLayoutProps): Promise<Metadata> {
  const { id } = await params
  const story = await queryStory(id)

  if (!story) {
    return {
      title: 'Story Not Found',
      robots: { index: false, follow: false },
    }
  }

  const description = stripStoryContentToPlainText(story.content).slice(0, 160).trim()
    || 'An original photo story and visual narrative.'

  return {
    title: story.title,
    description,
    alternates: { canonical: `/story/${id}` },
    openGraph: {
      title: story.title,
      description,
      url: `/story/${id}`,
      type: 'article',
      publishedTime: story.createdAt,
      modifiedTime: story.updatedAt,
    },
  }
}

export default function StoryDetailLayout({ children }: StoryDetailLayoutProps) {
  return children
}
