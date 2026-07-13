import { isStepCount, tool, ToolLoopAgent } from 'ai'
import type { LanguageModel, ToolSet } from 'ai'
import { z } from 'zod'

import { buildDirectEditMessages } from '../../direct-edit-prompt'
import type {
  DirectEditAgentEvent,
  DirectEditAgentRuntime,
  DirectEditAgentRuntimeRunOptions,
  DirectEditAgentTask,
} from '../../domain/agent'
import {
  MAX_AI_LONG_TEXT_LENGTH,
  MAX_AI_TARGET_IDS,
  MAX_AI_TASK_WARNINGS,
} from '../../domain/changes'
import { resolveEditorAiCapabilities } from '../../domain/capabilities'
import type { StructuredEditorSnapshot } from '../../domain/document'
import { EditorAiExecutionError } from '../../domain/execution'
import { toJsonValue } from '../../domain/json'
import type { JsonValue } from '../../domain/json'
import {
  MAX_EDITOR_OPERATION_BATCH_OPERATIONS,
  MAX_EDITOR_OPERATION_BATCH_SUMMARIES,
  MAX_EDITOR_OPERATION_ID_LENGTH,
  MAX_EDITOR_OPERATION_JSON_LENGTH,
  MAX_EDITOR_OPERATION_REPLACEMENT_LENGTH,
  MAX_EDITOR_OPERATION_SUMMARY_LENGTH,
  MAX_EDITOR_TEMPLATE_TARGET_SLOT_IDS,
  editorOperationBatchSchema,
  narrativeEditorOperationSchema,
  serializedJsonLengthWithin,
  validateDirectEditTaskTargetIdentity,
  validateOperationAuthorization,
  zineEditorOperationSchema,
} from '../../domain/operations'
import type { DirectEditorOperation, EditorOperationBatch } from '../../domain/operations'
import type { EditorAiEndpoint } from '../../types'
import { createAbortError, normalizeAiError } from './errors'
import { toVercelAiModelInput } from './messages'
import { createVercelAiLanguageModel } from './provider'

export interface VercelAiDirectEditAgentRuntimeOptions {
  endpoint: EditorAiEndpoint
  model: string
  temperature?: number
  maxSteps?: number
  maxAutoFixIterations?: number
  /** Package-internal test/custom runtime injection; intentionally not root-exported. */
  languageModel?: LanguageModel
}

type ToolFailureCode =
  | 'invalid_tool_input'
  | 'operation_limit_exceeded'
  | 'warning_limit_exceeded'
  | 'duplicate_operation_id'
  | 'batch_already_submitted'
  | 'invalid_operation_batch'
  | 'operation_not_authorized'
  | 'delete_not_authorized'
  | 'delete_target_not_authorized'
  | 'wrong_target_spread'
  | 'asset_not_in_project'

interface ToolFailure {
  ok: false
  error: { code: ToolFailureCode; message: string }
}

function failure(code: ToolFailureCode, message: string): ToolFailure {
  return { ok: false, error: { code, message } }
}

function snapshotJson(snapshot: DirectEditAgentTask['snapshot']): JsonValue {
  const project = (value: unknown): JsonValue => {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
    if (typeof value === 'number') return Number.isFinite(value) ? value : String(value)
    if (Array.isArray(value)) return value.map(project)
    if (typeof value === 'object') {
      const output: Record<string, JsonValue> = {}
      for (const [key, entry] of Object.entries(value)) {
        if (key !== 'dataUrl') output[key] = project(entry)
      }
      return output
    }
    return String(value)
  }
  return project(snapshot)
}

const boundedIdSchema = z.string().trim().min(1).max(MAX_EDITOR_OPERATION_ID_LENGTH)
const warningInputSchema = z.object({
  code: boundedIdSchema,
  message: z.string().max(MAX_AI_LONG_TEXT_LENGTH),
  severity: z.enum(['warning', 'info']),
  targetIds: z.array(boundedIdSchema).max(MAX_AI_TARGET_IDS).optional(),
}).strict()
const submitSchema = z.object({
  summary: z.array(z.string().min(1).max(MAX_EDITOR_OPERATION_SUMMARY_LENGTH))
    .max(MAX_EDITOR_OPERATION_BATCH_SUMMARIES),
}).strict()
const emptySchema = z.object({}).strict()

