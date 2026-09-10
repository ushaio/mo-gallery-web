import { getEditorContent } from '@mo-gallery/api-client/editor-content'
import { getMilkdownText } from '@mo-gallery/milkdown/media'
import type { ArticleContentDto } from '@/lib/api/types'
import { stripStoryContentToPlainText } from '@/lib/story-rich-content'

type ArticleTextSource = Pick<ArticleContentDto, 'editorType' | 'tiptapContent' | 'milkContent'>

/** All article summaries and counters read only the selected editor format. */
export function getArticlePlainText(source: ArticleTextSource): string {
  const content = getEditorContent(source)
  return source.editorType === 'milkdown'
    ? getMilkdownText(content)
    : stripStoryContentToPlainText(content)
}
