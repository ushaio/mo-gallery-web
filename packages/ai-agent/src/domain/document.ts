import { createStructuredRevision, createTextRevision } from './revision'

import type { JsonValue } from './json'

export interface EditorDocumentSnapshot {
  title?: string
  /** 由宿主按统一规则线性化的纯文本，段落之间使用单个换行。 */
  text: string
  /** 快照内容的稳定版本，用于检测提案是否基于过期文档。 */
  revision: string
}

export interface CreateEditorDocumentSnapshotInput {
  title?: string
  text: string
}

export type EditorAiCapability = 'narrative' | 'zine'

export interface EditorAiImageInput {
  id: string
  dataUrl: string
  mediaType: string
  width: number
  height: number
  byteLength: number
}

export interface NarrativeVisualSegment {
  id: string
  image: EditorAiImageInput
  nodeIds: string[]
  startY: number
  endY: number
}

export interface NarrativeNodeSnapshot {
  id: string
  type: string
  parentId?: string
  index: number
  depth: number
  text?: string
  attrs: Record<string, JsonValue>
  marks: JsonValue[]
  childIds: string[]
}

export interface NarrativeDocumentSnapshot {
  capability: 'narrative'
  documentId: string
  documentKind: 'story' | 'blog'
  title?: string
  root: JsonValue
  nodes: NarrativeNodeSnapshot[]
  editorWidth: number
  visualSegments: NarrativeVisualSegment[]
  revision: string
}

export interface CreateNarrativeDocumentSnapshotInput {
  documentId: string
  documentKind: 'story' | 'blog'
  title?: string
  root: JsonValue
  nodes: NarrativeNodeSnapshot[]
  editorWidth: number
  visualSegments: NarrativeVisualSegment[]
}

export interface ZineProjectSummarySnapshot {
  projectId: string
  settings: Record<string, JsonValue>
  spreadOrder: string[]
  spreadSummaries: Record<string, JsonValue>
}

export interface ZineSpreadSnapshot {
  spreadId: string
  index: number
  structure: JsonValue
  summary: JsonValue
  preview?: EditorAiImageInput
}

export interface ZineAssetCandidateSnapshot {
  assetId: string
  metadata: Record<string, JsonValue>
  thumbnail?: EditorAiImageInput
}

export interface ZineDocumentSnapshot {
  capability: 'zine'
  projectId: string
  targetSpreadId: string
  project: ZineProjectSummarySnapshot
  currentSpread: ZineSpreadSnapshot
  adjacentSpreads: ZineSpreadSnapshot[]
  assetCandidates: ZineAssetCandidateSnapshot[]
  revision: string
}

export interface CreateZineDocumentSnapshotInput {
  projectId: string
  targetSpreadId: string
  project: ZineProjectSummarySnapshot
  currentSpread: ZineSpreadSnapshot
  adjacentSpreads: ZineSpreadSnapshot[]
  assetCandidates: ZineAssetCandidateSnapshot[]
}

export type StructuredEditorSnapshot =
  | NarrativeDocumentSnapshot
  | ZineDocumentSnapshot

type OwnEnumerableDataEntry = readonly [key: string, value: unknown]

function getOwnEnumerableDataEntries(value: object): OwnEnumerableDataEntry[] {
  const entries: OwnEnumerableDataEntry[] = []
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') {
      throw new TypeError('Stable snapshot JSON records cannot contain symbol keys')
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (descriptor === undefined || !descriptor.enumerable) {
      throw new TypeError(`Stable snapshot JSON record properties must be enumerable (property ${key})`)
    }
    if (!('value' in descriptor)) {
      throw new TypeError(`Stable snapshot values cannot contain an object accessor (property ${key})`)
    }
    entries.push([key, descriptor.value])
  }
  return entries
}

