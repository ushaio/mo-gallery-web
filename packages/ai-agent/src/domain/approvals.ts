import type { EditorProposal } from './proposals'

export type EditorApprovalDecision = 'approved' | 'rejected'

export interface EditorApprovalRequest {
  id: string
  taskId: string
  proposal: EditorProposal
  message?: string
}

export interface EditorApprovalResponse {
  requestId: string
  decision: EditorApprovalDecision
  reason?: string
}
