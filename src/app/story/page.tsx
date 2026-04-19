import { queryStories } from '~/server/lib/queries'
import { StoryListContent } from './StoryListContent'

export default async function StoryListPage() {
  const stories = await queryStories()
  return <StoryListContent initialStories={stories} />
}