function getDenseArrayValues(value: unknown[]): unknown[] {
  if (Object.getPrototypeOf(value) !== Array.prototype) {
    throw new TypeError('Stable snapshot arrays must use Array.prototype')
  }

  const values = new Array<unknown>(value.length)
  const seenIndices = new Set<number>()
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') {
      throw new TypeError('Stable snapshot arrays cannot contain symbol keys')
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (descriptor === undefined) {
      throw new TypeError(`Stable snapshot arrays contain an invalid property (${key})`)
    }
    if (key === 'length') {
      if (
        !('value' in descriptor)
        || descriptor.value !== value.length
        || descriptor.enumerable
        || descriptor.configurable
      ) {
        throw new TypeError('Stable snapshot arrays must use the standard length property')
      }
      continue
    }

    const index = Number(key)
    if (!Number.isInteger(index) || index < 0 || index >= value.length || String(index) !== key) {
      throw new TypeError(`Stable snapshot arrays cannot define custom properties (property ${key})`)
    }
    if (!descriptor.enumerable) {
      throw new TypeError(`Stable snapshot array indices must be enumerable (index ${index})`)
    }
    if (!('value' in descriptor)) {
      throw new TypeError(`Stable snapshot values cannot contain an array accessor (index ${index})`)
    }
    seenIndices.add(index)
    values[index] = descriptor.value
  }

  for (let index = 0; index < value.length; index += 1) {
    if (!seenIndices.has(index)) {
      throw new TypeError(`Stable snapshot values cannot contain a sparse array (missing index ${index})`)
    }
  }
  return values
}

function assertDescriptorSafeJsonGraph(
  value: unknown,
  allowNonFiniteNumbers = false,
): void {
  if (value === undefined) {
    throw new TypeError('Stable snapshot values must be valid JSON')
  }
  if (
    typeof value === 'number'
    && !allowNonFiniteNumbers
    && !Number.isFinite(value)
  ) {
    throw new TypeError('Stable snapshot JSON numbers must be finite')
  }
  if (Array.isArray(value)) {
    for (const entry of getDenseArrayValues(value)) {
      assertDescriptorSafeJsonGraph(entry, allowNonFiniteNumbers)
    }
    return
  }
  if (value !== null && typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('Stable snapshot JSON records must use Object.prototype or a null prototype')
    }
    for (const [, entry] of getOwnEnumerableDataEntries(value)) {
      assertDescriptorSafeJsonGraph(entry, allowNonFiniteNumbers)
    }
    return
  }
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
    || typeof value === 'number'
  ) {
    return
  }
  throw new TypeError('Stable snapshot values must be valid JSON')
}

function mapStableArray<T, U>(value: T[], transform: (entry: T) => U): U[] {
  const values = getDenseArrayValues(value)
  const result = new Array<U>(values.length)
  for (let index = 0; index < values.length; index += 1) {
    result[index] = transform(values[index] as T)
  }
  return result
}

function cloneJsonValue(value: JsonValue): JsonValue {
  if (value === undefined) {
    throw new TypeError('Stable snapshot values must be valid JSON')
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new TypeError('Stable snapshot JSON numbers must be finite')
  }
  if (Array.isArray(value)) {
    return mapStableArray(value, cloneJsonValue)
  }
  if (value !== null && typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('Stable snapshot values must be valid JSON')
    }
    const result: Record<string, JsonValue> = {}
    for (const [key, entry] of getOwnEnumerableDataEntries(value)) {
      Object.defineProperty(result, key, {
        configurable: true,
        enumerable: true,
        value: cloneJsonValue(entry as JsonValue),
        writable: true,
      })
    }
    return result
  }
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
    || typeof value === 'number'
  ) {
    return value
  }
  throw new TypeError('Stable snapshot values must be valid JSON')
}

function cloneJsonRecord(value: Record<string, JsonValue>): Record<string, JsonValue> {
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('Stable snapshot JSON records must use Object.prototype or a null prototype')
  }
  const result: Record<string, JsonValue> = {}
  for (const [key, entry] of getOwnEnumerableDataEntries(value)) {
    Object.defineProperty(result, key, {
      configurable: true,
      enumerable: true,
      value: cloneJsonValue(entry as JsonValue),
      writable: true,
    })
  }
  return result
}

