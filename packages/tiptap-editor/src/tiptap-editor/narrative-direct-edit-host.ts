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

function comparePathsDescending(first: readonly number[], second: readonly number[]): number {
  const sharedLength = Math.min(first.length, second.length)
  for (let index = 0; index < sharedLength; index += 1) {
    if (first[index] !== second[index]) return second[index] - first[index]
  }
  return second.length - first.length
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

      const nodeById = new Map(canonicalSnapshot.nodes.map((node) => [node.id, node]))
      const validationIssues: EditorAiValidationIssue[] = []
      const replacements: ValidatedReplacement[] = []

      for (const operation of operations) {
        throwIfAborted(signal)
        if (operation.type !== 'replace_text') {
          validationIssues.push(issue(
            'unsupported_operation',
            `Narrative direct-edit does not support ${operation.type} yet`,
            operation,
          ))
          continue
        }

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
        replacements.push({ operation, target })
      }

      const replacementsByNode = new Map<string, ValidatedReplacement[]>()
      for (const replacement of replacements) {
        const grouped = replacementsByNode.get(replacement.operation.nodeId) ?? []
        grouped.push(replacement)
        replacementsByNode.set(replacement.operation.nodeId, grouped)
      }

      const conflictingOperationIds = new Set<string>()
      for (const grouped of replacementsByNode.values()) {
        for (let firstIndex = 0; firstIndex < grouped.length; firstIndex += 1) {
          for (let secondIndex = firstIndex + 1; secondIndex < grouped.length; secondIndex += 1) {
            if (rangesConflict(grouped[firstIndex].operation, grouped[secondIndex].operation)) {
              conflictingOperationIds.add(grouped[firstIndex].operation.operationId)
              conflictingOperationIds.add(grouped[secondIndex].operation.operationId)
            }
          }
        }
      }
      for (const replacement of replacements) {
        if (conflictingOperationIds.has(replacement.operation.operationId)) {
          validationIssues.push(issue(
            'overlapping_text_ranges',
            `Text range for ${replacement.operation.operationId} conflicts with another operation`,
            replacement.operation,
          ))
        }
      }

      if (validationIssues.length > 0) {
        return failedSimulation(canonicalSnapshot, validationIssues)
      }

      const sandboxRoot = toInertJson(canonicalSnapshot.root, 'Narrative snapshot root')
      const sandboxIndex = new Map(indexNarrativeNodes(sandboxRoot).map((entry) => [entry.snapshot.id, entry]))
      const changeEntries: ReadonlyAiChangeEntry[] = replacements.map(({ operation, target }) => ({
        operation: 'replace_text',
        targetId: operation.nodeId,
        targetLabel: target.type,
        category: 'content',
        before: target.text?.slice(operation.from, operation.to) ?? '',
        after: operation.replacement,
      }))
      const emptiedTextNodePaths: number[][] = []

      for (const grouped of replacementsByNode.values()) {
        const descending = [...grouped].sort((first, second) => second.operation.from - first.operation.from)
        const indexedTarget = sandboxIndex.get(descending[0].operation.nodeId)
        if (indexedTarget === undefined) {
          throw new EditorAiExecutionError('simulation_failed', 'Validated narrative target disappeared from sandbox')
        }
        const mutableTarget = getMutableNodeAtPath(sandboxRoot, indexedTarget.path)
        let text = typeof mutableTarget.text === 'string' ? mutableTarget.text : ''
        for (const { operation } of descending) {
          text = `${text.slice(0, operation.from)}${operation.replacement}${text.slice(operation.to)}`
        }
        if (text.length === 0) {
          emptiedTextNodePaths.push(indexedTarget.path)
        } else {
          mutableTarget.text = text
        }
      }

      for (const path of emptiedTextNodePaths.sort(comparePathsDescending)) {
        removeNodeAtPath(sandboxRoot, path)
      }

      throwIfAborted(signal)
      const resultSnapshot = createSnapshot(options, sandboxRoot)
      const result: EditorAiSimulationResult<NarrativeDocumentSnapshot> = {
        snapshot: resultSnapshot,
        resultRevision: resultSnapshot.revision,
        issues: [],
        changeEntries,
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

      const positionedNodes = indexProseMirrorTextNodes(state.doc)
      const positionedReplacements: Array<{
        operation: DeepReadonly<Extract<NarrativeEditorOperation, { type: 'replace_text' }>>
        target: PositionedTextNode
        from: number
        to: number
      }> = []

      for (const operation of batch.operations) {
        if (operation.type !== 'replace_text') {
          throw new EditorAiExecutionError(
            'validation_failed',
            `Narrative direct-edit commit does not support ${operation.type}`,
          )
        }
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

      let transaction = state.tr
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
