import assert from 'node:assert/strict'

import type { JSONContent } from '@tiptap/core'
import { history, redo, undo } from '@tiptap/pm/history'
import { Schema } from '@tiptap/pm/model'
import { EditorState, type Transaction } from '@tiptap/pm/state'
import {
  EditorAiExecutionError,
  type EditorOperationBatch,
  type NarrativeEditorOperation,
} from '@mo-gallery/ai-agent'

import {
  NARRATIVE_AI_TASK_TRANSACTION_META,
  createNarrativeDirectEditHost,
} from '../src/tiptap-editor/narrative-direct-edit-host'

function createDocument(firstText = 'Hello world', secondText = 'Second paragraph'): JSONContent {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        attrs: { textAlign: null },
        content: [{ type: 'text', text: firstText }],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: secondText }],
      },
    ],
  }
}

function operation(
  operationId: string,
  nodeId: string,
  from: number,
  to: number,
  replacement: string,
): NarrativeEditorOperation {
  return { operationId, type: 'replace_text', nodeId, from, to, replacement }
}

let document = createDocument()
const host = createNarrativeDirectEditHost({
  documentId: 'story-1',
  documentKind: 'story',
  title: 'A story',
  editorWidth: 720,
  getDocument: () => document,
})

const firstSnapshot = await host.captureSnapshot()
const secondSnapshot = await host.captureSnapshot()

assert.equal(firstSnapshot.capability, 'narrative')
assert.equal(firstSnapshot.documentId, 'story-1')
assert.equal(firstSnapshot.documentKind, 'story')
assert.equal(firstSnapshot.editorWidth, 720)
assert.deepEqual(firstSnapshot.visualSegments, [], 'Task 3 does not capture visual segments')
assert.deepEqual(
  firstSnapshot.nodes.map((node) => node.id),
  secondSnapshot.nodes.map((node) => node.id),
  'unchanged TipTap JSON receives stable node IDs across captures',
)
assert.equal(firstSnapshot.revision, secondSnapshot.revision, 'unchanged snapshots have canonical revisions')

const reorderedKeysDocument: JSONContent = {
  content: createDocument().content,
  type: 'doc',
}
document = reorderedKeysDocument
assert.equal(
  host.getCurrentRevision(),
  firstSnapshot.revision,
  'object key insertion order does not affect the canonical revision',
)

const textNodes = firstSnapshot.nodes.filter((node) => node.type === 'text')
assert.equal(textNodes.length, 2)
const firstTextNode = textNodes[0]
const secondTextNode = textNodes[1]

const successful = await host.simulate(firstSnapshot, [
  operation('replace-world', firstTextNode.id, 6, 11, 'gallery'),
  operation('replace-hello', firstTextNode.id, 0, 5, 'Hi'),
  operation('replace-second', secondTextNode.id, 0, 6, 'Another'),
])

assert.deepEqual(successful.issues, [])
assert.notEqual(successful.resultRevision, firstSnapshot.revision)
assert.equal(
  successful.snapshot.nodes.find((node) => node.id === firstTextNode.id)?.text,
  'Hi gallery',
  'multiple replacements use offsets from the base snapshot',
)
assert.equal(
  successful.snapshot.nodes.find((node) => node.id === secondTextNode.id)?.text,
  'Another paragraph',
)
assert.deepEqual(
  successful.changeEntries,
  [
    {
      operation: 'replace_text',
      targetId: firstTextNode.id,
      targetLabel: 'text',
      category: 'content',
      before: 'world',
      after: 'gallery',
    },
    {
      operation: 'replace_text',
      targetId: firstTextNode.id,
      targetLabel: 'text',
      category: 'content',
      before: 'Hello',
      after: 'Hi',
    },
    {
      operation: 'replace_text',
      targetId: secondTextNode.id,
      targetLabel: 'text',
      category: 'content',
      before: 'Second',
      after: 'Another',
    },
  ],
  'change entries are derived from the authoritative base text in operation order',
)
assert.equal(document.content?.[0]?.content?.[0]?.text, 'Hello world', 'simulation never mutates the live editor JSON')
assert.equal(firstSnapshot.nodes[2]?.text, 'Hello world', 'simulation never mutates its input snapshot')