const jsonInputSchema = z.json()
const jsonRecordInputSchema = z.record(z.string(), jsonInputSchema)
const narrativeMutationInputSchema = z.discriminatedUnion('type', [
  z.object({ operationId: boundedIdSchema, type: z.literal('replace_text'), nodeId: boundedIdSchema, from: z.number().int().nonnegative(), to: z.number().int().nonnegative(), replacement: z.string().max(MAX_EDITOR_OPERATION_REPLACEMENT_LENGTH) }).strict(),
  z.object({ operationId: boundedIdSchema, type: z.literal('set_node_attrs'), nodeId: boundedIdSchema, attrs: jsonRecordInputSchema }).strict(),
  z.object({ operationId: boundedIdSchema, type: z.literal('move_node'), nodeId: boundedIdSchema, targetParentId: boundedIdSchema, index: z.number().int().nonnegative() }).strict(),
  z.object({ operationId: boundedIdSchema, type: z.literal('insert_node'), parentId: boundedIdSchema, index: z.number().int().nonnegative(), node: jsonInputSchema }).strict(),
])
const zineBase = { operationId: boundedIdSchema, spreadId: boundedIdSchema }
const zineMutationInputSchema = z.discriminatedUnion('type', [
  z.object({ ...zineBase, type: z.literal('set_slot_attrs'), slotId: boundedIdSchema, attrs: jsonRecordInputSchema }).strict(),
  z.object({ ...zineBase, type: z.literal('insert_slot'), index: z.number().int().nonnegative(), slot: jsonInputSchema }).strict(),
  z.object({ ...zineBase, type: z.literal('assign_asset'), slotId: boundedIdSchema, assetId: boundedIdSchema }).strict(),
  z.object({ ...zineBase, type: z.literal('set_image_crop'), slotId: boundedIdSchema, crop: z.object({ scale: z.number().positive(), offsetX: z.number(), offsetY: z.number(), rotation: z.number() }).strict() }).strict(),
  z.object({ ...zineBase, type: z.literal('set_layer_order'), slotId: boundedIdSchema, zIndex: z.number() }).strict(),
  z.object({ ...zineBase, type: z.literal('apply_layout_template'), templateId: boundedIdSchema, targetSlotIds: z.array(boundedIdSchema).max(MAX_EDITOR_TEMPLATE_TARGET_SLOT_IDS), options: jsonRecordInputSchema.optional() }).strict(),
])
const deleteNodeSchema = z.object({
  operationId: boundedIdSchema,
  nodeId: boundedIdSchema,
}).strict()
const deleteSlotSchema = z.object({
  operationId: boundedIdSchema,
  spreadId: boundedIdSchema,
  slotId: boundedIdSchema,
}).strict()

function assertTaskTargetIdentity(task: DirectEditAgentTask): void {
  const issue = validateDirectEditTaskTargetIdentity(task.snapshot, task.authorization)[0]
  if (issue) throw new EditorAiExecutionError('operation_not_authorized', issue.message)
}

function buildBatchTarget(task: DirectEditAgentTask): EditorOperationBatch['target'] {
  const snapshot = task.snapshot
  if (snapshot.capability === 'narrative') {
    return { documentId: snapshot.documentId }
  }
  return { documentId: snapshot.projectId, spreadId: snapshot.targetSpreadId }
}

