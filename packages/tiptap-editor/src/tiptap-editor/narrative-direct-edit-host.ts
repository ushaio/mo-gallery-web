import {
  assertEditorAiRevision,
  canonicalizeJson,
  createNarrativeDocumentSnapshot,
  EditorAiExecutionError,
  hasEditorAiValidationErrors,
  type DeepReadonly,
  type EditorAiCommitResult,
  type EditorAiSimulationResult,
  type EditorAiValidationIssue,
  type EditorOperationBatch,
  type JsonValue,
  type NarrativeDocumentSnapshot,
  type NarrativeEditorOperation,
  type NarrativeNodeSnapshot,
  type ReadonlyAiChangeEntry,
} from '@mo-gallery/ai-agent'
import type { JSONContent } from '@tiptap/core'
import { closeHistory, redo, redoDepth, undo, undoDepth } from '@tiptap/pm/history'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { EditorState, Transaction } from '@tiptap/pm/state'

export const NARRATIVE_AI_TASK_TRANSACTION_META = 'mo-gallery:narrative-ai-task'

export interface NarrativeAiTaskTransactionMetadata {
  taskId: string
  historyEntryId: string
  baseRevision: string
  resultRevision: string
}

export interface NarrativeAiTaskHistoryState {
  state: 'applied' | 'undone' | 'redone'
  canUndo: boolean
  canRedo: boolean
}

interface CreateNarrativeDirectEditHostOptions {
  documentId: string
  documentKind: 'story' | 'blog'
  title?: string
  editorWidth: number
  getDocument: () => JSONContent
  getEditorState?: () => EditorState
  dispatchTransaction?: (transaction: Transaction) => void
  lockTask?: (taskId: string) => void
  unlockTask?: (taskId: string) => void
}

export interface NarrativeDirectEditHost {
  captureSnapshot(signal?: AbortSignal): Promise<DeepReadonly<NarrativeDocumentSnapshot>>
  getCurrentRevision(): string
  simulate(
    snapshot: DeepReadonly<NarrativeDocumentSnapshot>,
    operations: ReadonlyArray<DeepReadonly<NarrativeEditorOperation>>,
    signal?: AbortSignal,
  ): Promise<EditorAiSimulationResult<NarrativeDocumentSnapshot>>
  commit(
    batch: DeepReadonly<EditorOperationBatch<'narrative', NarrativeEditorOperation>>,
    simulation: EditorAiSimulationResult<NarrativeDocumentSnapshot>,
  ): Promise<EditorAiCommitResult>
  getTaskHistoryState(taskId: string): NarrativeAiTaskHistoryState | null
  undoTask(taskId: string): boolean
  redoTask(taskId: string): boolean
  lock(taskId: string): void
  unlock(taskId: string): void
}

interface IndexedNarrativeNode {
  snapshot: NarrativeNodeSnapshot
  path: number[]
}

interface ValidatedReplacement {
  operation: DeepReadonly<Extract<NarrativeEditorOperation, { type: 'replace_text' }>>
  target: DeepReadonly<NarrativeNodeSnapshot>
}

interface PositionedTextNode {
  node: ProseMirrorNode
  pos: number
}

interface TaskHistoryRecord {
  baseRevision: string
  resultRevision: string
  appliedUndoDepth: number
  state: NarrativeAiTaskHistoryState['state']
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new EditorAiExecutionError('aborted', 'Narrative direct-edit task was aborted')
  }
}

function toInertJson(
  value: unknown,
  field = 'TipTap document',
  ancestors: Set<object> = new Set(),
): JsonValue {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value))
  ) {
    return value
  }

  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      throw new TypeError(`${field} arrays must use Array.prototype`)
    }
    if (ancestors.has(value)) {
      throw new TypeError(`${field} cannot contain cyclic references`)
    }

    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length')
    if (
      lengthDescriptor === undefined
      || !('value' in lengthDescriptor)
      || lengthDescriptor.value !== value.length
      || lengthDescriptor.enumerable
      || lengthDescriptor.configurable
    ) {
      throw new TypeError(`${field} must use the standard array length property`)
    }

    ancestors.add(value)
    const result = new Array<JsonValue>(value.length)
    const seenIndices = new Set<number>()
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') {
        throw new TypeError(`${field} arrays cannot contain symbol keys`)
      }
      if (key === 'length') continue

      const index = Number(key)
      if (!Number.isInteger(index) || index < 0 || index >= value.length || String(index) !== key) {
        throw new TypeError(`${field} arrays cannot contain custom properties (${key})`)
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
        throw new TypeError(`${field}[${index}] must be an enumerable data property`)
      }
      seenIndices.add(index)
      result[index] = toInertJson(descriptor.value, `${field}[${index}]`, ancestors)
    }
    for (let index = 0; index < value.length; index += 1) {
      if (!seenIndices.has(index)) {
        throw new TypeError(`${field} cannot contain sparse arrays`)
      }
    }
    ancestors.delete(value)
    return result
  }

  if (typeof value === 'object' && value !== null) {
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`${field} records must use a plain object prototype`)
    }
    if (ancestors.has(value)) {
      throw new TypeError(`${field} cannot contain cyclic references`)
    }

    ancestors.add(value)
    const result: Record<string, JsonValue> = {}
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') {
        throw new TypeError(`${field} cannot contain symbol keys`)
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
        throw new TypeError(`${field}.${key} must be an enumerable data property`)
      }
      Object.defineProperty(result, key, {
        configurable: true,
        enumerable: true,
        value: toInertJson(descriptor.value, `${field}.${key}`, ancestors),
        writable: true,
      })
    }
    ancestors.delete(value)
    return result
  }

  throw new TypeError(`${field} must contain JSON-compatible values`)
}

