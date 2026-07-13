import { z } from 'zod'

import {
  editorAiTaskMetadataSchema,
  type EditorAiTaskMetadata,
} from './changes'
import {
  cloneDescriptorSafeJsonTree,
  isDescriptorSafeInertJson,
} from './inert-json'
import type { JsonValue } from './json'

export const MAX_EDITOR_AI_MESSAGE_METADATA_BYTES = 256 * 1024

export interface EditorAiTaskMessageMetadata {
  type: 'editor_ai_task'
  task: EditorAiTaskMetadata
}

export type EditorAiMessageMetadata = JsonValue

export interface EditorAiTaskStateUpdate {
  state: 'applied' | 'undone' | 'redone'
}

const IMAGE_DATA_URL_PATTERN = /^\s*data:image\//i

function isInertJsonTree(value: unknown): value is JsonValue {
  return isDescriptorSafeInertJson(value, {
    sharedReferences: 'reject',
    rejectString: (candidate) => IMAGE_DATA_URL_PATTERN.test(candidate),
  })
}

const inertJsonSchema = z.custom<JsonValue>(isInertJsonTree, {
  message: 'Expected inert, descriptor-safe JSON without image data URLs',
})

const editorAiTaskMessageMetadataObjectSchema = z.object({
  type: z.literal('editor_ai_task'),
  task: editorAiTaskMetadataSchema,
}).strict()

const boundedInertJsonSchema = inertJsonSchema.transform((value, context) => {
  const clone = cloneDescriptorSafeJsonTree(value)
  const serializedBytes = new TextEncoder().encode(JSON.stringify(clone)).byteLength
  if (serializedBytes > MAX_EDITOR_AI_MESSAGE_METADATA_BYTES) {
    context.addIssue({
      code: 'custom',
      message: `Metadata exceeds ${MAX_EDITOR_AI_MESSAGE_METADATA_BYTES} UTF-8 bytes`,
    })
    return z.NEVER
  }

  return clone
})

export const editorAiTaskMessageMetadataSchema = boundedInertJsonSchema
  .pipe(editorAiTaskMessageMetadataObjectSchema)

export const editorAiMessageMetadataSchema = boundedInertJsonSchema.transform((clone, context) => {
  if (
    clone !== null
    && !Array.isArray(clone)
    && typeof clone === 'object'
    && Object.prototype.hasOwnProperty.call(clone, 'type')
    && clone.type === 'editor_ai_task'
  ) {
    const parsedEnvelope = editorAiTaskMessageMetadataObjectSchema.safeParse(clone)
    if (!parsedEnvelope.success) {
      context.addIssue({
        code: 'custom',
        message: 'Malformed editor AI task metadata envelope',
      })
      return z.NEVER
    }
    return parsedEnvelope.data
  }

  return clone
})

export const editorAiTaskStateUpdateSchema = inertJsonSchema.pipe(z.object({
  state: z.enum(['applied', 'undone', 'redone']),
}).strict())

export function readEditorAiTaskMessageMetadata(
  value: unknown,
): EditorAiTaskMessageMetadata | null {
  const persistedMetadata = editorAiMessageMetadataSchema.safeParse(value)
  if (!persistedMetadata.success) return null

  const metadata = persistedMetadata.data
  const envelope = editorAiTaskMessageMetadataObjectSchema.safeParse(metadata)
  if (envelope.success) return envelope.data as EditorAiTaskMessageMetadata

  const legacyTask = editorAiTaskMetadataSchema.safeParse(metadata)
  if (!legacyTask.success) return null
  return {
    type: 'editor_ai_task',
    task: legacyTask.data as EditorAiTaskMetadata,
  }
}
