import { canonicalizeJson } from './domain/revision'

import type { DirectEditAgentTask } from './domain/agent'
import type { ResolvedEditorAiCapabilities } from './domain/capabilities'
import type {
  EditorAiImageInput,
  NarrativeDocumentSnapshot,
  StructuredEditorSnapshot,
  ZineDocumentSnapshot,
  ZineSpreadSnapshot,
} from './domain/document'
import type { DeepReadonly } from './domain/execution'
import type { JsonPrimitive, JsonValue } from './domain/json'
import type { EditorOperationAuthorization } from './domain/operations'
import type { EditorAiChatContentPart, EditorAiChatMessage } from './types'

export interface BuildDirectEditPromptInput<
  Snapshot extends StructuredEditorSnapshot = StructuredEditorSnapshot,
> {
  readonly task: DirectEditAgentTask<Snapshot>
  readonly capabilities: ResolvedEditorAiCapabilities
}

type ReadonlyJsonValue = JsonPrimitive
  | readonly ReadonlyJsonValue[]
  | { readonly [key: string]: ReadonlyJsonValue }
type PromptImage = DeepReadonly<EditorAiImageInput>

function projectStructuredJson(value: ReadonlyJsonValue): JsonValue {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    const result = new Array<JsonValue>(value.length)
    for (let index = 0; index < value.length; index += 1) result[index] = projectStructuredJson(value[index])
    return result
  }
  if (value !== null && typeof value === 'object') {
    const record = value as { readonly [key: string]: ReadonlyJsonValue }
    const result: Record<string, JsonValue> = {}
    const descriptors = Object.getOwnPropertyDescriptors(record)
    for (const key of Object.keys(descriptors)) {
      const descriptor = descriptors[key]
      if (key !== 'dataUrl' && descriptor?.enumerable && 'value' in descriptor) {
        Object.defineProperty(result, key, {
          enumerable: true,
          configurable: true,
          writable: true,
          value: projectStructuredJson(descriptor.value as ReadonlyJsonValue),
        })
      }
    }
    return result
  }
  return value
}

function imageJson(image: PromptImage): JsonValue {
  return { id: image.id, mediaType: image.mediaType, width: image.width, height: image.height, byteLength: image.byteLength }
}

function authorizationJson(authorization: DeepReadonly<EditorOperationAuthorization>): JsonValue {
  return {
    allowDelete: authorization.allowDelete,
    deleteTargetIds: [...authorization.deleteTargetIds],
    ...(authorization.targetSpreadId !== undefined ? { targetSpreadId: authorization.targetSpreadId } : {}),
    ...(authorization.projectAssetIds !== undefined ? { projectAssetIds: [...authorization.projectAssetIds] } : {}),
  }
}

function capabilityJson(capabilities: ResolvedEditorAiCapabilities): JsonValue {
  return {
    visualMode: capabilities.visualMode,
    executionMode: capabilities.executionMode,
    degradations: capabilities.degradations.map(({ code, message }) => ({ code, message })),
  }
}

function narrativeContext(input: BuildDirectEditPromptInput<NarrativeDocumentSnapshot>): JsonValue {
  const { task, capabilities } = input
  const { snapshot } = task
  return {
    taskId: task.id,
    taskType: task.taskType,
    instruction: task.instruction,
    revision: snapshot.revision,
    target: { capability: snapshot.capability, documentId: snapshot.documentId, documentKind: snapshot.documentKind },
    authorization: authorizationJson(task.authorization),
    capabilities: capabilityJson(capabilities),
    snapshot: {
      capability: snapshot.capability,
      documentId: snapshot.documentId,
      documentKind: snapshot.documentKind,
      ...(snapshot.title !== undefined ? { title: snapshot.title } : {}),
      root: projectStructuredJson(snapshot.root),
      nodes: snapshot.nodes.map((node) => ({
        id: node.id,
        type: node.type,
        ...(node.parentId !== undefined ? { parentId: node.parentId } : {}),
        index: node.index,
        depth: node.depth,
        ...(node.text !== undefined ? { text: node.text } : {}),
        attrs: projectStructuredJson(node.attrs),
        marks: projectStructuredJson(node.marks),
        childIds: [...node.childIds],
      })),
      editorWidth: snapshot.editorWidth,
      visualSegments: snapshot.visualSegments.map((segment) => ({
        id: segment.id,
        image: imageJson(segment.image),
        nodeIds: [...segment.nodeIds],
        startY: segment.startY,
        endY: segment.endY,
      })),
      revision: snapshot.revision,
    },
  }
}

