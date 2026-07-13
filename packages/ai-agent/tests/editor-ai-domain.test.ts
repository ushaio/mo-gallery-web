import assert from 'node:assert/strict'

import * as publicApi from '../src/index'
import * as capabilitiesDomain from '../src/domain/capabilities'

import type {
  DirectEditAgentEvent as PublicDirectEditAgentEvent,
  DirectEditAgentResult as PublicDirectEditAgentResult,
  DirectEditAgentRuntime as PublicDirectEditAgentRuntime,
  DirectEditAgentRuntimeRunOptions as PublicDirectEditAgentRuntimeRunOptions,
  DirectEditAgentTask as PublicDirectEditAgentTask,
  DirectEditTaskStatus as PublicDirectEditTaskStatus,
  DirectEditTaskType as PublicDirectEditTaskType,
} from '../src/index'

import {
  aiChangeEntrySchema,
  aiChangeSetSchema,
  aiTaskWarningSchema,
  editorAiTaskMetadataSchema,
  isEditorAiTaskMetadata,
  parseEditorAiTaskMetadata,
  summarizeOperations,
} from '../src/domain/changes'
import type { EditorAiCompletedTaskMetadata } from '../src/domain/changes'
import {
  createEditorDocumentRevision,
  createEditorDocumentSnapshot,
  createNarrativeDocumentSnapshot,
  createZineDocumentSnapshot,
  isNarrativeDocumentSnapshot,
  isZineDocumentSnapshot,
} from '../src/domain/document'
import type {
  CreateNarrativeDocumentSnapshotInput,
  CreateZineDocumentSnapshotInput,
  EditorAiImageInput,
  NarrativeDocumentSnapshot,
  StructuredEditorSnapshot,
  ZineDocumentSnapshot,
} from '../src/domain/document'
import type { JsonValue } from '../src/domain/json'
import { MAX_INERT_JSON_DEPTH } from '../src/domain/inert-json'
import {
  MAX_EDITOR_AI_MESSAGE_METADATA_BYTES,
  editorAiMessageMetadataSchema,
  editorAiTaskMessageMetadataSchema,
  editorAiTaskStateUpdateSchema,
  readEditorAiTaskMessageMetadata,
} from '../src/domain/message-metadata'
import {
  DIRECT_EDIT_TASK_STATUSES,
  createEditorAgentTaskId,
} from '../src/domain/agent'
import type {
  DirectEditAgentResult,
  DirectEditAgentRuntime,
  DirectEditAgentTask,
  DirectEditTaskStatus,
  DirectEditTaskType,
  EditorAgentEvent,
  EditorAgentResult,
  EditorAgentRuntime,
  EditorAgentStatus,
  EditorAgentTask,
} from '../src/domain/agent'
import type { EditorAiModelCapabilities } from '../src/domain/capabilities'
import type {
  EditorOperationAuthorization,
  NarrativeEditorOperation,
  ZineEditorOperation,
} from '../src/domain/operations'
import type { EditorProposal } from '../src/domain/proposals'
import {
  applyEditorAiContextBudget,
  estimateEditorAiContextTokens,
  resolveEditorAiCapabilities,
} from '../src/domain/capabilities'
import {
  MAX_EDITOR_OPERATION_BATCH_OPERATIONS,
  MAX_EDITOR_OPERATION_BATCH_SUMMARIES,
  MAX_EDITOR_OPERATION_ID_LENGTH,
  MAX_EDITOR_OPERATION_JSON_LENGTH,
  MAX_EDITOR_OPERATION_REPLACEMENT_LENGTH,
  MAX_EDITOR_OPERATION_SUMMARY_LENGTH,
  MAX_EDITOR_TEMPLATE_TARGET_SLOT_IDS,
  editorOperationBatchSchema,
  parseEditorOperationBatch,
  validateOperationAuthorization,
} from '../src/domain/operations'
import {
  canonicalizeJson,
  createStructuredRevision,
  createTextRevision,
} from '../src/domain/revision'
import { applyEditorAiContextBudgetWithEstimatorForTest } from './support/context-budget'