function isJsonRecord(value: JsonValue | undefined): value is Record<string, JsonValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nodeIdForPath(path: readonly number[]): string {
  return path.length === 0 ? 'narrative-node-root' : `narrative-node-${path.join('-')}`
}

function indexNarrativeNodes(root: JsonValue): IndexedNarrativeNode[] {
  if (!isJsonRecord(root)) {
    throw new TypeError('TipTap document root must be a JSON object')
  }

  const indexedNodes: IndexedNarrativeNode[] = []

  function visit(node: Record<string, JsonValue>, path: number[], parentId?: string): string {
    const id = nodeIdForPath(path)
    const content = Array.isArray(node.content) ? node.content : []
    const childIds: string[] = []

    for (let index = 0; index < content.length; index += 1) {
      const child = content[index]
      if (!isJsonRecord(child)) {
        throw new TypeError(`TipTap node ${id} content must contain JSON objects`)
      }
      childIds.push(nodeIdForPath([...path, index]))
    }

    const attrs = isJsonRecord(node.attrs) ? node.attrs : {}
    const marks = Array.isArray(node.marks) ? node.marks : []
    const snapshot: NarrativeNodeSnapshot = {
      id,
      type: typeof node.type === 'string' ? node.type : 'unknown',
      ...(parentId !== undefined ? { parentId } : {}),
      index: path.length === 0 ? 0 : path[path.length - 1],
      depth: path.length,
      ...(typeof node.text === 'string' ? { text: node.text } : {}),
      attrs,
      marks,
      childIds,
    }
    indexedNodes.push({ snapshot, path: [...path] })

    for (let index = 0; index < content.length; index += 1) {
      visit(content[index] as Record<string, JsonValue>, [...path, index], id)
    }
    return id
  }

  visit(root, [])
  return indexedNodes
}

function createSnapshot(
  options: CreateNarrativeDirectEditHostOptions,
  document: unknown,
): NarrativeDocumentSnapshot {
  const root = toInertJson(document)
  const indexedNodes = indexNarrativeNodes(root)
  return createNarrativeDocumentSnapshot({
    documentId: options.documentId,
    documentKind: options.documentKind,
    ...(options.title !== undefined ? { title: options.title } : {}),
    root,
    nodes: indexedNodes.map(({ snapshot }) => snapshot),
    editorWidth: options.editorWidth,
    visualSegments: [],
  })
}

function targetIdsForOperation(operation: DeepReadonly<NarrativeEditorOperation>): string[] {
  if ('nodeId' in operation) return [operation.nodeId]
  if ('parentId' in operation) return [operation.parentId]
  return []
}

function issue(
  code: string,
  message: string,
  operation: DeepReadonly<NarrativeEditorOperation>,
): EditorAiValidationIssue {
  const targetIds = targetIdsForOperation(operation)
  return {
    code,
    severity: 'error',
    message,
    operationId: operation.operationId,
    ...(targetIds.length > 0 ? { targetIds } : {}),
  }
}

function rangesConflict(
  first: ValidatedReplacement['operation'],
  second: ValidatedReplacement['operation'],
): boolean {
  const firstIsInsertion = first.from === first.to
  const secondIsInsertion = second.from === second.to

  if (firstIsInsertion && secondIsInsertion) return first.from === second.from
  if (firstIsInsertion) return first.from >= second.from && first.from < second.to
  if (secondIsInsertion) return second.from >= first.from && second.from < first.to
  return first.from < second.to && second.from < first.to
}

function failedSimulation(
  snapshot: DeepReadonly<NarrativeDocumentSnapshot>,
  issues: EditorAiValidationIssue[],
): EditorAiSimulationResult<NarrativeDocumentSnapshot> {
  return {
    snapshot,
    resultRevision: snapshot.revision,
    issues,
    changeEntries: [],
  }
}

function getMutableNodeAtPath(root: JsonValue, path: readonly number[]): Record<string, JsonValue> {
  let current = root
  for (const index of path) {
    if (!isJsonRecord(current) || !Array.isArray(current.content)) {
      throw new TypeError(`TipTap node path ${path.join('.')} does not exist`)
    }
    current = current.content[index]
  }
  if (!isJsonRecord(current)) {
    throw new TypeError(`TipTap node path ${path.join('.')} is not an object`)
  }
  return current
}

