import { z } from 'zod'

import type { EditorAiCapability } from './document'
import type { JsonValue } from './json'

export const MAX_EDITOR_OPERATION_BATCH_OPERATIONS = 500
export const MAX_EDITOR_OPERATION_BATCH_SUMMARIES = 100
export const MAX_EDITOR_OPERATION_SUMMARY_LENGTH = 4000
export const MAX_EDITOR_OPERATION_ID_LENGTH = 256
export const MAX_EDITOR_OPERATION_REPLACEMENT_LENGTH = 100_000
export const MAX_EDITOR_OPERATION_JSON_LENGTH = 250_000
export const MAX_EDITOR_TEMPLATE_TARGET_SLOT_IDS = 500

export interface ReplaceTextOperation {
  type: 'replace_text'
  match: {
    kind: 'exact_text'
    text: string
    occurrence: 'unique'
  }
  /** 空字符串表示删除匹配文本。 */
  replacement: string
}

export interface SetNodeAttrsOperation {
  type: 'set_node_attrs'
  nodeId: string
  attrs: Record<string, JsonValue>
}

export interface MoveNodeOperation {
  type: 'move_node'
  nodeId: string
  targetParentId: string
  index: number
}

export interface InsertNodeOperation {
  type: 'insert_node'
  parentId: string
  index: number
  node: JsonValue
}

export interface DeleteNodeOperation {
  type: 'delete_node'
  nodeId: string
}

export interface ApplyLayoutTemplateOperation {
  type: 'apply_layout_template'
  templateId: string
  targetNodeIds: string[]
  options?: Record<string, JsonValue>
}

export type EditorOperation =
  | ReplaceTextOperation
  | SetNodeAttrsOperation
  | MoveNodeOperation
  | InsertNodeOperation
  | DeleteNodeOperation
  | ApplyLayoutTemplateOperation

export function isReplaceTextOperation(
  operation: EditorOperation,
): operation is ReplaceTextOperation {
  return operation.type === 'replace_text'
}

export type NarrativeEditorOperation =
  | { operationId: string; type: 'replace_text'; nodeId: string; from: number; to: number; replacement: string }
  | { operationId: string; type: 'set_node_attrs'; nodeId: string; attrs: Record<string, JsonValue> }
  | { operationId: string; type: 'move_node'; nodeId: string; targetParentId: string; index: number }
  | { operationId: string; type: 'insert_node'; parentId: string; index: number; node: JsonValue }
  | { operationId: string; type: 'delete_node'; nodeId: string }

export type ZineEditorOperation =
  | { operationId: string; type: 'set_slot_attrs'; spreadId: string; slotId: string; attrs: Record<string, JsonValue> }
  | { operationId: string; type: 'insert_slot'; spreadId: string; index: number; slot: JsonValue }
  | { operationId: string; type: 'delete_slot'; spreadId: string; slotId: string }
  | { operationId: string; type: 'assign_asset'; spreadId: string; slotId: string; assetId: string }
  | { operationId: string; type: 'set_image_crop'; spreadId: string; slotId: string; crop: { scale: number; offsetX: number; offsetY: number; rotation: number } }
  | { operationId: string; type: 'set_layer_order'; spreadId: string; slotId: string; zIndex: number }
  | { operationId: string; type: 'apply_layout_template'; spreadId: string; templateId: string; targetSlotIds: string[]; options?: Record<string, JsonValue> }

export type DirectEditorOperation = NarrativeEditorOperation | ZineEditorOperation

export interface EditorOperationBatch<
  Capability extends EditorAiCapability = EditorAiCapability,
  Operation extends DirectEditorOperation = DirectEditorOperation,
> {
  taskId: string
  capability: Capability
  baseRevision: string
  target: { documentId: string; spreadId?: string }
  operations: Operation[]
  summary: string[]
}

function isInertJsonValue(
  value: unknown,
  ancestors: Set<object> = new Set(),
): value is JsonValue {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value))
  ) return true

  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) return false
    if (ancestors.has(value)) return false
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length')
    if (lengthDescriptor === undefined || !('value' in lengthDescriptor)) return false
    if (Reflect.ownKeys(value).length !== lengthDescriptor.value + 1) return false

    ancestors.add(value)
    for (let index = 0; index < lengthDescriptor.value; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
      if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
        ancestors.delete(value)
        return false
      }
      if (!isInertJsonValue(descriptor.value, ancestors)) {
        ancestors.delete(value)
        return false
      }
    }
    ancestors.delete(value)
    return true
  }

  if (typeof value !== 'object' || value === null) return false
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return false
  if (ancestors.has(value)) return false
  ancestors.add(value)
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') {
      ancestors.delete(value)
      return false
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      ancestors.delete(value)
      return false
    }
    if (!isInertJsonValue(descriptor.value, ancestors)) {
      ancestors.delete(value)
      return false
    }
  }
  ancestors.delete(value)
  return true
}

function isInertJsonRecord(value: unknown): value is Record<string, JsonValue> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return (prototype === Object.prototype || prototype === null) && isInertJsonValue(value)
}

