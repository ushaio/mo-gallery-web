import {
  createNarrativeDocumentSnapshot,
  createZineDocumentSnapshot,
  isNarrativeDocumentSnapshot,
} from './document'
import { canonicalizeJson } from './revision'
import {
  estimateContextBudgetTokens,
  notifyContextBudgetCandidate,
} from '../internal/context-budget'

import type {
  EditorAiImageInput,
  NarrativeDocumentSnapshot,
  NarrativeVisualSegment,
  StructuredEditorSnapshot,
  ZineAssetCandidateSnapshot,
  ZineDocumentSnapshot,
  ZineSpreadSnapshot,
} from './document'
import type { JsonValue } from './json'

export interface EditorAiModelCapabilities {
  vision: boolean
  structuredOutput: boolean
  toolCalling: boolean
  maxInputTokens?: number
}

export type EditorAiVisualMode = 'vision' | 'structure_only'
export type EditorAiExecutionMode = 'direct_edit' | 'suggestion_only'
export type EditorAiDegradationCode =
  | 'vision_unavailable'
  | 'structured_output_unavailable'
  | 'tool_calling_unavailable'
  | 'context_budget_exceeded'

export interface EditorAiDegradation {
  code: EditorAiDegradationCode
  message: string
}

export interface ResolvedEditorAiCapabilities {
  visualMode: EditorAiVisualMode
  executionMode: EditorAiExecutionMode
  degradations: EditorAiDegradation[]
}

export interface EditorAiContextBudget {
  maxInputTokens: number
  adjacentPreviewMaxPixels: number
  assetCandidateLimit: number
  remoteSpreadSummaryLimit: number
  narrativeVisualSegmentLimit: number
}

export interface EditorAiContextBudgetResult<Snapshot> {
  snapshot: Snapshot
  estimatedTokens: number
  reductions: string[]
  accepted: boolean
}

const VISION_UNAVAILABLE: EditorAiDegradation = {
  code: 'vision_unavailable',
  message: 'Vision input is unavailable; using document structure only.',
}
const STRUCTURED_OUTPUT_UNAVAILABLE: EditorAiDegradation = {
  code: 'structured_output_unavailable',
  message: 'Structured output is unavailable; direct editing is disabled.',
}
const TOOL_CALLING_UNAVAILABLE: EditorAiDegradation = {
  code: 'tool_calling_unavailable',
  message: 'Tool calling is unavailable; direct editing is disabled.',
}

