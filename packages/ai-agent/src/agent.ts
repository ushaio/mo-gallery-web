/**
 * 编辑器 Agent 的项目编排层。
 *
 * 领域协议与 UI 不依赖任何模型 SDK；默认运行时由 Vercel AI SDK 实现。
 */

import {
  createEditorAgentTaskId,
} from './domain/agent'
import {
  applyEditorAiContextBudget,
  resolveEditorAiCapabilities,
} from './domain/capabilities'
import {
  editorAiTaskMetadataSchema,
  summarizeOperations,
} from './domain/changes'
import {
  assertEditorAiRevision,
  EditorAiExecutionError,
  hasEditorAiValidationErrors,
} from './domain/execution'
import {
  editorOperationBatchSchema,
  validateDirectEditTaskTargetIdentity,
  validateOperationAuthorization,
} from './domain/operations'
import type {
  DirectEditAgentEvent,
  DirectEditAgentRuntime,
  DirectEditAgentTask,
  EditorAgentEvent,
  EditorAgentResult,
  EditorAgentRuntime,
  EditorAgentTask,
} from './domain/agent'
import type {
  EditorAiContextBudget,
  EditorAiDegradation,
  EditorAiModelCapabilities,
} from './domain/capabilities'
import type {
  AiTaskWarning,
  EditorAiCompletedTaskMetadata,
} from './domain/changes'
import type {
  EditorDocumentSnapshot,
  StructuredEditorSnapshot,
} from './domain/document'
import type {
  AiDocumentHost,
  DeepReadonly,
  EditorAiCommitBatch,
  EditorAiCommitResult,
  EditorAiExecutionCapability,
  EditorAiSnapshotByCapability,
  EditorAiSimulationResultForCapability,
} from './domain/execution'
import type { DirectEditorOperation, EditorOperationAuthorization } from './domain/operations'
import type { EditorProposal } from './domain/proposals'
import { VercelAiDirectEditAgentRuntime } from './runtime/vercel-ai/direct-edit-agent'
import { VercelAiEditorAgentRuntime } from './runtime/vercel-ai/editor-agent'
import { createAbortError } from './runtime/vercel-ai/errors'
import type { EditorAiEndpoint } from './types'

export interface RunEditorAgentOptions {
  endpoint: EditorAiEndpoint
  model: string
  instruction: string
  document: EditorDocumentSnapshot
  taskId?: string
  signal?: AbortSignal
  onEvent?: (event: EditorAgentEvent) => void
  /** 工具循环步数上限，默认 8。 */
  maxSteps?: number
}

function createTask(options: RunEditorAgentOptions): EditorAgentTask {
  return {
    id: options.taskId || createEditorAgentTaskId(),
    instruction: options.instruction,
    document: options.document,
  }
}

export async function runEditorAgentWithRuntime(
  options: RunEditorAgentOptions,
  runtime: EditorAgentRuntime,
): Promise<EditorAgentResult> {
  const task = createTask(options)
  const proposals: EditorProposal[] = []
  let summary = ''

  const emitSafely = (event: EditorAgentEvent): void => {
    try {
      options.onEvent?.(event)
    } catch {
      // Observers are best-effort and must not affect orchestration.
    }
  }
  for await (const event of runtime.run(task, { signal: options.signal })) {
    emitSafely(event)
    if (event.type === 'proposal_created') proposals.push(event.proposal)
    if (event.type === 'completed') {
      summary = event.summary
      break
    }
  }

  return {
    taskId: task.id,
    documentRevision: task.document.revision,
    summary: summary || (proposals.length > 0
      ? '已生成修改提案，请在预览中逐条确认。'
      : 'Agent 已结束，未生成可应用的修改提案。'),
    proposals,
  }
}