export const jsonValueSchema = z.custom<JsonValue>(isInertJsonValue, {
  message: 'Expected an inert JSON value',
})

export const jsonRecordSchema = z.custom<Record<string, JsonValue>>(isInertJsonRecord, {
  message: 'Expected an inert JSON record',
})

export function serializedJsonLengthWithin(value: JsonValue, limit: number): boolean {
  let length = 0
  const stack: JsonValue[] = [value]

  while (stack.length > 0) {
    const current = stack.pop() as JsonValue
    if (current === null || typeof current !== 'object') {
      length += JSON.stringify(current).length
    } else if (Array.isArray(current)) {
      length += 2 + Math.max(0, current.length - 1)
      for (let index = current.length - 1; index >= 0; index -= 1) stack.push(current[index])
    } else {
      const entries = Object.entries(current)
      length += 2 + Math.max(0, entries.length - 1)
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const [key, entry] = entries[index]
        length += JSON.stringify(key).length + 1
        stack.push(entry)
      }
    }
    if (length > limit) return false
  }

  return true
}

const structuredOperationPayloadSchema = <T extends JsonValue>(schema: z.ZodType<T>) => schema.refine(
  (value) => serializedJsonLengthWithin(value, MAX_EDITOR_OPERATION_JSON_LENGTH),
  { message: `Structured operation payload exceeds ${MAX_EDITOR_OPERATION_JSON_LENGTH} serialized JSON characters` },
)

const boundedJsonValueSchema = structuredOperationPayloadSchema(jsonValueSchema)
const boundedJsonRecordSchema = structuredOperationPayloadSchema(jsonRecordSchema)
const idSchema = z.string().trim().min(1).max(MAX_EDITOR_OPERATION_ID_LENGTH)
const indexSchema = z.number().finite().int().nonnegative()
const finiteNumberSchema = z.number().finite()
const operationIdShape = { operationId: idSchema }
const zineOperationShape = { ...operationIdShape, spreadId: idSchema }

export const narrativeEditorOperationSchema = z.discriminatedUnion('type', [
  z.object({ ...operationIdShape, type: z.literal('replace_text'), nodeId: idSchema, from: indexSchema, to: indexSchema, replacement: z.string().max(MAX_EDITOR_OPERATION_REPLACEMENT_LENGTH) }).strict().superRefine((operation, context) => {
    if (operation.to < operation.from) {
      context.addIssue({ code: 'custom', path: ['to'], message: 'to must be greater than or equal to from' })
    }
  }),
  z.object({ ...operationIdShape, type: z.literal('set_node_attrs'), nodeId: idSchema, attrs: boundedJsonRecordSchema }).strict(),
  z.object({ ...operationIdShape, type: z.literal('move_node'), nodeId: idSchema, targetParentId: idSchema, index: indexSchema }).strict(),
  z.object({ ...operationIdShape, type: z.literal('insert_node'), parentId: idSchema, index: indexSchema, node: boundedJsonValueSchema }).strict(),
  z.object({ ...operationIdShape, type: z.literal('delete_node'), nodeId: idSchema }).strict(),
])

const imageCropSchema = z.object({
  scale: finiteNumberSchema.positive(),
  offsetX: finiteNumberSchema,
  offsetY: finiteNumberSchema,
  rotation: finiteNumberSchema,
}).strict()

export const zineEditorOperationSchema = z.discriminatedUnion('type', [
  z.object({ ...zineOperationShape, type: z.literal('set_slot_attrs'), slotId: idSchema, attrs: boundedJsonRecordSchema }).strict(),
  z.object({ ...zineOperationShape, type: z.literal('insert_slot'), index: indexSchema, slot: boundedJsonValueSchema }).strict(),
  z.object({ ...zineOperationShape, type: z.literal('delete_slot'), slotId: idSchema }).strict(),
  z.object({ ...zineOperationShape, type: z.literal('assign_asset'), slotId: idSchema, assetId: idSchema }).strict(),
  z.object({ ...zineOperationShape, type: z.literal('set_image_crop'), slotId: idSchema, crop: imageCropSchema }).strict(),
  z.object({ ...zineOperationShape, type: z.literal('set_layer_order'), slotId: idSchema, zIndex: finiteNumberSchema }).strict(),
  z.object({ ...zineOperationShape, type: z.literal('apply_layout_template'), templateId: idSchema, targetSlotIds: z.array(idSchema).max(MAX_EDITOR_TEMPLATE_TARGET_SLOT_IDS), options: boundedJsonRecordSchema.optional() }).strict(),
])

export const directEditorOperationSchema = z.union([
  narrativeEditorOperationSchema,
  zineEditorOperationSchema,
])

const editorOperationTargetSchema = z.object({
  documentId: idSchema,
  spreadId: idSchema.optional(),
}).strict()