function zineContext(input: BuildDirectEditPromptInput<ZineDocumentSnapshot>): JsonValue {
  const { task, capabilities } = input
  const { snapshot } = task
  const spreadJson = (spread: DeepReadonly<ZineSpreadSnapshot>): JsonValue => ({
    spreadId: spread.spreadId,
    index: spread.index,
    structure: projectStructuredJson(spread.structure),
    summary: projectStructuredJson(spread.summary),
    ...(spread.preview ? { preview: imageJson(spread.preview) } : {}),
  })
  return {
    taskId: task.id,
    taskType: task.taskType,
    instruction: task.instruction,
    revision: snapshot.revision,
    target: { capability: snapshot.capability, projectId: snapshot.projectId, targetSpreadId: snapshot.targetSpreadId },
    authorization: authorizationJson(task.authorization),
    capabilities: capabilityJson(capabilities),
    snapshot: {
      capability: snapshot.capability,
      projectId: snapshot.projectId,
      targetSpreadId: snapshot.targetSpreadId,
      project: {
        projectId: snapshot.project.projectId,
        settings: projectStructuredJson(snapshot.project.settings),
        spreadOrder: [...snapshot.project.spreadOrder],
        spreadSummaries: projectStructuredJson(snapshot.project.spreadSummaries),
      },
      currentSpread: spreadJson(snapshot.currentSpread),
      adjacentSpreads: snapshot.adjacentSpreads.map(spreadJson),
      assetCandidates: snapshot.assetCandidates.map((candidate) => ({
        assetId: candidate.assetId,
        metadata: projectStructuredJson(candidate.metadata),
        ...(candidate.thumbnail ? { thumbnail: imageJson(candidate.thumbnail) } : {}),
      })),
      revision: snapshot.revision,
    },
  }
}

function commonPolicy(capabilities: ResolvedEditorAiCapabilities): string[] {
  const lines = [
    'Use only the supported structure and style operations supplied by the runtime.',
    'Do not invent nodes, assets, or IDs outside the supplied schema and context.',
    'For page_audit tasks, apply only safe fixes and report non-fixable findings as warnings.',
  ]
  if (capabilities.visualMode === 'structure_only') {
    lines.push('Structure-only mode uses stable structure, geometry, and metadata only. Do not perform subject recognition, semantic crop, visual focal-point judgment, or image-content-based asset replacement.')
  }
  if (capabilities.executionMode === 'suggestion_only') {
    lines.push('Suggestion-only execution mode: return advice only. Do not output operations or tool calls.')
  }
  return lines
}

function deletePolicy(authorization: DeepReadonly<EditorOperationAuthorization>, kind: 'target IDs' | 'slot IDs'): string {
  if (!authorization.allowDelete) return 'Delete operations and delete tools are unavailable for this task.'
  return `Delete operations are available only for the exact authorized ${kind}: ${JSON.stringify(authorization.deleteTargetIds)}. Never infer additional deletion targets from the instruction.`
}

function visualParts(label: string, image: PromptImage): EditorAiChatContentPart[] {
  return [{ type: 'text', text: label }, { type: 'file', dataUrl: image.dataUrl, mediaType: image.mediaType }]
}

function structuredContextText(context: JsonValue): string {
  return [
    'CURRENT DIRECT-EDIT CONTEXT (canonical JSON; already budgeted, do not truncate):',
    '<DIRECT_EDIT_CONTEXT_JSON>',
    canonicalizeJson(context),
    '</DIRECT_EDIT_CONTEXT_JSON>',
  ].join('\n')
}