export async function runEditorAgent(
  options: RunEditorAgentOptions,
): Promise<EditorAgentResult> {
  const runtime = new VercelAiEditorAgentRuntime({
    endpoint: options.endpoint,
    model: options.model,
    maxSteps: options.maxSteps,
  })
  return runEditorAgentWithRuntime(options, runtime)
}

export interface RunDirectEditAgentOptions<
  C extends EditorAiExecutionCapability = EditorAiExecutionCapability,
> {
  readonly endpoint: EditorAiEndpoint
  readonly model: string
  readonly instruction: string
  readonly taskType: DirectEditAgentTask['taskType']
  readonly host: AiDocumentHost<C>
  readonly modelCapabilities: DeepReadonly<EditorAiModelCapabilities>
  readonly authorization: DeepReadonly<EditorOperationAuthorization>
  readonly contextBudget?: DeepReadonly<EditorAiContextBudget>
  readonly taskId?: string
  readonly signal?: AbortSignal
  readonly maxSteps?: number
  readonly maxAutoFixIterations?: number
  readonly onEvent?: (event: DirectEditAgentEvent<EditorAiSnapshotByCapability[C]>) => void
}

export type RunDirectEditAgentResult =
  | {
      readonly mode: 'direct_edit'
      readonly metadata: EditorAiCompletedTaskMetadata
      readonly commit: DeepReadonly<EditorAiCommitResult>
    }
  | {
      readonly mode: 'suggestion_only'
      readonly suggestion: string
      readonly degradations: readonly EditorAiDegradation[]
    }

const DEFAULT_CONTEXT_LIMITS = {
  adjacentPreviewMaxPixels: 2_000_000,
  assetCandidateLimit: 100,
  remoteSpreadSummaryLimit: 100,
  narrativeVisualSegmentLimit: 100,
} as const

function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw createAbortError(signal.reason)
}

function executionError(
  code: ConstructorParameters<typeof EditorAiExecutionError>[0],
  message: string,
  cause?: unknown,
): EditorAiExecutionError {
  return cause === undefined
    ? new EditorAiExecutionError(code, message)
    : new EditorAiExecutionError(code, message, { cause })
}

function warningKey(warning: DeepReadonly<AiTaskWarning>): string {
  return `${warning.code}\u0000${warning.message}\u0000${(warning.targetIds ?? []).join('\u0000')}`
}

function dedupeWarnings(warnings: ReadonlyArray<DeepReadonly<AiTaskWarning>>): AiTaskWarning[] {
  const indexByKey = new Map<string, number>()
  const output: AiTaskWarning[] = []
  for (const warning of warnings) {
    const key = warningKey(warning)
    const existingIndex = indexByKey.get(key)
    if (existingIndex !== undefined) {
      const existing = output[existingIndex]
      if (existing.severity === 'info' && warning.severity === 'warning') {
        output[existingIndex] = { ...existing, severity: 'warning' }
      }
      continue
    }
    indexByKey.set(key, output.length)
    output.push({
      code: warning.code,
      message: warning.message,
      severity: warning.severity,
      ...(warning.targetIds ? { targetIds: [...warning.targetIds] } : {}),
    })
  }
  return output
}

function warningCodes(warnings: ReadonlyArray<DeepReadonly<AiTaskWarning>>): string[] {
  return [...new Set(warnings.map((warning) => warning.code))]
}

const SAVE_FAILED_WARNING: AiTaskWarning = {
  code: 'save_failed',
  message: 'The visible edit was committed, but saving failed.',
  severity: 'warning',
}

const COMMIT_REVISION_INVALID_WARNING: AiTaskWarning = {
  code: 'commit_revision_invalid',
  message: 'The host returned an invalid commit revision; the simulated revision was retained.',
  severity: 'warning',
}

const HOST_UNLOCK_FAILED_WARNING: AiTaskWarning = {
  code: 'host_unlock_failed',
  message: 'The edit was applied, but the editor could not be unlocked.',
  severity: 'warning',
}

