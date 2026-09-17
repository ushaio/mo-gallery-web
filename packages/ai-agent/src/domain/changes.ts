import { z } from 'zod'

import type { EditorAiCapability } from './document'
import type { JsonValue } from './json'
import {
  MAX_EDITOR_OPERATION_BATCH_OPERATIONS,
  MAX_EDITOR_OPERATION_BATCH_SUMMARIES,
  MAX_EDITOR_OPERATION_ID_LENGTH,
  MAX_EDITOR_OPERATION_SUMMARY_LENGTH,
} from './operations'
import type { DirectEditorOperation } from './operations'
import { isDescriptorSafeInertJson } from './inert-json'

export const MAX_AI_CHANGE_ENTRIES = MAX_EDITOR_OPERATION_BATCH_OPERATIONS
export const MAX_AI_TASK_WARNINGS = MAX_EDITOR_OPERATION_BATCH_SUMMARIES
export const MAX_AI_OPERATION_SUMMARIES = MAX_EDITOR_OPERATION_BATCH_SUMMARIES
export const MAX_AI_TARGET_IDS = 100
export const MAX_AI_SHORT_TEXT_LENGTH = MAX_EDITOR_OPERATION_ID_LENGTH
export const MAX_AI_LONG_TEXT_LENGTH = MAX_EDITOR_OPERATION_SUMMARY_LENGTH

export type AiChangeCategory = 'content' | 'structure' | 'style' | 'asset' | 'layout'
export type AiChangeSetState = 'applied' | 'undone' | 'redone'

export interface AiTaskWarning {
  code: string
  message: string
  severity: 'warning' | 'info'
  targetIds?: string[]
}

export interface AiChangeEntry {
  operation: string
  targetId: string
  targetLabel: string
  category: AiChangeCategory
  before?: JsonValue
  after?: JsonValue
}

export interface AiChangeSet {
  taskId: string
  targetLabel: string
  entries: AiChangeEntry[]
  warnings: AiTaskWarning[]
  state: AiChangeSetState
}

export interface EditorAiOperationSummary {
  type: string
  targetIds: string[]
}

interface EditorAiTaskMetadataBase {
  taskId: string
  capability: EditorAiCapability
  taskType: 'instruction' | 'page_audit'
  target: { documentId: string; spreadId?: string }
  model: string
  visualMode: 'vision' | 'structure_only'
  summary: string[]
  warningCodes: string[]
  operationSummary: EditorAiOperationSummary[]
  baseRevision: string
  durationMs: number
}

export interface EditorAiCompletedTaskMetadata extends EditorAiTaskMetadataBase {
  status: 'completed'
  changeSet: AiChangeSet
  resultRevision: string
}

export interface EditorAiUnsuccessfulTaskMetadata extends EditorAiTaskMetadataBase {
  status: 'failed' | 'stopped'
  changeSet?: never
  resultRevision?: never
}

export type EditorAiTaskMetadata =
  | EditorAiCompletedTaskMetadata
  | EditorAiUnsuccessfulTaskMetadata

const IMAGE_DATA_URL_PATTERN = /^data:image\//i

function isDescriptorSafePersistedJson(value: unknown): value is JsonValue {
  return isDescriptorSafeInertJson(value, {
    sharedReferences: 'allow-validated',
    rejectString: (candidate) => IMAGE_DATA_URL_PATTERN.test(candidate),
  })
}

const persistedJsonPreflightSchema = z.custom<JsonValue>(isDescriptorSafePersistedJson, {
  message: 'Expected descriptor-safe persisted JSON without image data URLs',
})
const shortTextSchema = z.string()
  .trim()
  .min(1)
  .max(MAX_AI_SHORT_TEXT_LENGTH)
  .refine((value) => !IMAGE_DATA_URL_PATTERN.test(value), {
    message: 'Expected text without an image data URL',
  })
const longTextSchema = z.string().max(MAX_AI_LONG_TEXT_LENGTH)
const targetIdsSchema = z.array(shortTextSchema).max(MAX_AI_TARGET_IDS)
const persistedJsonValueSchema = persistedJsonPreflightSchema

const aiTaskWarningObjectSchema = z.object({
  code: shortTextSchema,
  message: longTextSchema,
  severity: z.enum(['warning', 'info']),
  targetIds: targetIdsSchema.optional(),
}).strict()