function test(name: string, run: () => void): void {
  try {
    run()
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}`)
    throw error
  }
}

const MODEL_CAPABILITIES: EditorAiModelCapabilities = {
  vision: true,
  structuredOutput: true,
  toolCalling: true,
}

const NARRATIVE_AUTHORIZATION: EditorOperationAuthorization = {
  allowDelete: true,
  deleteTargetIds: ['paragraph-1'],
}

test('direct-edit task statuses are exhaustively represented', () => {
  const expected: readonly PublicDirectEditTaskStatus[] = [
    'preparing_context',
    'analyzing',
    'planning',
    'simulating',
    'validating',
    'applying',
    'completed',
    'stopped',
    'failed',
  ]

  assert.deepEqual(publicApi.DIRECT_EDIT_TASK_STATUSES, expected)
  assert.equal(publicApi.DIRECT_EDIT_TASK_STATUSES, DIRECT_EDIT_TASK_STATUSES)
  assert.equal(typeof publicApi.createEditorAgentTaskId, 'function')
  assert.equal(publicApi.createEditorAgentTaskId().length > 0, true)
})

test('package root exposes production APIs without adapter or test hooks', () => {
  const requiredValues = [
    'buildDirectEditMessages',
    'createEditorDocumentSnapshot',
    'createNarrativeDocumentSnapshot',
    'createStructuredRevision',
    'createZineDocumentSnapshot',
    'getTextReplacementOperation',
    'readEditorAiTaskMessageMetadata',
    'resolveEditorAiCapabilities',
    'runDirectEditAgent',
    'runDirectEditAgentWithRuntime',
    'runEditorAgent',
    'runEditorAgentWithRuntime',
    'streamEditorAiText',
  ] as const

  for (const name of requiredValues) {
    assert.equal(typeof publicApi[name], 'function', `${name} must be public`)
  }
  assert.equal(typeof publicApi.EDITOR_AI_SYSTEM_PROMPT, 'string')
  assert.equal(typeof publicApi.DIRECT_EDIT_TASK_STATUSES, 'object')
  assert.equal(publicApi.MAX_EDITOR_AI_MESSAGE_METADATA_BYTES, 256 * 1024)
  assert.equal(typeof publicApi.editorAiMessageMetadataSchema.safeParse, 'function')
  assert.equal(typeof publicApi.editorAiTaskMessageMetadataSchema.safeParse, 'function')
  assert.equal(typeof publicApi.editorAiTaskStateUpdateSchema.safeParse, 'function')

  for (const forbiddenName of [
    'VercelAiDirectEditAgentRuntime',
    'VercelAiEditorAgentRuntime',
    'applyEditorAiContextBudgetWithEstimatorForTest',
    'estimateContextBudgetTokens',
    'notifyContextBudgetCandidate',
  ]) {
    assert.equal(forbiddenName in publicApi, false, `${forbiddenName} must stay internal`)
  }
})

function compilePackageRootStatusContract(): void {
  const statuses: readonly PublicDirectEditTaskStatus[] = publicApi.DIRECT_EDIT_TASK_STATUSES

  // @ts-expect-error package-root task statuses are readonly
  statuses.push('failed')
}

void compilePackageRootStatusContract

test('direct-edit protocol supports correlated narrative and Zine tasks', () => {
  const narrativeTask: DirectEditAgentTask<NarrativeDocumentSnapshot> = {
    id: 'task-narrative',
    taskType: 'instruction',
    instruction: 'Improve the opening',
    snapshot: createNarrative(),
    authorization: NARRATIVE_AUTHORIZATION,
    modelCapabilities: MODEL_CAPABILITIES,
  }
  const zineTask: DirectEditAgentTask<ZineDocumentSnapshot> = {
    id: 'task-zine',
    taskType: 'page_audit',
    instruction: 'Audit this spread',
    snapshot: createZine(),
    authorization: {
      allowDelete: false,
      deleteTargetIds: [],
      targetSpreadId: 'spread-1',
      projectAssetIds: ['asset-1'],
    },
    modelCapabilities: MODEL_CAPABILITIES,
  }

  assert.equal(narrativeTask.snapshot.capability, 'narrative')
  assert.equal(zineTask.snapshot.capability, 'zine')
})

function compileDirectEditProtocolContracts(): void {
  const taskType: DirectEditTaskType = 'instruction'
  const narrativeTask: DirectEditAgentTask<NarrativeDocumentSnapshot> = {
    id: 'task-narrative',
    taskType,
    instruction: 'Improve the opening',
    snapshot: createNarrative(),
    authorization: NARRATIVE_AUTHORIZATION,
    modelCapabilities: MODEL_CAPABILITIES,
  }
  const zineTask: DirectEditAgentTask<ZineDocumentSnapshot> = {
    id: 'task-zine',
    taskType: 'page_audit',
    instruction: 'Audit this spread',
    snapshot: createZine(),
    authorization: {
      allowDelete: false,
      deleteTargetIds: [],
      targetSpreadId: 'spread-1',
      projectAssetIds: ['asset-1'],
    },
    modelCapabilities: MODEL_CAPABILITIES,
  }
  const packageRootTask: PublicDirectEditAgentTask<NarrativeDocumentSnapshot> = narrativeTask

  // @ts-expect-error protocol task IDs are readonly
  narrativeTask.id = 'mutated'
  // @ts-expect-error protocol task types are readonly
  narrativeTask.taskType = 'page_audit'
  // @ts-expect-error protocol instructions are readonly
  narrativeTask.instruction = 'mutated'
  // @ts-expect-error protocol snapshots are deeply readonly
  narrativeTask.snapshot.nodes[0].text = 'mutated'
  // @ts-expect-error protocol authorization is deeply readonly
  narrativeTask.authorization.deleteTargetIds.push('paragraph-2')
  // @ts-expect-error protocol model capabilities are deeply readonly
  narrativeTask.modelCapabilities.vision = false

  const narrativeBatch = {
    taskId: narrativeTask.id,
    capability: 'narrative' as const,
    baseRevision: narrativeTask.snapshot.revision,
    target: { documentId: narrativeTask.snapshot.documentId },
    operations: [{
      operationId: 'operation-1',
      type: 'replace_text' as const,
      nodeId: 'paragraph-1',
      from: 0,
      to: 7,
      replacement: 'Beginning',
    }],
    summary: ['Improved the opening'],
  }
  const warning = {
    code: 'minor_change',
    message: 'Only wording changed',
    severity: 'info' as const,
    targetIds: ['paragraph-1'],
  }
  const events: readonly PublicDirectEditAgentEvent<NarrativeDocumentSnapshot>[] = [
    { type: 'status_changed', status: 'planning' },
    { type: 'text_delta', text: 'Planning edits' },
    { type: 'tool_started', toolCallId: 'call-1', toolName: 'inspect', input: { ids: ['paragraph-1'] } },
    { type: 'tool_completed', toolCallId: 'call-1', toolName: 'inspect', output: { count: 1 } },
    { type: 'operation_batch_created', batch: narrativeBatch },
    { type: 'warning', warning },
    { type: 'completed', summary: ['Improved the opening'] },
    { type: 'error', code: 'validation_failed', message: 'Invalid edit' },
  ]

  for (const event of events) {
    switch (event.type) {
      case 'status_changed':
        // @ts-expect-error package-root event discriminants are readonly
        event.type = 'text_delta'
        // @ts-expect-error package-root statuses are readonly
        event.status = 'applying'
        break
      case 'text_delta':
        // @ts-expect-error package-root event discriminants are readonly
        event.type = 'status_changed'
        // @ts-expect-error package-root text deltas are readonly
        event.text = 'mutated'
        break
      case 'tool_started':
        // @ts-expect-error package-root event discriminants are readonly
        event.type = 'tool_completed'
        // @ts-expect-error package-root tool call IDs are readonly
        event.toolCallId = 'call-2'
        // @ts-expect-error package-root tool names are readonly
        event.toolName = 'mutated'
        // @ts-expect-error package-root tool inputs are readonly
        event.input = null
        // @ts-expect-error tool input is deeply readonly
        event.input.ids = []
        break
      case 'tool_completed':
        // @ts-expect-error package-root event discriminants are readonly
        event.type = 'tool_started'
        // @ts-expect-error package-root tool call IDs are readonly
        event.toolCallId = 'call-2'
        // @ts-expect-error package-root tool names are readonly
        event.toolName = 'mutated'
        // @ts-expect-error package-root tool outputs are readonly
        event.output = null
        // @ts-expect-error tool output is deeply readonly
        event.output.count = 2
        break
      case 'operation_batch_created':
        // @ts-expect-error package-root event discriminants are readonly
        event.type = 'completed'
        // @ts-expect-error package-root operation batches are readonly
        event.batch = narrativeBatch
        // @ts-expect-error operation batches are deeply readonly
        event.batch.operations.push(narrativeBatch.operations[0])
        break
      case 'warning':
        // @ts-expect-error package-root event discriminants are readonly
        event.type = 'error'
        // @ts-expect-error package-root warning payloads are readonly
        event.warning = warning
        // @ts-expect-error warnings are deeply readonly
        event.warning.targetIds?.push('paragraph-2')
        break
      case 'completed':
        // @ts-expect-error package-root event discriminants are readonly
        event.type = 'warning'
        // @ts-expect-error package-root completed summaries are readonly
        event.summary = []
        // @ts-expect-error completed summaries are readonly
        event.summary.push('mutated')
        break
      case 'error':
        // @ts-expect-error package-root event discriminants are readonly
        event.type = 'completed'
        // @ts-expect-error package-root error codes are readonly
        event.code = 'aborted'
        // @ts-expect-error package-root error messages are readonly
        event.message = 'mutated'
        break
    }
  }

  const narrativeRuntime: DirectEditAgentRuntime<NarrativeDocumentSnapshot> = {
    run: async function* <Current extends NarrativeDocumentSnapshot>(
      task: DirectEditAgentTask<Current>,
    ): AsyncIterable<PublicDirectEditAgentEvent<Current>> {
      yield { type: 'status_changed', status: 'applying' }
      yield {
        type: 'operation_batch_created',
        batch: { ...narrativeBatch, taskId: task.id },
      } as unknown as PublicDirectEditAgentEvent<Current>
      yield { type: 'completed', summary: ['Improved the opening'] }
    },
  }
  const zineRuntime: DirectEditAgentRuntime<ZineDocumentSnapshot> = {
    run: async function* <Current extends ZineDocumentSnapshot>(): AsyncIterable<PublicDirectEditAgentEvent<Current>> {
      yield { type: 'status_changed', status: 'completed' }
      yield { type: 'completed', summary: ['Audited spread'] }
    },
  }
  const broadRuntime: DirectEditAgentRuntime<StructuredEditorSnapshot> = {
    run: async function* <Current extends StructuredEditorSnapshot>(): AsyncIterable<PublicDirectEditAgentEvent<Current>> {
      yield { type: 'status_changed', status: 'completed' }
      yield { type: 'completed', summary: ['Handled structured document'] }
    },
  }
  const broadRuntimeAsNarrative: DirectEditAgentRuntime<NarrativeDocumentSnapshot> = broadRuntime
  const broadRuntimeAsZine: DirectEditAgentRuntime<ZineDocumentSnapshot> = broadRuntime
  narrativeRuntime.run(narrativeTask)
  zineRuntime.run(zineTask)
  broadRuntimeAsNarrative.run(narrativeTask)
  broadRuntimeAsZine.run(zineTask)
  const broadNarrativeEvents: AsyncIterable<PublicDirectEditAgentEvent<NarrativeDocumentSnapshot>> = broadRuntime.run(narrativeTask)
  const broadZineEvents: AsyncIterable<PublicDirectEditAgentEvent<ZineDocumentSnapshot>> = broadRuntime.run(zineTask)
  // @ts-expect-error broad runtime calls preserve narrative event correlation
  const broadNarrativeEventsAsZine: AsyncIterable<PublicDirectEditAgentEvent<ZineDocumentSnapshot>> = broadRuntime.run(narrativeTask)
  // @ts-expect-error broad runtime calls preserve Zine event correlation
  const broadZineEventsAsNarrative: AsyncIterable<PublicDirectEditAgentEvent<NarrativeDocumentSnapshot>> = broadRuntime.run(zineTask)
  // @ts-expect-error narrative runtimes reject Zine tasks
  narrativeRuntime.run<ZineDocumentSnapshot>(zineTask)
  // @ts-expect-error Zine runtimes reject narrative tasks
  zineRuntime.run<NarrativeDocumentSnapshot>(narrativeTask)
  // @ts-expect-error narrative-only runtimes cannot stand in for broad runtimes
  const unsafeBroadRuntime: DirectEditAgentRuntime<StructuredEditorSnapshot> = narrativeRuntime
  // @ts-expect-error Zine-only runtimes cannot stand in for narrative runtimes
  const unsafeNarrativeRuntime: DirectEditAgentRuntime<NarrativeDocumentSnapshot> = zineRuntime
  // @ts-expect-error narrative-only runtimes cannot stand in for Zine runtimes
  const unsafeZineRuntime: DirectEditAgentRuntime<ZineDocumentSnapshot> = narrativeRuntime

  const directResult: PublicDirectEditAgentResult<NarrativeDocumentSnapshot> = {
    mode: 'direct_edit',
    taskId: narrativeTask.id,
    baseRevision: narrativeTask.snapshot.revision,
    summary: ['Improved the opening'],
    warnings: [warning],
    batch: narrativeBatch,
  }
  const suggestionResult: PublicDirectEditAgentResult<NarrativeDocumentSnapshot> = {
    mode: 'suggestion_only',
    taskId: narrativeTask.id,
    baseRevision: narrativeTask.snapshot.revision,
    summary: ['Suggested a rewrite'],
    warnings: [warning],
    suggestion: 'Consider a shorter opening.',
  }
  const packageRootStatus: PublicDirectEditTaskStatus = 'planning'
  const packageRootTaskType: PublicDirectEditTaskType = taskType
  const packageRootEvent: PublicDirectEditAgentEvent<NarrativeDocumentSnapshot> = events[0]
  const packageRootRunOptions: PublicDirectEditAgentRuntimeRunOptions = {
    signal: new AbortController().signal,
  }
  const packageRootRuntime: PublicDirectEditAgentRuntime<NarrativeDocumentSnapshot> = narrativeRuntime
  const packageRootResult: PublicDirectEditAgentResult<NarrativeDocumentSnapshot> = directResult
  // @ts-expect-error package-root runtime signals are readonly
  packageRootRunOptions.signal = undefined
  // @ts-expect-error direct-edit results require a batch
  const missingBatch: DirectEditAgentResult<NarrativeDocumentSnapshot> = {
    mode: 'direct_edit', taskId: 'task', baseRevision: 'revision', summary: [], warnings: [],
  }
  // @ts-expect-error suggestion-only results require a suggestion
  const missingSuggestion: DirectEditAgentResult<NarrativeDocumentSnapshot> = {
    mode: 'suggestion_only', taskId: 'task', baseRevision: 'revision', summary: [], warnings: [],
  }
  // @ts-expect-error direct-edit results cannot include suggestions
  const coexistence: DirectEditAgentResult<NarrativeDocumentSnapshot> = {
    mode: 'direct_edit', taskId: 'task', baseRevision: 'revision', summary: [], warnings: [],
    batch: narrativeBatch,
    suggestion: 'conflict',
  }
  const predeclaredDirectConflict = {
    mode: 'direct_edit' as const,
    taskId: 'task',
    baseRevision: 'revision',
    summary: [],
    warnings: [],
    batch: narrativeBatch,
    suggestion: 'conflict',
  }
  // @ts-expect-error predeclared direct-edit results cannot carry a suggestion
  const directConflictFromVariable: DirectEditAgentResult<NarrativeDocumentSnapshot> = predeclaredDirectConflict
  const predeclaredSuggestionConflict = {
    mode: 'suggestion_only' as const,
    taskId: 'task',
    baseRevision: 'revision',
    summary: [],
    warnings: [],
    suggestion: 'Rewrite',
    batch: narrativeBatch,
  }
  // @ts-expect-error predeclared suggestion-only results cannot carry a batch
  const suggestionConflictFromVariable: DirectEditAgentResult<NarrativeDocumentSnapshot> = predeclaredSuggestionConflict
  const predeclaredMixedEvent = {
    type: 'status_changed' as const,
    status: 'planning' as const,
    text: 'conflict',
  }
  // @ts-expect-error predeclared events cannot mix fields from distinct variants
  const mixedEventFromVariable: PublicDirectEditAgentEvent<NarrativeDocumentSnapshot> = predeclaredMixedEvent
  // @ts-expect-error result warning arrays are readonly
  directResult.warnings.push(warning)
  // @ts-expect-error result warning entries are deeply readonly
  directResult.warnings[0].message = 'mutated'
  // @ts-expect-error direct-edit task IDs are readonly
  directResult.taskId = 'mutated'
  // @ts-expect-error direct-edit base revisions are readonly
  directResult.baseRevision = 'mutated'
  // @ts-expect-error direct-edit summaries are readonly properties
  directResult.summary = []
  // @ts-expect-error direct-edit summary arrays are readonly
  directResult.summary.push('mutated')
  // @ts-expect-error direct-edit warnings are readonly properties
  directResult.warnings = []
  // @ts-expect-error direct-edit warning data is deeply readonly
  directResult.warnings[0].targetIds?.push('paragraph-2')
  // @ts-expect-error direct-edit modes are readonly
  directResult.mode = 'suggestion_only'
  // @ts-expect-error direct-edit batches are readonly properties
  directResult.batch = narrativeBatch
  // @ts-expect-error direct-edit batch task IDs are readonly
  directResult.batch.taskId = 'mutated'
  // @ts-expect-error direct-edit batch base revisions are readonly
  directResult.batch.baseRevision = 'mutated'
  // @ts-expect-error direct-edit batch targets are deeply readonly
  directResult.batch.target.documentId = 'mutated'
  // @ts-expect-error direct-edit batch operation arrays are readonly
  directResult.batch.operations.push(narrativeBatch.operations[0])
  // @ts-expect-error direct-edit batch operations are deeply readonly
  directResult.batch.operations[0].replacement = 'mutated'
  // @ts-expect-error direct-edit batch summaries are readonly properties
  directResult.batch.summary = []
  // @ts-expect-error direct-edit batch summary arrays are readonly
  directResult.batch.summary.push('mutated')
  // @ts-expect-error direct-edit results forbid suggestions
  directResult.suggestion = 'forbidden'

  // @ts-expect-error suggestion-only task IDs are readonly
  suggestionResult.taskId = 'mutated'
  // @ts-expect-error suggestion-only base revisions are readonly
  suggestionResult.baseRevision = 'mutated'
  // @ts-expect-error suggestion-only summaries are readonly properties
  suggestionResult.summary = []
  // @ts-expect-error suggestion-only summary arrays are readonly
  suggestionResult.summary.push('mutated')
  // @ts-expect-error suggestion-only warnings are readonly properties
  suggestionResult.warnings = []
  // @ts-expect-error suggestion-only warning data is deeply readonly
  suggestionResult.warnings[0].message = 'mutated'
  // @ts-expect-error suggestion-only modes are readonly
  suggestionResult.mode = 'direct_edit'
  // @ts-expect-error suggestion-only suggestions are readonly
  suggestionResult.suggestion = 'mutated'
  // @ts-expect-error suggestion-only results forbid batches
  suggestionResult.batch = narrativeBatch

  void packageRootTask
  void packageRootStatus
  void packageRootTaskType
  void packageRootEvent
  void packageRootRunOptions
  void packageRootRuntime
  void packageRootResult
  void directResult
  void suggestionResult
  void missingBatch
  void missingSuggestion
  void coexistence
}

void compileDirectEditProtocolContracts

test('package root exposes only production context budgeting entry points', () => {
  assert.equal('resolveEditorAiCapabilities' in publicApi, true)
  assert.equal('estimateEditorAiContextTokens' in publicApi, true)
  assert.equal('applyEditorAiContextBudget' in publicApi, true)
  assert.equal('applyEditorAiContextBudgetWithEstimatorForTest' in publicApi, false)
})

test('capabilities domain exposes no context budgeting test hook', () => {
  assert.equal('applyEditorAiContextBudgetWithEstimatorForTest' in capabilitiesDomain, false)
})

test('canonical JSON ignores object insertion order', () => {
  const first = { z: 1, nested: { b: true, a: 'x' } }
  const second = { nested: { a: 'x', b: true }, z: 1 }

  assert.equal(canonicalizeJson(first), canonicalizeJson(second))
  assert.equal(
    createStructuredRevision('narrative', first),
    createStructuredRevision('narrative', second),
  )
})

test('snapshot cloning and canonical revisions preserve an own __proto__ JSON key', () => {
  const attrs = JSON.parse('{"__proto__":{"value":1}}') as Record<string, JsonValue>
  const canonicalRecord = JSON.parse(
    '{"z":0,"__proto__":{"value":1},"a":2}',
  ) as Record<string, JsonValue>
  const snapshot = createNarrative((input) => {
    input.nodes[0].attrs = attrs
  })
  const changed = createNarrative((input) => {
    input.nodes[0].attrs = JSON.parse(
      '{"__proto__":{"value":2}}',
    ) as Record<string, JsonValue>
  })

  assert.equal(
    Object.prototype.hasOwnProperty.call(snapshot.nodes[0].attrs, '__proto__'),
    true,
  )
  assert.equal(Object.getPrototypeOf(snapshot.nodes[0].attrs), Object.prototype)
  assert.deepEqual(snapshot.nodes[0].attrs['__proto__'], { value: 1 })
  assert.notEqual(snapshot.revision, changed.revision)
  assert.equal(
    canonicalizeJson(canonicalRecord),
    '{"__proto__":{"value":1},"a":2,"z":0}',
  )
  assert.equal(
    Object.prototype.hasOwnProperty.call(canonicalRecord, '__proto__'),
    true,
  )
  assert.equal(Object.getPrototypeOf(canonicalRecord), Object.prototype)
  assert.equal(Object.getPrototypeOf(attrs), Object.prototype)
})

test('snapshot constructors reject top-level JSON records with custom prototypes', () => {
  const customRecord = Object.assign(
    Object.create({ inherited: true }) as Record<string, JsonValue>,
    { own: 'value' },
  )

  assert.throws(() => createNarrative((input) => {
    input.nodes[0].attrs = customRecord
  }), { name: 'TypeError', message: /JSON record/i })
  assert.throws(() => createZine((input) => {
    input.project.settings = customRecord
  }), { name: 'TypeError', message: /JSON record/i })
  assert.throws(() => createZine((input) => {
    input.assetCandidates[0].metadata = customRecord
  }), { name: 'TypeError', message: /JSON record/i })
})

test('snapshot constructors safely clone null-prototype JSON records', () => {
  const attrs = Object.assign(
    Object.create(null) as Record<string, JsonValue>,
    JSON.parse('{"z":1,"__proto__":{"safe":true},"a":2}') as Record<string, JsonValue>,
  )
  const snapshot = createNarrative((input) => {
    input.nodes[0].attrs = attrs
  })

  assert.deepEqual(Object.keys(snapshot.nodes[0].attrs), ['z', '__proto__', 'a'])
  assert.equal(Object.getPrototypeOf(snapshot.nodes[0].attrs), Object.prototype)
  assert.equal(Object.prototype.hasOwnProperty.call(snapshot.nodes[0].attrs, '__proto__'), true)
  assert.deepEqual(snapshot.nodes[0].attrs['__proto__'], { safe: true })
  assert.equal(({} as { safe?: boolean }).safe, undefined)
})

test('snapshot constructors reject hidden accessors without executing them', () => {
  let rootGetterExecuted = false
  const root = Object.defineProperty({}, 'hidden', {
    configurable: true,
    enumerable: false,
    get: () => {
      rootGetterExecuted = true
      return 'unsafe'
    },
  })

  assert.throws(() => createNarrative((input) => {
    input.root = root as JsonValue
  }), { name: 'TypeError', message: /enumerable|accessor|JSON/i })
  assert.equal(rootGetterExecuted, false)

  let metadataGetterExecuted = false
  const metadata = Object.defineProperty({}, 'hidden', {
    configurable: true,
    enumerable: false,
    get: () => {
      metadataGetterExecuted = true
      return 'unsafe'
    },
  })

  assert.throws(() => createZine((input) => {
    input.assetCandidates[0].metadata = metadata as Record<string, JsonValue>
  }), { name: 'TypeError', message: /enumerable|accessor|JSON/i })
  assert.equal(metadataGetterExecuted, false)
})

test('snapshot constructors reject non-enumerable data and symbol properties', () => {
  const hiddenAttrs = Object.defineProperty({}, 'hidden', {
    configurable: true,
    enumerable: false,
    value: 'state',
    writable: true,
  })
  const symbol = Symbol('hidden')
  const marked = { type: 'bold' } as Record<PropertyKey, unknown>
  marked[symbol] = 'state'

  assert.throws(() => createNarrative((input) => {
    input.nodes[0].attrs = hiddenAttrs as Record<string, JsonValue>
  }), { name: 'TypeError', message: /enumerable|JSON/i })
  assert.throws(() => createNarrative((input) => {
    input.nodes[0].marks = [marked as JsonValue]
  }), { name: 'TypeError', message: /symbol|key|JSON/i })
  assert.throws(() => createZine((input) => {
    Object.defineProperty(input.project.settings, 'hidden', {
      enumerable: false,
      value: 'state',
    })
  }), { name: 'TypeError', message: /enumerable|JSON/i })
})

test('snapshot constructors accept standard arrays including their length property', () => {
  const narrative = createNarrative((input) => {
    input.root = { content: [{ marks: [] }] }
    input.nodes[0].marks = Object.freeze([
      { type: 'bold', attrs: { level: 1 } },
    ]) as unknown as JsonValue[]
  })
  const zine = createZine((input) => {
    input.project.settings = { guides: Object.freeze([0, 120, 240]) as number[] }
  })

  assert.deepEqual(narrative.nodes[0].marks, [{ type: 'bold', attrs: { level: 1 } }])
  assert.deepEqual(zine.project.settings.guides, [0, 120, 240])
})

test('snapshot constructors reject hidden state instead of accepting the empty snapshot value', () => {
  const hidden = Object.defineProperty({}, 'state', {
    enumerable: false,
    value: 'not-empty',
  })

  assert.deepEqual(createNarrative((input) => {
    input.nodes[0].attrs = {}
  }).nodes[0].attrs, {})
  assert.throws(() => createNarrative((input) => {
    input.nodes[0].attrs = hidden as Record<string, JsonValue>
  }), { name: 'TypeError', message: /enumerable|JSON/i })
})

test('canonical JSON preserves array order', () => {
  assert.notEqual(
    createStructuredRevision('zine', { items: ['a', 'b'] }),
    createStructuredRevision('zine', { items: ['b', 'a'] }),
  )
})

test('canonical JSON rejects invalid runtime values', () => {
  assert.throws(
    () => canonicalizeJson(undefined as unknown as JsonValue),
    { name: 'TypeError', message: /undefined|JSON/i },
  )
  assert.throws(
    () => canonicalizeJson({ missing: undefined } as unknown as JsonValue),
    { name: 'TypeError', message: /undefined|JSON/i },
  )
  assert.throws(
    () => canonicalizeJson(Number.NaN as unknown as JsonValue),
    { name: 'TypeError', message: /finite|JSON/i },
  )
  assert.throws(
    () => canonicalizeJson({ value: Number.POSITIVE_INFINITY } as unknown as JsonValue),
    { name: 'TypeError', message: /finite|JSON/i },
  )
})

test('canonical JSON rejects sparse arrays without colliding with dense arrays', () => {
  const emptySlot = Array(1) as unknown as JsonValue
  const leadingSlot = [, 'x'] as unknown as JsonValue

  assert.equal(canonicalizeJson([null]), '[null]')
  assert.equal(canonicalizeJson([null, 'x']), '[null,"x"]')
  assert.throws(
    () => canonicalizeJson(emptySlot),
    { name: 'TypeError', message: /sparse array/i },
  )
  assert.throws(
    () => canonicalizeJson(leadingSlot),
    { name: 'TypeError', message: /sparse array/i },
  )
})

test('canonical JSON rejects own custom map methods without executing them', () => {
  const values = ['a', 'b'] as string[] & { map: Array<string>['map'] }
  let executed = false
  values.map = (() => {
    executed = true
    return ['forged']
  }) as Array<string>['map']

  assert.throws(
    () => canonicalizeJson(values as unknown as JsonValue),
    { name: 'TypeError', message: /array|JSON/i },
  )
  assert.equal(executed, false)
})

test('canonical JSON rejects custom and null array prototypes', () => {
  const inheritedMap = Object.create(Array.prototype) as unknown as string[]
  let executed = false
  Object.defineProperty(inheritedMap, 'map', {
    value: () => {
      executed = true
      return ['forged']
    },
  })
  const inheritedArray = ['a', 'b']
  Object.setPrototypeOf(inheritedArray, inheritedMap)
  const nullPrototypeArray = ['a', 'b']
  Object.setPrototypeOf(nullPrototypeArray, null)

  assert.throws(
    () => canonicalizeJson(inheritedArray as unknown as JsonValue),
    { name: 'TypeError', message: /array|JSON/i },
  )
  assert.equal(executed, false)
  assert.throws(
    () => canonicalizeJson(nullPrototypeArray as unknown as JsonValue),
    { name: 'TypeError', message: /array|JSON/i },
  )
})

test('canonical JSON remains deterministic for standard dense arrays', () => {
  const first: JsonValue = ['a', { z: 1, a: [true, null] }]
  const second: JsonValue = ['a', { a: [true, null], z: 1 }]

  assert.equal(canonicalizeJson(first), '["a",{"a":[true,null],"z":1}]')
  assert.equal(canonicalizeJson(first), canonicalizeJson(second))
})

test('canonical JSON rejects enumerable object getters without executing them', () => {
  let executed = false
  const value = Object.defineProperty({}, 'unsafe', {
    enumerable: true,
    get: () => {
      executed = true
      return 'unsafe'
    },
  })

  assert.throws(
    () => canonicalizeJson(value as JsonValue),
    { name: 'TypeError', message: /accessor|JSON/i },
  )
  assert.equal(executed, false)
})

test('canonical JSON rejects array index getters without executing them', () => {
  let executed = false
  const value = ['safe']
  Object.defineProperty(value, '0', {
    enumerable: true,
    get: () => {
      executed = true
      return 'unsafe'
    },
  })

  assert.throws(
    () => canonicalizeJson(value as JsonValue),
    { name: 'TypeError', message: /accessor|array|JSON/i },
  )
  assert.equal(executed, false)
})

test('revision namespaces cannot collide', () => {
  const value = { content: 'same' }
  assert.notEqual(
    createStructuredRevision('narrative', value),
    createStructuredRevision('zine', value),
  )
})

test('legacy text revisions retain their public format and value', () => {
  const expected = 'fnv1a-4f9f2cab-5'

  assert.equal(createTextRevision('hello'), expected)
  assert.equal(createEditorDocumentRevision('hello'), expected)
})

test('legacy editor document snapshots preserve their public contract', () => {
  const titled = createEditorDocumentSnapshot({
    title: '  A title  ',
    text: '  unchanged text  ',
  })
  const untitled = createEditorDocumentSnapshot({ title: '   ', text: 'body' })

  assert.deepEqual(titled, {
    title: 'A title',
    text: '  unchanged text  ',
    revision: createEditorDocumentRevision('  unchanged text  '),
  })
  assert.deepEqual(untitled, {
    text: 'body',
    revision: createEditorDocumentRevision('body'),
  })
})

function image(dataUrl: string): EditorAiImageInput {
  return {
    id: 'image-1',
    dataUrl,
    mediaType: 'image/png',
    width: 1200,
    height: 800,
    byteLength: 1234,
  }
}

function narrativeInput(): CreateNarrativeDocumentSnapshotInput {
  return {
    documentId: 'story-1',
    documentKind: 'story',
    title: 'A Story',
    root: { type: 'doc', content: [{ type: 'paragraph' }] },
    nodes: [
      {
        id: 'paragraph-1',
        type: 'paragraph',
        index: 0,
        depth: 1,
        text: 'Opening',
        attrs: { align: 'left' },
        marks: [],
        childIds: [],
      },
    ],
    editorWidth: 960,
    visualSegments: [{
      id: 'segment-1',
      image: image('data:image/png;base64,AAAA'),
      nodeIds: ['paragraph-1', 'paragraph-2'],
      startY: 0,
      endY: 420,
    }],
  }
}

function createNarrative(
  mutate?: (input: CreateNarrativeDocumentSnapshotInput) => void,
): NarrativeDocumentSnapshot {
  const input = narrativeInput()
  mutate?.(input)
  return createNarrativeDocumentSnapshot(input)
}

function zineInput(): CreateZineDocumentSnapshotInput {
  return {
    projectId: 'project-1',
    targetSpreadId: 'spread-2',
    project: {
      projectId: 'project-1',
      settings: { pageWidth: 2400, pageHeight: 1600 },
      spreadOrder: ['spread-1', 'spread-2', 'spread-3'],
      spreadSummaries: {
        'spread-1': { title: 'Opening' },
        'spread-2': { title: 'Feature' },
        'spread-3': { title: 'Closing' },
      },
    },
    currentSpread: {
      spreadId: 'spread-2',
      index: 1,
      structure: {
        slots: [{ id: 'slot-1', x: 20, y: 30, width: 800, height: 600 }],
      },
      summary: { title: 'Feature', slotCount: 1 },
      preview: image('data:image/png;base64,BBBB'),
    },
    adjacentSpreads: [
      {
        spreadId: 'spread-1', index: 0, structure: { slots: [] },
        summary: { title: 'Opening', slotCount: 0 },
        preview: image('data:image/png;base64,CCCC'),
      },
      {
        spreadId: 'spread-3', index: 2, structure: { slots: [{ id: 'slot-3' }] },
        summary: { title: 'Closing', slotCount: 1 },
        preview: image('data:image/png;base64,EEEE'),
      },
    ],
    assetCandidates: [
      {
        assetId: 'asset-1', metadata: { width: 6000, height: 4000, dpi: 300 },
        thumbnail: image('data:image/png;base64,DDDD'),
      },
      {
        assetId: 'asset-2', metadata: { width: 5000, height: 3000, dpi: 240 },
        thumbnail: image('data:image/png;base64,FFFF'),
      },
    ],
  }
}

function createZine(
  mutate?: (input: CreateZineDocumentSnapshotInput) => void,
): ZineDocumentSnapshot {
  const input = zineInput()
  mutate?.(input)
  return createZineDocumentSnapshot(input)
}

test('direct edit statuses are exact and use stopped rather than cancelled', () => {
  assert.deepEqual(DIRECT_EDIT_TASK_STATUSES, [
    'preparing_context',
    'analyzing',
    'planning',
    'simulating',
    'validating',
    'applying',
    'completed',
    'stopped',
    'failed',
  ])
  assert.equal(DIRECT_EDIT_TASK_STATUSES.includes('cancelled' as never), false)
})

test('legacy agent contracts and approval events remain available', () => {
  const status: EditorAgentStatus = 'cancelled'
  const task: EditorAgentTask = {
    id: 'legacy-task',
    instruction: 'Suggest a change',
    document: createEditorDocumentSnapshot({ text: 'Legacy' }),
  }
  const proposal: EditorProposal = {
    id: 'proposal-1',
    taskId: task.id,
    kind: 'content_edit',
    baseRevision: task.document.revision,
    reason: 'Confirm change',
    risk: 'low',
    operations: [{
      type: 'replace_text',
      match: {
        kind: 'exact_text',
        text: 'Legacy',
        occurrence: 'unique',
      },
      replacement: 'Updated legacy text',
    }],
  }
  const proposalEvent: EditorAgentEvent = {
    type: 'proposal_created',
    proposal,
  }
  const event: EditorAgentEvent = {
    type: 'approval_required',
    request: {
      id: 'approval-1',
      taskId: task.id,
      proposal,
      message: 'Confirm change',
    },
  }
  const runtime: EditorAgentRuntime = {
    async *run(receivedTask) {
      assert.equal(receivedTask, task)
      yield { type: 'status_changed', status }
    },
  }
  const result: EditorAgentResult = {
    taskId: task.id,
    documentRevision: task.document.revision,
    summary: 'No changes',
    proposals: [],
  }

  assert.equal(proposalEvent.type, 'proposal_created')
  if (proposalEvent.type === 'proposal_created') {
    assert.equal(proposalEvent.proposal.id, 'proposal-1')
    assert.equal(proposalEvent.proposal.taskId, task.id)
    assert.equal(proposalEvent.proposal.baseRevision, task.document.revision)
    const [operation] = proposalEvent.proposal.operations
    assert.ok(operation)
    assert.equal(operation.type, 'replace_text')
    if (operation.type === 'replace_text') {
      assert.equal(operation.match.text, 'Legacy')
      assert.equal(operation.replacement, 'Updated legacy text')
    }
  }
  assert.equal(event.type, 'approval_required')
  assert.equal(typeof runtime.run, 'function')
  assert.equal(result.taskId, task.id)
})

test('direct edit tasks correlate capability and expose immutable truth', () => {
  const narrativeTask: DirectEditAgentTask<NarrativeDocumentSnapshot> = {
    id: 'narrative-task',
    taskType: 'instruction',
    instruction: 'Tighten the opening',
    snapshot: createNarrative(),
    authorization: NARRATIVE_AUTHORIZATION,
    modelCapabilities: MODEL_CAPABILITIES,
  }
  const zineTask: DirectEditAgentTask<ZineDocumentSnapshot> = {
    id: 'zine-task',
    taskType: 'page_audit',
    instruction: 'Audit this spread',
    snapshot: createZine(),
    authorization: { ...NARRATIVE_AUTHORIZATION, targetSpreadId: 'spread-2' },
    modelCapabilities: MODEL_CAPABILITIES,
  }

  // @ts-expect-error narrative tasks cannot contain zine snapshots
  const wrongNarrativeTask: DirectEditAgentTask<NarrativeDocumentSnapshot> = { ...narrativeTask, snapshot: createZine() }
  // @ts-expect-error zine tasks cannot contain narrative snapshots
  const wrongZineTask: DirectEditAgentTask<ZineDocumentSnapshot> = { ...zineTask, snapshot: createNarrative() }
  if (false) {
    // @ts-expect-error snapshot truth is deeply readonly
    narrativeTask.snapshot.nodes[0].attrs.align = 'right'
    // @ts-expect-error authorization arrays are readonly
    narrativeTask.authorization.deleteTargetIds.push('other')
    // @ts-expect-error model capabilities are readonly
    narrativeTask.modelCapabilities.vision = false
  }

  assert.equal(wrongNarrativeTask.snapshot.capability, 'zine')
  assert.equal(wrongZineTask.snapshot.capability, 'narrative')
  assert.equal(narrativeTask.snapshot.capability, 'narrative')
  assert.equal(zineTask.snapshot.capability, 'zine')
})

test('direct edit events cover protocol events and exclude legacy approvals', () => {
  const narrativeOperation: NarrativeEditorOperation = {
    operationId: 'operation-1', type: 'delete_node', nodeId: 'paragraph-1',
  }
  const zineOperation: ZineEditorOperation = {
    operationId: 'operation-2', type: 'delete_slot', spreadId: 'spread-2', slotId: 'slot-1',
  }
  const events: PublicDirectEditAgentEvent<NarrativeDocumentSnapshot>[] = [
    { type: 'status_changed', status: 'planning' },
    { type: 'text_delta', text: 'Planning' },
    { type: 'tool_started', toolCallId: 'call-1', toolName: 'plan', input: { step: 1 } },
    { type: 'tool_completed', toolCallId: 'call-1', toolName: 'plan', output: ['done'] },
    {
      type: 'operation_batch_created',
      batch: {
        taskId: 'narrative-task', capability: 'narrative', baseRevision: 'revision-1',
        target: { documentId: 'story-1' }, operations: [narrativeOperation], summary: ['Deleted node'],
      },
    },
    { type: 'warning', warning: { code: 'limited', message: 'Limited context', severity: 'warning' } },
    { type: 'completed', summary: ['Completed'] },
    { type: 'error', code: 'validation_failed', message: 'Invalid output' },
  ]
  // @ts-expect-error direct events do not expose proposals
  const proposal: PublicDirectEditAgentEvent = { type: 'proposal_created', proposal: {} }
  // @ts-expect-error direct events do not expose approval requests
  const approval: PublicDirectEditAgentEvent = { type: 'approval_required', request: {} }
  const wrongBatch: PublicDirectEditAgentEvent<NarrativeDocumentSnapshot> = {
    type: 'operation_batch_created',
    batch: {
      // @ts-expect-error narrative events cannot contain zine batches
      taskId: 'zine-task', capability: 'zine', baseRevision: 'revision-1',
      target: { documentId: 'project-1', spreadId: 'spread-2' },
      // @ts-expect-error narrative events cannot contain zine operations
      operations: [zineOperation], summary: [],
    },
  }

  assert.equal(events.length, 8)
  assert.equal(proposal.type, 'proposal_created')
  assert.equal(approval.type, 'approval_required')
  assert.equal(wrongBatch.type, 'operation_batch_created')
})

test('direct runtime supports AbortSignal and capability-safe fake implementations', () => {
  const runtime: DirectEditAgentRuntime<NarrativeDocumentSnapshot> = {
    run: async function* <Current extends NarrativeDocumentSnapshot>(
      task: DirectEditAgentTask<Current>,
      options?: { signal?: AbortSignal },
    ): AsyncIterable<PublicDirectEditAgentEvent<Current>> {
      if (options?.signal?.aborted) {
        yield { type: 'error', code: 'aborted', message: 'Stopped' }
        return
      }
      yield { type: 'status_changed', status: 'analyzing' }
      yield { type: 'completed', summary: [task.instruction] }
    },
  }
  const iterable = runtime.run({
    id: 'runtime-task', taskType: 'instruction', instruction: 'Edit',
    snapshot: createNarrative(), authorization: NARRATIVE_AUTHORIZATION,
    modelCapabilities: MODEL_CAPABILITIES,
  }, { signal: new AbortController().signal })

  assert.equal(iterable[Symbol.asyncIterator] instanceof Function, true)
})

test('direct results discriminate batch from suggestion and remain readonly', () => {
  const direct: DirectEditAgentResult<NarrativeDocumentSnapshot> = {
    mode: 'direct_edit', taskId: 'task-1', baseRevision: 'revision-1',
    summary: ['Updated opening'], warnings: [],
    batch: {
      taskId: 'task-1', capability: 'narrative', baseRevision: 'revision-1',
      target: { documentId: 'story-1' }, operations: [], summary: ['Updated opening'],
    },
  }
  const suggestion: DirectEditAgentResult<ZineDocumentSnapshot> = {
    mode: 'suggestion_only', taskId: 'task-2', baseRevision: 'revision-2',
    summary: ['Suggested a crop'], warnings: [],
    suggestion: 'Try a stronger crop.',
  }
  // @ts-expect-error direct edit results require a batch
  const missingBatch: DirectEditAgentResult<NarrativeDocumentSnapshot> = {
    mode: 'direct_edit', taskId: 'task', baseRevision: 'revision', summary: [], warnings: [],
  }
  // @ts-expect-error direct edit results cannot contain suggestions
  const directWithSuggestion: DirectEditAgentResult<NarrativeDocumentSnapshot> = { ...direct, suggestion: 'No' }
  // @ts-expect-error suggestion-only results require suggestions
  const missingSuggestion: DirectEditAgentResult<ZineDocumentSnapshot> = {
    mode: 'suggestion_only', taskId: 'task', baseRevision: 'revision', summary: [], warnings: [],
  }
  // @ts-expect-error suggestion-only results cannot contain batches
  const suggestionWithBatch: DirectEditAgentResult<ZineDocumentSnapshot> = { ...suggestion, batch: direct.batch }
  if (false) {
    // @ts-expect-error result summaries are readonly
    direct.summary.push('More')
    // @ts-expect-error result batches are deeply readonly
    direct.batch.operations.push({ operationId: 'x', type: 'delete_node', nodeId: 'x' })
  }
  const summarize = (result: DirectEditAgentResult): string => result.mode === 'direct_edit'
    ? result.summary.join(', ')
    : `${result.suggestion}:${result.warnings.length}`

  assert.equal(summarize(direct), 'Updated opening')
  assert.equal(summarize(suggestion), 'Try a stronger crop.:0')
  assert.equal(missingBatch.mode, 'direct_edit')
  assert.equal(directWithSuggestion.mode, 'direct_edit')
  assert.equal(missingSuggestion.mode, 'suggestion_only')
  assert.equal(suggestionWithBatch.mode, 'suggestion_only')
})

test('legacy task id helper remains nonempty and distinguishes consecutive calls', () => {
  const first = createEditorAgentTaskId()
  const second = createEditorAgentTaskId()

  assert.ok(first.length > 0)
  assert.ok(second.length > 0)
  assert.notEqual(first, second)
})

const LARGE_CONTEXT_BUDGET = {
  maxInputTokens: 1_000_000,
  adjacentPreviewMaxPixels: 1_000_000,
  assetCandidateLimit: 10,
  remoteSpreadSummaryLimit: 10,
  narrativeVisualSegmentLimit: 10,
}

test('model capabilities resolve full, visual, and structured degradation modes', () => {
  assert.deepEqual(resolveEditorAiCapabilities({
    vision: true, structuredOutput: true, toolCalling: true,
  }), { visualMode: 'vision', executionMode: 'direct_edit', degradations: [] })
  assert.deepEqual(resolveEditorAiCapabilities({
    vision: false, structuredOutput: true, toolCalling: true,
  }), {
    visualMode: 'structure_only', executionMode: 'direct_edit',
    degradations: [{ code: 'vision_unavailable', message: 'Vision input is unavailable; using document structure only.' }],
  })
  assert.deepEqual(resolveEditorAiCapabilities({
    vision: true, structuredOutput: false, toolCalling: false,
  }), {
    visualMode: 'vision', executionMode: 'suggestion_only',
    degradations: [
      { code: 'structured_output_unavailable', message: 'Structured output is unavailable; direct editing is disabled.' },
      { code: 'tool_calling_unavailable', message: 'Tool calling is unavailable; direct editing is disabled.' },
    ],
  })
  assert.equal(resolveEditorAiCapabilities({
    vision: true, structuredOutput: false, toolCalling: true,
  }).executionMode, 'suggestion_only')
  assert.equal(resolveEditorAiCapabilities({
    vision: true, structuredOutput: true, toolCalling: false,
  }).executionMode, 'suggestion_only')
})

test('capability and context budget numeric fields reject invalid values', () => {
  for (const maxInputTokens of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => resolveEditorAiCapabilities({
      vision: true, structuredOutput: true, toolCalling: true, maxInputTokens,
    }), TypeError)
  }
  for (const [field, value] of [
    ['maxInputTokens', 0], ['adjacentPreviewMaxPixels', -1],
    ['assetCandidateLimit', 1.5], ['remoteSpreadSummaryLimit', Number.NaN],
    ['narrativeVisualSegmentLimit', Number.POSITIVE_INFINITY],
  ] as const) {
    assert.throws(() => applyEditorAiContextBudget(createNarrative(), {
      ...LARGE_CONTEXT_BUDGET, [field]: value,
    }), TypeError)
  }
})

test('structured snapshots reject invalid image byte lengths', () => {
  const invalidValues = [
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ]

  for (const byteLength of invalidValues) {
    assert.throws(() => createNarrative((input) => {
      input.visualSegments[0].image.byteLength = byteLength
    }), { name: 'TypeError', message: /image byteLength.*finite nonnegative integer/i })

    for (const location of ['current', 'adjacent', 'asset'] as const) {
      assert.throws(() => createZine((input) => {
        const target = location === 'current'
          ? input.currentSpread.preview!
          : location === 'adjacent'
            ? input.adjacentSpreads[0].preview!
            : input.assetCandidates[0].thumbnail!
        target.byteLength = byteLength
      }), { name: 'TypeError', message: /image byteLength.*finite nonnegative integer/i })
    }
  }
})

test('structured snapshots require image dimensions to be finite nonnegative integers', () => {
  for (const field of ['width', 'height'] as const) {
    for (const value of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      assert.throws(() => createNarrative((input) => {
        input.visualSegments[0].image[field] = value
      }), { name: 'TypeError', message: new RegExp(`image ${field}.*finite nonnegative integer`, 'i') })
    }
  }
})

test('valid image metadata preserves token estimates and budget reductions', () => {
  const zeroBytes = createNarrative((input) => {
    input.visualSegments[0].image.width = 0
    input.visualSegments[0].image.height = 0
    input.visualSegments[0].image.byteLength = 0
  })
  const positiveBytes = createNarrative((input) => {
    input.visualSegments[0].image.byteLength = 1237
  })
  const baseline = createNarrative()

  assert.equal(zeroBytes.visualSegments[0].image.byteLength, 0)
  assert.equal(positiveBytes.visualSegments[0].image.byteLength, 1237)
  assert.equal(
    estimateEditorAiContextTokens(positiveBytes) - estimateEditorAiContextTokens(baseline),
    1,
  )
  assert.deepEqual(
    applyEditorAiContextBudget(baseline, LARGE_CONTEXT_BUDGET).reductions,
    [],
  )
})

test('token estimation rejects invalid byte lengths on manually cast snapshots', () => {
  const impossibleBudget = { ...LARGE_CONTEXT_BUDGET, maxInputTokens: 1 }

  for (const byteLength of [-1_000_000, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const invalid = createZine() as ZineDocumentSnapshot
    invalid.currentSpread.preview!.byteLength = byteLength
    const castSnapshot = invalid as StructuredEditorSnapshot

    assert.throws(
      () => estimateEditorAiContextTokens(castSnapshot),
      { name: 'TypeError', message: /image byteLength.*finite nonnegative integer/i },
    )
    assert.throws(
      () => applyEditorAiContextBudget(castSnapshot, impossibleBudget),
      { name: 'TypeError', message: /image byteLength.*finite nonnegative integer/i },
    )
  }
})

test('configured narrative limits preserve editable structure and sample first and last visuals', () => {
  const source = createNarrative((input) => {
    input.visualSegments = Array.from({ length: 6 }, (_, index) => ({
      id: `segment-${index}`,
      image: { ...image(`data:image/png;base64,${index}`), id: `image-${index}` },
      nodeIds: ['paragraph-1'], startY: index * 100, endY: index * 100 + 80,
    }))
  })
  const before = structuredClone(source)
  const result = applyEditorAiContextBudget(source, {
    ...LARGE_CONTEXT_BUDGET, narrativeVisualSegmentLimit: 4,
  })

  assert.deepEqual(result.snapshot.root, source.root)
  assert.deepEqual(result.snapshot.nodes, source.nodes)
  assert.deepEqual(result.snapshot.visualSegments.map((segment) => segment.id),
    ['segment-0', 'segment-2', 'segment-3', 'segment-5'])
  assert.deepEqual(result.reductions, ['narrative_visual_segments:6->4'])
  assert.deepEqual(source, before)
  assert.notEqual(result.snapshot, source)
  assert.notEqual(result.snapshot.nodes, source.nodes)
  assert.notEqual(result.snapshot.visualSegments[0].image, source.visualSegments[0].image)
  assert.equal(result.snapshot.revision, source.revision)
})

test('zine hard limits preserve current context and reduce references deterministically', () => {
  const source = createZine((input) => {
    input.adjacentSpreads[0].preview = { ...input.adjacentSpreads[0].preview!, width: 2000, height: 1000 }
  })
  const before = structuredClone(source)
  const result = applyEditorAiContextBudget(source, {
    ...LARGE_CONTEXT_BUDGET,
    adjacentPreviewMaxPixels: 1_000_000,
    assetCandidateLimit: 1,
    remoteSpreadSummaryLimit: 1,
  })

  assert.deepEqual(result.reductions, [
    'adjacent_preview_pixels:spread-1',
    'asset_thumbnail:asset-1',
    'asset_thumbnail:asset-2',
    'asset_candidates:2->1',
    'remote_spread_summaries:2->1',
  ])
  assert.deepEqual(result.snapshot.project.settings, source.project.settings)
  assert.deepEqual(result.snapshot.currentSpread.structure, source.currentSpread.structure)
  assert.deepEqual(result.snapshot.currentSpread.preview, source.currentSpread.preview)
  assert.equal(result.snapshot.assetCandidates.length, 1)
  assert.equal(result.snapshot.adjacentSpreads.length, 2)
  assert.deepEqual(Object.keys(result.snapshot.project.spreadSummaries), ['spread-1', 'spread-2'])
  assert.deepEqual(source, before)
  assert.notEqual(result.snapshot.project, source.project)
  assert.notEqual(result.snapshot.currentSpread.preview, source.currentSpread.preview)
})

test('zine spread summary limiting retains an own target summary omitted from spread order', () => {
  const source = createZine((input) => {
    input.project.spreadOrder = ['spread-1', 'spread-3']
  })
  const before = structuredClone(source)

  const result = applyEditorAiContextBudget(source, {
    ...LARGE_CONTEXT_BUDGET,
    remoteSpreadSummaryLimit: 1,
  })

  assert.deepEqual(result.reductions, ['remote_spread_summaries:2->1'])
  assert.deepEqual(Object.keys(result.snapshot.project.spreadSummaries), [
    'spread-1',
    'spread-2',
  ])
  assert.deepEqual(result.snapshot.project.spreadSummaries['spread-2'], {
    title: 'Feature',
  })
  assert.deepEqual(result.snapshot.currentSpread, source.currentSpread)
  assert.equal(result.snapshot.revision, source.revision)
  assert.deepEqual(source, before)
})

test('zine spread summary hard limit leaves adjacent spread references unchanged', () => {
  const source = createZine((input) => {
    input.project.spreadOrder = ['spread-1', 'spread-2', 'spread-3', 'spread-4']
    input.project.spreadSummaries['spread-4'] = { title: 'Appendix' }
    input.adjacentSpreads.push({
      spreadId: 'spread-4',
      index: 3,
      structure: { slots: [{ id: 'slot-4' }] },
      summary: { title: 'Appendix', slotCount: 1 },
    })
  })
  const before = structuredClone(source)

  const result = applyEditorAiContextBudget(source, {
    ...LARGE_CONTEXT_BUDGET,
    remoteSpreadSummaryLimit: 1,
  })

  assert.deepEqual(Object.keys(result.snapshot.project.spreadSummaries), [
    'spread-1',
    'spread-2',
  ])
  assert.deepEqual(result.snapshot.adjacentSpreads, source.adjacentSpreads)
  assert.deepEqual(
    result.snapshot.adjacentSpreads.map((spread) => spread.spreadId),
    ['spread-1', 'spread-3', 'spread-4'],
  )
  assert.equal(result.snapshot.revision, source.revision)
  assert.deepEqual(source, before)
})

test('zine spread summary limiting orders listed IDs before absent target and adjacent IDs', () => {
  const source = createZine((input) => {
    input.project.spreadOrder = ['spread-1', 'spread-3']
    Object.defineProperty(input.project.spreadSummaries, 'spread-4', {
      value: { title: 'Appendix' },
      enumerable: true,
      configurable: true,
      writable: true,
    })
    input.adjacentSpreads.push({
      spreadId: 'spread-4',
      index: 10,
      structure: { slots: [] },
      summary: { title: 'Appendix', slotCount: 0 },
    })
    Object.defineProperty(input.project.spreadSummaries, 'spread-5', {
      value: { title: 'Credits' },
      enumerable: true,
      configurable: true,
      writable: true,
    })
    input.adjacentSpreads.push({
      spreadId: 'spread-5',
      index: 11,
      structure: { slots: [] },
      summary: { title: 'Credits', slotCount: 0 },
    })
    Object.defineProperty(input.project.spreadSummaries, 'spread-6', {
      value: { title: 'Colophon' },
      enumerable: true,
      configurable: true,
      writable: true,
    })
    input.adjacentSpreads.push({
      spreadId: 'spread-6',
      index: 12,
      structure: { slots: [] },
      summary: { title: 'Colophon', slotCount: 0 },
    })
  })

  const result = applyEditorAiContextBudget(source, {
    ...LARGE_CONTEXT_BUDGET,
    remoteSpreadSummaryLimit: 4,
  })

  assert.deepEqual(result.snapshot.adjacentSpreads.map((spread) => spread.spreadId), [
    'spread-1',
    'spread-3',
    'spread-4',
    'spread-5',
    'spread-6',
  ])
  assert.deepEqual(Object.keys(result.snapshot.project.spreadSummaries), [
    'spread-1',
    'spread-3',
    'spread-2',
    'spread-4',
    'spread-5',
  ])
})

test('zine spread summary limiting does not invent a missing own target summary', () => {
  const source = createZine((input) => {
    input.project.spreadOrder = ['spread-1', 'spread-3']
    delete input.project.spreadSummaries['spread-2']
  })

  const result = applyEditorAiContextBudget(source, {
    ...LARGE_CONTEXT_BUDGET,
    remoteSpreadSummaryLimit: 1,
  })

  assert.deepEqual(result.reductions, ['remote_spread_summaries:2->1'])
  assert.deepEqual(Object.keys(result.snapshot.project.spreadSummaries), ['spread-1'])
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      result.snapshot.project.spreadSummaries,
      'spread-2',
    ),
    false,
  )
})

test('zine spread summary limiting preserves an own __proto__ spread ID', () => {
  const source = createZine((input) => {
    input.project.spreadOrder = ['__proto__', 'spread-2', 'spread-3']
    input.project.spreadSummaries = JSON.parse(
      '{"__proto__":{"title":"Opening"},"spread-2":{"title":"Feature"},"spread-3":{"title":"Closing"}}',
    ) as Record<string, JsonValue>
    input.adjacentSpreads[0].spreadId = '__proto__'
  })
  const before = structuredClone(source)

  const result = applyEditorAiContextBudget(source, {
    ...LARGE_CONTEXT_BUDGET,
    remoteSpreadSummaryLimit: 1,
  })

  const summaries = result.snapshot.project.spreadSummaries
  assert.deepEqual(result.reductions, ['remote_spread_summaries:2->1'])
  assert.equal(Object.prototype.hasOwnProperty.call(summaries, '__proto__'), true)
  assert.equal(Object.getPrototypeOf(summaries), Object.prototype)
  assert.deepEqual(summaries['__proto__'], { title: 'Opening' })
  assert.equal(result.snapshot.adjacentSpreads[0].spreadId, '__proto__')
  assert.equal(result.snapshot.revision, source.revision)
  assert.deepEqual(source, before)
})

test('zine spread summary limiting ignores an inherited constructor summary', () => {
  const source = createZine((input) => {
    input.project.spreadOrder = ['constructor', 'spread-2', 'spread-3']
    input.adjacentSpreads[0].spreadId = 'constructor'
  })
  const before = structuredClone(source)

  const result = applyEditorAiContextBudget(source, {
    ...LARGE_CONTEXT_BUDGET,
    remoteSpreadSummaryLimit: 1,
  })

  const summaries = result.snapshot.project.spreadSummaries
  assert.deepEqual(result.reductions, ['remote_spread_summaries:2->1'])
  assert.equal(Object.prototype.hasOwnProperty.call(summaries, 'constructor'), false)
  assert.doesNotThrow(() => JSON.parse(
    canonicalizeJson(result.snapshot as unknown as JsonValue),
  ))
  assert.equal(result.snapshot.adjacentSpreads[0].spreadId, 'constructor')
  assert.equal(result.snapshot.revision, source.revision)
  assert.deepEqual(source, before)
})

test('zine spread summary limiting preserves own constructor and toString summaries', () => {
  const source = createZine((input) => {
    input.targetSpreadId = 'toString'
    input.project.spreadOrder = ['constructor', 'toString', 'spread-3']
    input.project.spreadSummaries = JSON.parse(
      '{"constructor":{"title":"Opening"},"toString":{"title":"Feature"},"spread-3":{"title":"Closing"}}',
    ) as Record<string, JsonValue>
    input.currentSpread.spreadId = 'toString'
    input.adjacentSpreads[0].spreadId = 'constructor'
  })

  const result = applyEditorAiContextBudget(source, {
    ...LARGE_CONTEXT_BUDGET,
    remoteSpreadSummaryLimit: 1,
  })

  const summaries = result.snapshot.project.spreadSummaries
  assert.equal(Object.prototype.hasOwnProperty.call(summaries, 'constructor'), true)
  assert.equal(Object.prototype.hasOwnProperty.call(summaries, 'toString'), true)
  assert.deepEqual(summaries.constructor, { title: 'Opening' })
  assert.deepEqual(summaries.toString, { title: 'Feature' })
})

test('zine summary limit applies with no adjacent spreads and keeps the target summary', () => {
  const source = createZine((input) => {
    input.project.spreadOrder = ['remote-2', 'remote-1']
    input.project.spreadSummaries = {
      'remote-1': { title: 'Remote one' },
      'spread-2': { title: 'Feature' },
      'remote-2': { title: 'Remote two' },
    }
    input.adjacentSpreads = []
    input.assetCandidates = []
  })
  const before = structuredClone(source)
  const targetOnly = createZine((input) => {
    input.project.spreadOrder = ['remote-2', 'remote-1']
    input.project.spreadSummaries = { 'spread-2': { title: 'Feature' } }
    input.adjacentSpreads = []
    input.assetCandidates = []
  })

  const result = applyEditorAiContextBudget(source, {
    ...LARGE_CONTEXT_BUDGET,
    maxInputTokens: estimateEditorAiContextTokens(targetOnly),
    remoteSpreadSummaryLimit: 0,
  })

  assert.equal(result.accepted, true)
  assert.deepEqual(Object.keys(result.snapshot.project.spreadSummaries), ['spread-2'])
  assert.deepEqual(result.snapshot.project.spreadSummaries['spread-2'], { title: 'Feature' })
  assert.equal(result.snapshot.revision, source.revision)
  assert.deepEqual(source, before)
})

test('zine summary limit retains target plus configured optional summaries in project order', () => {
  const source = createZine((input) => {
    input.project.spreadOrder = ['remote-2', 'remote-1', 'remote-3']
    input.project.spreadSummaries = {
      'remote-1': { title: 'Remote one' },
      'spread-2': { title: 'Feature' },
      'remote-3': { title: 'Remote three' },
      'remote-2': { title: 'Remote two' },
    }
    input.adjacentSpreads = []
    input.assetCandidates = []
  })
  const before = structuredClone(source)

  const result = applyEditorAiContextBudget(source, {
    ...LARGE_CONTEXT_BUDGET,
    remoteSpreadSummaryLimit: 2,
  })

  assert.deepEqual(Object.keys(result.snapshot.project.spreadSummaries), [
    'remote-2',
    'remote-1',
    'spread-2',
  ])
  assert.equal(result.snapshot.revision, source.revision)
  assert.deepEqual(source, before)
})

test('zine over-budget reduction removes optional summaries before rejecting target-only context', () => {
  const source = createZine((input) => {
    input.project.spreadOrder = ['remote-1', 'remote-2']
    input.project.spreadSummaries = {
      'remote-1': { title: 'Remote one', detail: 'x'.repeat(400) },
      'spread-2': { title: 'Feature' },
      'remote-2': { title: 'Remote two', detail: 'y'.repeat(400) },
    }
    input.adjacentSpreads = []
    input.assetCandidates = []
  })
  const before = structuredClone(source)
  const targetOnly = createZine((input) => {
    input.project.spreadOrder = ['remote-1', 'remote-2']
    input.project.spreadSummaries = { 'spread-2': { title: 'Feature' } }
    input.adjacentSpreads = []
    input.assetCandidates = []
  })
  const targetTokens = estimateEditorAiContextTokens(targetOnly)

  const accepted = applyEditorAiContextBudget(source, {
    ...LARGE_CONTEXT_BUDGET,
    maxInputTokens: targetTokens,
    remoteSpreadSummaryLimit: 2,
  })
  const rejected = applyEditorAiContextBudget(source, {
    ...LARGE_CONTEXT_BUDGET,
    maxInputTokens: targetTokens - 1,
    remoteSpreadSummaryLimit: 2,
  })

  assert.equal(accepted.accepted, true)
  assert.deepEqual(Object.keys(accepted.snapshot.project.spreadSummaries), ['spread-2'])
  assert.equal(accepted.reductions.includes('context_budget_exceeded'), false)
  assert.equal(rejected.accepted, false)
  assert.deepEqual(Object.keys(rejected.snapshot.project.spreadSummaries), ['spread-2'])
  assert.equal(rejected.reductions.at(-1), 'context_budget_exceeded')
  assert.equal(accepted.snapshot.revision, source.revision)
  assert.equal(rejected.snapshot.revision, source.revision)
  assert.deepEqual(source, before)
})

test('zine over-budget reductions separate summaries from later adjacent references', () => {
  const source = createZine((input) => {
    input.project.spreadSummaries['spread-1'] = {
      title: 'Opening', detail: 'x'.repeat(400),
    }
    input.project.spreadSummaries['spread-3'] = {
      title: 'Closing', detail: 'y'.repeat(400),
    }
    input.assetCandidates = []
    for (const spread of input.adjacentSpreads) delete spread.preview
  })
  const mandatory = createZine((input) => {
    input.project.spreadSummaries = { 'spread-2': { title: 'Feature' } }
    input.adjacentSpreads = []
    input.assetCandidates = []
  })
  const mandatoryWithSourceRevision = {
    ...mandatory,
    revision: source.revision,
  }

  const result = applyEditorAiContextBudget(source, {
    ...LARGE_CONTEXT_BUDGET,
    maxInputTokens: estimateEditorAiContextTokens(mandatoryWithSourceRevision),
    remoteSpreadSummaryLimit: 1,
  })

  assert.deepEqual(result.reductions, [
    'remote_spread_summaries:2->1',
    'remote_spread_summaries:1->0',
    'adjacent_spreads:2->0',
  ])
  assert.equal(result.accepted, true)
  assert.deepEqual(Object.keys(result.snapshot.project.spreadSummaries), ['spread-2'])
  assert.deepEqual(result.snapshot.adjacentSpreads, [])
})

test('oversized adjacent previews are reduced as an isolated first stage', () => {
  const source = createZine((input) => {
    input.assetCandidates = []
    input.adjacentSpreads[0].preview = {
      ...input.adjacentSpreads[0].preview!,
      width: 2000,
      height: 1000,
    }
    delete input.adjacentSpreads[1].preview
  })
  const result = applyEditorAiContextBudget(source, {
    ...LARGE_CONTEXT_BUDGET,
    adjacentPreviewMaxPixels: 1_000_000,
  })

  assert.deepEqual(result.reductions, ['adjacent_preview_pixels:spread-1'])
  assert.equal(result.accepted, true)
  assert.equal(result.snapshot.adjacentSpreads[0].preview, undefined)
  assert.deepEqual(result.snapshot.currentSpread.preview, source.currentSpread.preview)
})

test('token reductions follow priority and final estimate is recomputed', () => {
  const source = createZine((input) => {
    input.adjacentSpreads[0].preview = {
      ...input.adjacentSpreads[0].preview!,
      width: 2000,
      height: 1000,
    }
  })
  const before = structuredClone(source)
  const mandatory = createZine((input) => {
    input.project.spreadSummaries = { 'spread-2': { title: 'Feature' } }
    input.adjacentSpreads = []
    input.assetCandidates = []
  })
  const target = estimateEditorAiContextTokens(mandatory)
  const result = applyEditorAiContextBudget(source, {
    maxInputTokens: target,
    adjacentPreviewMaxPixels: 1_000_000,
    assetCandidateLimit: 1,
    remoteSpreadSummaryLimit: 1,
    narrativeVisualSegmentLimit: 2,
  })

  assert.deepEqual(result.reductions, [
    'adjacent_preview_pixels:spread-1',
    'adjacent_preview:spread-3',
    'asset_thumbnail:asset-1',
    'asset_thumbnail:asset-2',
    'asset_candidates:2->1',
    'asset_candidates:1->0',
    'remote_spread_summaries:2->1',
    'remote_spread_summaries:1->0',
    'adjacent_spreads:2->0',
  ])
  assert.equal(result.accepted, true)
  assert.equal(result.estimatedTokens, estimateEditorAiContextTokens(result.snapshot))
  assert.ok(result.estimatedTokens <= target)
  assert.deepEqual(result.snapshot.currentSpread.preview, source.currentSpread.preview)
  assert.deepEqual(source, before)
  assert.equal(result.snapshot.revision, source.revision)
})

test('remaining adjacent previews are removed before later optional zine context', () => {
  const source = createZine((input) => {
    input.assetCandidates = []
  })
  const desired = createZine((input) => {
    input.assetCandidates = []
    delete input.adjacentSpreads[1].preview
  })
  const result = applyEditorAiContextBudget(source, {
    ...LARGE_CONTEXT_BUDGET,
    maxInputTokens: estimateEditorAiContextTokens(desired),
    adjacentPreviewMaxPixels: 2_000_000,
  })

  assert.deepEqual(result.reductions, ['adjacent_preview:spread-3'])
  assert.equal(result.accepted, true)
  assert.deepEqual(result.snapshot.adjacentSpreads, desired.adjacentSpreads)
})

test('asset thumbnails are exhausted before candidate references are removed', () => {
  const source = createZine((input) => {
    input.adjacentSpreads = []
    input.project.spreadSummaries = { 'spread-2': { title: 'Feature' } }
  })
  const desired = createZine((input) => {
    input.adjacentSpreads = []
    input.project.spreadSummaries = { 'spread-2': { title: 'Feature' } }
    for (const candidate of input.assetCandidates) delete candidate.thumbnail
  })
  const result = applyEditorAiContextBudget(source, {
    ...LARGE_CONTEXT_BUDGET,
    maxInputTokens: estimateEditorAiContextTokens(desired),
  })

  assert.deepEqual(result.reductions, [
    'asset_thumbnail:asset-2',
    'asset_thumbnail:asset-1',
  ])
  assert.equal(result.accepted, true)
  assert.equal(result.snapshot.assetCandidates.length, 2)
})

test('asset candidates continue reducing beyond the configured limit while over budget', () => {
  const source = createZine((input) => {
    input.adjacentSpreads = []
    input.project.spreadSummaries = { 'spread-2': { title: 'Feature' } }
    for (const candidate of input.assetCandidates) delete candidate.thumbnail
  })
  const desired = createZine((input) => {
    input.adjacentSpreads = []
    input.assetCandidates = []
    input.project.spreadSummaries = { 'spread-2': { title: 'Feature' } }
  })
  const result = applyEditorAiContextBudget(source, {
    ...LARGE_CONTEXT_BUDGET,
    maxInputTokens: estimateEditorAiContextTokens(desired),
    assetCandidateLimit: 1,
  })

  assert.deepEqual(result.reductions, [
    'asset_candidates:2->1',
    'asset_candidates:1->0',
  ])
  assert.equal(result.accepted, true)
  assert.equal(result.snapshot.assetCandidates.length, 0)
})

test('asset candidate search retains the maximal deterministic prefix that fits', () => {
  const source = createZine((input) => {
    input.adjacentSpreads = []
    input.project.spreadSummaries = { 'spread-2': { title: 'Feature' } }
    input.assetCandidates = Array.from({ length: 4 }, (_, index) => ({
      assetId: `asset-${index}`,
      metadata: { detail: String(index).repeat(40) },
    }))
  })
  const withTwo = createZine((input) => {
    input.adjacentSpreads = []
    input.project.spreadSummaries = { 'spread-2': { title: 'Feature' } }
    input.assetCandidates = source.assetCandidates.slice(0, 2)
  })
  const withThree = createZine((input) => {
    input.adjacentSpreads = []
    input.project.spreadSummaries = { 'spread-2': { title: 'Feature' } }
    input.assetCandidates = source.assetCandidates.slice(0, 3)
  })
  const maxInputTokens = estimateEditorAiContextTokens(withTwo)

  const result = applyEditorAiContextBudget(source, {
    ...LARGE_CONTEXT_BUDGET,
    maxInputTokens,
    assetCandidateLimit: 4,
  })

  assert.equal(result.accepted, true)
  assert.deepEqual(result.snapshot.assetCandidates.map((candidate) => candidate.assetId), [
    'asset-0',
    'asset-1',
  ])
  assert.equal(result.estimatedTokens, maxInputTokens)
  assert.ok(estimateEditorAiContextTokens(withThree) > maxInputTokens)
  assert.deepEqual(result.reductions, ['asset_candidates:4->2'])
})

test('large asset candidate retention uses logarithmically bounded estimates', () => {
  const source = createZine((input) => {
    input.adjacentSpreads = []
    input.project.spreadSummaries = { 'spread-2': { title: 'Feature' } }
    input.assetCandidates = Array.from({ length: 1024 }, (_, index) => ({
      assetId: `asset-${index}`,
      metadata: { rank: index },
    }))
  })
  let estimatorCalls = 0
  let reconstructionCalls = 0
  const retainedCount = 513
  const result = applyEditorAiContextBudgetWithEstimatorForTest(
    source,
    { ...LARGE_CONTEXT_BUDGET, maxInputTokens: retainedCount, assetCandidateLimit: 1024 },
    (snapshot) => {
      estimatorCalls += 1
      return isZineDocumentSnapshot(snapshot) ? snapshot.assetCandidates.length : 0
    },
    { onCandidateSnapshot: () => { reconstructionCalls += 1 } },
  )

  assert.equal(result.accepted, true)
  assert.equal(result.snapshot.assetCandidates.length, retainedCount)
  assert.deepEqual(result.snapshot.assetCandidates.map((candidate) => candidate.assetId),
    source.assetCandidates.slice(0, retainedCount).map((candidate) => candidate.assetId))
  assert.deepEqual(result.reductions, [`asset_candidates:1024->${retainedCount}`])
  assert.ok(estimatorCalls <= Math.ceil(Math.log2(1025)) + 3)
  assert.ok(reconstructionCalls <= Math.ceil(Math.log2(1025)) + 1)
})

test('large narrative sampling uses logarithmically bounded estimates', () => {
  const source = createNarrative((input) => {
    input.visualSegments = Array.from({ length: 1024 }, (_, index) => ({
      id: `segment-${index}`,
      image: {
        id: `image-${index}`,
        dataUrl: 'data:image/png;base64,AA',
        mediaType: 'image/png',
        width: 1,
        height: 1,
        byteLength: 0,
      },
      nodeIds: ['paragraph-1'],
      startY: index,
      endY: index + 1,
    }))
  })
  let estimatorCalls = 0
  let reconstructionCalls = 0
  const retainedCount = 513
  const result = applyEditorAiContextBudgetWithEstimatorForTest(
    source,
    { ...LARGE_CONTEXT_BUDGET, maxInputTokens: retainedCount, narrativeVisualSegmentLimit: 1024 },
    (snapshot) => {
      estimatorCalls += 1
      return isNarrativeDocumentSnapshot(snapshot) ? snapshot.visualSegments.length : 0
    },
    { onCandidateSnapshot: () => { reconstructionCalls += 1 } },
  )

  assert.equal(result.snapshot.visualSegments.length, retainedCount)
  assert.equal(result.snapshot.visualSegments[0].id, 'segment-0')
  assert.equal(result.snapshot.visualSegments.at(-1)?.id, 'segment-1023')
  assert.deepEqual(result.reductions, [`narrative_visual_segments:1024->${retainedCount}`])
  assert.ok(estimatorCalls <= Math.ceil(Math.log2(1025)) + 3)
  assert.ok(reconstructionCalls <= Math.ceil(Math.log2(1025)) + 1)
})

test('large summary retention uses logarithmically bounded estimates', () => {
  const source = createZine((input) => {
    const optionalIds = Array.from({ length: 1024 }, (_, index) => `remote-${index}`)
    input.project.spreadOrder = optionalIds
    input.project.spreadSummaries = { 'spread-2': { title: 'Feature' } }
    for (const spreadId of optionalIds) {
      input.project.spreadSummaries[spreadId] = { title: spreadId }
    }
    input.adjacentSpreads = []
    input.assetCandidates = []
  })
  let estimatorCalls = 0
  let reconstructionCalls = 0
  const retainedCount = 513
  const result = applyEditorAiContextBudgetWithEstimatorForTest(
    source,
    {
      ...LARGE_CONTEXT_BUDGET,
      maxInputTokens: retainedCount,
      remoteSpreadSummaryLimit: 1024,
    },
    (snapshot) => {
      estimatorCalls += 1
      return isZineDocumentSnapshot(snapshot)
        ? Object.keys(snapshot.project.spreadSummaries).length - 1
        : 0
    },
    { onCandidateSnapshot: () => { reconstructionCalls += 1 } },
  )

  assert.equal(Object.keys(result.snapshot.project.spreadSummaries).length, retainedCount + 1)
  assert.equal(
    Object.prototype.hasOwnProperty.call(result.snapshot.project.spreadSummaries, 'spread-2'),
    true,
  )
  assert.deepEqual(result.reductions, [`remote_spread_summaries:1024->${retainedCount}`])
  assert.ok(estimatorCalls <= Math.ceil(Math.log2(1025)) + 3)
  assert.ok(reconstructionCalls <= Math.ceil(Math.log2(1025)) + 1)
})

test('large adjacent retention uses logarithmically bounded estimates', () => {
  const source = createZine((input) => {
    input.project.spreadSummaries = { 'spread-2': { title: 'Feature' } }
    input.assetCandidates = []
    input.adjacentSpreads = Array.from({ length: 1024 }, (_, index) => ({
      spreadId: `spread-${index + 3}`,
      index: index + 2,
      structure: { slots: [] },
      summary: { title: `Spread ${index + 3}` },
    }))
  })
  let estimatorCalls = 0
  let reconstructionCalls = 0
  const retainedCount = 513
  const result = applyEditorAiContextBudgetWithEstimatorForTest(
    source,
    { ...LARGE_CONTEXT_BUDGET, maxInputTokens: retainedCount },
    (snapshot) => {
      estimatorCalls += 1
      return isZineDocumentSnapshot(snapshot) ? snapshot.adjacentSpreads.length : 0
    },
    { onCandidateSnapshot: () => { reconstructionCalls += 1 } },
  )

  assert.equal(result.snapshot.adjacentSpreads.length, retainedCount)
  assert.deepEqual(
    result.snapshot.adjacentSpreads.map((spread) => spread.spreadId),
    source.adjacentSpreads.slice(0, retainedCount).map((spread) => spread.spreadId),
  )
  assert.deepEqual(result.reductions, [`adjacent_spreads:1024->${retainedCount}`])
  assert.ok(estimatorCalls <= Math.ceil(Math.log2(1025)) + 3)
  assert.ok(reconstructionCalls <= Math.ceil(Math.log2(1025)) + 1)
})

test('remote references continue reducing beyond the configured limit while over budget', () => {
  const source = createZine((input) => {
    input.assetCandidates = []
    for (const spread of input.adjacentSpreads) delete spread.preview
  })
  const desired = createZine((input) => {
    input.assetCandidates = []
    input.adjacentSpreads = []
    input.project.spreadSummaries = { 'spread-2': { title: 'Feature' } }
  })
  const result = applyEditorAiContextBudget(source, {
    ...LARGE_CONTEXT_BUDGET,
    maxInputTokens: estimateEditorAiContextTokens(desired),
    remoteSpreadSummaryLimit: 1,
  })

  assert.deepEqual(result.reductions, [
    'remote_spread_summaries:2->1',
    'remote_spread_summaries:1->0',
    'adjacent_spreads:2->0',
  ])
  assert.equal(result.accepted, true)
  assert.equal(result.snapshot.adjacentSpreads.length, 0)
  assert.deepEqual(Object.keys(result.snapshot.project.spreadSummaries), ['spread-2'])
})

test('zine mandatory overflow retains current context after exhausting all references', () => {
  const source = createZine((input) => {
    input.currentSpread.preview = {
      ...input.currentSpread.preview!,
      dataUrl: `data:image/png;base64,${'Z'.repeat(200)}`,
      byteLength: 20_000,
    }
  })
  const before = structuredClone(source)
  const result = applyEditorAiContextBudget(source, {
    maxInputTokens: 1,
    adjacentPreviewMaxPixels: 0,
    assetCandidateLimit: 0,
    remoteSpreadSummaryLimit: 0,
    narrativeVisualSegmentLimit: 0,
  })

  assert.equal(result.accepted, false)
  assert.equal(result.reductions.at(-1), 'context_budget_exceeded')
  assert.equal(result.reductions.includes('current_preview'), false)
  assert.equal(result.snapshot.adjacentSpreads.length, 0)
  assert.equal(result.snapshot.assetCandidates.length, 0)
  assert.deepEqual(Object.keys(result.snapshot.project.spreadSummaries), ['spread-2'])
  assert.deepEqual(result.snapshot.project.settings, source.project.settings)
  assert.equal(result.snapshot.targetSpreadId, source.targetSpreadId)
  assert.deepEqual(result.snapshot.currentSpread.structure, source.currentSpread.structure)
  assert.deepEqual(result.snapshot.currentSpread.summary, source.currentSpread.summary)
  assert.deepEqual(result.snapshot.currentSpread.preview, source.currentSpread.preview)
  assert.equal(result.snapshot.currentSpread.preview?.dataUrl, source.currentSpread.preview?.dataUrl)
  assert.equal(result.estimatedTokens, estimateEditorAiContextTokens(result.snapshot))
  assert.deepEqual(source, before)
  assert.equal(result.snapshot.revision, source.revision)
})

test('narrative mandatory overflow removes every visual segment without truncating structure', () => {
  const source = createNarrative((input) => {
    input.nodes[0].text = 'x'.repeat(20_000)
    input.visualSegments = Array.from({ length: 4 }, (_, index) => ({
      id: `segment-${index}`,
      image: { ...image(`data:image/png;base64,${index}`), id: `image-${index}` },
      nodeIds: ['paragraph-1'], startY: index * 100, endY: index * 100 + 80,
    }))
  })
  const before = structuredClone(source)
  const result = applyEditorAiContextBudget(source, {
    maxInputTokens: 1,
    adjacentPreviewMaxPixels: 0,
    assetCandidateLimit: 0,
    remoteSpreadSummaryLimit: 0,
    narrativeVisualSegmentLimit: 2,
  })

  assert.equal(result.accepted, false)
  assert.deepEqual(result.reductions, [
    'narrative_visual_segments:4->2',
    'narrative_visual_segments:2->0',
    'context_budget_exceeded',
  ])
  assert.equal(result.reductions.at(-1), 'context_budget_exceeded')
  assert.equal(result.snapshot.visualSegments.length, 0)
  assert.deepEqual(result.snapshot.root, source.root)
  assert.deepEqual(result.snapshot.nodes, source.nodes)
  assert.equal(result.estimatedTokens, estimateEditorAiContextTokens(result.snapshot))
  assert.deepEqual(source, before)
  assert.equal(result.snapshot.revision, source.revision)
})

test('narrative snapshots reject own custom-map arrays without executing them', () => {
  const input = narrativeInput()
  let executed = false
  input.nodes.map = (() => {
    executed = true
    return []
  }) as typeof input.nodes.map

  assert.throws(
    () => createNarrativeDocumentSnapshot(input),
    { name: 'TypeError', message: /array/i },
  )
  assert.equal(executed, false)
})

test('zine snapshots reject inherited custom-map arrays without executing them', () => {
  const input = zineInput()
  const customPrototype = Object.create(Array.prototype) as unknown as unknown[]
  let executed = false
  Object.defineProperty(customPrototype, 'map', {
    value: () => {
      executed = true
      return []
    },
  })
  Object.setPrototypeOf(input.adjacentSpreads, customPrototype)

  assert.throws(
    () => createZineDocumentSnapshot(input),
    { name: 'TypeError', message: /array/i },
  )
  assert.equal(executed, false)
})

test('snapshot constructors reject sparse arrays at typed cloning boundaries', () => {
  assert.throws(() => createNarrative((input) => {
    input.nodes = Array(1) as unknown as typeof input.nodes
  }), { name: 'TypeError', message: /sparse array/i })
  assert.throws(() => createZine((input) => {
    input.project.spreadOrder = Array(1) as unknown as string[]
  }), { name: 'TypeError', message: /sparse array/i })
})

test('snapshot constructors reject typed field getters without executing them', () => {
  const input = narrativeInput()
  let executed = false
  Object.defineProperty(input, 'documentId', {
    enumerable: true,
    get: () => {
      executed = true
      return 'unsafe'
    },
  })

  assert.throws(
    () => createNarrativeDocumentSnapshot(input),
    { name: 'TypeError', message: /accessor|snapshot|JSON/i },
  )
  assert.equal(executed, false)
})

test('snapshot constructors reject nested JSON record getters without executing them', () => {
  const input = zineInput()
  let executed = false
  input.assetCandidates[0].metadata = Object.defineProperty({}, 'unsafe', {
    enumerable: true,
    get: () => {
      executed = true
      return 'unsafe'
    },
  }) as Record<string, JsonValue>

  assert.throws(
    () => createZineDocumentSnapshot(input),
    { name: 'TypeError', message: /accessor|snapshot|JSON/i },
  )
  assert.equal(executed, false)
})

test('entire narrative visual segment structures are excluded from revision', () => {
  const baseline = createNarrative().revision
  const mutations: Array<[string, (input: CreateNarrativeDocumentSnapshotInput) => void]> = [
    ['segment id', (input) => { input.visualSegments[0].id = 'segment-changed' }],
    ['node IDs', (input) => { input.visualSegments[0].nodeIds[0] = 'node-changed' }],
    ['node ID order', (input) => { input.visualSegments[0].nodeIds.reverse() }],
    ['start Y', (input) => { input.visualSegments[0].startY = 12 }],
    ['end Y', (input) => { input.visualSegments[0].endY = 999 }],
    ['image id', (input) => { input.visualSegments[0].image.id = 'image-changed' }],
    ['image media type', (input) => { input.visualSegments[0].image.mediaType = 'image/webp' }],
    ['image width', (input) => { input.visualSegments[0].image.width = 640 }],
    ['image height', (input) => { input.visualSegments[0].image.height = 480 }],
    ['image byte length', (input) => { input.visualSegments[0].image.byteLength = 9999 }],
    ['image data URL', (input) => { input.visualSegments[0].image.dataUrl = 'data:image/png;base64,ZZZZ' }],
  ]

  for (const [field, mutate] of mutations) {
    assert.equal(createNarrative(mutate).revision, baseline, field)
  }
})

test('narrative node attrs content and order alter revision', () => {
  const baseline = createNarrative()
  const changedAttrs = createNarrative((input) => {
    input.nodes = [{
      id: 'paragraph-1', type: 'paragraph', index: 0, depth: 1,
      text: 'Opening', attrs: { align: 'center' }, marks: [], childIds: [],
    }]
  })
  const changedContent = createNarrative((input) => {
    input.nodes = [{
      id: 'paragraph-1', type: 'paragraph', index: 0, depth: 1,
      text: 'Revised opening', attrs: { align: 'left' }, marks: [], childIds: [],
    }]
  })
  const ordered = createNarrative((input) => {
    input.nodes = [
      {
        id: 'paragraph-1', type: 'paragraph', index: 0, depth: 1,
        text: 'Opening', attrs: { align: 'left' }, marks: [], childIds: [],
      },
      {
        id: 'paragraph-2', type: 'paragraph', index: 1, depth: 1,
        text: 'Second', attrs: {}, marks: [], childIds: [],
      },
    ]
  })
  const reordered = createNarrative((input) => {
    input.nodes = [
      {
        id: 'paragraph-2', type: 'paragraph', index: 1, depth: 1,
        text: 'Second', attrs: {}, marks: [], childIds: [],
      },
      {
        id: 'paragraph-1', type: 'paragraph', index: 0, depth: 1,
        text: 'Opening', attrs: { align: 'left' }, marks: [], childIds: [],
      },
    ]
  })

  assert.notEqual(changedAttrs.revision, baseline.revision)
  assert.notEqual(changedContent.revision, baseline.revision)
  assert.notEqual(reordered.revision, ordered.revision)
})

test('ordinary data-prefixed narrative strings remain revision-stable content', () => {
  const first = createNarrative((input) => {
    input.root = { type: 'doc', label: 'data:first' }
    input.nodes[0].text = 'data:first'
    input.nodes[0].attrs = { label: 'data:first' }
  })
  const second = createNarrative((input) => {
    input.root = { type: 'doc', label: 'data:second' }
    input.nodes[0].text = 'data:second'
    input.nodes[0].attrs = { label: 'data:second' }
  })

  assert.notEqual(first.revision, second.revision)
})

test('nested narrative data URLs are scrubbed but ordinary data values remain stable inputs', () => {
  const dataUrlRevision = (suffix: string) => createNarrative((input) => {
    input.root = { nested: { source: `data:text/plain,root-${suffix}` } }
    input.nodes[0].attrs = { nested: { source: `data:image/png,attrs-${suffix}` } }
    input.nodes[0].marks = [{ attrs: { source: `DATA:application/json,marks-${suffix}` } }]
  }).revision
  const ordinaryRevision = (suffix: string) => createNarrative((input) => {
    input.root = { value: `data:${suffix}` }
    input.nodes[0].attrs = { value: `data:${suffix}` }
    input.nodes[0].marks = [{ value: `data:${suffix}` }]
  }).revision

  assert.equal(dataUrlRevision('first'), dataUrlRevision('second'))
  assert.notEqual(ordinaryRevision('first'), ordinaryRevision('second'))
})

test('narrative identity, content, and editor width are stable revision inputs', () => {
  const baseline = createNarrative().revision
  const mutations: Array<[string, (input: CreateNarrativeDocumentSnapshotInput) => void]> = [
    ['document ID', (input) => { input.documentId = 'story-2' }],
    ['document kind', (input) => { input.documentKind = 'blog' }],
    ['title', (input) => { input.title = 'Changed title' }],
    ['root', (input) => { input.root = { type: 'doc', changed: true } }],
    ['editor width', (input) => { input.editorWidth = 1024 }],
  ]

  for (const [field, mutate] of mutations) {
    assert.notEqual(createNarrative(mutate).revision, baseline, field)
  }
})

test('snapshot constructors reject nested undefined runtime values', () => {
  assert.throws(() => createNarrative((input) => {
    input.root = { nested: { missing: undefined } } as unknown as JsonValue
  }), { name: 'TypeError', message: /undefined|JSON/i })
  assert.throws(() => createNarrative((input) => {
    input.nodes[0].attrs = { nested: { missing: undefined } } as unknown as Record<string, JsonValue>
  }), { name: 'TypeError', message: /undefined|JSON/i })
  assert.throws(() => createZine((input) => {
    input.project.settings = { nested: { missing: undefined } } as unknown as Record<string, JsonValue>
  }), { name: 'TypeError', message: /undefined|JSON/i })
  assert.throws(() => createZine((input) => {
    input.assetCandidates[0].metadata = {
      nested: { missing: undefined },
    } as unknown as Record<string, JsonValue>
  }), { name: 'TypeError', message: /undefined|JSON/i })
})

test('narrative snapshot constructors reject sparse nested JSON arrays', () => {
  assert.throws(() => createNarrative((input) => {
    input.root = { content: Array(1) } as unknown as JsonValue
  }), { name: 'TypeError', message: /sparse array/i })
  assert.throws(() => createNarrative((input) => {
    input.nodes[0].attrs = {
      nested: [, 'x'],
    } as unknown as Record<string, JsonValue>
  }), { name: 'TypeError', message: /sparse array/i })
})

test('zine snapshot constructors reject sparse nested JSON arrays', () => {
  assert.throws(() => createZine((input) => {
    input.project.settings = {
      nested: Array(1),
    } as unknown as Record<string, JsonValue>
  }), { name: 'TypeError', message: /sparse array/i })
  assert.throws(() => createZine((input) => {
    input.assetCandidates[0].metadata = {
      nested: [, 'x'],
    } as unknown as Record<string, JsonValue>
  }), { name: 'TypeError', message: /sparse array/i })
})

test('dense arrays with explicit null remain valid and deterministic', () => {
  const first = createNarrative((input) => {
    input.root = { content: [null, { attrs: [null, 'x'] }] }
    input.nodes[0].attrs = { values: [null] }
  })
  const second = createNarrative((input) => {
    input.root = { content: [null, { attrs: [null, 'x'] }] }
    input.nodes[0].attrs = { values: [null] }
  })

  assert.deepEqual(first.root, second.root)
  assert.equal(first.revision, second.revision)
})

test('narrative snapshots deeply isolate mutable input and output data', () => {
  const root: JsonValue = { content: [{ type: 'paragraph' }] }
  const attrs: Record<string, JsonValue> = { nested: { align: 'left' } }
  const marks: JsonValue[] = [{ type: 'bold', attrs: { weight: 600 } }]
  const childIds = ['child-1']
  const visualImage = image('data:image/png;base64,AAAA')
  const visualNodeIds = ['paragraph-1']
  const input = {
    documentId: 'story-1', documentKind: 'story' as const, root,
    nodes: [{
      id: 'paragraph-1', type: 'paragraph', index: 0, depth: 1,
      attrs, marks, childIds,
    }],
    editorWidth: 960,
    visualSegments: [{
      id: 'segment-1', image: visualImage, nodeIds: visualNodeIds,
      startY: 0, endY: 10,
    }],
  }
  const snapshot = createNarrativeDocumentSnapshot(input)

  ;(root as { content: Array<{ type: string }> }).content[0].type = 'changed-input'
  ;(attrs.nested as { align: string }).align = 'center'
  ;(marks[0] as { attrs: { weight: number } }).attrs.weight = 700
  childIds.push('child-2')
  visualImage.id = 'changed-input-image'
  visualNodeIds.push('changed-input-node')
  assert.deepEqual(snapshot.root, { content: [{ type: 'paragraph' }] })
  assert.deepEqual(snapshot.nodes[0].attrs, { nested: { align: 'left' } })
  assert.deepEqual(snapshot.nodes[0].marks, [{ type: 'bold', attrs: { weight: 600 } }])
  assert.deepEqual(snapshot.nodes[0].childIds, ['child-1'])
  assert.equal(snapshot.visualSegments[0].image.id, 'image-1')
  assert.deepEqual(snapshot.visualSegments[0].nodeIds, ['paragraph-1'])

  ;(snapshot.root as { content: Array<{ type: string }> }).content[0].type = 'changed-output'
  ;(snapshot.nodes[0].attrs.nested as { align: string }).align = 'right'
  ;(snapshot.nodes[0].marks[0] as { attrs: { weight: number } }).attrs.weight = 800
  snapshot.nodes[0].childIds.push('changed-output-child')
  snapshot.visualSegments[0].image.id = 'changed-output-image'
  snapshot.visualSegments[0].nodeIds.push('changed-output-node')
  assert.deepEqual(root, { content: [{ type: 'changed-input' }] })
  assert.deepEqual(attrs, { nested: { align: 'center' } })
  assert.deepEqual(marks, [{ type: 'bold', attrs: { weight: 700 } }])
  assert.deepEqual(childIds, ['child-1', 'child-2'])
  assert.equal(visualImage.id, 'changed-input-image')
  assert.deepEqual(visualNodeIds, ['paragraph-1', 'changed-input-node'])
})

test('entire zine preview and thumbnail structures are excluded from revision', () => {
  const baseline = createZine().revision
  const imageMutations: Array<[string, (image: EditorAiImageInput) => void]> = [
    ['id', (value) => { value.id = 'image-changed' }],
    ['media type', (value) => { value.mediaType = 'image/webp' }],
    ['width', (value) => { value.width = 640 }],
    ['height', (value) => { value.height = 480 }],
    ['byte length', (value) => { value.byteLength = 9999 }],
    ['data URL', (value) => { value.dataUrl = 'data:image/png;base64,ZZZZ' }],
  ]

  for (const [field, mutateImage] of imageMutations) {
    assert.equal(createZine((input) => {
      mutateImage(input.currentSpread.preview!)
    }).revision, baseline, `preview ${field}`)
    assert.equal(createZine((input) => {
      mutateImage(input.assetCandidates[0].thumbnail!)
    }).revision, baseline, `thumbnail ${field}`)
  }
})

test('zine nested data URLs do not alter revision', () => {
  const first = createZine((input) => {
    input.project.settings = { nested: { source: 'data:application/json;base64,AAAA' } }
    input.project.spreadSummaries = { 'spread-2': { source: 'DATA:text/plain,first' } }
    input.currentSpread.structure = { slots: [{ source: 'data:font/woff2;base64,BBBB' }] }
    input.currentSpread.summary = { source: 'data:application/octet-stream;base64,CCCC' }
    input.assetCandidates[0].metadata = {
      source: 'data:video/mp4;base64,DDDD',
      description: 'ordinary data: string',
    }
  })
  const second = createZine((input) => {
    input.project.settings = { nested: { source: 'data:application/json;base64,XXXX' } }
    input.project.spreadSummaries = { 'spread-2': { source: 'DATA:text/plain,second' } }
    input.currentSpread.structure = { slots: [{ source: 'data:font/woff2;base64,YYYY' }] }
    input.currentSpread.summary = { source: 'data:application/octet-stream;base64,ZZZZ' }
    input.assetCandidates[0].metadata = {
      source: 'data:video/mp4;base64,EEEE',
      description: 'ordinary data: string',
    }
  })

  assert.equal(first.revision, second.revision)
  assert.notEqual(
    first.revision,
    createZine((input) => {
      input.project.settings = { nested: { source: 'data:application/json;base64,AAAA' } }
      input.project.spreadSummaries = { 'spread-2': { source: 'DATA:text/plain,first' } }
      input.currentSpread.structure = { slots: [{ source: 'data:font/woff2;base64,BBBB' }] }
      input.currentSpread.summary = { source: 'data:application/octet-stream;base64,CCCC' }
      input.assetCandidates[0].metadata = {
        source: 'data:video/mp4;base64,DDDD',
        description: 'changed ordinary data: string',
      }
    }).revision,
  )
})

test('ordinary data-prefixed zine strings alter revision', () => {
  assert.notEqual(
    createZine((input) => { input.assetCandidates[0].metadata = { label: 'data:first' } }).revision,
    createZine((input) => { input.assetCandidates[0].metadata = { label: 'data:second' } }).revision,
  )
})

test('generic data URLs with commas remain volatile in stable zine JSON', () => {
  assert.equal(
    createZine((input) => {
      input.project.settings = { source: 'data:text/plain,first' }
      input.assetCandidates[0].metadata = { source: 'DATA:image/svg+xml,<svg>first</svg>' }
    }).revision,
    createZine((input) => {
      input.project.settings = { source: 'data:text/plain,second' }
      input.assetCandidates[0].metadata = { source: 'DATA:image/svg+xml,<svg>second</svg>' }
    }).revision,
  )
})

test('snapshot creation rejects non-finite stable numbers', () => {
  assert.throws(() => createNarrativeDocumentSnapshot({
    documentId: 'story-1', documentKind: 'story', root: {}, nodes: [],
    editorWidth: Number.NaN, visualSegments: [],
  }), { name: 'TypeError', message: /finite/i })
  assert.throws(() => createNarrative((input) => {
    input.nodes = [{
      id: 'paragraph-1', type: 'paragraph', index: Number.POSITIVE_INFINITY,
      depth: 1, attrs: {}, marks: [], childIds: [],
    }]
  }), { name: 'TypeError', message: /finite/i })
  assert.throws(() => createZine((input) => {
    input.currentSpread.structure = { x: Number.NEGATIVE_INFINITY }
  }), {
    name: 'TypeError', message: /finite/i,
  })
  assert.throws(() => createZineDocumentSnapshot({
    projectId: 'project-1', targetSpreadId: 'spread-1',
    project: { projectId: 'project-1', settings: {}, spreadOrder: [], spreadSummaries: {} },
    currentSpread: { spreadId: 'spread-1', index: Number.NaN, structure: {}, summary: {} },
    adjacentSpreads: [], assetCandidates: [],
  }), { name: 'TypeError', message: /finite/i })
})

test('zine snapshots deeply isolate mutable input and output data', () => {
  const settings: Record<string, JsonValue> = { layout: { columns: 2 } }
  const structure: JsonValue = { slots: [{ id: 'slot-1' }] }
  const summary: JsonValue = { title: 'Feature' }
  const metadata: Record<string, JsonValue> = { nested: { dpi: 300 } }
  const preview = image('data:image/png;base64,PREVIEW')
  const thumbnail = image('data:image/png;base64,THUMB')
  const input = {
    projectId: 'project-1', targetSpreadId: 'spread-1',
    project: {
      projectId: 'project-1', settings, spreadOrder: ['spread-1'],
      spreadSummaries: { 'spread-1': summary },
    },
    currentSpread: { spreadId: 'spread-1', index: 0, structure, summary, preview },
    adjacentSpreads: [],
    assetCandidates: [{ assetId: 'asset-1', metadata, thumbnail }],
  }
  const snapshot = createZineDocumentSnapshot(input)

  ;(settings.layout as { columns: number }).columns = 3
  ;(structure as { slots: Array<{ id: string }> }).slots[0].id = 'changed-input-slot'
  ;(summary as { title: string }).title = 'Changed input'
  ;(metadata.nested as { dpi: number }).dpi = 240
  preview.id = 'changed-input-preview'
  thumbnail.id = 'changed-input-thumbnail'
  assert.deepEqual(snapshot.project.settings, { layout: { columns: 2 } })
  assert.deepEqual(snapshot.currentSpread.structure, { slots: [{ id: 'slot-1' }] })
  assert.deepEqual(snapshot.currentSpread.summary, { title: 'Feature' })
  assert.deepEqual(snapshot.assetCandidates[0].metadata, { nested: { dpi: 300 } })
  assert.equal(snapshot.currentSpread.preview?.id, 'image-1')
  assert.equal(snapshot.assetCandidates[0].thumbnail?.id, 'image-1')

  ;(snapshot.project.settings.layout as { columns: number }).columns = 4
  ;(snapshot.currentSpread.structure as { slots: Array<{ id: string }> }).slots[0].id = 'changed-output-slot'
  ;(snapshot.currentSpread.summary as { title: string }).title = 'Changed output'
  ;(snapshot.assetCandidates[0].metadata.nested as { dpi: number }).dpi = 180
  if (snapshot.currentSpread.preview) snapshot.currentSpread.preview.id = 'changed-output-preview'
  if (snapshot.assetCandidates[0].thumbnail) snapshot.assetCandidates[0].thumbnail.id = 'changed-output-thumbnail'
  assert.deepEqual(settings, { layout: { columns: 3 } })
  assert.deepEqual(structure, { slots: [{ id: 'changed-input-slot' }] })
  assert.deepEqual(summary, { title: 'Changed input' })
  assert.deepEqual(metadata, { nested: { dpi: 240 } })
  assert.equal(preview.id, 'changed-input-preview')
  assert.equal(thumbnail.id, 'changed-input-thumbnail')
})

test('zine slot geometry and asset metadata dimensions alter revision', () => {
  const baseline = createZine()
  const changedGeometry = createZine((input) => {
    input.currentSpread.structure = {
      slots: [{ id: 'slot-1', x: 20, y: 30, width: 900, height: 600 }],
    }
  })
  const changedDpi = createZine((input) => {
    input.assetCandidates[0].metadata = { width: 6000, height: 4000, dpi: 240 }
  })
  const changedWidth = createZine((input) => {
    input.assetCandidates[0].metadata = { width: 5999, height: 4000, dpi: 300 }
  })
  const changedHeight = createZine((input) => {
    input.assetCandidates[0].metadata = { width: 6000, height: 3999, dpi: 300 }
  })

  assert.notEqual(changedGeometry.revision, baseline.revision)
  assert.notEqual(changedDpi.revision, baseline.revision)
  assert.notEqual(changedWidth.revision, baseline.revision)
  assert.notEqual(changedHeight.revision, baseline.revision)
})

test('zine project, spreads, and assets are stable revision inputs', () => {
  const baseline = createZine().revision
  const mutations: Array<[string, (input: CreateZineDocumentSnapshotInput) => void]> = [
    ['project ID', (input) => { input.projectId = 'project-2' }],
    ['target spread ID', (input) => { input.targetSpreadId = 'spread-3' }],
    ['project settings', (input) => { input.project.settings.pageWidth = 2500 }],
    ['project spread order', (input) => { input.project.spreadOrder.reverse() }],
    ['project spread summary', (input) => {
      input.project.spreadSummaries['spread-2'] = { title: 'Changed feature' }
    }],
    ['current spread ID', (input) => { input.currentSpread.spreadId = 'spread-current' }],
    ['current spread index', (input) => { input.currentSpread.index = 4 }],
    ['current spread structure', (input) => { input.currentSpread.structure = { slots: [] } }],
    ['current spread summary', (input) => { input.currentSpread.summary = { title: 'Changed' } }],
    ['adjacent spread ID', (input) => { input.adjacentSpreads[0].spreadId = 'spread-adjacent' }],
    ['adjacent spread index', (input) => { input.adjacentSpreads[0].index = 5 }],
    ['adjacent spread order', (input) => { input.adjacentSpreads.reverse() }],
    ['adjacent spread structure', (input) => {
      input.adjacentSpreads[0].structure = { slots: [{ id: 'changed-slot' }] }
    }],
    ['adjacent spread summary', (input) => {
      input.adjacentSpreads[0].summary = { title: 'Changed adjacent' }
    }],
    ['asset ID', (input) => { input.assetCandidates[0].assetId = 'asset-changed' }],
    ['asset metadata', (input) => { input.assetCandidates[0].metadata.dpi = 150 }],
    ['asset order', (input) => { input.assetCandidates.reverse() }],
  ]

  for (const [field, mutate] of mutations) {
    assert.notEqual(createZine(mutate).revision, baseline, field)
  }
})

test('structured snapshot type guards narrow by capability', () => {
  const snapshots: StructuredEditorSnapshot[] = [createNarrative(), createZine()]
  const narrative = snapshots.find(isNarrativeDocumentSnapshot)
  const zine = snapshots.find(isZineDocumentSnapshot)

  assert.equal(narrative?.documentKind, 'story')
  assert.equal(zine?.targetSpreadId, 'spread-2')
  assert.equal(isZineDocumentSnapshot(narrative as StructuredEditorSnapshot), false)
  assert.equal(isNarrativeDocumentSnapshot(zine as StructuredEditorSnapshot), false)
})

function narrativeBatch(operation: Record<string, unknown>): Record<string, unknown> {
  return {
    taskId: 'task-1', capability: 'narrative', baseRevision: 'revision-1',
    target: { documentId: 'story-1' }, operations: [operation], summary: ['Updated story'],
  }
}

function zineBatch(operation: Record<string, unknown>): Record<string, unknown> {
  return {
    taskId: 'task-2', capability: 'zine', baseRevision: 'revision-2',
    target: { documentId: 'project-1', spreadId: 'spread-1' },
    operations: [operation], summary: ['Updated spread'],
  }
}

test('valid narrative and Zine direct-edit batches parse', () => {
  assert.equal(parseEditorOperationBatch(narrativeBatch({
    operationId: 'op-1', type: 'replace_text', nodeId: 'node-1',
    from: 0, to: 4, replacement: 'New',
  })).capability, 'narrative')
  assert.equal(parseEditorOperationBatch(zineBatch({
    operationId: 'op-2', type: 'set_image_crop', spreadId: 'spread-1', slotId: 'slot-1',
    crop: { scale: 1.5, offsetX: -2, offsetY: 3, rotation: 0 },
  })).capability, 'zine')
})

function jsonObjectAtSerializedLimit(limit: number): { content: string } {
  return { content: 'x'.repeat(limit - JSON.stringify({ content: '' }).length) }
}

test('direct-edit batches enforce exact operation and summary boundaries', () => {
  const operations = Array.from({ length: MAX_EDITOR_OPERATION_BATCH_OPERATIONS }, (_, index) => ({
    operationId: `op-${index}`, type: 'delete_node', nodeId: `node-${index}`,
  }))
  const summaries = Array.from(
    { length: MAX_EDITOR_OPERATION_BATCH_SUMMARIES },
    () => 'x'.repeat(MAX_EDITOR_OPERATION_SUMMARY_LENGTH),
  )
  const atLimit = narrativeBatch(operations[0])
  atLimit.operations = operations
  atLimit.summary = summaries
  assert.equal(editorOperationBatchSchema.safeParse(atLimit).success, true)

  assert.equal(editorOperationBatchSchema.safeParse({
    ...atLimit,
    operations: [...operations, {
      operationId: 'over-limit', type: 'delete_node', nodeId: 'over-limit',
    }],
  }).success, false)
  assert.equal(editorOperationBatchSchema.safeParse({
    ...atLimit, summary: [...summaries, 'over-limit'],
  }).success, false)
  assert.equal(editorOperationBatchSchema.safeParse({
    ...atLimit, summary: ['x'.repeat(MAX_EDITOR_OPERATION_SUMMARY_LENGTH + 1)],
  }).success, false)
  assert.equal(editorOperationBatchSchema.safeParse({ ...atLimit, summary: [''] }).success, false)
})

test('direct-edit operations enforce exact ID, replacement, and template target boundaries', () => {
  const boundedId = 'i'.repeat(MAX_EDITOR_OPERATION_ID_LENGTH)
  assert.equal(editorOperationBatchSchema.safeParse(narrativeBatch({
    operationId: boundedId, type: 'replace_text', nodeId: boundedId,
    from: 0, to: 0, replacement: 'x'.repeat(MAX_EDITOR_OPERATION_REPLACEMENT_LENGTH),
  })).success, true)
  assert.equal(editorOperationBatchSchema.safeParse(narrativeBatch({
    operationId: `${boundedId}x`, type: 'replace_text', nodeId: 'node',
    from: 0, to: 0, replacement: '',
  })).success, false)
  assert.equal(editorOperationBatchSchema.safeParse(narrativeBatch({
    operationId: 'op', type: 'replace_text', nodeId: 'node',
    from: 0, to: 0, replacement: 'x'.repeat(MAX_EDITOR_OPERATION_REPLACEMENT_LENGTH + 1),
  })).success, false)

  const targetSlotIds = Array.from(
    { length: MAX_EDITOR_TEMPLATE_TARGET_SLOT_IDS },
    (_, index) => `slot-${index}`,
  )
  assert.equal(editorOperationBatchSchema.safeParse(zineBatch({
    operationId: 'op', type: 'apply_layout_template', spreadId: 'spread-1',
    templateId: boundedId, targetSlotIds,
  })).success, true)
  assert.equal(editorOperationBatchSchema.safeParse(zineBatch({
    operationId: 'op', type: 'apply_layout_template', spreadId: 'spread-1',
    templateId: 'template', targetSlotIds: [...targetSlotIds, 'over-limit'],
  })).success, false)
  assert.equal(editorOperationBatchSchema.safeParse(zineBatch({
    operationId: 'op', type: 'apply_layout_template', spreadId: 'spread-1',
    templateId: 'template', targetSlotIds: [`${boundedId}x`],
  })).success, false)
})

test('direct-edit operations enforce exact serialized structured payload boundaries', () => {
  const atLimit = jsonObjectAtSerializedLimit(MAX_EDITOR_OPERATION_JSON_LENGTH)
  const overLimit = jsonObjectAtSerializedLimit(MAX_EDITOR_OPERATION_JSON_LENGTH + 1)
  const cases = [
    [
      (payload: unknown) => narrativeBatch({ operationId: 'op', type: 'set_node_attrs', nodeId: 'node', attrs: payload }),
      'attrs',
    ],
    [
      (payload: unknown) => narrativeBatch({ operationId: 'op', type: 'insert_node', parentId: 'root', index: 0, node: payload }),
      'node',
    ],
    [
      (payload: unknown) => zineBatch({ operationId: 'op', type: 'set_slot_attrs', spreadId: 'spread-1', slotId: 'slot', attrs: payload }),
      'slot attrs',
    ],
    [
      (payload: unknown) => zineBatch({ operationId: 'op', type: 'insert_slot', spreadId: 'spread-1', index: 0, slot: payload }),
      'slot',
    ],
    [
      (payload: unknown) => zineBatch({ operationId: 'op', type: 'apply_layout_template', spreadId: 'spread-1', templateId: 'template', targetSlotIds: [], options: payload }),
      'options',
    ],
  ] as const

  for (const [createBatch, label] of cases) {
    assert.equal(editorOperationBatchSchema.safeParse(createBatch(atLimit)).success, true, `${label} at limit`)
    const result = editorOperationBatchSchema.safeParse(createBatch(overLimit))
    assert.equal(result.success, false, `${label} over limit`)
    if (!result.success) assert.match(result.error.issues[0]?.message ?? '', /250000 serialized JSON characters/)
  }
})

test('direct-edit schemas reject unknown operation, target, and batch keys', () => {
  assert.throws(() => parseEditorOperationBatch(narrativeBatch({
    operationId: 'op-1', type: 'replace_text', nodeId: 'node-1', from: 0, to: 1,
    replacement: 'x', arbitraryCss: 'display:none',
  })))
  assert.throws(() => parseEditorOperationBatch({
    ...narrativeBatch({ operationId: 'op-1', type: 'delete_node', nodeId: 'node-1' }),
    arbitraryCss: 'display:none',
  }))
  const batch = narrativeBatch({ operationId: 'op-1', type: 'delete_node', nodeId: 'node-1' })
  batch.target = { documentId: 'story-1', arbitraryCss: 'display:none' }
  assert.throws(() => parseEditorOperationBatch(batch))
})

test('direct-edit schemas reject blank IDs, invalid ranges, indices, and non-finite numbers', () => {
  const invalidOperations = [
    { operationId: ' ', type: 'delete_node', nodeId: 'node-1' },
    { operationId: 'op', type: 'replace_text', nodeId: ' ', from: 0, to: 1, replacement: '' },
    { operationId: 'op', type: 'replace_text', nodeId: 'node-1', from: -1, to: 1, replacement: '' },
    { operationId: 'op', type: 'replace_text', nodeId: 'node-1', from: 2, to: 1, replacement: '' },
    { operationId: 'op', type: 'insert_node', parentId: 'root', index: -1, node: {} },
    { operationId: 'op', type: 'move_node', nodeId: 'node-1', targetParentId: 'root', index: 0.5 },
  ]
  for (const operation of invalidOperations) {
    assert.throws(() => parseEditorOperationBatch(narrativeBatch(operation)))
  }
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => parseEditorOperationBatch(zineBatch({
      operationId: 'op', type: 'set_layer_order', spreadId: 'spread-1',
      slotId: 'slot-1', zIndex: value,
    })))
  }
})

test('direct-edit schemas reject malformed inert JSON without executing accessors', () => {
  const customArray = ['safe']
  Object.setPrototypeOf(customArray, Object.create(Array.prototype))
  const malformedValues: unknown[] = [
    undefined,
    { missing: undefined },
    { number: Number.NaN },
    Array(1),
    customArray,
    new Date(),
  ]
  for (const attrs of malformedValues) {
    assert.throws(() => parseEditorOperationBatch(narrativeBatch({
      operationId: 'op', type: 'set_node_attrs', nodeId: 'node-1', attrs,
    })))
  }
  let executed = false
  const attrs = Object.defineProperty({}, 'unsafe', {
    enumerable: true,
    get: () => { executed = true; return 'unsafe' },
  })
  assert.throws(() => parseEditorOperationBatch(narrativeBatch({
    operationId: 'op', type: 'set_node_attrs', nodeId: 'node-1', attrs,
  })))
  assert.equal(executed, false)

  const node = ['safe']
  Object.defineProperty(node, '0', {
    enumerable: true,
    get: () => { executed = true; return 'unsafe' },
  })
  assert.throws(() => parseEditorOperationBatch(narrativeBatch({
    operationId: 'op', type: 'insert_node', parentId: 'root', index: 0, node,
  })))
  assert.equal(executed, false)
})

test('direct-edit batch entry points reject accessors across the entire batch graph without execution', () => {
  const accessorBatchFactories: Array<[string, () => { value: unknown; wasExecuted: () => boolean }]> = [
    ['batch capability', () => {
      let executed = false
      const value = narrativeBatch({ operationId: 'op', type: 'delete_node', nodeId: 'node-1' })
      Object.defineProperty(value, 'capability', {
        enumerable: true,
        get: () => { executed = true; return 'narrative' },
      })
      return { value, wasExecuted: () => executed }
    }],
    ['batch operations', () => {
      let executed = false
      const value = narrativeBatch({ operationId: 'op', type: 'delete_node', nodeId: 'node-1' })
      Object.defineProperty(value, 'operations', {
        enumerable: true,
        get: () => { executed = true; return [] },
      })
      return { value, wasExecuted: () => executed }
    }],
    ['operation type', () => {
      let executed = false
      const operation = { operationId: 'op', type: 'delete_node', nodeId: 'node-1' }
      Object.defineProperty(operation, 'type', {
        enumerable: true,
        get: () => { executed = true; return 'delete_node' },
      })
      return { value: narrativeBatch(operation), wasExecuted: () => executed }
    }],
    ['operation attrs', () => {
      let executed = false
      const operation = { operationId: 'op', type: 'set_node_attrs', nodeId: 'node-1', attrs: {} }
      Object.defineProperty(operation, 'attrs', {
        enumerable: true,
        get: () => { executed = true; return {} },
      })
      return { value: narrativeBatch(operation), wasExecuted: () => executed }
    }],
    ['target spreadId', () => {
      let executed = false
      const value = zineBatch({
        operationId: 'op', type: 'delete_slot', spreadId: 'spread-1', slotId: 'slot-1',
      })
      Object.defineProperty(value.target, 'spreadId', {
        enumerable: true,
        get: () => { executed = true; return 'spread-1' },
      })
      return { value, wasExecuted: () => executed }
    }],
  ]

  for (const [label, createAccessorBatch] of accessorBatchFactories) {
    const schemaInput = createAccessorBatch()
    assert.equal(editorOperationBatchSchema.safeParse(schemaInput.value).success, false, `${label} schema`)
    assert.equal(schemaInput.wasExecuted(), false, `${label} schema accessor executed`)

    const parserInput = createAccessorBatch()
    assert.throws(() => parseEditorOperationBatch(parserInput.value), `${label} parser`)
    assert.equal(parserInput.wasExecuted(), false, `${label} parser accessor executed`)
  }
})

test('direct-edit batches enforce capability and Zine target spread invariants', () => {
  assert.throws(() => parseEditorOperationBatch({
    ...narrativeBatch({
      operationId: 'op', type: 'assign_asset', spreadId: 'spread-1',
      slotId: 'slot-1', assetId: 'asset-1',
    }),
  }))
  assert.throws(() => parseEditorOperationBatch({
    ...zineBatch({ operationId: 'op', type: 'delete_node', nodeId: 'node-1' }),
  }))
  const missingSpread = zineBatch({
    operationId: 'op', type: 'delete_slot', spreadId: 'spread-1', slotId: 'slot-1',
  })
  missingSpread.target = { documentId: 'project-1' }
  assert.throws(() => parseEditorOperationBatch(missingSpread))
  assert.throws(() => parseEditorOperationBatch({
    ...narrativeBatch({ operationId: 'op', type: 'delete_node', nodeId: 'node-1' }),
    target: { documentId: 'story-1', spreadId: 'spread-1' },
  }))
  assert.throws(() => parseEditorOperationBatch(zineBatch({
    operationId: 'op', type: 'delete_slot', spreadId: 'spread-2', slotId: 'slot-1',
  })))
})

test('direct-edit batches reject duplicate operation IDs', () => {
  const batch = narrativeBatch({ operationId: 'op-1', type: 'delete_node', nodeId: 'node-1' })
  batch.operations = [
    { operationId: 'op-1', type: 'delete_node', nodeId: 'node-1' },
    { operationId: 'op-1', type: 'delete_node', nodeId: 'node-2' },
  ]
  assert.throws(() => parseEditorOperationBatch(batch))
})

test('delete authorization defaults deny and requires exact narrative and Zine targets', () => {
  const narrativeDelete = { operationId: 'op-n', type: 'delete_node' as const, nodeId: 'node-1' }
  const zineDelete = {
    operationId: 'op-z', type: 'delete_slot' as const, spreadId: 'spread-1', slotId: 'slot-1',
  }
  assert.deepEqual(validateOperationAuthorization([narrativeDelete], {
    allowDelete: false, deleteTargetIds: ['node-1'],
  }).map((issue) => issue.code), ['delete_not_authorized'])
  assert.deepEqual(validateOperationAuthorization([narrativeDelete], {
    allowDelete: true, deleteTargetIds: ['node-2'],
  }).map((issue) => issue.code), ['delete_target_not_authorized'])
  assert.deepEqual(validateOperationAuthorization([narrativeDelete], {
    allowDelete: true, deleteTargetIds: ['node-1'],
  }), [])
  assert.deepEqual(validateOperationAuthorization([zineDelete], {
    allowDelete: true, deleteTargetIds: ['slot-2'], targetSpreadId: 'spread-1',
  }).map((issue) => issue.code), ['delete_target_not_authorized'])
  assert.deepEqual(validateOperationAuthorization([zineDelete], {
    allowDelete: true, deleteTargetIds: ['slot-1'], targetSpreadId: 'spread-1',
  }), [])
})

test('authorization rejects every Zine write to the wrong spread', () => {
  const operations = [
    { operationId: '1', type: 'set_slot_attrs' as const, spreadId: 'wrong', slotId: 's', attrs: {} },
    { operationId: '2', type: 'insert_slot' as const, spreadId: 'wrong', index: 0, slot: {} },
    { operationId: '3', type: 'delete_slot' as const, spreadId: 'wrong', slotId: 's' },
    { operationId: '4', type: 'assign_asset' as const, spreadId: 'wrong', slotId: 's', assetId: 'a' },
    { operationId: '5', type: 'set_image_crop' as const, spreadId: 'wrong', slotId: 's', crop: { scale: 1, offsetX: 0, offsetY: 0, rotation: 0 } },
    { operationId: '6', type: 'set_layer_order' as const, spreadId: 'wrong', slotId: 's', zIndex: 1 },
    { operationId: '7', type: 'apply_layout_template' as const, spreadId: 'wrong', templateId: 't', targetSlotIds: ['s'] },
  ]
  assert.deepEqual(validateOperationAuthorization(operations, {
    allowDelete: true, deleteTargetIds: ['s'], targetSpreadId: 'spread-1', projectAssetIds: ['a'],
  }).map((issue) => issue.code), Array(7).fill('wrong_target_spread'))
})

test('asset authorization requires project membership', () => {
  const operation = {
    operationId: 'op', type: 'assign_asset' as const, spreadId: 'spread-1',
    slotId: 'slot-1', assetId: 'asset-2',
  }
  assert.deepEqual(validateOperationAuthorization([operation], {
    allowDelete: false, deleteTargetIds: [], targetSpreadId: 'spread-1',
    projectAssetIds: ['asset-1'],
  }).map((issue) => issue.code), ['asset_not_in_project'])
  assert.deepEqual(validateOperationAuthorization([operation], {
    allowDelete: false, deleteTargetIds: [], targetSpreadId: 'spread-1',
    projectAssetIds: ['asset-2'],
  }), [])
})

test('authorization returns deterministic multi-error ordering', () => {
  const operations = [{
    operationId: 'op', type: 'assign_asset' as const, spreadId: 'spread-2',
    slotId: 'slot-1', assetId: 'external',
  }, {
    operationId: 'delete', type: 'delete_slot' as const, spreadId: 'spread-2', slotId: 'slot-2',
  }]
  assert.deepEqual(validateOperationAuthorization(operations, {
    allowDelete: false, deleteTargetIds: [], targetSpreadId: 'spread-1', projectAssetIds: [],
  }).map((issue) => issue.code), [
    'wrong_target_spread', 'asset_not_in_project',
    'delete_not_authorized', 'wrong_target_spread',
  ])
})

function completedTaskMetadata(
  capability: 'narrative' | 'zine' = 'narrative',
): EditorAiCompletedTaskMetadata {
  return {
    taskId: 'task-4', capability, taskType: 'instruction' as const,
    target: capability === 'zine'
      ? { documentId: 'zine-1', spreadId: 'spread-1' }
      : { documentId: 'story-1' },
    model: 'gpt-editor', visualMode: 'vision' as const, summary: ['Updated content'],
    warningCodes: ['minor'],
    operationSummary: [{ type: 'replace_text', targetIds: ['node-1'] }],
    baseRevision: 'revision-1', durationMs: 42, status: 'completed' as const,
    resultRevision: 'revision-2',
    changeSet: {
      taskId: 'task-4', targetLabel: 'Opening paragraph',
      entries: [{
        operation: 'replace_text', targetId: 'node-1', targetLabel: 'Opening',
        category: 'content' as const, before: { text: 'Old' }, after: { text: 'New' },
      }],
      warnings: [{
        code: 'minor', message: 'Small wording change', severity: 'info' as const,
        targetIds: ['node-1'],
      }],
      state: 'applied' as const,
    },
  }
}

function metadataPayloadAtSerializedBytes(
  byteLength: number,
  prefix = '',
): { payload: string } {
  const emptyEnvelopeBytes = new TextEncoder().encode(JSON.stringify({ payload: '' })).byteLength
  const prefixBytes = new TextEncoder().encode(prefix).byteLength
  const paddingBytes = byteLength - emptyEnvelopeBytes - prefixBytes
  assert.equal(paddingBytes >= 0, true)
  return { payload: `${prefix}${'x'.repeat(paddingBytes)}` }
}

function nestedMetadataTree(depth: number): Record<string, unknown> {
  const root: Record<string, unknown> = {}
  let cursor = root
  for (let index = 0; index < depth; index += 1) {
    const child: Record<string, unknown> = {}
    cursor.child = child
    cursor = child
  }
  cursor.value = 'leaf'
  return root
}

test('message metadata accepts strict task envelopes for every terminal outcome', () => {
  const completed = {
    type: 'editor_ai_task' as const,
    task: completedTaskMetadata(),
  }
  assert.deepEqual(editorAiTaskMessageMetadataSchema.parse(completed), completed)
  assert.deepEqual(readEditorAiTaskMessageMetadata(completed), completed)

  const { changeSet: _changeSet, resultRevision: _resultRevision, ...base } = completed.task
  for (const status of ['failed', 'stopped'] as const) {
    const envelope = { type: 'editor_ai_task' as const, task: { ...base, status } }
    assert.deepEqual(readEditorAiTaskMessageMetadata(envelope), envelope)
  }
})

test('message metadata normalizes legacy bare tasks without misclassifying other metadata', () => {
  const legacyTask = completedTaskMetadata()
  assert.deepEqual(readEditorAiTaskMessageMetadata(legacyTask), {
    type: 'editor_ai_task',
    task: legacyTask,
  })

  for (const metadata of [
    { type: 'image', src: '/photos/one.jpg' },
    { type: 'custom', nested: { enabled: true } },
  ]) {
    assert.deepEqual(editorAiMessageMetadataSchema.parse(metadata), metadata)
    assert.equal(readEditorAiTaskMessageMetadata(metadata), null)
  }
})

test('reserved task envelopes are strict and never fall through as generic metadata', () => {
  for (const value of [
    { type: 'editor_ai_task', task: { status: 'completed' } },
    { type: 'editor_ai_task', task: completedTaskMetadata(), extra: true },
    { type: 'editor_ai_task', task: { ...completedTaskMetadata(), extra: true } },
  ]) {
    assert.equal(editorAiMessageMetadataSchema.safeParse(value).success, false)
    assert.equal(readEditorAiTaskMessageMetadata(value), null)
  }
})

test('message metadata rejects image data URLs recursively but permits other data strings', () => {
  for (const value of [
    { image: 'data:image/png;base64,abc' },
    { nested: ['  data:ImAgE/webp;base64,abc'] },
    ' DATA:IMAGE/jpeg;base64,abc',
  ]) {
    assert.equal(editorAiMessageMetadataSchema.safeParse(value).success, false)
  }
  for (const value of [
    { value: 'data:first' },
    { value: 'data:text/plain,hello' },
  ]) {
    assert.deepEqual(editorAiMessageMetadataSchema.parse(value), value)
  }
})

test('message metadata enforces exact UTF-8 serialized byte boundaries', () => {
  const exact = metadataPayloadAtSerializedBytes(MAX_EDITOR_AI_MESSAGE_METADATA_BYTES)
  const over = metadataPayloadAtSerializedBytes(MAX_EDITOR_AI_MESSAGE_METADATA_BYTES + 1)
  assert.equal(new TextEncoder().encode(JSON.stringify(exact)).byteLength, MAX_EDITOR_AI_MESSAGE_METADATA_BYTES)
  assert.equal(editorAiMessageMetadataSchema.safeParse(exact).success, true)
  assert.equal(editorAiMessageMetadataSchema.safeParse(over).success, false)

  const exactMultibyte = metadataPayloadAtSerializedBytes(
    MAX_EDITOR_AI_MESSAGE_METADATA_BYTES,
    'é',
  )
  assert.equal(new TextEncoder().encode(JSON.stringify(exactMultibyte)).byteLength, MAX_EDITOR_AI_MESSAGE_METADATA_BYTES)
  assert.equal(editorAiMessageMetadataSchema.safeParse(exactMultibyte).success, true)
  assert.equal(editorAiMessageMetadataSchema.safeParse({
    payload: `${exactMultibyte.payload}x`,
  }).success, false)
})

test('message metadata preflight rejects active or non-JSON graphs without executing accessors', () => {
  let getterExecuted = false
  const getterValue = {}
  Object.defineProperty(getterValue, 'secret', {
    enumerable: true,
    get: () => { getterExecuted = true; return 'nope' },
  })
  const nonEnumerable = { visible: true }
  Object.defineProperty(nonEnumerable, 'hidden', { enumerable: false, value: true })
  const withSymbol = { visible: true, [Symbol('hidden')]: true }
  const sparse = Array(2)
  sparse[1] = 'present'
  const customPrototype = Object.create({ inherited: true }) as Record<string, unknown>
  customPrototype.visible = true
  const cycle: Record<string, unknown> = {}
  cycle.self = cycle

  for (const value of [
    getterValue,
    nonEnumerable,
    withSymbol,
    sparse,
    customPrototype,
    cycle,
    { value: undefined },
    { value: Number.NaN },
    { value: Number.POSITIVE_INFINITY },
  ]) {
    assert.equal(editorAiMessageMetadataSchema.safeParse(value).success, false)
  }
  assert.equal(getterExecuted, false)
})

test('message metadata rejects shared-reference DAGs before persistence expansion', () => {
  let shared: Record<string, unknown> = { value: 'leaf' }
  for (let depth = 0; depth < 30; depth += 1) {
    shared = { left: shared, right: shared }
  }

  assert.equal(editorAiMessageMetadataSchema.safeParse(shared).success, false)
  assert.equal(editorAiMessageMetadataSchema.safeParse(shared).success, false)
})

test('message metadata depth limit fails closed without recursive overflow', () => {
  const deeplyNested = nestedMetadataTree(10_000)

  assert.doesNotThrow(() => editorAiMessageMetadataSchema.safeParse(deeplyNested))
  assert.equal(editorAiMessageMetadataSchema.safeParse(deeplyNested).success, false)
  assert.equal(
    editorAiMessageMetadataSchema.safeParse(nestedMetadataTree(MAX_INERT_JSON_DEPTH)).success,
    true,
  )
  assert.equal(
    editorAiMessageMetadataSchema.safeParse(nestedMetadataTree(MAX_INERT_JSON_DEPTH + 1)).success,
    false,
  )
})

test('task metadata shares bounded validation while allowing validated DAG references', () => {
  const deepTask = completedTaskMetadata()
  deepTask.changeSet.entries[0].before = nestedMetadataTree(10_000) as JsonValue
  deepTask.changeSet.entries[0].after = nestedMetadataTree(10_000) as JsonValue

  assert.doesNotThrow(() => editorAiTaskMetadataSchema.safeParse(deepTask))
  assert.equal(editorAiTaskMetadataSchema.safeParse(deepTask).success, false)

  const shared = { nested: { value: 'leaf' } }
  const dagTask = completedTaskMetadata()
  dagTask.changeSet.entries[0].before = { left: shared, right: shared }
  dagTask.changeSet.entries[0].after = shared
  assert.equal(editorAiTaskMetadataSchema.safeParse(dagTask).success, true)
  assert.equal(editorAiMessageMetadataSchema.safeParse({ left: shared, right: shared }).success, false)
})

test('message metadata tree contract rejects cycles but accepts distinct equal branches', () => {
  const cycle: Record<string, unknown> = {}
  cycle.self = cycle

  assert.equal(editorAiMessageMetadataSchema.safeParse(cycle).success, false)
  assert.deepEqual(editorAiMessageMetadataSchema.parse({
    left: { nested: { value: 'same' } },
    right: { nested: { value: 'same' } },
  }), {
    left: { nested: { value: 'same' } },
    right: { nested: { value: 'same' } },
  })
})

test('message metadata safely round-trips null prototypes and own __proto__ fields', () => {
  const value = Object.create(null) as Record<string, unknown>
  value.nested = Object.create(null) as Record<string, unknown>
  ;(value.nested as Record<string, unknown>).ok = true
  Object.defineProperty(value, '__proto__', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: { safe: true },
  })

  const parsed = editorAiMessageMetadataSchema.parse(value) as Record<string, unknown>
  assert.deepEqual(parsed.nested, { ok: true })
  assert.equal(Object.prototype.hasOwnProperty.call(parsed, '__proto__'), true)
  assert.deepEqual(parsed.__proto__, { safe: true })
  assert.equal(Object.getPrototypeOf(parsed), Object.prototype)
})

test('task state updates accept only the exact persisted state shape', () => {
  for (const state of ['applied', 'undone', 'redone'] as const) {
    assert.deepEqual(editorAiTaskStateUpdateSchema.parse({ state }), { state })
  }
  for (const value of [
    { state: 'pending' },
    { state: 'applied', status: 'completed' },
    { state: 'applied', extra: true },
  ]) {
    assert.equal(editorAiTaskStateUpdateSchema.safeParse(value).success, false)
  }
})

test('message metadata parsing returns persistence-safe data isolated from inputs', () => {
  const input = { type: 'editor_ai_task' as const, task: completedTaskMetadata() }
  const parsed = readEditorAiTaskMessageMetadata(input)
  assert.notEqual(parsed, input)
  assert.notEqual(parsed?.task, input.task)
  assert.notEqual(parsed?.task.summary, input.task.summary)

  input.task.summary[0] = 'mutated after parsing'
  assert.equal(parsed?.task.summary[0], 'Updated content')
})

test('completed narrative and Zine task metadata parse', () => {
  assert.equal(parseEditorAiTaskMetadata(completedTaskMetadata()).status, 'completed')
  const zine = parseEditorAiTaskMetadata(completedTaskMetadata('zine'))
  assert.equal(zine.capability, 'zine')
  assert.equal(zine.target.spreadId, 'spread-1')
  assert.equal(isEditorAiTaskMetadata(zine), true)
})

test('failed and stopped metadata parse only without applied changes', () => {
  const base = completedTaskMetadata()
  const { changeSet: _changeSet, resultRevision: _resultRevision, ...rest } = base
  assert.equal(parseEditorAiTaskMetadata({ ...rest, status: 'failed' }).status, 'failed')
  assert.equal(parseEditorAiTaskMetadata({ ...rest, status: 'stopped' }).status, 'stopped')
  assert.equal(editorAiTaskMetadataSchema.safeParse({ ...rest, status: 'completed' }).success, false)
  assert.equal(editorAiTaskMetadataSchema.safeParse({ ...base, status: 'failed' }).success, false)
  assert.equal(editorAiTaskMetadataSchema.safeParse({ ...base, status: 'stopped' }).success, false)
})

test('task metadata schemas reject invalid discriminants and unknown keys', () => {
  for (const [field, value] of [
    ['visualMode', 'pixels'], ['status', 'pending'],
  ] as const) {
    assert.equal(editorAiTaskMetadataSchema.safeParse({ ...completedTaskMetadata(), [field]: value }).success, false)
  }
  assert.equal(aiChangeEntrySchema.safeParse({
    ...completedTaskMetadata().changeSet.entries[0], category: 'unknown',
  }).success, false)
  assert.equal(aiChangeSetSchema.safeParse({
    ...completedTaskMetadata().changeSet, state: 'pending',
  }).success, false)
  assert.equal(aiTaskWarningSchema.safeParse({
    code: 'x', message: 'x', severity: 'warning', extra: true,
  }).success, false)
  assert.equal(editorAiTaskMetadataSchema.safeParse({ ...completedTaskMetadata(), extra: true }).success, false)
})

type MetadataPath = Array<string | number>

function metadataWith(path: MetadataPath, value: unknown): unknown {
  const metadata: unknown = structuredClone(completedTaskMetadata('zine'))
  let parent = metadata as Record<string | number, unknown>
  for (const segment of path.slice(0, -1)) {
    parent = parent[segment] as Record<string | number, unknown>
  }
  parent[path.at(-1)!] = value
  return metadata
}

function changeEntries(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    operation: `operation-${index}`, targetId: `target-${index}`, targetLabel: `label-${index}`,
    category: 'content', before: { index }, after: { index: index + 1 },
  }))
}

function taskWarnings(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    code: `warning-${index}`, message: `message-${index}`, severity: 'info',
    targetIds: [`target-${index}`],
  }))
}

function operationSummaries(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    type: `operation-${index}`, targetIds: [`target-${index}`],
  }))
}

test('task metadata enforces exact collection boundaries', () => {
  const cases: Array<[string, MetadataPath, (count: number) => unknown, number]> = [
    ['change-set entries', ['changeSet', 'entries'], changeEntries, 500],
    ['change-set warnings', ['changeSet', 'warnings'], taskWarnings, 100],
    ['warning codes', ['warningCodes'], (count) => Array.from({ length: count }, (_, i) => `code-${i}`), 100],
    ['metadata summaries', ['summary'], (count) => Array.from({ length: count }, (_, i) => `summary-${i}`), 100],
    ['operation summaries', ['operationSummary'], operationSummaries, 100],
    ['warning target IDs', ['changeSet', 'warnings', 0, 'targetIds'], (count) => Array.from({ length: count }, (_, i) => `id-${i}`), 100],
    ['operation summary target IDs', ['operationSummary', 0, 'targetIds'], (count) => Array.from({ length: count }, (_, i) => `id-${i}`), 100],
  ]

  for (const [label, path, build, maximum] of cases) {
    assert.equal(editorAiTaskMetadataSchema.safeParse(metadataWith(path, build(maximum))).success, true, `${label} maximum`)
    assert.equal(editorAiTaskMetadataSchema.safeParse(metadataWith(path, build(maximum + 1))).success, false, `${label} overflow`)
  }
})

test('task metadata enforces every exact short-text boundary', () => {
  const paths: Array<[string, MetadataPath]> = [
    ['task ID', ['taskId']],
    ['target document ID', ['target', 'documentId']],
    ['target spread ID', ['target', 'spreadId']],
    ['model', ['model']],
    ['base revision', ['baseRevision']],
    ['result revision', ['resultRevision']],
    ['change-set task ID', ['changeSet', 'taskId']],
    ['change-set target label', ['changeSet', 'targetLabel']],
    ['warning code', ['changeSet', 'warnings', 0, 'code']],
    ['warning target ID', ['changeSet', 'warnings', 0, 'targetIds', 0]],
    ['change operation', ['changeSet', 'entries', 0, 'operation']],
    ['change target ID', ['changeSet', 'entries', 0, 'targetId']],
    ['change target label', ['changeSet', 'entries', 0, 'targetLabel']],
    ['operation summary type', ['operationSummary', 0, 'type']],
    ['operation summary target ID', ['operationSummary', 0, 'targetIds', 0]],
  ]

  for (const [label, path] of paths) {
    assert.equal(editorAiTaskMetadataSchema.safeParse(metadataWith(path, 'x'.repeat(256))).success, true, `${label} maximum`)
    assert.equal(editorAiTaskMetadataSchema.safeParse(metadataWith(path, 'x'.repeat(257))).success, false, `${label} overflow`)
  }
})

test('task metadata enforces every exact long-text boundary', () => {
  const paths: Array<[string, MetadataPath]> = [
    ['metadata summary', ['summary', 0]],
    ['change-set warning message', ['changeSet', 'warnings', 0, 'message']],
  ]

  for (const [label, path] of paths) {
    assert.equal(editorAiTaskMetadataSchema.safeParse(metadataWith(path, 'x'.repeat(4000))).success, true, `${label} maximum`)
    assert.equal(editorAiTaskMetadataSchema.safeParse(metadataWith(path, 'x'.repeat(4001))).success, false, `${label} overflow`)
  }
})

test('task metadata duration is a finite nonnegative integer', () => {
  assert.equal(editorAiTaskMetadataSchema.safeParse(metadataWith(['durationMs'], 0)).success, true)
  for (const durationMs of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(editorAiTaskMetadataSchema.safeParse(metadataWith(['durationMs'], durationMs)).success, false)
  }
})

test('persisted task metadata recursively rejects comma-less image data prefixes', () => {
  const cases: Array<[string, MetadataPath, unknown]> = [
    ['top-level uppercase prefix', ['summary', 0], 'DATA:IMAGE/png;base64'],
    ['top-level truncated prefix', ['model'], 'data:image/'],
    ['nested before prefix', ['changeSet', 'entries', 0, 'before'], { nested: ['DaTa:ImAgE/svg+xml'] }],
    ['nested after malformed prefix', ['changeSet', 'entries', 0, 'after'], { nested: { source: 'data:image/not-a-real-type' } }],
  ]

  for (const [label, path, value] of cases) {
    assert.equal(editorAiTaskMetadataSchema.safeParse(metadataWith(path, value)).success, false, label)
  }

  assert.equal(editorAiTaskMetadataSchema.safeParse(metadataWith(['summary', 0], 'data:first')).success, true)
  assert.equal(editorAiTaskMetadataSchema.safeParse(metadataWith(['summary', 0], 'data:text/plain,hello')).success, true)
})

test('trimmed task metadata fields reject whitespace-prefixed image data URLs', () => {
  assert.equal(
    editorAiTaskMetadataSchema.safeParse(
      metadataWith(['model'], ' data:image/png;base64,AAAA'),
    ).success,
    false,
  )
  assert.throws(() => parseEditorAiTaskMetadata(
    metadataWith(['target', 'documentId'], '\tDaTa:ImAgE/svg+xml;base64,AAAA'),
  ))
  assert.equal(
    isEditorAiTaskMetadata(
      metadataWith(['changeSet', 'warnings', 0, 'code'], '\nDATA:IMAGE/webp;base64,AAAA'),
    ),
    false,
  )

  const parsed = parseEditorAiTaskMetadata(metadataWith(['model'], '  gpt-editor  '))
  assert.equal(parsed.model, 'gpt-editor')
  assert.equal(
    editorAiTaskMetadataSchema.safeParse(metadataWith(['model'], '  data:first  ')).success,
    true,
  )
  assert.equal(
    editorAiTaskMetadataSchema.safeParse(
      metadataWith(['model'], '\tdata:text/plain,hello\n'),
    ).success,
    true,
  )
})

test('task metadata entry points reject whole-input accessors without execution', () => {
  function accessorMetadata() {
    let executed = false
    const value = completedTaskMetadata()
    Object.defineProperty(value, 'status', {
      enumerable: true,
      get: () => { executed = true; return 'completed' },
    })
    return { value, wasExecuted: () => executed }
  }

  const schemaInput = accessorMetadata()
  assert.equal(editorAiTaskMetadataSchema.safeParse(schemaInput.value).success, false)
  assert.equal(schemaInput.wasExecuted(), false)

  const parserInput = accessorMetadata()
  assert.throws(() => parseEditorAiTaskMetadata(parserInput.value))
  assert.equal(parserInput.wasExecuted(), false)

  const guardInput = accessorMetadata()
  assert.equal(isEditorAiTaskMetadata(guardInput.value), false)
  assert.equal(guardInput.wasExecuted(), false)
})

test('message metadata fails closed when hostile proxy reflection throws', () => {
  const traps: Array<[string, ProxyHandler<Record<string, string>>]> = [
    ['getPrototypeOf', { getPrototypeOf: () => { throw new Error('hostile prototype') } }],
    ['ownKeys', { ownKeys: () => { throw new Error('hostile keys') } }],
    ['getOwnPropertyDescriptor', {
      getOwnPropertyDescriptor: () => { throw new Error('hostile descriptor') },
    }],
  ]

  for (const [label, handler] of traps) {
    const hostile = new Proxy<Record<string, string>>({ value: 'safe' }, handler)
    let result: ReturnType<typeof editorAiMessageMetadataSchema.safeParse> | undefined
    assert.doesNotThrow(() => {
      result = editorAiMessageMetadataSchema.safeParse(hostile)
    }, label)
    assert.equal(result?.success, false, label)
  }
})

test('task metadata rejects nested change accessors without execution', () => {
  let executed = false
  const metadata = completedTaskMetadata()
  Object.defineProperty(metadata.changeSet.entries[0], 'before', {
    enumerable: true,
    get: () => {
      executed = true
      return 'data:image/png;base64,AAAA'
    },
  })

  assert.equal(editorAiTaskMetadataSchema.safeParse(metadata).success, false)
  assert.equal(executed, false)
})

test('task metadata validates deeply shared JSON in linear object visits', () => {
  const depth = 18
  const graphObjects = new WeakSet<object>()
  let shared: Record<string, unknown> = { value: 'leaf' }
  graphObjects.add(shared)
  for (let index = 0; index < depth; index += 1) {
    shared = { left: shared, right: shared }
    graphObjects.add(shared)
  }

  const metadata = completedTaskMetadata()
  const entry = metadata.changeSet.entries[0] as { before?: JsonValue }
  entry.before = shared as JsonValue
  const originalDescriptor = Object.getOwnPropertyDescriptor
  let graphDescriptorReads = 0
  Object.getOwnPropertyDescriptor = ((value: object, key: PropertyKey) => {
    if (graphObjects.has(value)) graphDescriptorReads += 1
    return originalDescriptor(value, key)
  }) as typeof Object.getOwnPropertyDescriptor

  try {
    assert.equal(editorAiTaskMetadataSchema.safeParse(metadata).success, true)
  } finally {
    Object.getOwnPropertyDescriptor = originalDescriptor
  }

  assert.ok(
    graphDescriptorReads <= (depth + 1) * 6,
    `expected linear descriptor reads, received ${graphDescriptorReads}`,
  )
})

test('task metadata rejects a true JSON cycle', () => {
  const cyclic: Record<string, unknown> = {}
  cyclic.self = cyclic
  const metadata = completedTaskMetadata()
  const entry = metadata.changeSet.entries[0] as { before?: JsonValue }
  entry.before = cyclic as JsonValue

  assert.equal(editorAiTaskMetadataSchema.safeParse(metadata).success, false)
})

test('task metadata safely round-trips JsonValue with an own __proto__ key', () => {
  const metadata = completedTaskMetadata()
  const entry = metadata.changeSet.entries[0] as { before?: JsonValue }
  entry.before = JSON.parse('{"__proto__":{"safe":true}}') as JsonValue
  const parsed = parseEditorAiTaskMetadata(metadata)
  assert.equal(parsed.status, 'completed')
  if (parsed.status !== 'completed') throw new Error('Expected completed metadata')
  const before = parsed.changeSet.entries[0].before as Record<string, JsonValue>
  assert.equal(Object.prototype.hasOwnProperty.call(before, '__proto__'), true)
  assert.deepEqual(before.__proto__, { safe: true })
  assert.equal(({} as { safe?: boolean }).safe, undefined)
})

test('summarizeOperations groups, deduplicates, orders targets, and does not mutate', () => {
  const operations = [
    { operationId: '1', type: 'replace_text' as const, nodeId: 'n1', from: 0, to: 1, replacement: 'x' },
    { operationId: '2', type: 'insert_node' as const, parentId: 'root', index: 0, node: {} },
    { operationId: '3', type: 'replace_text' as const, nodeId: 'n1', from: 1, to: 2, replacement: 'y' },
    { operationId: '4', type: 'replace_text' as const, nodeId: 'n2', from: 0, to: 1, replacement: 'z' },
    { operationId: '5', type: 'assign_asset' as const, spreadId: 's', slotId: 'slot-1', assetId: 'asset-1' },
    { operationId: '6', type: 'apply_layout_template' as const, spreadId: 's', templateId: 't', targetSlotIds: ['slot-2', 'slot-1', 'slot-2'] },
  ]
  const snapshot = structuredClone(operations)
  const summary = summarizeOperations(operations)
  assert.deepEqual(summary, [
    { type: 'replace_text', targetIds: ['n1', 'n2'] },
    { type: 'insert_node', targetIds: ['root'] },
    { type: 'assign_asset', targetIds: ['slot-1'] },
    { type: 'apply_layout_template', targetIds: ['slot-2', 'slot-1'] },
  ])
  assert.deepEqual(operations, snapshot)
  assert.notEqual(summary[0].targetIds, summary[1].targetIds)
})
