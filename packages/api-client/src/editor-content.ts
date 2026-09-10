import type { EditorType } from './types'

interface EditorContentSource {
  editorType: EditorType
  tiptapContent?: string | null
  milkContent?: string | null
}

/** Select one format explicitly; an empty selected body never restores another format. */
export function getEditorContent(source: EditorContentSource): string {
  return source.editorType === 'milkdown'
    ? source.milkContent ?? ''
    : source.tiptapContent ?? ''
}

export function hasEditorContent(
  source: { contentEditorTypes: readonly EditorType[] },
  editorType: EditorType,
): boolean {
  return source.contentEditorTypes.includes(editorType)
}