function removeNodeAtPath(root: JsonValue, path: readonly number[]): void {
  if (path.length === 0) {
    throw new TypeError('The TipTap document root cannot be removed')
  }
  const parent = getMutableNodeAtPath(root, path.slice(0, -1))
  if (!Array.isArray(parent.content)) {
    throw new TypeError(`TipTap node path ${path.join('.')} has no parent content`)
  }
  parent.content.splice(path[path.length - 1], 1)
  if (parent.content.length === 0) delete parent.content
}

type EditorSchema = EditorState['schema']

function contentArray(node: Record<string, JsonValue>): JsonValue[] {
  return Array.isArray(node.content) ? node.content : []
}

/**
 * 以「对象身份」为键记录每个节点当前所处的路径。
 * 结构操作（insert/move/delete）会让基于路径的 nodeId 失效，节点对象本身却不变，
 * 因此批内解析目标时统一按对象身份重新定位，而不是复用快照里的旧路径。
 */
function pathIndexByObject(root: JsonValue): Map<object, number[]> {
  const index = new Map<object, number[]>()

  const visit = (value: JsonValue, path: number[]): void => {
    if (!isJsonRecord(value)) return
    index.set(value, path)
    const content = contentArray(value)
    for (let childIndex = 0; childIndex < content.length; childIndex += 1) {
      visit(content[childIndex], [...path, childIndex])
    }
  }

  visit(root, [])
  return index
}

/** 用编辑器真实 schema 校验一段节点 JSON；schema 不可用时跳过（无头调用）。 */
function schemaNodeIssue(schema: EditorSchema | undefined, node: JsonValue): string | null {
  if (schema === undefined) return null
  try {
    schema.nodeFromJSON(node).check()
    return null
  } catch (error) {
    return error instanceof Error ? error.message : 'Node does not match the editor schema'
  }
}

function indexProseMirrorTextNodes(doc: ProseMirrorNode): Map<string, PositionedTextNode> {
  const indexed = new Map<string, PositionedTextNode>()

  function visit(node: ProseMirrorNode, path: number[], pos: number): void {
    if (node.isText) {
      indexed.set(nodeIdForPath(path), { node, pos })
    }

    node.forEach((child, offset, index) => {
      const childPos = path.length === 0 ? offset : pos + 1 + offset
      visit(child, [...path, index], childPos)
    })
  }

  visit(doc, [], -1)
  return indexed
}

function requireCommitAdapters(options: CreateNarrativeDirectEditHostOptions): {
  getEditorState: () => EditorState
  dispatchTransaction: (transaction: Transaction) => void
} {
  if (options.getEditorState === undefined || options.dispatchTransaction === undefined) {
    throw new EditorAiExecutionError(
      'commit_failed',
      'Narrative direct-edit commit requires editor state and transaction adapters',
    )
  }
  return {
    getEditorState: options.getEditorState,
    dispatchTransaction: options.dispatchTransaction,
  }
}