const invalidRange = await host.simulate(firstSnapshot, [
  operation('valid-first', firstTextNode.id, 0, 5, 'Changed'),
  operation('invalid-second', secondTextNode.id, 0, 999, 'Invalid'),
])

assert.equal(invalidRange.resultRevision, firstSnapshot.revision, 'failed simulation returns the unchanged revision')
assert.equal(invalidRange.snapshot.revision, firstSnapshot.revision, 'failed simulation returns the unchanged snapshot')
assert.deepEqual(invalidRange.changeEntries, [], 'all-or-nothing failure exposes no partial authoritative changes')
assert.deepEqual(
  invalidRange.issues.map((issue) => ({ code: issue.code, operationId: issue.operationId })),
  [{ code: 'invalid_text_range', operationId: 'invalid-second' }],
)

const missingTarget = await host.simulate(firstSnapshot, [
  operation('missing', 'missing-node', 0, 0, 'Nope'),
])
assert.equal(missingTarget.issues[0]?.code, 'target_not_found')
assert.deepEqual(missingTarget.issues[0]?.targetIds, ['missing-node'])

const structuralNode = firstSnapshot.nodes.find((node) => node.type === 'paragraph')
assert.ok(structuralNode)
const nonTextTarget = await host.simulate(firstSnapshot, [
  operation('not-text', structuralNode.id, 0, 0, 'Nope'),
])
assert.equal(nonTextTarget.issues[0]?.code, 'target_not_text')

const overlapping = await host.simulate(firstSnapshot, [
  operation('overlap-a', firstTextNode.id, 0, 5, 'A'),
  operation('overlap-b', firstTextNode.id, 4, 7, 'B'),
])
assert.deepEqual(
  overlapping.issues.map((issue) => issue.code),
  ['overlapping_text_ranges', 'overlapping_text_ranges'],
  'overlapping operations reject the entire batch with correlated issues',
)
assert.deepEqual(overlapping.changeEntries, [])

const samePointInsertions = await host.simulate(firstSnapshot, [
  operation('insert-a', firstTextNode.id, 5, 5, 'A'),
  operation('insert-b', firstTextNode.id, 5, 5, 'B'),
])
assert.equal(samePointInsertions.issues.length, 2, 'same-position insertions are rejected as ambiguous')

const endBoundaryInsertion = await host.simulate(firstSnapshot, [
  operation('replace-prefix', firstTextNode.id, 0, 5, 'Hi'),
  operation('insert-after-prefix', firstTextNode.id, 5, 5, '!'),
])
assert.deepEqual(endBoundaryInsertion.issues, [], 'an insertion at a half-open range end is independent')
assert.equal(
  endBoundaryInsertion.snapshot.nodes.find((node) => node.id === firstTextNode.id)?.text,
  'Hi! world',
)

const startBoundaryInsertion = await host.simulate(firstSnapshot, [
  operation('replace-from-start', firstTextNode.id, 0, 5, 'Hi'),
  operation('insert-at-start', firstTextNode.id, 0, 0, '!'),
])
assert.equal(startBoundaryInsertion.issues.length, 2, 'an insertion at a replacement start remains ordering-ambiguous')

const adjacentReplacements = await host.simulate(firstSnapshot, [
  operation('replace-prefix-adjacent', firstTextNode.id, 0, 5, 'Hi'),
  operation('replace-space-adjacent', firstTextNode.id, 5, 6, '-'),
])
assert.deepEqual(adjacentReplacements.issues, [], 'adjacent non-empty half-open ranges do not overlap')
assert.equal(
  adjacentReplacements.snapshot.nodes.find((node) => node.id === firstTextNode.id)?.text,
  'Hi-world',
)