export function buildNarrativeDirectEditMessages(
  input: BuildDirectEditPromptInput<NarrativeDocumentSnapshot>,
): EditorAiChatMessage[] {
  const { task, capabilities } = input
  const system = [
    'You are a project-neutral narrative direct-edit agent.',
    'Read the complete current editable structure before planning edits.',
    'All operations reference stable node IDs and node-relative text offsets; make no selection-based assumption.',
    'Use no arbitrary CSS and no whole-document replacement.',
    ...commonPolicy(capabilities),
    deletePolicy(task.authorization, 'target IDs'),
  ].join('\n')
  const text = structuredContextText(narrativeContext(input))
  const content: EditorAiChatContentPart[] = []
  if (capabilities.visualMode === 'vision') {
    for (const segment of task.snapshot.visualSegments) {
      content.push(...visualParts(`Narrative visual segment ${JSON.stringify(segment.id)}; image ID ${JSON.stringify(segment.image.id)}; node IDs ${JSON.stringify(segment.nodeIds)}; vertical range ${segment.startY}-${segment.endY}.`, segment.image))
    }
  }
  return [{ role: 'system', text: system }, { role: 'user', text, ...(content.length ? { content } : {}) }]
}

export function buildZineDirectEditMessages(
  input: BuildDirectEditPromptInput<ZineDocumentSnapshot>,
): EditorAiChatMessage[] {
  const { task, capabilities } = input
  const { snapshot } = task
  const projectAssets = task.authorization.projectAssetIds ?? []
  const system = [
    'You are a project-neutral Zine direct-edit agent.',
    `targetSpreadId ${JSON.stringify(snapshot.targetSpreadId)}, the current spread, is the only writable spread.`,
    'The project and adjacent spreads are read-only design references.',
    `Every Zine write operation includes the exact field/value spreadId: ${JSON.stringify(snapshot.targetSpreadId)}.`,
    `Assets may come only from the provided project assetCandidates and project asset allowlist: ${JSON.stringify(projectAssets)}.`,
    'Use no filesystem, external gallery, asset generation, asset import, or delete of project assets.',
    'Use no arbitrary CSS and no whole-project replacement.',
    ...commonPolicy(capabilities),
    deletePolicy(task.authorization, 'slot IDs'),
  ].join('\n')
  const text = structuredContextText(zineContext(input))
  const content: EditorAiChatContentPart[] = []
  if (capabilities.visualMode === 'vision') {
    if (snapshot.currentSpread.preview) content.push(...visualParts(`Current writable preview; spread ID ${JSON.stringify(snapshot.currentSpread.spreadId)}; preview image ID ${JSON.stringify(snapshot.currentSpread.preview.id)}.`, snapshot.currentSpread.preview))
    for (const spread of snapshot.adjacentSpreads) {
      if (spread.preview) content.push(...visualParts(`Read-only adjacent preview; spread ID ${JSON.stringify(spread.spreadId)}; preview image ID ${JSON.stringify(spread.preview.id)}.`, spread.preview))
    }
    for (const candidate of snapshot.assetCandidates) {
      if (candidate.thumbnail) content.push(...visualParts(`Project asset candidate thumbnail; asset ID ${JSON.stringify(candidate.assetId)}; thumbnail image ID ${JSON.stringify(candidate.thumbnail.id)}.`, candidate.thumbnail))
    }
  }
  return [{ role: 'system', text: system }, { role: 'user', text, ...(content.length ? { content } : {}) }]
}

export function buildDirectEditMessages(input: BuildDirectEditPromptInput<NarrativeDocumentSnapshot>): EditorAiChatMessage[]
export function buildDirectEditMessages(input: BuildDirectEditPromptInput<ZineDocumentSnapshot>): EditorAiChatMessage[]
export function buildDirectEditMessages(input: BuildDirectEditPromptInput): EditorAiChatMessage[]
export function buildDirectEditMessages(input: BuildDirectEditPromptInput): EditorAiChatMessage[] {
  if (input.task.snapshot.capability === 'narrative') {
    return buildNarrativeDirectEditMessages({ task: input.task as DirectEditAgentTask<NarrativeDocumentSnapshot>, capabilities: input.capabilities })
  }
  return buildZineDirectEditMessages({ task: input.task as DirectEditAgentTask<ZineDocumentSnapshot>, capabilities: input.capabilities })
}