function validateBatch<C extends EditorAiExecutionCapability>(
  value: unknown,
  task: DirectEditAgentTask<EditorAiSnapshotByCapability[C]>,
): EditorAiCommitBatch<C> {
  const parsed = editorOperationBatchSchema.safeParse(value)
  if (!parsed.success) {
    throw executionError('invalid_operation_batch', 'Runtime produced an invalid operation batch')
  }
  const batch = parsed.data
  const snapshot = task.snapshot
  const targetMatches = snapshot.capability === 'narrative'
    ? batch.target.documentId === snapshot.documentId && batch.target.spreadId === undefined
    : batch.target.documentId === snapshot.projectId && batch.target.spreadId === snapshot.targetSpreadId
  if (
    batch.taskId !== task.id
    || batch.capability !== snapshot.capability
    || batch.baseRevision !== snapshot.revision
    || !targetMatches
  ) {
    throw executionError('invalid_operation_batch', 'Operation batch identity does not match the captured task')
  }
  const authorizationIssues = validateOperationAuthorization(
    batch.operations,
    task.authorization as EditorOperationAuthorization,
  )
  if (authorizationIssues.length > 0) {
    throw executionError(
      'operation_not_authorized',
      `Operation batch is not authorized: ${authorizationIssues.map((issue) => issue.code).join(', ')}`,
    )
  }
  return batch as unknown as EditorAiCommitBatch<C>
}

function targetForSnapshot(snapshot: DeepReadonly<StructuredEditorSnapshot>): {
  documentId: string
  spreadId?: string
} {
  return snapshot.capability === 'narrative'
    ? { documentId: snapshot.documentId }
    : { documentId: snapshot.projectId, spreadId: snapshot.targetSpreadId }
}

function targetLabel(snapshot: DeepReadonly<StructuredEditorSnapshot>): string {
  if (snapshot.capability === 'zine') return `Zine spread ${snapshot.targetSpreadId}`
  return snapshot.title?.trim() || `${snapshot.documentKind} ${snapshot.documentId}`
}

export async function runDirectEditAgentWithRuntime<
  C extends EditorAiExecutionCapability,
