import type { EditorApprovalRequest } from './approvals'
import type {
  EditorAiModelCapabilities,
} from './capabilities'
import type { AiTaskWarning } from './changes'
import type {
  EditorDocumentSnapshot,
  NarrativeDocumentSnapshot,
  StructuredEditorSnapshot,
  ZineDocumentSnapshot,
} from './document'
import type {
  DeepReadonly,
  EditorAiCommitBatch,
  EditorAiExecutionCapability,
  EditorAiExecutionErrorCode,
} from './execution'
import type { JsonValue } from './json'
import type { EditorOperationAuthorization } from './operations'
import type { EditorProposal } from './proposals'

export type EditorAgentStatus =
  | 'starting'
  | 'running'
  | 'completed'
  | 'cancelled'
  | 'failed'

export interface EditorAgentTask {
  id: string
  instruction: string
  document: EditorDocumentSnapshot
}

export type EditorAgentEvent =
  | { type: 'status_changed'; status: EditorAgentStatus }
  | { type: 'text_delta'; text: string }
  | {
      type: 'tool_started'
      toolCallId: string
      toolName: string
      input: JsonValue
    }
  | {
      type: 'tool_completed'
      toolCallId: string
      toolName: string
      output: JsonValue
    }
  | { type: 'proposal_created'; proposal: EditorProposal }
  | { type: 'approval_required'; request: EditorApprovalRequest }
  | { type: 'completed'; summary: string }
  | { type: 'error'; message: string }

export interface EditorAgentRuntimeRunOptions {
  signal?: AbortSignal
}

export interface EditorAgentRuntime {
  run(
    task: EditorAgentTask,
    options?: EditorAgentRuntimeRunOptions,
  ): AsyncIterable<EditorAgentEvent>
}

export interface EditorAgentResult {
  taskId: string
  documentRevision: string
  summary: string
  proposals: EditorProposal[]
}

export const DIRECT_EDIT_TASK_STATUSES = [
  'preparing_context',
  'analyzing',
  'planning',
  'simulating',
  'validating',
  'applying',
  'completed',
  'stopped',
  'failed',
] as const

export type DirectEditTaskStatus = typeof DIRECT_EDIT_TASK_STATUSES[number]

export type DirectEditTaskType = 'instruction' | 'page_audit'

export interface DirectEditAgentTask<
  Snapshot extends StructuredEditorSnapshot = StructuredEditorSnapshot,
> {
  readonly id: string
  readonly taskType: DirectEditTaskType
  readonly instruction: string
  readonly snapshot: DeepReadonly<Snapshot>
  readonly authorization: DeepReadonly<EditorOperationAuthorization>
  readonly modelCapabilities: DeepReadonly<EditorAiModelCapabilities>
}

type DirectEditCapabilityForSnapshot<
  Snapshot extends StructuredEditorSnapshot,
> = Snapshot extends NarrativeDocumentSnapshot
  ? 'narrative'
  : Snapshot extends ZineDocumentSnapshot
    ? 'zine'
    : EditorAiExecutionCapability

type UnionKeys<Union> = Union extends Union ? keyof Union : never

type StrictUnionHelper<Union, All> = Union extends unknown
  ? Union & Partial<Record<Exclude<UnionKeys<All>, keyof Union>, never>>
  : never

type StrictUnion<Union> = StrictUnionHelper<Union, Union>

type DirectEditAgentEventVariant<
  Snapshot extends StructuredEditorSnapshot,
> =
  | { readonly type: 'status_changed'; readonly status: DirectEditTaskStatus }
  | { readonly type: 'text_delta'; readonly text: string }
  | {
      readonly type: 'tool_started'
      readonly toolCallId: string
      readonly toolName: string
      readonly input: DeepReadonly<JsonValue>
    }
  | {
      readonly type: 'tool_completed'
      readonly toolCallId: string
      readonly toolName: string
      readonly output: DeepReadonly<JsonValue>
    }
  | { readonly type: 'warning'; readonly warning: DeepReadonly<AiTaskWarning> }
  | { readonly type: 'completed'; readonly summary: readonly string[] }
  | {
      readonly type: 'error'
      readonly code: EditorAiExecutionErrorCode
      readonly message: string
    }
  | (Snapshot extends StructuredEditorSnapshot
      ? {
          readonly type: 'operation_batch_created'
          readonly batch: EditorAiCommitBatch<DirectEditCapabilityForSnapshot<Snapshot>>
        }
      : never)

export type DirectEditAgentEvent<
  Snapshot extends StructuredEditorSnapshot = StructuredEditorSnapshot,
> = StrictUnion<DirectEditAgentEventVariant<Snapshot>>

export interface DirectEditAgentRuntimeRunOptions {
  readonly signal?: AbortSignal
}

declare const directEditRuntimeSnapshot: unique symbol

type DirectEditAgentRuntimeRun<
  Snapshot extends StructuredEditorSnapshot,
> = (<Current extends Snapshot>(
  task: DirectEditAgentTask<Current>,
  options?: DirectEditAgentRuntimeRunOptions,
) => AsyncIterable<DirectEditAgentEvent<Current>>) & {
  readonly [directEditRuntimeSnapshot]?: (snapshot: Snapshot) => void
}

export interface DirectEditAgentRuntime<
  Snapshot extends StructuredEditorSnapshot = StructuredEditorSnapshot,
> {
  readonly run: DirectEditAgentRuntimeRun<Snapshot>
}

type DirectEditAgentBatchResult<
  Snapshot extends StructuredEditorSnapshot,
> = {
  readonly mode: 'direct_edit'
  readonly taskId: string
  readonly baseRevision: string
  readonly summary: readonly string[]
  readonly warnings: ReadonlyArray<DeepReadonly<AiTaskWarning>>
  readonly batch: EditorAiCommitBatch<DirectEditCapabilityForSnapshot<Snapshot>>
  readonly suggestion?: never
}

type DirectEditAgentSuggestionResult = {
  readonly mode: 'suggestion_only'
  readonly taskId: string
  readonly baseRevision: string
  readonly summary: readonly string[]
  readonly warnings: ReadonlyArray<DeepReadonly<AiTaskWarning>>
  readonly suggestion: string
  readonly batch?: never
}

export type DirectEditAgentResult<
  Snapshot extends StructuredEditorSnapshot = StructuredEditorSnapshot,
> = (Snapshot extends StructuredEditorSnapshot
  ? DirectEditAgentBatchResult<Snapshot>
  : never) | DirectEditAgentSuggestionResult

export function createEditorAgentTaskId(): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  if (uuid) return uuid
  return `editor-agent-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