const unsupported = await host.simulate(firstSnapshot, [{
  operationId: 'unsupported',
  type: 'set_node_attrs',
  nodeId: firstTextNode.id,
  attrs: { textAlign: 'center' },
}])
assert.equal(unsupported.issues[0]?.code, 'unsupported_operation')
assert.equal(unsupported.issues[0]?.operationId, 'unsupported')
assert.deepEqual(unsupported.changeEntries, [])

{
  let accessorReads = 0
  const accessorContent: JSONContent[] = []
  Object.defineProperty(accessorContent, '0', {
    configurable: true,
    enumerable: true,
    get() {
      accessorReads += 1
      return { type: 'paragraph' }
    },
  })
  document = { type: 'doc', content: accessorContent }
  await assert.rejects(host.captureSnapshot(), TypeError, 'array accessors are rejected')
  assert.equal(accessorReads, 0, 'snapshot capture never executes an array accessor')

  const customContent: JSONContent[] = []
  Object.defineProperty(customContent, 'extra', {
    configurable: true,
    enumerable: true,
    value: true,
    writable: true,
  })
  document = { type: 'doc', content: customContent }
  await assert.rejects(host.captureSnapshot(), TypeError, 'custom array properties are rejected')

  const undefinedDocument = { type: 'doc' } as JSONContent & Record<string, unknown>
  undefinedDocument.invalid = undefined
  document = undefinedDocument
  await assert.rejects(host.captureSnapshot(), TypeError, 'undefined properties are rejected instead of omitted')

  const cyclicDocument: Record<string, unknown> = { type: 'doc' }
  cyclicDocument.self = cyclicDocument
  document = cyclicDocument as JSONContent
  await assert.rejects(host.captureSnapshot(), TypeError, 'cyclic editor JSON is rejected')
}

document = createDocument()
const nodeIntegritySnapshot = await host.captureSnapshot()
const mutableNodes = nodeIntegritySnapshot.nodes as unknown as Array<{ type: string; text?: string }>
const mutableTextNode = mutableNodes.find((node) => node.type === 'text')
assert.ok(mutableTextNode)
mutableTextNode.text = 'Forged snapshot text'
const integritySimulation = await host.simulate(nodeIntegritySnapshot, [
  operation('integrity', firstTextNode.id, 0, 5, 'Hi'),
])
assert.equal(integritySimulation.changeEntries[0]?.before, 'Hello', 'simulation rebuilds authoritative nodes from snapshot root')

const rootIntegritySnapshot = await host.captureSnapshot()
const mutableRoot = rootIntegritySnapshot.root as unknown as {
  content: Array<{ content: Array<{ text: string }> }>
}
mutableRoot.content[0].content[0].text = 'Forged root text'
await assert.rejects(
  host.simulate(rootIntegritySnapshot, [operation('forged-root', firstTextNode.id, 0, 5, 'Hi')]),
  (error) => error instanceof EditorAiExecutionError && error.code === 'stale_revision',
  'simulation rejects snapshot root contents that no longer match the stored revision',
)

const deletion = await host.simulate(firstSnapshot, [
  operation('delete-text', firstTextNode.id, 0, firstTextNode.text?.length ?? 0, ''),
])
const deletionRoot = deletion.snapshot.root as {
  content: Array<{ content?: Array<{ type: string; text?: string }> }>
}
assert.deepEqual(
  deletionRoot.content[0].content ?? [],
  [],
  'deleting all text removes the empty text node instead of producing invalid TipTap JSON',
)

const aborted = new AbortController()
aborted.abort()
await assert.rejects(
  host.captureSnapshot(aborted.signal),
  (error) => error instanceof EditorAiExecutionError && error.code === 'aborted',
  'capture observes cancellation before reading editor state',
)

