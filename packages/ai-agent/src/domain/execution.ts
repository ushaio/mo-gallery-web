import type { AiChangeEntry } from './changes'
import type {
  NarrativeDocumentSnapshot,
  StructuredEditorSnapshot,
  ZineDocumentSnapshot,
} from './document'
import type {
  EditorOperationBatch,
  NarrativeEditorOperation,
  ZineEditorOperation,
} from './operations'
import type { JsonPrimitive } from './json'

export type DeepReadonly<T> = T extends JsonPrimitive
  ? T
  : T extends ReadonlyArray<infer Item>
    ? ReadonlyArray<DeepReadonly<Item>>
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T

export type DeepReadonlyJsonValue =
  | JsonPrimitive
  | ReadonlyArray<DeepReadonlyJsonValue>
  | { readonly [key: string]: DeepReadonlyJsonValue }

export interface ReadonlyAiChangeEntry {
  readonly operation: string
  readonly targetId: string
  readonly targetLabel: string
  readonly category: AiChangeEntry['category']
  readonly before?: DeepReadonlyJsonValue
  readonly after?: DeepReadonlyJsonValue
}

export interface EditorAiValidationIssue {
  readonly code: string
  readonly severity: 'error' | 'warning' | 'info'
  readonly message: string
  readonly operationId?: string
  readonly targetIds?: ReadonlyArray<string>
}

export interface EditorAiSimulationResult<
  Snapshot extends StructuredEditorSnapshot,
> {
  readonly snapshot: DeepReadonly<Snapshot>
  readonly resultRevision: string
  readonly issues: ReadonlyArray<EditorAiValidationIssue>
  readonly changeEntries: ReadonlyArray<ReadonlyAiChangeEntry>
}

export interface EditorAiCommitResult {
  readonly resultRevision: string
  readonly historyEntryId: string
  readonly saved: boolean
  readonly saveError?: string
}

export interface EditorAiSnapshotByCapability {
  narrative: NarrativeDocumentSnapshot
  zine: ZineDocumentSnapshot
}

export interface EditorAiOperationByCapability {
  narrative: NarrativeEditorOperation
  zine: ZineEditorOperation
}

export type EditorAiExecutionCapability = keyof EditorAiSnapshotByCapability

type EditorAiCommitBatchForCapability<
  C extends EditorAiExecutionCapability,
> = DeepReadonly<EditorOperationBatch<C, EditorAiOperationByCapability[C]>>

export type EditorAiCommitBatch<
  C extends EditorAiExecutionCapability = EditorAiExecutionCapability,
> = C extends EditorAiExecutionCapability
  ? EditorAiCommitBatchForCapability<C>
  : never

export type EditorAiSimulationArgs<
  C extends EditorAiExecutionCapability,
> = C extends EditorAiExecutionCapability
  ? [
      snapshot: DeepReadonly<EditorAiSnapshotByCapability[C]>,
      operations: ReadonlyArray<DeepReadonly<EditorAiOperationByCapability[NoInfer<C>]>>,
      signal?: AbortSignal,
    ]
  : never

export type EditorAiSimulationResultForCapability<
  C extends EditorAiExecutionCapability,
> = C extends EditorAiExecutionCapability
  ? EditorAiSimulationResult<EditorAiSnapshotByCapability[C]>
  : never

export type EditorAiCommitArgs<
  C extends EditorAiExecutionCapability,
> = C extends EditorAiExecutionCapability
  ? [
      batch: EditorAiCommitBatchForCapability<C>,
      simulation: EditorAiSimulationResult<EditorAiSnapshotByCapability[C]>,
    ]
  : never

type EditorAiSimulate<C extends EditorAiExecutionCapability> =
  EditorAiExecutionCapability extends C
    ? <K extends C>(
        snapshot: DeepReadonly<EditorAiSnapshotByCapability[K]> & { readonly capability: K },
        operations: ReadonlyArray<DeepReadonly<EditorAiOperationByCapability[NoInfer<K>]>>,
        signal?: AbortSignal,
      ) => Promise<EditorAiSimulationResultForCapability<K>>
    : (
        ...args: EditorAiSimulationArgs<C>
      ) => Promise<EditorAiSimulationResultForCapability<C>>

export interface AiDocumentHost<
  C extends EditorAiExecutionCapability,
> {
  captureSnapshot(signal?: AbortSignal): Promise<DeepReadonly<EditorAiSnapshotByCapability[C]>>
  getCurrentRevision(): string
  simulate: EditorAiSimulate<C>
  commit(...args: EditorAiCommitArgs<C>): Promise<EditorAiCommitResult>
  lock(taskId: string): void
  unlock(taskId: string): void
}

export type EditorAiExecutionErrorCode =
  | 'aborted'
  | 'capability_unavailable'
  | 'context_budget_exceeded'
  | 'invalid_operation_batch'
  | 'operation_not_authorized'
  | 'stale_revision'
  | 'simulation_failed'
  | 'validation_failed'
  | 'commit_failed'

function copyValidationIssues(
  issues: readonly EditorAiValidationIssue[],
): EditorAiValidationIssue[] {
  return issues.map((issue) => ({
    code: issue.code,
    severity: issue.severity,
    message: issue.message,
    ...(issue.operationId !== undefined ? { operationId: issue.operationId } : {}),
    ...(issue.targetIds !== undefined ? { targetIds: [...issue.targetIds] } : {}),
  }))
}

export class EditorAiExecutionError extends Error {
  readonly code: EditorAiExecutionErrorCode
  private readonly validationIssues?: EditorAiValidationIssue[]

  constructor(
    code: EditorAiExecutionErrorCode,
    message: string,
    options: { cause?: unknown; issues?: readonly EditorAiValidationIssue[] } = {},
  ) {
    if ('cause' in options) {
      super(message, { cause: options.cause })
    } else {
      super(message)
    }
    this.name = 'EditorAiExecutionError'
    this.code = code
    this.validationIssues = options.issues === undefined
      ? undefined
      : copyValidationIssues(options.issues)
  }

  get issues(): readonly EditorAiValidationIssue[] | undefined {
    return this.validationIssues === undefined
      ? undefined
      : copyValidationIssues(this.validationIssues)
  }
}

export function hasEditorAiValidationErrors(
  issues: readonly EditorAiValidationIssue[],
): boolean {
  return issues.some((issue) => issue.severity === 'error')
}

export function assertEditorAiRevision(expected: string, actual: string): void {
  if (expected !== actual) {
    throw new EditorAiExecutionError(
      'stale_revision',
      `Expected editor revision ${expected}, but found ${actual}`,
    )
  }
}
