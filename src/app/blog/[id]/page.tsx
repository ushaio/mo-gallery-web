import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { queryBlog } from '~/server/lib/queries'
import { BlogDetailContent } from './BlogDetailContent'

interface BlogDetailPageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: BlogDetailPageProps): Promise<Metadata> {
  const { id } = await params
  const blog = await queryBlog(id)

  if (!blog) return { title: 'Not Found' }

  const description = blog.content
    .replace(/[#*`\[\]<>]/g, '')
    .substring(0, 160)
    .trim()

  return {
    title: blog.title,
    description,
    openGraph: {
      title: blog.title,
      description,
      type: 'article',
      publishedTime: blog.createdAt,
      modifiedTime: blog.updatedAt,
    },
  }
}

export default async function BlogDetailPage({ params }: BlogDetailPageProps) {
  const { id } = await params
  const blog = await queryBlog(id)

  if (!blog) notFound()

  return <BlogDetailContent blog={blog} />
}