export const aiTaskWarningSchema = persistedJsonPreflightSchema.pipe(aiTaskWarningObjectSchema)

const aiChangeEntryObjectSchema = z.object({
  operation: shortTextSchema,
  targetId: shortTextSchema,
  targetLabel: shortTextSchema,
  category: z.enum(['content', 'structure', 'style', 'asset', 'layout']),
  before: persistedJsonValueSchema.optional(),
  after: persistedJsonValueSchema.optional(),
}).strict()

export const aiChangeEntrySchema = persistedJsonPreflightSchema.pipe(aiChangeEntryObjectSchema)

const aiChangeSetObjectSchema = z.object({
  taskId: shortTextSchema,
  targetLabel: shortTextSchema,
  entries: z.array(aiChangeEntryObjectSchema).max(MAX_AI_CHANGE_ENTRIES),
  warnings: z.array(aiTaskWarningObjectSchema).max(MAX_AI_TASK_WARNINGS),
  state: z.enum(['applied', 'undone', 'redone']),
}).strict()

export const aiChangeSetSchema = persistedJsonPreflightSchema.pipe(aiChangeSetObjectSchema)

const editorAiTargetSchema = z.object({
  documentId: shortTextSchema,
  spreadId: shortTextSchema.optional(),
}).strict()

const operationSummarySchema = z.object({
  type: shortTextSchema,
  targetIds: targetIdsSchema,
}).strict()

const metadataBaseShape = {
  taskId: shortTextSchema,
  capability: z.enum(['narrative', 'zine']),
  taskType: z.enum(['instruction', 'page_audit']),
  target: editorAiTargetSchema,
  model: shortTextSchema,
  visualMode: z.enum(['vision', 'structure_only']),
  summary: z.array(longTextSchema).max(MAX_AI_TASK_WARNINGS),
  warningCodes: z.array(shortTextSchema).max(MAX_AI_TASK_WARNINGS),
  operationSummary: z.array(operationSummarySchema).max(MAX_AI_OPERATION_SUMMARIES),
  baseRevision: shortTextSchema,
  durationMs: z.number().finite().int().nonnegative(),
}

const editorAiTaskMetadataObjectSchema = z.discriminatedUnion('status', [
  z.object({
    ...metadataBaseShape,
    status: z.literal('completed'),
    changeSet: aiChangeSetObjectSchema,
    resultRevision: shortTextSchema,
  }).strict(),
  z.object({
    ...metadataBaseShape,
    status: z.enum(['failed', 'stopped']),
  }).strict(),
])

export const editorAiTaskMetadataSchema = persistedJsonPreflightSchema
  .pipe(editorAiTaskMetadataObjectSchema)

export function parseEditorAiTaskMetadata(value: unknown): EditorAiTaskMetadata {
  return editorAiTaskMetadataSchema.parse(value) as EditorAiTaskMetadata
}

export function isEditorAiTaskMetadata(value: unknown): value is EditorAiTaskMetadata {
  return editorAiTaskMetadataSchema.safeParse(value).success
}

function extractOperationTargetIds(operation: DirectEditorOperation): string[] {
  if (operation.type === 'apply_layout_template') return [...operation.targetSlotIds]
  if ('nodeId' in operation) return [operation.nodeId]
  if ('slotId' in operation) return [operation.slotId]
  if (operation.type === 'insert_node') return [operation.parentId]
  if ('assetId' in operation && typeof operation.assetId === 'string') return [operation.assetId]
  return []
}

export function summarizeOperations(
  operations: DirectEditorOperation[],
): EditorAiOperationSummary[] {
  const summaries: EditorAiOperationSummary[] = []
  const summaryByType = new Map<string, { summary: EditorAiOperationSummary; targets: Set<string> }>()

  for (const operation of operations) {
    let grouped = summaryByType.get(operation.type)
    if (grouped === undefined) {
      grouped = { summary: { type: operation.type, targetIds: [] }, targets: new Set() }
      summaryByType.set(operation.type, grouped)
      summaries.push(grouped.summary)
    }
    for (const targetId of extractOperationTargetIds(operation)) {
      if (!grouped.targets.has(targetId)) {
        grouped.targets.add(targetId)
        grouped.summary.targetIds.push(targetId)
      }
    }
  }

  return summaries
}