function scrubImageData(value: JsonValue): JsonValue {
  if (typeof value === 'string' && /^data:[^,]*,/i.test(value)) {
    return '[image-data]'
  }
  if (Array.isArray(value)) return mapStableArray(value, scrubImageData)
  if (value !== null && typeof value === 'object') {
    const result: Record<string, JsonValue> = {}
    for (const [key, entry] of getOwnEnumerableDataEntries(value)) {
      Object.defineProperty(result, key, {
        configurable: true,
        enumerable: true,
        value: scrubImageData(entry as JsonValue),
        writable: true,
      })
    }
    return result
  }
  return value
}

function cloneImage(image: EditorAiImageInput): EditorAiImageInput {
  assertFiniteNonnegativeInteger(image.width, 'Editor AI image width')
  assertFiniteNonnegativeInteger(image.height, 'Editor AI image height')
  assertFiniteNonnegativeInteger(image.byteLength, 'Editor AI image byteLength')
  return {
    id: image.id,
    dataUrl: image.dataUrl,
    mediaType: image.mediaType,
    width: image.width,
    height: image.height,
    byteLength: image.byteLength,
  }
}

function cloneNarrativeNode(node: NarrativeNodeSnapshot): NarrativeNodeSnapshot {
  assertFiniteStableNumber(node.index, 'Narrative node index')
  assertFiniteStableNumber(node.depth, 'Narrative node depth')
  return {
    id: node.id,
    type: node.type,
    ...(node.parentId !== undefined ? { parentId: node.parentId } : {}),
    index: node.index,
    depth: node.depth,
    ...(node.text !== undefined ? { text: node.text } : {}),
    attrs: cloneJsonRecord(node.attrs),
    marks: mapStableArray(node.marks, cloneJsonValue),
    childIds: mapStableArray(node.childIds, (childId) => childId),
  }
}

function cloneVisualSegment(segment: NarrativeVisualSegment): NarrativeVisualSegment {
  assertFiniteStableNumber(segment.startY, 'Narrative visual segment start Y')
  assertFiniteStableNumber(segment.endY, 'Narrative visual segment end Y')
  return {
    id: segment.id,
    image: cloneImage(segment.image),
    nodeIds: mapStableArray(segment.nodeIds, (nodeId) => nodeId),
    startY: segment.startY,
    endY: segment.endY,
  }
}

function cloneZineSpread(spread: ZineSpreadSnapshot): ZineSpreadSnapshot {
  return {
    spreadId: spread.spreadId,
    index: spread.index,
    structure: cloneJsonValue(spread.structure),
    summary: cloneJsonValue(spread.summary),
    ...(spread.preview ? { preview: cloneImage(spread.preview) } : {}),
  }
}

function createStableZineSpread(spread: ZineSpreadSnapshot): JsonValue {
  return {
    spreadId: spread.spreadId,
    index: spread.index,
    structure: scrubImageData(spread.structure),
    summary: scrubImageData(spread.summary),
  }
}