function createRuntimeTools(
  task: DirectEditAgentTask,
  capability: 'narrative' | 'zine',
  maxAutoFixIterations: number,
) {
  const operations: DirectEditorOperation[] = []
  const operationIds = new Set<string>()
  let submittedBatch: EditorOperationBatch | undefined
  let rejectedCorrectionAttempts = 0
  let acceptedWarningCount = 0

  // Schema-level tool errors never execute; only deterministic executable rejections consume this budget.
  const reject = (code: ToolFailureCode, message: string): ToolFailure => {
    rejectedCorrectionAttempts += 1
    if (rejectedCorrectionAttempts > maxAutoFixIterations) {
      throw new EditorAiExecutionError(
        'validation_failed',
        `Direct-edit validation correction limit exceeded after ${rejectedCorrectionAttempts} rejected tool attempts (maximum ${maxAutoFixIterations})`,
      )
    }
    return failure(code, message)
  }

  const accept = (operation: DirectEditorOperation) => {
    if (submittedBatch) {
      return failure('batch_already_submitted', 'An operation batch was already submitted')
    }
    if (operationIds.has(operation.operationId)) {
      return reject('duplicate_operation_id', `Duplicate operationId: ${operation.operationId}`)
    }
    if (operations.length >= MAX_EDITOR_OPERATION_BATCH_OPERATIONS) {
      return reject(
        'operation_limit_exceeded',
        `Operation limit exceeded: at most ${MAX_EDITOR_OPERATION_BATCH_OPERATIONS} operations may be accepted`,
      )
    }
    const authorization = {
      allowDelete: task.authorization.allowDelete,
      deleteTargetIds: [...task.authorization.deleteTargetIds],
      ...(task.authorization.targetSpreadId !== undefined
        ? { targetSpreadId: task.authorization.targetSpreadId }
        : {}),
      ...(task.authorization.projectAssetIds
        ? { projectAssetIds: [...task.authorization.projectAssetIds] }
        : {}),
    }
    const issue = validateOperationAuthorization([operation], authorization)[0]
    if (issue) return reject(issue.code, `Operation ${operation.operationId} is not authorized: ${issue.code}`)
    const operationCapability = 'spreadId' in operation ? 'zine' : 'narrative'
    if (operationCapability !== capability) {
      return reject('invalid_operation_batch', `Operation ${operation.operationId} does not match ${capability}`)
    }
    operationIds.add(operation.operationId)
    operations.push(operation)
    return { ok: true as const, operation }
  }

  const validateStructuredPayload = (input: z.infer<typeof narrativeMutationInputSchema> | z.infer<typeof zineMutationInputSchema>): ToolFailure | undefined => {
    let payload: JsonValue | undefined
    switch (input.type) {
      case 'set_node_attrs':
      case 'set_slot_attrs':
        payload = input.attrs
        break
      case 'insert_node':
        payload = input.node
        break
      case 'insert_slot':
        payload = input.slot
        break
      case 'apply_layout_template':
        payload = input.options
        break
    }
    if (payload !== undefined && !serializedJsonLengthWithin(payload, MAX_EDITOR_OPERATION_JSON_LENGTH)) {
      return reject(
        'invalid_tool_input',
        `payload_too_large: structured operation payload exceeds ${MAX_EDITOR_OPERATION_JSON_LENGTH} serialized JSON characters`,
      )
    }
    return undefined
  }

  const common: ToolSet = {
    read_snapshot: tool({
      description: 'Read the immutable, budgeted task snapshot. Image binary is represented by metadata only.',
      inputSchema: emptySchema,
      execute: async () => ({ ok: true as const, snapshot: snapshotJson(task.snapshot) }),
    }),
    report_warning: tool({
      description: 'Report a bounded task warning that cannot or should not be fixed automatically.',
      inputSchema: warningInputSchema,
      execute: async (warning) => {
        if (acceptedWarningCount >= MAX_AI_TASK_WARNINGS) {
          return reject(
            'warning_limit_exceeded',
            `Warning limit exceeded: at most ${MAX_AI_TASK_WARNINGS} warnings may be accepted`,
          )
        }
        acceptedWarningCount += 1
        return { ok: true as const, warning }
      },
    }),
    submit_operation_batch: tool({
      description: 'Finalize exactly one authoritative operation batch from accepted operations.',
      inputSchema: submitSchema,
      execute: async ({ summary }) => {
        if (submittedBatch) return reject('batch_already_submitted', 'An operation batch was already submitted')
        assertTaskTargetIdentity(task)
        const snapshot = task.snapshot
        const batch: EditorOperationBatch = {
          taskId: task.id,
          capability,
          baseRevision: snapshot.revision,
          target: buildBatchTarget(task),
          operations: [...operations],
          summary: [...summary],
        }
        const parsed = editorOperationBatchSchema.safeParse(batch)
        if (!parsed.success) return reject('invalid_operation_batch', 'The finalized operation batch is invalid')
        const authorization = {
          allowDelete: task.authorization.allowDelete,
          deleteTargetIds: [...task.authorization.deleteTargetIds],
          ...(task.authorization.targetSpreadId !== undefined
            ? { targetSpreadId: task.authorization.targetSpreadId }
            : {}),
          ...(task.authorization.projectAssetIds
            ? { projectAssetIds: [...task.authorization.projectAssetIds] }
            : {}),
        }
        const issue = validateOperationAuthorization(parsed.data.operations, authorization)[0]
        if (issue) return reject(issue.code, `Final operation batch is not authorized: ${issue.code}`)
        submittedBatch = parsed.data
        return {
          ok: true as const,
          submitted: true as const,
          operationCount: submittedBatch.operations.length,
          summaryCount: submittedBatch.summary.length,
        }
      },
    }),
  }

  if (capability === 'narrative') {
    common.add_narrative_operation = tool({
      description: 'Add one validated non-delete narrative operation.',
      inputSchema: narrativeMutationInputSchema,
      execute: async (input) => {
        const payloadFailure = validateStructuredPayload(input)
        if (payloadFailure) return payloadFailure
        const parsed = narrativeEditorOperationSchema.safeParse(input)
        return parsed.success
          ? accept(parsed.data)
          : reject('invalid_tool_input', 'Narrative operation failed domain validation')
      },
    })
    if (task.authorization.allowDelete) {
      common.delete_node = tool({
        description: 'Delete one exactly authorized narrative node.',
        inputSchema: deleteNodeSchema,
        execute: async (input) => accept({ ...input, type: 'delete_node' }),
      })
    }
  } else {
    common.add_zine_operation = tool({
      description: 'Add one validated non-delete Zine operation for the current spread.',
      inputSchema: zineMutationInputSchema,
      execute: async (input) => {
        const payloadFailure = validateStructuredPayload(input)
        if (payloadFailure) return payloadFailure
        const parsed = zineEditorOperationSchema.safeParse(input)
        return parsed.success
          ? accept(parsed.data)
          : reject('invalid_tool_input', 'Zine operation failed domain validation')
      },
    })
    if (task.authorization.allowDelete) {
      common.delete_slot = tool({
        description: 'Delete one exactly authorized Zine slot on the current spread.',
        inputSchema: deleteSlotSchema,
        execute: async (input) => accept({ ...input, type: 'delete_slot' }),
      })
    }
  }

  return {
    tools: common,
    getSubmittedBatch: () => submittedBatch,
  }
}