export function createNarrativeDirectEditHost(
  options: CreateNarrativeDirectEditHostOptions,
): NarrativeDirectEditHost {
  const taskHistory = new Map<string, TaskHistoryRecord>()
  const successfulSimulationOperations = new WeakMap<object, string>()

  function captureCurrentSnapshot(): NarrativeDocumentSnapshot {
    return createSnapshot(options, options.getDocument())
  }

  function getHistoryState(taskId: string): NarrativeAiTaskHistoryState | null {
    const record = taskHistory.get(taskId)
    if (record === undefined || options.getEditorState === undefined) return null

    const state = options.getEditorState()
    const currentRevision = createSnapshot(options, state.doc.toJSON()).revision
    const currentUndoDepth = undoDepth(state)
    const currentRedoDepth = redoDepth(state)

    if (
      currentRevision === record.resultRevision
      && currentUndoDepth === record.appliedUndoDepth
    ) {
      if (record.state === 'undone') record.state = 'redone'
      return { state: record.state, canUndo: true, canRedo: false }
    }
    if (
      currentRevision === record.baseRevision
      && currentUndoDepth === record.appliedUndoDepth - 1
      && currentRedoDepth > 0
    ) {
      record.state = 'undone'
      return { state: 'undone', canUndo: false, canRedo: true }
    }
    return { state: record.state, canUndo: false, canRedo: false }
  }

  return {
    async captureSnapshot(signal) {
      throwIfAborted(signal)
      const snapshot = captureCurrentSnapshot()
      throwIfAborted(signal)
      return snapshot
    },

    getCurrentRevision() {
      return captureCurrentSnapshot().revision
    },

    async simulate(snapshot, operations, signal) {
      throwIfAborted(signal)
      assertEditorAiRevision(snapshot.revision, captureCurrentSnapshot().revision)
      const canonicalSnapshot = createSnapshot(options, snapshot.root)
      assertEditorAiRevision(snapshot.revision, canonicalSnapshot.revision)

      const schema = options.getEditorState?.().schema
      const nodeById = new Map(canonicalSnapshot.nodes.map((node) => [node.id, node]))
      const validationIssues: EditorAiValidationIssue[] = []
      const queuedReplacements = new Map<string, ValidatedReplacement[]>()
      const changeEntryByOperationId = new Map<string, ReadonlyAiChangeEntry>()

      const sandboxRoot = toInertJson(canonicalSnapshot.root, 'Narrative snapshot root')
      const baseObjects = new Map<string, Record<string, JsonValue>>()
      for (const entry of indexNarrativeNodes(sandboxRoot)) {
        baseObjects.set(entry.snapshot.id, getMutableNodeAtPath(sandboxRoot, entry.path))
      }
      let objectPaths = pathIndexByObject(sandboxRoot)

      // nodeId 由路径派生，批内结构操作会让后续旧 id 位移；因此统一按「节点对象身份」重新定位当前路径。
      const currentNodeAt = (
        nodeId: string,
      ): { object: Record<string, JsonValue>; path: number[] } | undefined => {
        const object = baseObjects.get(nodeId)
        if (object === undefined) return undefined
        const path = objectPaths.get(object)
        if (path === undefined) return undefined
        return { object, path: [...path] }
      }
      const nodeTypeLabel = (object: Record<string, JsonValue>): string => (
        typeof object.type === 'string' ? object.type : 'node'
      )
      // 行内格式：add 覆盖同类型 mark、remove 删除、replace 整体替换；null 表示该 mark 类型要被移除。
      const computeTextMarks = (
        existing: JsonValue[],
        requested: Map<string, JsonValue | null>,
        mode: 'add' | 'remove' | 'replace',
      ): JsonValue[] => {
        const kept: JsonValue[] = mode === 'replace'
          ? []
          : existing.filter((mark) => !(isJsonRecord(mark) && typeof mark.type === 'string' && requested.has(mark.type)))
        if (mode === 'remove') return kept
        const added = [...requested.values()].filter((mark): mark is JsonValue => mark !== null)
        return [...kept, ...added]
      }

      for (const operation of operations) {
        throwIfAborted(signal)

        if (operation.type === 'replace_text') {
          const target = nodeById.get(operation.nodeId)
          if (target === undefined) {
            validationIssues.push(issue('target_not_found', `Node ${operation.nodeId} was not found`, operation))
            continue
          }
          if (target.type !== 'text' || target.text === undefined) {
            validationIssues.push(issue('target_not_text', `Node ${operation.nodeId} is not an editable text node`, operation))
            continue
          }
          if (
            !Number.isInteger(operation.from)
            || !Number.isInteger(operation.to)
            || operation.from < 0
            || operation.to < operation.from
            || operation.to > target.text.length
          ) {
            validationIssues.push(issue(
              'invalid_text_range',
              `Text range ${operation.from}-${operation.to} is outside node ${operation.nodeId}`,
              operation,
            ))
            continue
          }
          // 文本替换延后到结构操作之后再执行：结构操作不改变文本偏移，却可能删除目标节点。
          const grouped = queuedReplacements.get(operation.nodeId) ?? []
          grouped.push({ operation, target })
          queuedReplacements.set(operation.nodeId, grouped)
          continue
        }

        if (operation.type === 'set_node_attrs') {
          const current = currentNodeAt(operation.nodeId)
          if (current === undefined) {
            validationIssues.push(issue(
              'target_not_found',
              `Node ${operation.nodeId} is unavailable (it may have been changed earlier in this batch)`,
              operation,
            ))
            continue
          }
          if (current.path.length === 0) {
            validationIssues.push(issue('root_node_immutable', 'The document root has no editable attributes', operation))
            continue
          }
          const before = isJsonRecord(current.object.attrs) ? current.object.attrs : {}
          // operation.attrs 来自只读的模型输入，转为可变 JSON 后再合并，避免只读类型污染编辑器文档。
          const merged = toInertJson({ ...before, ...operation.attrs }, 'Narrative node attributes')
          const schemaError = schemaNodeIssue(schema, { ...current.object, attrs: merged })
          if (schemaError !== null) {
            validationIssues.push(issue(
              'invalid_node_attrs',
              `Attributes are not valid for node ${operation.nodeId} (${nodeTypeLabel(current.object)}): ${schemaError}`,
              operation,
            ))
            continue
          }
          current.object.attrs = merged
          changeEntryByOperationId.set(operation.operationId, {
            operation: 'set_node_attrs',
            targetId: operation.nodeId,
            targetLabel: nodeTypeLabel(current.object),
            category: 'style',
            before,
            after: merged,
          })
          continue
        }

        if (operation.type === 'set_text_marks') {
          const current = currentNodeAt(operation.nodeId)
          if (current === undefined) {
            validationIssues.push(issue(
              'target_not_found',
              `Node ${operation.nodeId} is unavailable (it may have been changed earlier in this batch)`,
              operation,
            ))
            continue
          }
          if (current.object.type !== 'text' || typeof current.object.text !== 'string') {
            validationIssues.push(issue('target_not_text', `Node ${operation.nodeId} is not an editable text node`, operation))
            continue
          }
          const text = current.object.text
          if (
            !Number.isInteger(operation.from)
            || !Number.isInteger(operation.to)
            || operation.from < 0
            || operation.to <= operation.from
            || operation.to > text.length
          ) {
            validationIssues.push(issue(
              'invalid_text_range',
              `Text range ${operation.from}-${operation.to} is outside node ${operation.nodeId}`,
              operation,
            ))
            continue
          }
          const mode = operation.mode ?? 'add'
          const requestedMarks = new Map<string, JsonValue | null>()
          let markIssue: EditorAiValidationIssue | undefined
          for (const mark of operation.marks) {
            const markType = typeof mark.type === 'string' ? mark.type : ''
            if (markType.length === 0) {
              markIssue = issue('invalid_text_marks', 'Every text mark needs a non-empty mark type', operation)
              break
            }
            if (schema !== undefined && schema.marks[markType] === undefined) {
              markIssue = issue('invalid_text_marks', `Mark type ${markType} is not available in this editor`, operation)
              break
            }
            if (mode === 'remove' || mark.attrs === undefined) {
              requestedMarks.set(markType, mode === 'remove' ? null : { type: markType })
              continue
            }
            requestedMarks.set(markType, {
              type: markType,
              attrs: toInertJson(mark.attrs, 'Narrative text mark attributes'),
            })
          }
          if (markIssue !== undefined) {
            validationIssues.push(markIssue)
            continue
          }
          const parentPath = current.path.slice(0, -1)
          const nodeIndex = current.path[current.path.length - 1]
          const parentNode = parentPath.length === 0 ? sandboxRoot : getMutableNodeAtPath(sandboxRoot, parentPath)
          if (!isJsonRecord(parentNode)) {
            validationIssues.push(issue('target_not_found', `Node ${operation.nodeId} has no editable parent`, operation))
            continue
          }
          const existingMarks: JsonValue[] = Array.isArray(current.object.marks) ? current.object.marks : []
          const nextMarks = computeTextMarks(existingMarks, requestedMarks, mode)
          const before = text.slice(0, operation.from)
          const covered = text.slice(operation.from, operation.to)
          const after = text.slice(operation.to)
          // 一段文本可能只有部分带格式，按区间把文本节点拆成 before/covered/after 三段（空段不保留）。
          const base = toInertJson(current.object, 'Narrative text node') as Record<string, JsonValue>
          const coveredNode: Record<string, JsonValue> = { ...base, text: covered }
          if (nextMarks.length === 0) delete coveredNode.marks
          else coveredNode.marks = toInertJson(nextMarks, 'Narrative text marks')
          const replacement: JsonValue[] = []
          if (before.length > 0) replacement.push({ ...base, text: before })
          replacement.push(coveredNode)
          if (after.length > 0) replacement.push({ ...base, text: after })
          contentArray(parentNode).splice(nodeIndex, 1, ...replacement)
          objectPaths = pathIndexByObject(sandboxRoot)
          changeEntryByOperationId.set(operation.operationId, {
            operation: 'set_text_marks',
            targetId: operation.nodeId,
            targetLabel: nodeTypeLabel(current.object),
            category: 'style',
            before: { text: covered, marks: toInertJson(existingMarks, 'Narrative text marks') },
            after: { text: covered, marks: toInertJson(nextMarks, 'Narrative text marks') },
          })
          continue
        }

        if (operation.type === 'insert_node') {
          const parent = currentNodeAt(operation.parentId)
          if (parent === undefined) {
            validationIssues.push(issue('target_not_found', `Parent node ${operation.parentId} is unavailable`, operation))
            continue
          }
          const content = contentArray(parent.object)
          if (operation.index > content.length) {
            validationIssues.push(issue(
              'invalid_insert_index',
              `Insert index ${operation.index} exceeds the ${content.length} children of ${operation.parentId}`,
              operation,
            ))
            continue
          }
          // 插入内容同样先转成可变 JSON，后续才能挂进沙箱文档树。
          const insertedNode = toInertJson(operation.node, 'Inserted narrative node')
          const insertedType = isJsonRecord(insertedNode) ? insertedNode.type : undefined
          if (typeof insertedType !== 'string') {
            validationIssues.push(issue(
              'invalid_node_payload',
              'Inserted node must be a JSON object with a string "type"',
              operation,
            ))
            continue
          }
          const schemaError = schemaNodeIssue(schema, insertedNode)
          if (schemaError !== null) {
            validationIssues.push(issue(
              'invalid_node_payload',
              `Inserted node is not valid for the editor schema: ${schemaError}`,
              operation,
            ))
            continue
          }
          if (!Array.isArray(parent.object.content)) parent.object.content = []
          contentArray(parent.object).splice(operation.index, 0, insertedNode)
          objectPaths = pathIndexByObject(sandboxRoot)
          changeEntryByOperationId.set(operation.operationId, {
            operation: 'insert_node',
            targetId: operation.parentId,
            targetLabel: nodeTypeLabel(parent.object),
            category: 'structure',
            after: { type: insertedType },
          })
          continue
        }

        if (operation.type === 'move_node') {
          const current = currentNodeAt(operation.nodeId)
          if (current === undefined) {
            validationIssues.push(issue('target_not_found', `Node ${operation.nodeId} is unavailable`, operation))
            continue
          }
          if (current.path.length === 0) {
            validationIssues.push(issue('root_node_immutable', 'The document root cannot be moved', operation))
            continue
          }
          const targetParent = currentNodeAt(operation.targetParentId)
          if (targetParent === undefined) {
            validationIssues.push(issue('target_not_found', `Target parent ${operation.targetParentId} is unavailable`, operation))
            continue
          }
          const isOwnDescendant = (
            targetParent.path.length >= current.path.length
            && current.path.every((value, index) => targetParent.path[index] === value)
          )
          if (isOwnDescendant) {
            validationIssues.push(issue(
              'invalid_move_target',
              `Node ${operation.nodeId} cannot be moved into itself or its own descendant ${operation.targetParentId}`,
              operation,
            ))
            continue
          }
          const sameParent = current.path.length === targetParent.path.length + 1
            && current.path.slice(0, -1).every((value, index) => targetParent.path[index] === value)
          const maxIndex = contentArray(targetParent.object).length - (sameParent ? 1 : 0)
          if (operation.index > maxIndex) {
            validationIssues.push(issue(
              'invalid_move_index',
              `Move index ${operation.index} exceeds position count ${maxIndex} in ${operation.targetParentId}`,
              operation,
            ))
            continue
          }
          const previousParentPath = current.path.slice(0, -1)
          const previousIndex = current.path[current.path.length - 1]
          const previousParent = getMutableNodeAtPath(sandboxRoot, previousParentPath)
          const [moved] = contentArray(previousParent).splice(previousIndex, 1)
          if (moved === undefined) {
            throw new EditorAiExecutionError(
              'simulation_failed',
              'Validated narrative move target disappeared from sandbox',
            )
          }
          const insertionIndex = sameParent && operation.index > previousIndex
            ? operation.index - 1
            : operation.index
          const insertionParent = sameParent ? previousParent : targetParent.object
          if (!Array.isArray(insertionParent.content)) insertionParent.content = []
          contentArray(insertionParent).splice(insertionIndex, 0, moved)
          objectPaths = pathIndexByObject(sandboxRoot)
          changeEntryByOperationId.set(operation.operationId, {
            operation: 'move_node',
            targetId: operation.nodeId,
            targetLabel: nodeTypeLabel(current.object),
            category: 'structure',
            before: { parentId: nodeIdForPath(previousParentPath), index: previousIndex },
            after: { parentId: operation.targetParentId, index: operation.index },
          })
          continue
        }

        // 未识别的操作类型（例如误传进叙事批次的 zine 操作）必须显式拒绝，绝不能落到下面的删除分支。
        const fallbackType: string = operation.type
        if (fallbackType !== 'delete_node') {
          validationIssues.push(issue(
            'unsupported_operation',
            `Narrative direct-edit does not support ${fallbackType}`,
            operation,
          ))
          continue
        }
        const current = currentNodeAt(operation.nodeId)
        if (current === undefined) {
          validationIssues.push(issue('target_not_found', `Node ${operation.nodeId} is unavailable`, operation))
          continue
        }
        if (current.path.length === 0) {
          validationIssues.push(issue('root_node_immutable', 'The document root cannot be deleted', operation))
          continue
        }
        const deletedType = nodeTypeLabel(current.object)
        const deletedText = typeof current.object.text === 'string'
          ? current.object.text.slice(0, 200)
          : undefined
        removeNodeAtPath(sandboxRoot, current.path)
        objectPaths = pathIndexByObject(sandboxRoot)
        changeEntryByOperationId.set(operation.operationId, {
          operation: 'delete_node',
          targetId: operation.nodeId,
          targetLabel: deletedType,
          category: 'structure',
          before: deletedText === undefined ? { type: deletedType } : { type: deletedType, text: deletedText },
        })
      }

      const conflictingOperationIds = new Set<string>()
      for (const grouped of queuedReplacements.values()) {
        for (let firstIndex = 0; firstIndex < grouped.length; firstIndex += 1) {
          for (let secondIndex = firstIndex + 1; secondIndex < grouped.length; secondIndex += 1) {
            if (rangesConflict(grouped[firstIndex].operation, grouped[secondIndex].operation)) {
              conflictingOperationIds.add(grouped[firstIndex].operation.operationId)
              conflictingOperationIds.add(grouped[secondIndex].operation.operationId)
            }
          }
        }
      }
      for (const grouped of queuedReplacements.values()) {
        for (const replacement of grouped) {
          if (conflictingOperationIds.has(replacement.operation.operationId)) {
            validationIssues.push(issue(
              'overlapping_text_ranges',
              `Text range for ${replacement.operation.operationId} conflicts with another operation`,
              replacement.operation,
            ))
          }
        }
      }

      if (validationIssues.length > 0) {
        return failedSimulation(canonicalSnapshot, validationIssues)
      }

      for (const [nodeId, grouped] of queuedReplacements) {
        const current = currentNodeAt(nodeId)
        if (current === undefined) {
          for (const { operation } of grouped) {
            validationIssues.push(issue(
              'target_not_found',
              `Node ${nodeId} is unavailable (it may have been deleted earlier in this batch)`,
              operation,
            ))
          }
          continue
        }
        const descending = [...grouped].sort((first, second) => second.operation.from - first.operation.from)
        let text = typeof current.object.text === 'string' ? current.object.text : ''
        for (const { operation, target } of descending) {
          text = `${text.slice(0, operation.from)}${operation.replacement}${text.slice(operation.to)}`
          changeEntryByOperationId.set(operation.operationId, {
            operation: 'replace_text',
            targetId: operation.nodeId,
            targetLabel: target.type,
            category: 'content',
            before: target.text?.slice(operation.from, operation.to) ?? '',
            after: operation.replacement,
          })
        }
        if (text.length === 0) {
          removeNodeAtPath(sandboxRoot, current.path)
          objectPaths = pathIndexByObject(sandboxRoot)
        } else {
          current.object.text = text
        }
      }

      if (validationIssues.length > 0) {
        return failedSimulation(canonicalSnapshot, validationIssues)
      }

      // 定型：ProseMirror 的 fromJSON 会补齐节点默认属性，若不归一化，commit 阶段的
      // 「事务结果 JSON 与模拟结果逐字节相等」校验会必然失败。
      let resultRoot: JsonValue = sandboxRoot
      if (schema !== undefined) {
        try {
          const normalizedDocument = schema.nodeFromJSON(sandboxRoot)
          normalizedDocument.check()
          resultRoot = normalizedDocument.toJSON() as JsonValue
        } catch (error) {
          return failedSimulation(canonicalSnapshot, [{
            code: 'invalid_document',
            severity: 'error',
            message: `The edited document is no longer valid for the editor schema: ${
              error instanceof Error ? error.message : 'unknown error'
            }`,
          }])
        }
      }

      throwIfAborted(signal)
      const resultSnapshot = createSnapshot(options, resultRoot)
      const result: EditorAiSimulationResult<NarrativeDocumentSnapshot> = {
        snapshot: resultSnapshot,
        resultRevision: resultSnapshot.revision,
        issues: [],
        changeEntries: operations.flatMap((operation) => {
          const entry = changeEntryByOperationId.get(operation.operationId)
          return entry === undefined ? [] : [entry]
        }),
      }
      successfulSimulationOperations.set(
        result,
        canonicalizeJson(toInertJson(operations, 'Narrative simulation operations')),
      )
      return result
    },

    async commit(batch, simulation) {
      if (taskHistory.has(batch.taskId)) {
        throw new EditorAiExecutionError(
          'invalid_operation_batch',
          `Narrative task ${batch.taskId} has already been committed`,
        )
      }
      if (batch.target.documentId !== options.documentId) {
        throw new EditorAiExecutionError(
          'invalid_operation_batch',
          `Operation batch targets ${batch.target.documentId}, not ${options.documentId}`,
        )
      }
      if (hasEditorAiValidationErrors(simulation.issues)) {
        throw new EditorAiExecutionError(
          'validation_failed',
          'Narrative direct-edit simulation contains validation errors',
          { issues: simulation.issues },
        )
      }
      const expectedOperations = successfulSimulationOperations.get(simulation)
      const actualOperations = canonicalizeJson(
        toInertJson(batch.operations, 'Narrative commit operations'),
      )
      if (expectedOperations === undefined || expectedOperations !== actualOperations) {
        throw new EditorAiExecutionError(
          'validation_failed',
          'Narrative operation batch does not match its host simulation',
        )
      }

      const { getEditorState, dispatchTransaction } = requireCommitAdapters(options)
      const state = getEditorState()
      const stateSnapshot = createSnapshot(options, state.doc.toJSON())
      assertEditorAiRevision(batch.baseRevision, stateSnapshot.revision)
      assertEditorAiRevision(batch.baseRevision, captureCurrentSnapshot().revision)

      const canonicalSimulationSnapshot = createSnapshot(options, simulation.snapshot.root)
      if (
        canonicalSimulationSnapshot.revision !== simulation.resultRevision
        || simulation.snapshot.revision !== simulation.resultRevision
      ) {
        throw new EditorAiExecutionError(
          'validation_failed',
          'Narrative direct-edit simulation result does not match its revision',
        )
      }

      let transaction = state.tr
      if (batch.operations.every((operation) => operation.type === 'replace_text')) {
        const positionedNodes = indexProseMirrorTextNodes(state.doc)
        const positionedReplacements: Array<{
          operation: DeepReadonly<Extract<NarrativeEditorOperation, { type: 'replace_text' }>>
          target: PositionedTextNode
          from: number
          to: number
        }> = []

        for (const operation of batch.operations) {
          const target = positionedNodes.get(operation.nodeId)
          if (target === undefined || !target.node.isText) {
            throw new EditorAiExecutionError(
              'validation_failed',
              `Narrative text node ${operation.nodeId} is unavailable during commit`,
            )
          }
          if (
            !Number.isInteger(operation.from)
            || !Number.isInteger(operation.to)
            || operation.from < 0
            || operation.to < operation.from
            || operation.to > target.node.textContent.length
          ) {
            throw new EditorAiExecutionError(
              'validation_failed',
              `Narrative text range ${operation.from}-${operation.to} is invalid during commit`,
            )
          }
          positionedReplacements.push({
            operation,
            target,
            from: target.pos + operation.from,
            to: target.pos + operation.to,
          })
        }

        positionedReplacements.sort((first, second) => {
          if (first.from !== second.from) return second.from - first.from
          return second.to - first.to
        })

        for (const replacement of positionedReplacements) {
          if (replacement.operation.replacement.length === 0) {
            transaction = transaction.delete(replacement.from, replacement.to)
          } else {
            transaction = transaction.replaceWith(
              replacement.from,
              replacement.to,
              state.schema.text(replacement.operation.replacement, replacement.target.node.marks),
            )
          }
        }
      } else {
        // 结构 / 属性类批量：nodeId 由路径派生，批内结构操作会让后续旧 id 位移，
        // 逐条重放容易错位。这里直接以「已通过 schema 校验并定型的模拟结果」整篇替换文档内容，
        // 紧随其后的 revision + JSON 逐字节相等校验会证明事务结果与模拟结果完全一致。
        let targetDocument: ProseMirrorNode
        try {
          targetDocument = state.schema.nodeFromJSON(simulation.snapshot.root)
        } catch (error) {
          throw new EditorAiExecutionError(
            'validation_failed',
            `Narrative simulation result is not a valid editor document: ${
              error instanceof Error ? error.message : 'unknown error'
            }`,
          )
        }
        transaction = transaction.replaceWith(0, state.doc.content.size, targetDocument.content)
      }

      const historyEntryId = `${batch.taskId}:${simulation.resultRevision}`
      const metadata: NarrativeAiTaskTransactionMetadata = {
        taskId: batch.taskId,
        historyEntryId,
        baseRevision: batch.baseRevision,
        resultRevision: simulation.resultRevision,
      }
      transaction.setMeta(NARRATIVE_AI_TASK_TRANSACTION_META, metadata)
      transaction = closeHistory(transaction)
      transaction.setTime(0)

      const transactionSnapshot = createSnapshot(options, transaction.doc.toJSON())
      if (
        !transaction.docChanged
        || transactionSnapshot.revision === batch.baseRevision
      ) {
        throw new EditorAiExecutionError(
          'validation_failed',
          'Narrative direct-edit commit must produce a document change',
        )
      }
      if (
        transactionSnapshot.revision !== simulation.resultRevision
        || canonicalizeJson(transactionSnapshot.root) !== canonicalizeJson(canonicalSimulationSnapshot.root)
      ) {
        throw new EditorAiExecutionError(
          'validation_failed',
          'Narrative transaction result does not match the validated simulation',
        )
      }

      dispatchTransaction(transaction)
      const committedState = getEditorState()
      const committedSnapshot = createSnapshot(options, committedState.doc.toJSON())
      if (committedSnapshot.revision !== simulation.resultRevision) {
        throw new EditorAiExecutionError(
          'commit_failed',
          'Narrative editor did not apply the validated transaction result',
        )
      }

      taskHistory.set(batch.taskId, {
        baseRevision: batch.baseRevision,
        resultRevision: simulation.resultRevision,
        appliedUndoDepth: undoDepth(committedState),
        state: 'applied',
      })

      return {
        resultRevision: simulation.resultRevision,
        historyEntryId,
        saved: false,
      }
    },

    getTaskHistoryState(taskId) {
      return getHistoryState(taskId)
    },

    undoTask(taskId) {
      const historyState = getHistoryState(taskId)
      if (!historyState?.canUndo || options.getEditorState === undefined || options.dispatchTransaction === undefined) {
        return false
      }
      return undo(options.getEditorState(), options.dispatchTransaction)
    },

    redoTask(taskId) {
      const historyState = getHistoryState(taskId)
      if (!historyState?.canRedo || options.getEditorState === undefined || options.dispatchTransaction === undefined) {
        return false
      }
      return redo(options.getEditorState(), options.dispatchTransaction)
    },

    lock(taskId) {
      if (options.lockTask === undefined) {
        throw new EditorAiExecutionError('commit_failed', 'Narrative direct-edit lock adapter is unavailable')
      }
      options.lockTask(taskId)
    },

    unlock(taskId) {
      if (options.unlockTask === undefined) {
        throw new EditorAiExecutionError('commit_failed', 'Narrative direct-edit unlock adapter is unavailable')
      }
      options.unlockTask(taskId)
    },
  }
}
