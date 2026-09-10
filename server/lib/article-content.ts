import 'server-only'
import { z } from 'zod'
import { EditorType, Prisma } from '@/generated/prisma/client'
import type { ArticleContentDto, TiptapJsonContent } from '@mo-gallery/api-client'

export const EditorTypeSchema = z.enum(EditorType)

// A cold database connection can exceed Prisma's 2 s acquisition default.
// Reserve up to 25 s for the transaction within Desktop's 30 s HTTP budget.
export const ARTICLE_SAVE_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 15_000,
} as const

export const ArticleContentShape = {
  editorType: EditorTypeSchema.optional(),
  tiptapContent: z.string().max(50000).optional(),
  tiptapContentJson: z.record(z.string(), z.json()).optional().nullable(),
  milkContent: z.string().max(50000).optional().nullable(),
}

type ArticleContentInput = z.infer<z.ZodObject<typeof ArticleContentShape>>
type SelectedArticleContentInput = ArticleContentInput & { editorType: EditorType }

export class MissingEditorContentError extends Error {
  constructor(editorType: EditorType) {
    super(`No saved ${editorType} content. Convert content before switching editors.`)
  }
}

export function hasArticleBody(input: ArticleContentInput): boolean {
  return input.tiptapContent !== undefined
    || input.tiptapContentJson !== undefined
    || input.milkContent !== undefined
}

export function validateArticleContent(input: ArticleContentInput, ctx: z.RefinementCtx): void {
  if (hasArticleBody(input) && input.editorType === undefined) {
    ctx.addIssue({ code: 'custom', path: ['editorType'], message: 'Editor type is required when saving content' })
  }
  if (input.editorType === 'tiptap' && input.milkContent !== undefined) {
    ctx.addIssue({ code: 'custom', path: ['milkContent'], message: 'Milkdown content requires the milkdown editor type' })
  }
  if (input.editorType === 'milkdown' && (input.tiptapContent !== undefined || input.tiptapContentJson !== undefined)) {
    ctx.addIssue({ code: 'custom', path: ['tiptapContent'], message: 'TipTap content requires the tiptap editor type' })
  }
}

/** A body save replaces the selected document, including an intentionally empty one. */
export function articleContentData(input: SelectedArticleContentInput) {
  if (input.editorType === 'milkdown') {
    return { editorType: input.editorType, milkContent: input.milkContent ?? '' }
  }
  return {
    editorType: input.editorType,
    tiptapContent: input.tiptapContent ?? '',
    // Do not let an old JSON document override a new HTML-only or empty save.
    tiptapContentJson: input.tiptapContentJson ?? Prisma.DbNull,
  }
}

export const ARTICLE_CONTENT_SELECT = {
  editorType: true,
  tiptapContent: true,
  tiptapContentJson: true,
  milkContent: true,
} as const satisfies Prisma.BlogContentSelect

export const ARTICLE_CONTENT_INCLUDE = {
  contents: { select: ARTICLE_CONTENT_SELECT },
} as const

type ArticleContentRow = Prisma.BlogContentGetPayload<{ select: typeof ARTICLE_CONTENT_SELECT }>
type ArticleWithContent = { editorType: EditorType; contents: ArticleContentRow[] }

/** Admin readers keep conversion sources; public readers expose only the selected format. */
export function mapArticleContent<T extends ArticleWithContent>(
  article: T,
  includeOtherEditors = false,
): Omit<T, 'contents'> & ArticleContentDto {
  const { contents, ...metadata } = article
  const visibleContents = includeOtherEditors
    ? contents
    : contents.filter((row) => row.editorType === article.editorType)
  const tiptap = visibleContents.find((row) => row.editorType === 'tiptap')
  const milkdown = visibleContents.find((row) => row.editorType === 'milkdown')
  const tiptapJson = tiptap?.tiptapContentJson

  return {
    ...metadata,
    editorType: article.editorType,
    contentEditorTypes: contents.map((row) => row.editorType),
    tiptapContent: tiptap?.tiptapContent ?? '',
    tiptapContentJson: tiptapJson && typeof tiptapJson === 'object' && !Array.isArray(tiptapJson)
      ? tiptapJson as TiptapJsonContent
      : null,
    milkContent: milkdown ? milkdown.milkContent ?? '' : null,
  }
}