function isSuccessfulWarningOutput(value: unknown): value is { ok: true; warning: z.infer<typeof warningInputSchema> } {
  return Boolean(value && typeof value === 'object' && (value as { ok?: unknown }).ok === true && (value as { warning?: unknown }).warning)
}

export class VercelAiDirectEditAgentRuntime implements DirectEditAgentRuntime<StructuredEditorSnapshot> {
  private readonly options: VercelAiDirectEditAgentRuntimeOptions

  constructor(options: VercelAiDirectEditAgentRuntimeOptions) {
    this.options = options
  }

  async *run<Snapshot extends StructuredEditorSnapshot>(
    task: DirectEditAgentTask<Snapshot>,
    options: DirectEditAgentRuntimeRunOptions = {},
  ): AsyncIterable<DirectEditAgentEvent<Snapshot>> {
    const localTask = structuredClone(task)
    yield { type: 'status_changed', status: 'preparing_context' }
    try {
      if (options.signal?.aborted) throw createAbortError(options.signal.reason)
      const capabilities = resolveEditorAiCapabilities(localTask.modelCapabilities)
      assertTaskTargetIdentity(localTask)
      const modelInput = toVercelAiModelInput(buildDirectEditMessages({ task: localTask, capabilities }))
      const directEdit = capabilities.executionMode === 'direct_edit'
      const maxSteps = this.options.maxSteps ?? 12
      if (!Number.isFinite(maxSteps) || !Number.isInteger(maxSteps) || maxSteps < 1) {
        throw new EditorAiExecutionError(
          'validation_failed',
          'maxSteps must be a finite positive integer',
        )
      }
      const maxAutoFixIterations = this.options.maxAutoFixIterations ?? 2
      if (!Number.isFinite(maxAutoFixIterations) || !Number.isInteger(maxAutoFixIterations) || maxAutoFixIterations < 0) {
        throw new EditorAiExecutionError(
          'validation_failed',
          'maxAutoFixIterations must be a finite nonnegative integer',
        )
      }
      const runtimeTools = directEdit
        ? createRuntimeTools(localTask, localTask.snapshot.capability, maxAutoFixIterations)
        : undefined
      const tools = runtimeTools?.tools ?? {}
      const agent = new ToolLoopAgent({
        model: this.options.languageModel
          ?? createVercelAiLanguageModel(this.options.endpoint, this.options.model),
        ...(modelInput.instructions ? { instructions: modelInput.instructions } : {}),
        tools,
        temperature: this.options.temperature ?? 0.3,
        stopWhen: isStepCount(maxSteps),
      })

      yield { type: 'status_changed', status: 'analyzing' }
      yield { type: 'status_changed', status: 'planning' }
      const result = await agent.stream({ messages: modelInput.messages, abortSignal: options.signal })
      let text = ''

      for await (const part of result.fullStream) {
        if (options.signal?.aborted) throw createAbortError(options.signal.reason)
        switch (part.type) {
          case 'text-delta':
            if (part.text) {
              text += part.text
              yield { type: 'text_delta', text: part.text }
            }
            break
          case 'tool-call':
            yield { type: 'tool_started', toolCallId: part.toolCallId, toolName: part.toolName, input: toJsonValue(part.input) }
            break
          case 'tool-result': {
            const output = toJsonValue(part.output)
            yield { type: 'tool_completed', toolCallId: part.toolCallId, toolName: part.toolName, output }
            if (part.toolName === 'report_warning' && isSuccessfulWarningOutput(part.output)) {
              yield { type: 'warning', warning: part.output.warning }
            }
            break
          }
          case 'tool-error':
            if (part.error instanceof EditorAiExecutionError) throw part.error
            yield {
              type: 'tool_completed',
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              output: toJsonValue(failure('invalid_tool_input', 'Tool input failed strict schema validation')),
            }
            break
          case 'abort':
            throw createAbortError(part.reason ?? options.signal?.reason)
          case 'error':
            throw normalizeAiError(part.error)
          default:
            break
        }
      }

      if (options.signal?.aborted) throw createAbortError(options.signal.reason)
      const submittedBatch = runtimeTools?.getSubmittedBatch()
      const responseText = text.trim()
      if (directEdit && !submittedBatch && !responseText) {
        throw new EditorAiExecutionError(
          'invalid_operation_batch',
          'Direct edit completed without a successful operation batch submission',
        )
      }
      if (submittedBatch) {
        yield { type: 'operation_batch_created', batch: submittedBatch } as unknown as DirectEditAgentEvent<Snapshot>
      }
      const summary = submittedBatch?.summary ?? (responseText ? [responseText] : [])
      yield { type: 'completed', summary }
      yield { type: 'status_changed', status: 'completed' }
    } catch (error) {
      if (options.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
        yield { type: 'status_changed', status: 'stopped' }
        throw createAbortError(options.signal?.reason ?? error)
      }
      const normalized = normalizeAiError(error)
      const executionError = error instanceof EditorAiExecutionError
        ? error
        : new EditorAiExecutionError('invalid_operation_batch', normalized.message, { cause: error })
      yield { type: 'error', code: executionError.code, message: executionError.message }
      yield { type: 'status_changed', status: 'failed' }
      throw executionError
    }
  }
}