document = createDocument('The document changed')
await assert.rejects(
  host.simulate(firstSnapshot, [operation('stale', firstTextNode.id, 0, 5, 'Fresh')]),
  (error) => error instanceof EditorAiExecutionError && error.code === 'stale_revision',
  'simulation rejects a snapshot after the live document revision changes',
)

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      attrs: { textAlign: { default: null } },
      content: 'text*',
      group: 'block',
    },
    text: { group: 'inline' },
  },
})

let editorState = EditorState.create({
  schema,
  doc: schema.nodeFromJSON(createDocument()),
  plugins: [history()],
})
editorState = editorState.apply(editorState.tr.insertText('!', 12))
const originalEditorDocument = editorState.doc.toJSON()
let dispatchCount = 0
const emittedDocuments: JSONContent[] = []
const committedTransactions: Transaction[] = []
const transactionHost = createNarrativeDirectEditHost({
  documentId: 'story-transaction',
  documentKind: 'story',
  editorWidth: 720,
  getDocument: () => editorState.doc.toJSON(),
  getEditorState: () => editorState,
  dispatchTransaction: (transaction) => {
    dispatchCount += 1
    committedTransactions.push(transaction)
    editorState = editorState.apply(transaction)
    emittedDocuments.push(editorState.doc.toJSON())
  },
})

const transactionSnapshot = await transactionHost.captureSnapshot()
const transactionTextNodes = transactionSnapshot.nodes.filter((node) => node.type === 'text')
const transactionOperations = [
  operation('transaction-world', transactionTextNodes[0].id, 6, 11, 'gallery'),
  operation('transaction-hello', transactionTextNodes[0].id, 0, 5, 'Hi'),
  operation('transaction-second', transactionTextNodes[1].id, 0, 6, 'Another'),
]
const transactionSimulation = await transactionHost.simulate(transactionSnapshot, transactionOperations)
const transactionBatch: EditorOperationBatch<'narrative', NarrativeEditorOperation> = {
  taskId: 'task-transaction',
  capability: 'narrative',
  baseRevision: transactionSnapshot.revision,
  target: { documentId: 'story-transaction' },
  operations: transactionOperations,
  summary: ['Replace three text ranges'],
}

await assert.rejects(
  transactionHost.commit({
    ...transactionBatch,
    taskId: 'task-mismatched',
    operations: [operation('different-operation', transactionTextNodes[0].id, 0, 5, 'Other')],
  }, transactionSimulation),
  (error) => error instanceof EditorAiExecutionError && error.code === 'validation_failed',
  'commit rejects a batch that was not used to produce its simulation',
)
assert.equal(dispatchCount, 0, 'batch/simulation mismatch is rejected before dispatch')

const noOpSimulation = await transactionHost.simulate(transactionSnapshot, [])
await assert.rejects(
  transactionHost.commit({
    ...transactionBatch,
    taskId: 'task-no-op',
    operations: [],
    summary: [],
  }, noOpSimulation),
  (error) => error instanceof EditorAiExecutionError && error.code === 'validation_failed',
  'a net-zero operation batch cannot claim a native history entry',
)
assert.equal(dispatchCount, 0, 'no-op commit is rejected before dispatch')

const commitResult = await transactionHost.commit(transactionBatch, transactionSimulation)
assert.equal(dispatchCount, 1, 'three replacements commit through exactly one dispatch')
assert.equal(emittedDocuments.length, 1, 'editor update observers receive only the final document')
assert.equal(JSON.stringify(emittedDocuments[0]), JSON.stringify(transactionSimulation.snapshot.root))
assert.equal(commitResult.resultRevision, transactionSimulation.resultRevision)
assert.deepEqual(
  committedTransactions[0].getMeta(NARRATIVE_AI_TASK_TRANSACTION_META),
  {
    taskId: 'task-transaction',
    historyEntryId: commitResult.historyEntryId,
    baseRevision: transactionSnapshot.revision,
    resultRevision: transactionSimulation.resultRevision,
  },
  'the single transaction carries authoritative AI task metadata',
)
assert.deepEqual(transactionHost.getTaskHistoryState('task-transaction'), {
  state: 'applied',
  canUndo: true,
  canRedo: false,
})