const editorOperationBatchObjectSchema = z.object({
  taskId: idSchema,
  capability: z.enum(['narrative', 'zine']),
  baseRevision: idSchema,
  target: editorOperationTargetSchema,
  operations: z.array(directEditorOperationSchema).max(MAX_EDITOR_OPERATION_BATCH_OPERATIONS),
  summary: z.array(z.string().min(1).max(MAX_EDITOR_OPERATION_SUMMARY_LENGTH)).max(MAX_EDITOR_OPERATION_BATCH_SUMMARIES),
}).strict().superRefine((batch, context) => {
  const operationIds = new Set<string>()
  for (let index = 0; index < batch.operations.length; index += 1) {
    const operation = batch.operations[index]
    if (operationIds.has(operation.operationId)) {
      context.addIssue({ code: 'custom', path: ['operations', index, 'operationId'], message: 'Duplicate operationId' })
    }
    operationIds.add(operation.operationId)

    const isZineOperation = 'spreadId' in operation
    if ((batch.capability === 'zine') !== isZineOperation) {
      context.addIssue({ code: 'custom', path: ['operations', index, 'type'], message: 'Operation does not match capability' })
    }
    if (isZineOperation && operation.spreadId !== batch.target.spreadId) {
      context.addIssue({ code: 'custom', path: ['operations', index, 'spreadId'], message: 'Operation spreadId must match target spreadId' })
    }
  }

  if (batch.capability === 'zine' && batch.target.spreadId === undefined) {
    context.addIssue({ code: 'custom', path: ['target', 'spreadId'], message: 'Zine target requires spreadId' })
  }
  if (batch.capability === 'narrative' && batch.target.spreadId !== undefined) {
    context.addIssue({ code: 'custom', path: ['target', 'spreadId'], message: 'Narrative target cannot include spreadId' })
  }
})

export const editorOperationBatchSchema = z.custom<unknown>(isInertJsonValue, {
  message: 'Expected an inert JSON operation batch',
}).pipe(editorOperationBatchObjectSchema)

export function parseEditorOperationBatch(value: unknown): EditorOperationBatch {
  return editorOperationBatchSchema.parse(value) as EditorOperationBatch
}

export interface EditorOperationAuthorization {
  allowDelete: boolean
  deleteTargetIds: string[]
  targetSpreadId?: string
  projectAssetIds?: string[]
}

export interface DirectEditTaskTargetIdentityIssue {
  readonly code: 'wrong_target_spread'
  readonly message: string
}

type DirectEditTaskTargetIdentitySnapshot =
  | { readonly capability: 'narrative' }
  | {
      readonly capability: 'zine'
      readonly projectId: string
      readonly targetSpreadId: string
      readonly project: { readonly projectId: string }
      readonly currentSpread: { readonly spreadId: string }
    }

export function validateDirectEditTaskTargetIdentity(
  snapshot: DirectEditTaskTargetIdentitySnapshot,
  authorization: {
    readonly targetSpreadId?: string
  },
): DirectEditTaskTargetIdentityIssue[] {
  if (snapshot.capability === 'narrative') {
    return authorization.targetSpreadId === undefined
      ? []
      : [{
          code: 'wrong_target_spread',
          message: 'Narrative tasks cannot authorize a target spread',
        }]
  }

  if (snapshot.project.projectId !== snapshot.projectId) {
    return [{
      code: 'wrong_target_spread',
      message: 'Zine snapshot project identity does not match the nested project identity',
    }]
  }
  if (snapshot.currentSpread.spreadId !== snapshot.targetSpreadId) {
    return [{
      code: 'wrong_target_spread',
      message: 'Zine snapshot current spread identity does not match the target spread identity',
    }]
  }
  if (authorization.targetSpreadId !== snapshot.targetSpreadId) {
    return [{
      code: 'wrong_target_spread',
      message: 'Zine snapshot target spread does not match the authorized target spread',
    }]
  }
  return []
}

export type EditorOperationAuthorizationErrorCode =
  | 'delete_not_authorized'
  | 'delete_target_not_authorized'
  | 'wrong_target_spread'
  | 'asset_not_in_project'

export interface EditorOperationAuthorizationError {
  code: EditorOperationAuthorizationErrorCode
  operationId: string
}

export function validateOperationAuthorization(
  operations: DirectEditorOperation[],
  authorization: EditorOperationAuthorization,
): EditorOperationAuthorizationError[] {
  const issues: EditorOperationAuthorizationError[] = []
  const deleteTargets = new Set(authorization.deleteTargetIds)
  const projectAssets = new Set(authorization.projectAssetIds ?? [])

  for (const operation of operations) {
    const deleteTarget = operation.type === 'delete_node'
      ? operation.nodeId
      : operation.type === 'delete_slot'
        ? operation.slotId
        : undefined

    if (deleteTarget !== undefined) {
      if (!authorization.allowDelete) {
        issues.push({ code: 'delete_not_authorized', operationId: operation.operationId })
      } else if (!deleteTargets.has(deleteTarget)) {
        issues.push({ code: 'delete_target_not_authorized', operationId: operation.operationId })
      }
    }

    if ('spreadId' in operation && operation.spreadId !== authorization.targetSpreadId) {
      issues.push({ code: 'wrong_target_spread', operationId: operation.operationId })
    }
    if (operation.type === 'assign_asset' && !projectAssets.has(operation.assetId)) {
      issues.push({ code: 'asset_not_in_project', operationId: operation.operationId })
    }
  }

  return issues
}
