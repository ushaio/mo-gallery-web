import { isReplaceTextOperation } from './operations'
import type { EditorOperation, ReplaceTextOperation } from './operations'

export type EditorProposalKind = 'content_edit' | 'layout_edit'
export type EditorProposalRisk = 'low' | 'medium' | 'high'

export interface EditorProposal {
  id: string
  taskId: string
  kind: EditorProposalKind
  baseRevision: string
  reason?: string
  risk: EditorProposalRisk
  confidence?: number
  operations: EditorOperation[]
}

/** 当前文本 Diff UI 使用；未来布局提案会由专用审阅器处理。 */
export function getTextReplacementOperation(
  proposal: EditorProposal,
): ReplaceTextOperation | null {
  if (proposal.operations.length !== 1) return null
  const [operation] = proposal.operations
  return operation && isReplaceTextOperation(operation) ? operation : null
}
