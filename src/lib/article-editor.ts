import { hasEditorContent } from '@mo-gallery/api-client/editor-content'
import { convertToMilkdown } from '@mo-gallery/milkdown/migration'
import type { ArticleContentDto } from '@/lib/api/types'

export function createMilkdownDraftContent(): ArticleContentDto {
  return { editorType: 'milkdown', contentEditorTypes: ['milkdown'], tiptapContent: '', tiptapContentJson: null, milkContent: '' }
}

/** Called by an explicit conversion/selection action, never by draft loading. */
export function activateMilkdownContent(source: ArticleContentDto): ArticleContentDto {
  if (!hasEditorContent(source, 'milkdown') && !hasEditorContent(source, 'tiptap')) return source
  return {
    ...source,
    editorType: 'milkdown',
    contentEditorTypes: Array.from(new Set<ArticleContentDto['editorType']>([...source.contentEditorTypes, 'milkdown'])),
    milkContent: hasEditorContent(source, 'milkdown') ? source.milkContent ?? '' : convertToMilkdown(source),
  }
}

/** Apply server normalization only to fields untouched while the request ran. */
export function mergeSavedFields<T extends object>(current: T, submitted: T, saved: T, keys: readonly (keyof T)[]): T {
  const merged = { ...current }
  for (const key of keys) {
    if (current[key] === submitted[key] || JSON.stringify(current[key]) === JSON.stringify(submitted[key])) {
      merged[key] = saved[key]
    }
  }
  return merged
}