await assert.rejects(
  transactionHost.commit(transactionBatch, transactionSimulation),
  (error) => error instanceof EditorAiExecutionError && error.code === 'invalid_operation_batch',
  'a committed task ID cannot be reused',
)
assert.equal(dispatchCount, 1, 'duplicate task ID is rejected before dispatch')

assert.equal(undo(editorState, (transaction) => {
  editorState = editorState.apply(transaction)
}), true, 'native history can undo the AI transaction')
assert.equal(
  JSON.stringify(editorState.doc.toJSON()),
  JSON.stringify(originalEditorDocument),
  'one Undo restores the complete original document',
)
assert.deepEqual(transactionHost.getTaskHistoryState('task-transaction'), {
  state: 'undone',
  canUndo: false,
  canRedo: true,
})

assert.equal(redo(editorState, (transaction) => {
  editorState = editorState.apply(transaction)
}), true, 'native history can redo the AI transaction')
assert.equal(
  JSON.stringify(editorState.doc.toJSON()),
  JSON.stringify(transactionSimulation.snapshot.root),
  'one Redo restores the complete AI result',
)
assert.deepEqual(transactionHost.getTaskHistoryState('task-transaction'), {
  state: 'redone',
  canUndo: true,
  canRedo: false,
})

editorState = editorState.apply(editorState.tr.insertText('?', 1))
assert.equal(
  transactionHost.getTaskHistoryState('task-transaction')?.canUndo,
  false,
  'a later typing history event prevents the AI card from undoing past history top',
)
assert.equal(undo(editorState, (transaction) => {
  editorState = editorState.apply(transaction)
}), true, 'native history first undoes typing after the AI task')
assert.equal(
  JSON.stringify(editorState.doc.toJSON()),
  JSON.stringify(transactionSimulation.snapshot.root),
  'typing after the AI task stays in a separate native history event',
)
assert.deepEqual(transactionHost.getTaskHistoryState('task-transaction'), {
  state: 'redone',
  canUndo: true,
  canRedo: false,
})

const failedCommitDispatchCount = dispatchCount
const failedSimulation = await transactionHost.simulate(
  await transactionHost.captureSnapshot(),
  [operation('invalid-commit', transactionTextNodes[0].id, 0, 999, 'Invalid')],
)
await assert.rejects(
  transactionHost.commit({
    ...transactionBatch,
    taskId: 'task-invalid',
    baseRevision: failedSimulation.snapshot.revision,
    operations: [operation('invalid-commit', transactionTextNodes[0].id, 0, 999, 'Invalid')],
  }, failedSimulation),
  (error) => error instanceof EditorAiExecutionError && error.code === 'validation_failed',
)
assert.equal(dispatchCount, failedCommitDispatchCount, 'failed simulation produces no transaction')

const staleSnapshot = await transactionHost.captureSnapshot()
const staleTextNode = staleSnapshot.nodes.find((node) => node.type === 'text')
assert.ok(staleTextNode)
const staleOperation = operation('stale-commit', staleTextNode.id, 0, 2, 'Stale')
const staleSimulation = await transactionHost.simulate(staleSnapshot, [staleOperation])
editorState = editorState.apply(editorState.tr.insertText('!', 1))
await assert.rejects(
  transactionHost.commit({
    ...transactionBatch,
    taskId: 'task-stale',
    baseRevision: staleSnapshot.revision,
    operations: [staleOperation],
  }, staleSimulation),
  (error) => error instanceof EditorAiExecutionError && error.code === 'stale_revision',
)
assert.equal(dispatchCount, failedCommitDispatchCount, 'stale commit produces no transaction')

console.log('✓ narrative direct-edit snapshot and sandbox simulation')
