import { queryBlogs, queryBlogCategories } from '~/server/lib/queries'
import { BlogListContent } from './BlogListContent'

export default async function BlogListPage() {
  const [blogs, categories] = await Promise.all([
    queryBlogs(),
    queryBlogCategories(),
  ])

  return <BlogListContent initialBlogs={blogs} initialCategories={categories} />
}