function assertFiniteStableNumber(value: number, field: string): void {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${field} must be finite`)
  }
}

function assertFiniteNonnegativeInteger(value: number, field: string): void {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new TypeError(`${field} must be a finite nonnegative integer`)
  }
}

function createStableNarrativeNode(node: NarrativeNodeSnapshot): JsonValue {
  return {
    id: node.id,
    type: node.type,
    ...(node.parentId !== undefined ? { parentId: node.parentId } : {}),
    index: node.index,
    depth: node.depth,
    ...(node.text !== undefined ? { text: node.text } : {}),
    attrs: scrubImageData(node.attrs),
    marks: mapStableArray(node.marks, scrubImageData),
    childIds: mapStableArray(node.childIds, (childId) => childId),
  }
}

function createStableZineProject(project: ZineProjectSummarySnapshot): JsonValue {
  return {
    projectId: project.projectId,
    settings: scrubImageData(project.settings),
    spreadOrder: mapStableArray(project.spreadOrder, (spreadId) => spreadId),
    spreadSummaries: scrubImageData(project.spreadSummaries),
  }
}

function createStableZineAsset(candidate: ZineAssetCandidateSnapshot): JsonValue {
  return {
    assetId: candidate.assetId,
    metadata: scrubImageData(candidate.metadata),
  }
}

/** FNV-1a 32 位哈希；只用于快照一致性标识，不用于安全场景。 */
export function createEditorDocumentRevision(text: string): string {
  return createTextRevision(text)
}

export function createEditorDocumentSnapshot(
  input: CreateEditorDocumentSnapshotInput,
): EditorDocumentSnapshot {
  assertDescriptorSafeJsonGraph(input)
  return {
    ...(input.title?.trim() ? { title: input.title.trim() } : {}),
    text: input.text,
    revision: createEditorDocumentRevision(input.text),
  }
}

export function createNarrativeDocumentSnapshot(
  input: CreateNarrativeDocumentSnapshotInput,
): NarrativeDocumentSnapshot {
  assertDescriptorSafeJsonGraph(input, true)
  assertFiniteStableNumber(input.editorWidth, 'Narrative editor width')
  const root = cloneJsonValue(input.root)
  const nodes = mapStableArray(input.nodes, cloneNarrativeNode)
  const visualSegments = mapStableArray(input.visualSegments, cloneVisualSegment)
  const stableValue: JsonValue = {
    documentId: input.documentId,
    documentKind: input.documentKind,
    ...(input.title !== undefined ? { title: input.title } : {}),
    root: scrubImageData(root),
    nodes: mapStableArray(nodes, createStableNarrativeNode),
    editorWidth: input.editorWidth,
  }

  return {
    capability: 'narrative',
    documentId: input.documentId,
    documentKind: input.documentKind,
    ...(input.title !== undefined ? { title: input.title } : {}),
    root,
    nodes,
    editorWidth: input.editorWidth,
    visualSegments,
    revision: createStructuredRevision('narrative', stableValue),
  }
}

export function createZineDocumentSnapshot(
  input: CreateZineDocumentSnapshotInput,
): ZineDocumentSnapshot {
  assertDescriptorSafeJsonGraph(input, true)
  const project: ZineProjectSummarySnapshot = {
    projectId: input.project.projectId,
    settings: cloneJsonRecord(input.project.settings),
    spreadOrder: mapStableArray(input.project.spreadOrder, (spreadId) => spreadId),
    spreadSummaries: cloneJsonRecord(input.project.spreadSummaries),
  }
  const currentSpread = cloneZineSpread(input.currentSpread)
  const adjacentSpreads = mapStableArray(input.adjacentSpreads, cloneZineSpread)
  assertFiniteStableNumber(currentSpread.index, 'Current spread index')
  adjacentSpreads.forEach((spread) => {
    assertFiniteStableNumber(spread.index, 'Adjacent spread index')
  })
  const assetCandidates = mapStableArray(input.assetCandidates, (candidate) => ({
    assetId: candidate.assetId,
    metadata: cloneJsonRecord(candidate.metadata),
    ...(candidate.thumbnail ? { thumbnail: cloneImage(candidate.thumbnail) } : {}),
  }))
  const stableValue: JsonValue = {
    projectId: input.projectId,
    targetSpreadId: input.targetSpreadId,
    project: createStableZineProject(project),
    currentSpread: createStableZineSpread(currentSpread),
    adjacentSpreads: mapStableArray(adjacentSpreads, createStableZineSpread),
    assetCandidates: mapStableArray(assetCandidates, createStableZineAsset),
  }

  return {
    capability: 'zine',
    projectId: input.projectId,
    targetSpreadId: input.targetSpreadId,
    project,
    currentSpread,
    adjacentSpreads,
    assetCandidates,
    revision: createStructuredRevision('zine', stableValue),
  }
}

export function isNarrativeDocumentSnapshot(
  snapshot: StructuredEditorSnapshot,
): snapshot is NarrativeDocumentSnapshot {
  return snapshot.capability === 'narrative'
}

export function isZineDocumentSnapshot(
  snapshot: StructuredEditorSnapshot,
): snapshot is ZineDocumentSnapshot {
  return snapshot.capability === 'zine'
}