>(
  options: RunDirectEditAgentOptions<C>,
  runtime: DirectEditAgentRuntime<EditorAiSnapshotByCapability[C]>,
): Promise<RunDirectEditAgentResult> {
  const startedAt = Date.now()
  const taskId = options.taskId || createEditorAgentTaskId()
  let lockAcquired = false
  let unlockAttempted = false
  let terminalErrorSeen = false
  let stoppedSeen = false
  let failedSeen = false
  let commitSucceeded = false
  let primaryError: unknown
  let result: RunDirectEditAgentResult | undefined
  let pendingDirectEditResult: Extract<RunDirectEditAgentResult, { mode: 'direct_edit' }> | undefined

  const emit = (event: DirectEditAgentEvent<EditorAiSnapshotByCapability[C]>): void => {
    if (event.type === 'error') terminalErrorSeen = true
    if (event.type === 'status_changed' && event.status === 'stopped') stoppedSeen = true
    if (event.type === 'status_changed' && event.status === 'failed') failedSeen = true
    try {
      options.onEvent?.(event)
    } catch {
      // Observers are best-effort and must not affect orchestration.
    }
  }

  const unlockOnce = (): void => {
    if (!lockAcquired || unlockAttempted) return
    unlockAttempted = true
    options.host.unlock(taskId)
  }

  try {
    checkAbort(options.signal)
    const capabilities = resolveEditorAiCapabilities(options.modelCapabilities)
    if (capabilities.executionMode === 'direct_edit') {
      options.host.lock(taskId)
      lockAcquired = true
    }
    const fullSnapshot = await options.host.captureSnapshot(options.signal)
    checkAbort(options.signal)
    const identityIssues = validateDirectEditTaskTargetIdentity(
      fullSnapshot as StructuredEditorSnapshot,
      options.authorization as EditorOperationAuthorization,
    )
    if (identityIssues.length > 0) {
      throw executionError(
        'operation_not_authorized',
        `Direct-edit task target is not authorized: ${identityIssues.map((issue) => issue.code).join(', ')}`,
      )
    }
    const budget = options.contextBudget ?? (
      options.modelCapabilities.maxInputTokens === undefined
        ? undefined
        : { maxInputTokens: options.modelCapabilities.maxInputTokens, ...DEFAULT_CONTEXT_LIMITS }
    )
    const budgetResult = budget
      ? applyEditorAiContextBudget(fullSnapshot as EditorAiSnapshotByCapability[C], budget)
      : {
          snapshot: structuredClone(fullSnapshot) as DeepReadonly<EditorAiSnapshotByCapability[C]>,
          accepted: true,
        }
    if (!budgetResult.accepted) {
      throw executionError('context_budget_exceeded', 'Editor context cannot fit within the configured budget')
    }
    const task: DirectEditAgentTask<EditorAiSnapshotByCapability[C]> = {
      id: taskId,
      taskType: options.taskType,
      instruction: options.instruction,
      snapshot: budgetResult.snapshot as DeepReadonly<EditorAiSnapshotByCapability[C]>,
      authorization: options.authorization,
      modelCapabilities: options.modelCapabilities,
    }
    const batches: unknown[] = []
    const warnings: Array<DeepReadonly<AiTaskWarning>> = []
    const completedSummary: string[] = []
    let suggestion = ''

    let runtimeTerminalError: EditorAiExecutionError | undefined
    let runtimeStopped = false
    let runtimeFailed = false
    for await (const event of runtime.run(task, { signal: options.signal })) {
      if (runtimeTerminalError || runtimeStopped || runtimeFailed) break
      if (event.type === 'error') {
        runtimeTerminalError = new EditorAiExecutionError(event.code, event.message)
        emit(event)
        break
      }
      if (event.type === 'status_changed' && event.status === 'stopped') {
        runtimeStopped = true
        emit(event)
        break
      }
      if (event.type === 'status_changed' && event.status === 'failed') {
        runtimeFailed = true
        emit(event)
        break
      }
      if (event.type === 'operation_batch_created') batches.push(event.batch)
      if (event.type === 'warning') warnings.push(event.warning)
      if (event.type === 'text_delta') suggestion += event.text
      if (event.type === 'completed') {
        completedSummary.push(...event.summary)
      }
      const suppressTerminal = capabilities.executionMode === 'direct_edit' && (
        event.type === 'completed'
        || (event.type === 'status_changed' && event.status === 'completed')
      )
      if (!suppressTerminal) emit(event)
      if (
        event.type === 'completed'
        || (event.type === 'status_changed' && event.status === 'completed')
      ) {
        break
      }
    }
    if (runtimeTerminalError) throw runtimeTerminalError
    if (runtimeStopped) throw createAbortError('Runtime stopped')
    if (runtimeFailed) {
      throw executionError('invalid_operation_batch', 'Direct-edit runtime reported a failed status')
    }
    checkAbort(options.signal)

    if (capabilities.executionMode === 'suggestion_only') {
      if (batches.length !== 0) {
        throw executionError('invalid_operation_batch', 'Suggestion-only runtime must not create operation batches')
      }
      const finalSuggestion = suggestion.trim() || completedSummary.join('\n').trim()
      if (!finalSuggestion) {
        throw executionError('capability_unavailable', 'Suggestion-only runtime returned no suggestion text')
      }
      result = { mode: 'suggestion_only', suggestion: finalSuggestion, degradations: capabilities.degradations }
    } else {
      if (batches.length !== 1) {
        throw executionError('invalid_operation_batch', 'Direct-edit runtime must create exactly one operation batch')
      }
      const authoritativeBatch = validateBatch(batches[0], task)
      emit({ type: 'status_changed', status: 'simulating' })
      let simulation: EditorAiSimulationResultForCapability<C>
      try {
        simulation = await options.host.simulate(
          fullSnapshot as never,
          authoritativeBatch.operations as never,
          options.signal,
        ) as EditorAiSimulationResultForCapability<C>
      } catch (error) {
        if (error instanceof EditorAiExecutionError || (error instanceof Error && error.name === 'AbortError')) throw error
        throw executionError('simulation_failed', 'Editor host simulation failed', error)
      }
      checkAbort(options.signal)
      emit({ type: 'status_changed', status: 'validating' })
      if (hasEditorAiValidationErrors(simulation.issues)) {
        throw new EditorAiExecutionError(
          'validation_failed',
          'Editor host rejected the simulated operation batch',
          { issues: simulation.issues },
        )
      }
      checkAbort(options.signal)
      assertEditorAiRevision(authoritativeBatch.baseRevision, options.host.getCurrentRevision())

      const simulationWarnings: AiTaskWarning[] = simulation.issues
        .filter((issue) => issue.severity !== 'error')
        .map((issue) => ({
          code: issue.code,
          message: issue.message,
          severity: issue.severity as 'warning' | 'info',
          ...(issue.targetIds ? { targetIds: [...issue.targetIds] } : {}),
        }))
      const preCommitWarnings = dedupeWarnings([...warnings, ...simulationWarnings])
      const summary = authoritativeBatch.summary.length > 0
        ? [...authoritativeBatch.summary]
        : completedSummary.length > 0
          ? completedSummary
          : ['Applied editor operation batch.']
      const preCommitMetadata = {
        taskId,
        status: 'completed' as const,
        capability: fullSnapshot.capability,
        taskType: options.taskType,
        target: targetForSnapshot(fullSnapshot),
        model: options.model,
        visualMode: capabilities.visualMode,
        summary,
        warningCodes: warningCodes(preCommitWarnings),
        operationSummary: summarizeOperations(authoritativeBatch.operations as DirectEditorOperation[]),
        changeSet: {
          taskId,
          targetLabel: targetLabel(fullSnapshot),
          entries: simulation.changeEntries.map((entry) => structuredClone(entry)),
          warnings: preCommitWarnings,
          state: 'applied' as const,
        },
        baseRevision: authoritativeBatch.baseRevision,
        resultRevision: simulation.resultRevision,
        durationMs: Math.max(0, Math.floor(Date.now() - startedAt)),
      }
      const reservedWarnings = dedupeWarnings([
        ...preCommitWarnings,
        SAVE_FAILED_WARNING,
        COMMIT_REVISION_INVALID_WARNING,
        HOST_UNLOCK_FAILED_WARNING,
      ])
      const preflightWithReservedWarnings = {
        ...preCommitMetadata,
        warningCodes: warningCodes(reservedWarnings),
        changeSet: {
          ...preCommitMetadata.changeSet,
          warnings: reservedWarnings,
        },
      }
      const preflight = editorAiTaskMetadataSchema.safeParse(preflightWithReservedWarnings)
      if (!preflight.success) {
        throw executionError('validation_failed', 'Editor task metadata failed pre-commit validation', preflight.error)
      }
      const safeBaseMetadata = editorAiTaskMetadataSchema.parse(preCommitMetadata) as EditorAiCompletedTaskMetadata

      checkAbort(options.signal)
      emit({ type: 'status_changed', status: 'applying' })
      checkAbort(options.signal)
      assertEditorAiRevision(authoritativeBatch.baseRevision, options.host.getCurrentRevision())
      let commit: EditorAiCommitResult
      try {
        const commitBatch = options.host.commit as (
          batch: EditorAiCommitBatch<EditorAiExecutionCapability>,
          result: EditorAiSimulationResultForCapability<EditorAiExecutionCapability>,
        ) => Promise<EditorAiCommitResult>
        commit = await commitBatch.call(options.host, authoritativeBatch, simulation)
        commitSucceeded = true
      } catch (error) {
        if (error instanceof EditorAiExecutionError) throw error
        throw executionError('commit_failed', 'Editor host commit failed', error)
      }

      const commitRevisionCandidate = {
        ...safeBaseMetadata,
        resultRevision: commit.resultRevision,
      }
      const commitRevisionIsValid = editorAiTaskMetadataSchema.safeParse(commitRevisionCandidate).success
      const commitWarnings = [
        ...(commit.saved ? [] : [SAVE_FAILED_WARNING]),
        ...(commitRevisionIsValid ? [] : [COMMIT_REVISION_INVALID_WARNING]),
      ]
      const finalWarnings = dedupeWarnings([...safeBaseMetadata.changeSet.warnings, ...commitWarnings])
      const metadata: EditorAiCompletedTaskMetadata = {
        ...safeBaseMetadata,
        warningCodes: warningCodes(finalWarnings),
        changeSet: {
          ...safeBaseMetadata.changeSet,
          warnings: finalWarnings,
        },
        resultRevision: commitRevisionIsValid ? commit.resultRevision : safeBaseMetadata.resultRevision,
        durationMs: Math.max(0, Math.floor(Date.now() - startedAt)),
      }
      pendingDirectEditResult = { mode: 'direct_edit', metadata, commit }
      try {
        unlockOnce()
      } catch {
        const cleanupWarnings = dedupeWarnings([
          ...pendingDirectEditResult.metadata.changeSet.warnings,
          HOST_UNLOCK_FAILED_WARNING,
        ])
        pendingDirectEditResult = {
          ...pendingDirectEditResult,
          metadata: {
            ...pendingDirectEditResult.metadata,
            warningCodes: warningCodes(cleanupWarnings),
            changeSet: {
              ...pendingDirectEditResult.metadata.changeSet,
              warnings: cleanupWarnings,
            },
          },
        }
        emit({ type: 'warning', warning: HOST_UNLOCK_FAILED_WARNING })
      }
      emit({ type: 'completed', summary })
      emit({ type: 'status_changed', status: 'completed' })
      result = pendingDirectEditResult
    }
  } catch (error) {
    primaryError = error
    const aborted = options.signal?.aborted || (error instanceof Error && error.name === 'AbortError')
    try {
      if (aborted) {
        if (!stoppedSeen) emit({ type: 'status_changed', status: 'stopped' })
      } else {
        const normalized = error instanceof EditorAiExecutionError
          ? error
          : executionError('invalid_operation_batch', error instanceof Error ? error.message : String(error), error)
        if (!terminalErrorSeen && !failedSeen) {
          emit({ type: 'error', code: normalized.code, message: normalized.message })
        }
        if (!failedSeen) emit({ type: 'status_changed', status: 'failed' })
        primaryError = normalized
      }
    } catch {
      // Event callback failures must not mask the original orchestration failure.
    }
  }

  if (lockAcquired && !unlockAttempted) {
    try {
      unlockOnce()
    } catch (error) {
      if (primaryError === undefined && !commitSucceeded) {
        primaryError = executionError('commit_failed', 'Editor host unlock failed', error)
      }
    }
  }
  if (primaryError !== undefined) throw primaryError
  if (result === undefined) throw executionError('invalid_operation_batch', 'Editor orchestration produced no result')
  return result
}

export async function runDirectEditAgent<C extends EditorAiExecutionCapability>(
  options: RunDirectEditAgentOptions<C>,
): Promise<RunDirectEditAgentResult> {
  const runtime = new VercelAiDirectEditAgentRuntime({
    endpoint: options.endpoint,
    model: options.model,
    maxSteps: options.maxSteps,
    maxAutoFixIterations: options.maxAutoFixIterations,
  })
  return runDirectEditAgentWithRuntime(options, runtime)
}