function assertPositiveInteger(value: number, field: string): void {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${field} must be a finite positive integer`)
  }
}

function assertNonnegativeInteger(value: number, field: string): void {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new TypeError(`${field} must be a finite nonnegative integer`)
  }
}

export function resolveEditorAiCapabilities(
  capabilities: EditorAiModelCapabilities,
): ResolvedEditorAiCapabilities {
  if (capabilities.maxInputTokens !== undefined) {
    assertPositiveInteger(capabilities.maxInputTokens, 'maxInputTokens')
  }

  const degradations: EditorAiDegradation[] = []
  if (!capabilities.vision) degradations.push({ ...VISION_UNAVAILABLE })
  if (!capabilities.structuredOutput) {
    degradations.push({ ...STRUCTURED_OUTPUT_UNAVAILABLE })
  }
  if (!capabilities.toolCalling) {
    degradations.push({ ...TOOL_CALLING_UNAVAILABLE })
  }

  return {
    visualMode: capabilities.vision ? 'vision' : 'structure_only',
    executionMode: capabilities.structuredOutput && capabilities.toolCalling
      ? 'direct_edit'
      : 'suggestion_only',
    degradations,
  }
}

function cloneImage(image: EditorAiImageInput): EditorAiImageInput {
  return {
    id: image.id,
    dataUrl: image.dataUrl,
    mediaType: image.mediaType,
    width: image.width,
    height: image.height,
    byteLength: image.byteLength,
  }
}

function cloneNarrative(snapshot: NarrativeDocumentSnapshot): NarrativeDocumentSnapshot {
  const clone = createNarrativeDocumentSnapshot({
    documentId: snapshot.documentId,
    documentKind: snapshot.documentKind,
    ...(snapshot.title !== undefined ? { title: snapshot.title } : {}),
    root: snapshot.root,
    nodes: snapshot.nodes,
    editorWidth: snapshot.editorWidth,
    visualSegments: snapshot.visualSegments,
  })
  return { ...clone, revision: snapshot.revision }
}

function cloneZine(snapshot: ZineDocumentSnapshot): ZineDocumentSnapshot {
  const clone = createZineDocumentSnapshot({
    projectId: snapshot.projectId,
    targetSpreadId: snapshot.targetSpreadId,
    project: snapshot.project,
    currentSpread: snapshot.currentSpread,
    adjacentSpreads: snapshot.adjacentSpreads,
    assetCandidates: snapshot.assetCandidates,
  })
  return { ...clone, revision: snapshot.revision }
}

function cloneSnapshot<Snapshot extends StructuredEditorSnapshot>(snapshot: Snapshot): Snapshot {
  return (isNarrativeDocumentSnapshot(snapshot)
    ? cloneNarrative(snapshot)
    : cloneZine(snapshot)) as Snapshot
}

function imageJson(image: EditorAiImageInput): JsonValue {
  return {
    id: image.id,
    mediaType: image.mediaType,
    width: image.width,
    height: image.height,
    byteLength: image.byteLength,
  }
}

function segmentJson(segment: NarrativeVisualSegment): JsonValue {
  return {
    id: segment.id,
    image: imageJson(segment.image),
    nodeIds: segment.nodeIds,
    startY: segment.startY,
    endY: segment.endY,
  }
}

function nodeJson(node: NarrativeDocumentSnapshot['nodes'][number]): JsonValue {
  return {
    id: node.id,
    type: node.type,
    ...(node.parentId !== undefined ? { parentId: node.parentId } : {}),
    index: node.index,
    depth: node.depth,
    ...(node.text !== undefined ? { text: node.text } : {}),
    attrs: node.attrs,
    marks: node.marks,
    childIds: node.childIds,
  }
}

function projectJson(project: ZineDocumentSnapshot['project']): JsonValue {
  return {
    projectId: project.projectId,
    settings: project.settings,
    spreadOrder: project.spreadOrder,
    spreadSummaries: project.spreadSummaries,
  }
}

function spreadJson(spread: ZineSpreadSnapshot): JsonValue {
  return {
    spreadId: spread.spreadId,
    index: spread.index,
    structure: spread.structure,
    summary: spread.summary,
    ...(spread.preview ? { preview: imageJson(spread.preview) } : {}),
  }
}

function candidateJson(candidate: ZineAssetCandidateSnapshot): JsonValue {
  return {
    assetId: candidate.assetId,
    metadata: candidate.metadata,
    ...(candidate.thumbnail ? { thumbnail: imageJson(candidate.thumbnail) } : {}),
  }
}

function tokenJson(snapshot: StructuredEditorSnapshot): JsonValue {
  if (isNarrativeDocumentSnapshot(snapshot)) {
    return {
      capability: snapshot.capability,
      documentId: snapshot.documentId,
      documentKind: snapshot.documentKind,
      ...(snapshot.title !== undefined ? { title: snapshot.title } : {}),
      root: snapshot.root,
      nodes: snapshot.nodes.map(nodeJson),
      editorWidth: snapshot.editorWidth,
      visualSegments: snapshot.visualSegments.map(segmentJson),
      revision: snapshot.revision,
    }
  }
  return {
    capability: snapshot.capability,
    projectId: snapshot.projectId,
    targetSpreadId: snapshot.targetSpreadId,
    project: projectJson(snapshot.project),
    currentSpread: spreadJson(snapshot.currentSpread),
    adjacentSpreads: snapshot.adjacentSpreads.map(spreadJson),
    assetCandidates: snapshot.assetCandidates.map(candidateJson),
    revision: snapshot.revision,
  }
}

function imageBytes(snapshot: StructuredEditorSnapshot): number {
  let total = 0
  if (isNarrativeDocumentSnapshot(snapshot)) {
    for (const segment of snapshot.visualSegments) {
      total += validImageByteLength(segment.image)
    }
    return total
  }
  if (snapshot.currentSpread.preview) {
    total += validImageByteLength(snapshot.currentSpread.preview)
  }
  for (const spread of snapshot.adjacentSpreads) {
    if (spread.preview) total += validImageByteLength(spread.preview)
  }
  for (const candidate of snapshot.assetCandidates) {
    if (candidate.thumbnail) total += validImageByteLength(candidate.thumbnail)
  }
  return total
}

function validImageByteLength(image: EditorAiImageInput): number {
  assertNonnegativeInteger(image.byteLength, 'Editor AI image byteLength')
  return image.byteLength
}

/**
 * Conservative, provider-neutral estimate: one token per four canonical JSON
 * UTF-16 code units, plus one token per three decoded image bytes. This is a
 * stable budgeting heuristic, not provider-exact tokenization.
 */
export function estimateEditorAiContextTokens(snapshot: StructuredEditorSnapshot): number {
  const decodedImageBytes = imageBytes(snapshot)
  return Math.ceil(canonicalizeJson(tokenJson(snapshot)).length / 4)
    + Math.ceil(decodedImageBytes / 3)
}

function sampleVisualSegments(
  segments: NarrativeVisualSegment[],
  limit: number,
): NarrativeVisualSegment[] {
  if (limit >= segments.length) return segments
  if (limit === 0) return []
  if (limit === 1) return [segments[0]]
  const selected = new Array<NarrativeVisualSegment>(limit)
  selected[0] = segments[0]
  selected[limit - 1] = segments[segments.length - 1]
  for (let slot = 1; slot < limit - 1; slot += 1) {
    const index = Math.round((slot * (segments.length - 1)) / (limit - 1))
    selected[slot] = segments[index]
  }
  return selected
}

function narrativeRetentionOrder(segments: NarrativeVisualSegment[]): NarrativeVisualSegment[] {
  const length = segments.length
  if (length <= 1) return segments.slice()

  const tree = new Array<number>(length + 1).fill(0)
  const add = (index: number, value: number): void => {
    for (let cursor = index + 1; cursor <= length; cursor += cursor & -cursor) {
      tree[cursor] += value
    }
  }
  const select = (rank: number): number => {
    let index = 0
    let bit = 1
    while (bit * 2 <= length) bit *= 2
    for (; bit > 0; bit = Math.floor(bit / 2)) {
      const next = index + bit
      if (next <= length && tree[next] <= rank) {
        index = next
        rank -= tree[next]
      }
    }
    return index
  }
  for (let index = 0; index < length; index += 1) add(index, 1)

  const removalRank = new Array<number>(length)
  for (let remaining = length; remaining > 0; remaining -= 1) {
    const removedPosition = remaining === 1
      ? 0
      : remaining === 2
        ? 1
        : Math.floor((remaining - 1) / 2)
    const sourceIndex = select(removedPosition)
    removalRank[sourceIndex] = remaining
    add(sourceIndex, -1)
  }
  return segments
    .map((segment, sourceIndex) => ({ segment, sourceIndex, rank: removalRank[sourceIndex] }))
    .sort((left, right) => left.rank - right.rank || left.sourceIndex - right.sourceIndex)
    .map(({ segment }) => segment)
}

function retainedNarrativeSegments(
  sourceOrder: NarrativeVisualSegment[],
  retentionOrder: NarrativeVisualSegment[],
  count: number,
): NarrativeVisualSegment[] {
  if (count >= sourceOrder.length) return sourceOrder
  const retained = new Set(retentionOrder.slice(0, count))
  return sourceOrder.filter((segment) => retained.has(segment))
}

function nearestSpreads(spreads: ZineSpreadSnapshot[], targetIndex: number, limit: number): ZineSpreadSnapshot[] {
  if (limit >= spreads.length) return spreads
  const ranked = spreads.map((spread, sourceIndex) => ({ spread, sourceIndex }))
  ranked.sort((left, right) => {
    const distance = Math.abs(left.spread.index - targetIndex) - Math.abs(right.spread.index - targetIndex)
    return distance || left.sourceIndex - right.sourceIndex
  })
  const retained = new Set(ranked.slice(0, limit).map((entry) => entry.sourceIndex))
  return spreads.filter((_spread, index) => retained.has(index))
}

function nearestSpreadRetentionOrder(
  spreads: ZineSpreadSnapshot[],
  targetIndex: number,
): ZineSpreadSnapshot[] {
  return spreads
    .map((spread, sourceIndex) => ({ spread, sourceIndex }))
    .sort((left, right) => {
      const distance = Math.abs(left.spread.index - targetIndex)
        - Math.abs(right.spread.index - targetIndex)
      return distance || left.sourceIndex - right.sourceIndex
    })
    .map(({ spread }) => spread)
}

function retainedNearestSpreads(
  sourceOrder: ZineSpreadSnapshot[],
  retentionOrder: ZineSpreadSnapshot[],
  count: number,
): ZineSpreadSnapshot[] {
  if (count >= sourceOrder.length) return sourceOrder
  const retained = new Set(retentionOrder.slice(0, count))
  return sourceOrder.filter((spread) => retained.has(spread))
}

function optionalSpreadSummaryIds(snapshot: ZineDocumentSnapshot): string[] {
  const source = snapshot.project.spreadSummaries
  const orderedIds: string[] = []
  const orderedIdSet = new Set<string>([snapshot.targetSpreadId])
  for (const spreadId of snapshot.project.spreadOrder) {
    const descriptor = Object.getOwnPropertyDescriptor(source, spreadId)
    if (!descriptor?.enumerable || !('value' in descriptor) || orderedIdSet.has(spreadId)) continue
    orderedIds.push(spreadId)
    orderedIdSet.add(spreadId)
  }
  for (const spreadId of Object.keys(source)) {
    if (orderedIdSet.has(spreadId)) continue
    const descriptor = Object.getOwnPropertyDescriptor(source, spreadId)
    if (!descriptor || !('value' in descriptor)) continue
    orderedIds.push(spreadId)
    orderedIdSet.add(spreadId)
  }
  return orderedIds
}

function limitedSpreadSummaries(
  snapshot: ZineDocumentSnapshot,
  optionalLimit: number,
  optionalIds = optionalSpreadSummaryIds(snapshot),
): Record<string, JsonValue> {
  const retainedOptionalIds = optionalIds.slice(0, optionalLimit)
  const retainedOptionalSet = new Set(retainedOptionalIds)
  const orderedIds: string[] = []
  const orderedIdSet = new Set<string>()
  for (const spreadId of snapshot.project.spreadOrder) {
    if (
      orderedIdSet.has(spreadId)
      || (spreadId !== snapshot.targetSpreadId && !retainedOptionalSet.has(spreadId))
    ) continue
    orderedIds.push(spreadId)
    orderedIdSet.add(spreadId)
  }
  if (!orderedIdSet.has(snapshot.targetSpreadId)) {
    orderedIds.push(snapshot.targetSpreadId)
    orderedIdSet.add(snapshot.targetSpreadId)
  }
  for (const spreadId of retainedOptionalIds) {
    if (orderedIdSet.has(spreadId)) continue
    orderedIds.push(spreadId)
    orderedIdSet.add(spreadId)
  }
  const summaries: Record<string, JsonValue> = {}
  const source = snapshot.project.spreadSummaries
  for (const spreadId of orderedIds) {
    const descriptor = Object.getOwnPropertyDescriptor(source, spreadId)
    if (!descriptor?.enumerable || !('value' in descriptor)) continue
    Object.defineProperty(summaries, spreadId, {
      value: descriptor.value,
      enumerable: true,
      configurable: true,
      writable: true,
    })
  }
  return summaries
}

function projectWithSpreadSummaries(
  snapshot: ZineDocumentSnapshot,
  spreadSummaries: Record<string, JsonValue>,
): ZineDocumentSnapshot['project'] {
  return {
    projectId: snapshot.project.projectId,
    settings: snapshot.project.settings,
    spreadOrder: snapshot.project.spreadOrder,
    spreadSummaries,
  }
}

function farthestPreviewIndex(spreads: ZineSpreadSnapshot[], targetIndex: number): number {
  let selected = -1
  let distance = -1
  for (let index = 0; index < spreads.length; index += 1) {
    if (!spreads[index].preview) continue
    const candidateDistance = Math.abs(spreads[index].index - targetIndex)
    if (candidateDistance >= distance) {
      selected = index
      distance = candidateDistance
    }
  }
  return selected
}

function recreateNarrativeWithRevision(
  snapshot: NarrativeDocumentSnapshot,
  visualSegments: NarrativeVisualSegment[],
): NarrativeDocumentSnapshot {
  const recreated = createNarrativeDocumentSnapshot({ ...snapshot, visualSegments })
  return { ...recreated, revision: snapshot.revision }
}

function recreateZineWithRevision(
  snapshot: ZineDocumentSnapshot,
  changes: Partial<Pick<ZineDocumentSnapshot, 'project' | 'currentSpread' | 'adjacentSpreads' | 'assetCandidates'>>,
): ZineDocumentSnapshot {
  const recreated = createZineDocumentSnapshot({ ...snapshot, ...changes })
  return { ...recreated, revision: snapshot.revision }
}

function applyNarrativeHardLimits(
  snapshot: NarrativeDocumentSnapshot,
  budget: EditorAiContextBudget,
  reductions: string[],
): NarrativeDocumentSnapshot {
  if (snapshot.visualSegments.length <= budget.narrativeVisualSegmentLimit) return snapshot
  const previous = snapshot.visualSegments.length
  const visualSegments = sampleVisualSegments(snapshot.visualSegments, budget.narrativeVisualSegmentLimit)
  reductions.push(`narrative_visual_segments:${previous}->${visualSegments.length}`)
  return recreateNarrativeWithRevision(snapshot, visualSegments)
}

function removeOversizedAdjacentPreviews(
  snapshot: ZineDocumentSnapshot,
  budget: EditorAiContextBudget,
  reductions: string[],
): ZineDocumentSnapshot {
  const adjacentSpreads = snapshot.adjacentSpreads.map((spread) => {
    if (spread.preview && spread.preview.width * spread.preview.height > budget.adjacentPreviewMaxPixels) {
      reductions.push(`adjacent_preview_pixels:${spread.spreadId}`)
      const { preview: _preview, ...withoutPreview } = spread
      return withoutPreview
    }
    return spread
  })
  return recreateZineWithRevision(snapshot, { adjacentSpreads })
}

function validateBudget(budget: EditorAiContextBudget): void {
  assertPositiveInteger(budget.maxInputTokens, 'maxInputTokens')
  assertNonnegativeInteger(budget.adjacentPreviewMaxPixels, 'adjacentPreviewMaxPixels')
  assertNonnegativeInteger(budget.assetCandidateLimit, 'assetCandidateLimit')
  assertNonnegativeInteger(budget.remoteSpreadSummaryLimit, 'remoteSpreadSummaryLimit')
  assertNonnegativeInteger(budget.narrativeVisualSegmentLimit, 'narrativeVisualSegmentLimit')
}

function findLargestRetainedSnapshot<Snapshot extends StructuredEditorSnapshot>(
  maximumCount: number,
  maxInputTokens: number,
  buildSnapshot: (count: number) => Snapshot,
): { snapshot: Snapshot, retainedCount: number } {
  let low = 0
  let high = maximumCount
  let bestSnapshot: Snapshot | undefined
  let retainedCount = -1

  while (low <= high) {
    const candidateCount = Math.floor((low + high) / 2)
    const candidate = buildSnapshot(candidateCount)
    notifyContextBudgetCandidate()
    if (estimateContextBudgetTokens(candidate, estimateEditorAiContextTokens) <= maxInputTokens) {
      bestSnapshot = candidate
      retainedCount = candidateCount
      low = candidateCount + 1
    } else {
      high = candidateCount - 1
    }
  }

  if (bestSnapshot) return { snapshot: bestSnapshot, retainedCount }
  const snapshot = buildSnapshot(0)
  notifyContextBudgetCandidate()
  return { snapshot, retainedCount: 0 }
}

export function applyEditorAiContextBudget<Snapshot extends StructuredEditorSnapshot>(
  input: Snapshot,
  budget: EditorAiContextBudget,
): EditorAiContextBudgetResult<Snapshot> {
  validateBudget(budget)
  const reductions: string[] = []
  let snapshot: StructuredEditorSnapshot = cloneSnapshot(input)
  snapshot = isNarrativeDocumentSnapshot(snapshot)
    ? applyNarrativeHardLimits(snapshot, budget, reductions)
    : removeOversizedAdjacentPreviews(snapshot, budget, reductions)

  const estimateTokens = (candidate: StructuredEditorSnapshot): number => (
    estimateContextBudgetTokens(candidate, estimateEditorAiContextTokens)
  )
  const overBudget = (): boolean => estimateTokens(snapshot) > budget.maxInputTokens

  if (isNarrativeDocumentSnapshot(snapshot)) {
    if (overBudget() && snapshot.visualSegments.length > 0) {
      const previous = snapshot.visualSegments.length
      const sourceSegments = snapshot.visualSegments
      const retentionOrder = narrativeRetentionOrder(sourceSegments)
      const result = findLargestRetainedSnapshot(
        previous,
        budget.maxInputTokens,
        (count) => recreateNarrativeWithRevision(
          snapshot as NarrativeDocumentSnapshot,
          retainedNarrativeSegments(sourceSegments, retentionOrder, count),
        ),
      )
      reductions.push(`narrative_visual_segments:${previous}->${result.retainedCount}`)
      snapshot = result.snapshot
    }
  } else {
    while (
      snapshot.adjacentSpreads.some((spread) => spread.preview !== undefined)
      && overBudget()
    ) {
      const index = farthestPreviewIndex(snapshot.adjacentSpreads, snapshot.currentSpread.index)
      if (index < 0) break
      const adjacentSpreads = snapshot.adjacentSpreads.map((spread, spreadIndex) => {
        if (spreadIndex !== index) return spread
        reductions.push(`adjacent_preview:${spread.spreadId}`)
        const { preview: _preview, ...withoutPreview } = spread
        return withoutPreview
      })
      snapshot = recreateZineWithRevision(snapshot, { adjacentSpreads })
    }
    if (snapshot.assetCandidates.length > budget.assetCandidateLimit) {
      const assetCandidates = snapshot.assetCandidates.map((candidate) => {
        if (!candidate.thumbnail) return candidate
        reductions.push(`asset_thumbnail:${candidate.assetId}`)
        const { thumbnail: _thumbnail, ...withoutThumbnail } = candidate
        return withoutThumbnail
      })
      snapshot = recreateZineWithRevision(snapshot, { assetCandidates })
    }
    while (
      snapshot.assetCandidates.some((candidate) => candidate.thumbnail !== undefined)
      && overBudget()
    ) {
      let index = -1
      for (let candidateIndex = snapshot.assetCandidates.length - 1; candidateIndex >= 0; candidateIndex -= 1) {
        if (snapshot.assetCandidates[candidateIndex].thumbnail) {
          index = candidateIndex
          break
        }
      }
      if (index < 0) break
      const assetCandidates = snapshot.assetCandidates.map((candidate, candidateIndex) => {
        if (candidateIndex !== index) return candidate
        reductions.push(`asset_thumbnail:${candidate.assetId}`)
        const { thumbnail: _thumbnail, ...withoutThumbnail } = candidate
        return withoutThumbnail
      })
      snapshot = recreateZineWithRevision(snapshot, { assetCandidates })
    }
    if (snapshot.assetCandidates.length > budget.assetCandidateLimit) {
      const previous = snapshot.assetCandidates.length
      const assetCandidates = snapshot.assetCandidates.slice(0, budget.assetCandidateLimit)
      reductions.push(`asset_candidates:${previous}->${assetCandidates.length}`)
      snapshot = recreateZineWithRevision(snapshot, { assetCandidates })
    }
    if (snapshot.assetCandidates.length > 0 && overBudget()) {
      const previous = snapshot.assetCandidates.length
      const sourceSnapshot = snapshot
      const sourceCandidates = snapshot.assetCandidates
      const result = findLargestRetainedSnapshot(
        previous,
        budget.maxInputTokens,
        (count) => recreateZineWithRevision(sourceSnapshot, {
          assetCandidates: sourceCandidates.slice(0, count),
        }),
      )
      reductions.push(`asset_candidates:${previous}->${result.retainedCount}`)
      snapshot = result.snapshot
    }
    let optionalSummaryIds = optionalSpreadSummaryIds(snapshot)
    let optionalSummaryCount = optionalSummaryIds.length
    if (optionalSummaryCount > budget.remoteSpreadSummaryLimit) {
      const retainedOptionalCount = Math.min(optionalSummaryCount, budget.remoteSpreadSummaryLimit)
      reductions.push(`remote_spread_summaries:${optionalSummaryCount}->${retainedOptionalCount}`)
      const project = projectWithSpreadSummaries(
        snapshot,
        limitedSpreadSummaries(snapshot, retainedOptionalCount, optionalSummaryIds),
      )
      snapshot = recreateZineWithRevision(snapshot, { project })
      optionalSummaryCount = retainedOptionalCount
      optionalSummaryIds = optionalSummaryIds.slice(0, retainedOptionalCount)
    }
    if (optionalSummaryCount > 0 && overBudget()) {
      const previous = optionalSummaryCount
      const sourceSnapshot = snapshot
      const result = findLargestRetainedSnapshot(
        previous,
        budget.maxInputTokens,
        (count) => recreateZineWithRevision(sourceSnapshot, {
          project: projectWithSpreadSummaries(
            sourceSnapshot,
            limitedSpreadSummaries(sourceSnapshot, count, optionalSummaryIds),
          ),
        }),
      )
      reductions.push(`remote_spread_summaries:${previous}->${result.retainedCount}`)
      snapshot = result.snapshot
    }
    if (snapshot.adjacentSpreads.length > 0 && overBudget()) {
      const previous = snapshot.adjacentSpreads.length
      const sourceSnapshot = snapshot
      const sourceSpreads = snapshot.adjacentSpreads
      const retentionOrder = nearestSpreadRetentionOrder(
        sourceSpreads,
        snapshot.currentSpread.index,
      )
      const result = findLargestRetainedSnapshot(
        previous,
        budget.maxInputTokens,
        (count) => recreateZineWithRevision(sourceSnapshot, {
          adjacentSpreads: retainedNearestSpreads(sourceSpreads, retentionOrder, count),
        }),
      )
      reductions.push(`adjacent_spreads:${previous}->${result.retainedCount}`)
      snapshot = result.snapshot
    }
  }

  const estimatedTokens = estimateTokens(snapshot)
  const accepted = estimatedTokens <= budget.maxInputTokens
  if (!accepted) reductions.push('context_budget_exceeded')
  return { snapshot: snapshot as Snapshot, estimatedTokens, reductions, accepted }
}
