import assert from 'node:assert/strict'

import { MockLanguageModelV4, simulateReadableStream } from 'ai/test'

import type { DirectEditAgentEvent, DirectEditAgentTask, NarrativeDocumentSnapshot, ZineDocumentSnapshot } from '../src/index'
import {
  EditorAiExecutionError,
  MAX_AI_CHANGE_ENTRIES,
  MAX_AI_LONG_TEXT_LENGTH,
  MAX_AI_SHORT_TEXT_LENGTH,
  MAX_AI_TARGET_IDS,
  MAX_AI_TASK_WARNINGS,
} from '../src/index'
import { VercelAiDirectEditAgentRuntime } from '../src/runtime/vercel-ai/direct-edit-agent'

const MODEL_OPERATION_TEXT_LIMIT = 100_000
const MODEL_OPERATION_JSON_LIMIT = 250_000
const MODEL_TEMPLATE_TARGET_LIMIT = 500
const SUBMIT_SUMMARY_COUNT_LIMIT = MAX_AI_TASK_WARNINGS
const SUBMIT_SUMMARY_TEXT_LIMIT = MAX_AI_LONG_TEXT_LENGTH

type MockStreamPart = Awaited<ReturnType<MockLanguageModelV4['doStream']>>['stream'] extends ReadableStream<infer Part> ? Part : never

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
}

function finish(unified: 'stop' | 'tool-calls'): MockStreamPart {
  return { type: 'finish', finishReason: { unified, raw: undefined }, usage }
}

function model(responses: MockStreamPart[][], inspect?: (options: Parameters<MockLanguageModelV4['doStream']>[0], call: number) => void): MockLanguageModelV4 {
  let call = 0
  return new MockLanguageModelV4({
    doStream: async (options) => {
      inspect?.(options, call)
      const chunks = responses[call++]
      if (!chunks) throw new Error(`Unexpected model call ${call}`)
      return { stream: simulateReadableStream({ chunks, initialDelayInMs: null }) }
    },
  })
}

function narrativeSnapshot(): NarrativeDocumentSnapshot {
  return {
    capability: 'narrative', documentId: 'story-1', documentKind: 'story', root: { type: 'doc' },
    nodes: [{ id: 'p1', type: 'paragraph', index: 0, depth: 1, text: 'Old', attrs: {}, marks: [], childIds: [] }],
    editorWidth: 900,
    visualSegments: [{ id: 'v1', image: { id: 'img1', dataUrl: 'data:image/png;base64,QQ==', mediaType: 'image/png', width: 10, height: 10, byteLength: 1 }, nodeIds: ['p1'], startY: 0, endY: 10 }],
    revision: 'rev-n1',
  }
}

function zineSnapshot(): ZineDocumentSnapshot {
  return {
    capability: 'zine', projectId: 'project-1', targetSpreadId: 'spread-1',
    project: { projectId: 'project-1', settings: {}, spreadOrder: ['spread-1'], spreadSummaries: {} },
    currentSpread: { spreadId: 'spread-1', index: 0, structure: { slots: [{ id: 'slot-1' }] }, summary: {}, preview: { id: 'preview', dataUrl: 'data:image/png;base64,Qg==', mediaType: 'image/png', width: 10, height: 10, byteLength: 1 } },
    adjacentSpreads: [], assetCandidates: [{ assetId: 'asset-1', metadata: {} }], revision: 'rev-z1',
  }
}

function task<Snapshot extends NarrativeDocumentSnapshot | ZineDocumentSnapshot>(snapshot: Snapshot, overrides: Partial<DirectEditAgentTask<Snapshot>> = {}): DirectEditAgentTask<Snapshot> {
  return {
    id: `task-${snapshot.capability}`, taskType: 'instruction', instruction: 'Improve it', snapshot,
    authorization: snapshot.capability === 'zine'
      ? { allowDelete: false, deleteTargetIds: [], targetSpreadId: snapshot.targetSpreadId, projectAssetIds: ['asset-1'] }
      : { allowDelete: false, deleteTargetIds: [] },
    modelCapabilities: { vision: true, structuredOutput: true, toolCalling: true }, ...overrides,
  } as DirectEditAgentTask<Snapshot>
}

function call(toolCallId: string, toolName: string, input: unknown): MockStreamPart {
  return { type: 'tool-call', toolCallId, toolName, input: JSON.stringify(input) }
}

function jsonObjectAtCanonicalLimit(limit: number): { content: string } {
  const emptyLength = JSON.stringify({ content: '' }).length
  return { content: 'x'.repeat(limit - emptyLength) }
}

function toolOutputs(events: DirectEditAgentEvent[]): unknown[] {
  return events.filter((event) => event.type === 'tool_completed').map((event) => event.output)
}

function toolOutput(events: DirectEditAgentEvent[], toolCallId: string): unknown {
  const event = events.find((candidate) => candidate.type === 'tool_completed' && candidate.toolCallId === toolCallId)
  assert.ok(event)
  return event.output
}

function assertInvalidToolInput(events: DirectEditAgentEvent[], toolCallId: string): void {
  assert.equal((toolOutput(events, toolCallId) as { error: { code: string } }).error.code, 'invalid_tool_input')
}

function assertNoAuthoritativeBatchLeak(events: DirectEditAgentEvent[]): void {
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry)
      return
    }
    if (!value || typeof value !== 'object') return
    for (const [key, entry] of Object.entries(value)) {
      assert.equal(
        ['batch', 'operations', 'target', 'baseRevision', 'taskId'].includes(key),
        false,
        `authoritative batch field leaked through ${key}`,
      )
      visit(entry)
    }
  }

  for (const event of events) {
    if (event.type === 'tool_started') visit(event.input)
    if (event.type === 'tool_completed') visit(event.output)
  }
}

function eventIndex(
  events: DirectEditAgentEvent[],
  predicate: (event: DirectEditAgentEvent) => boolean,
): number {
  const index = events.findIndex(predicate)
  assert.notEqual(index, -1)
  return index
}

async function collect<Snapshot extends NarrativeDocumentSnapshot | ZineDocumentSnapshot>(runtime: VercelAiDirectEditAgentRuntime, currentTask: DirectEditAgentTask<Snapshot>, signal?: AbortSignal): Promise<DirectEditAgentEvent<Snapshot>[]> {
  const events: DirectEditAgentEvent<Snapshot>[] = []
  for await (const event of runtime.run(currentTask, { signal })) events.push(event)
  return events
}

function runtime(languageModel: MockLanguageModelV4, options: { maxSteps?: number; maxAutoFixIterations?: number } = {}): VercelAiDirectEditAgentRuntime {
  return new VercelAiDirectEditAgentRuntime({ endpoint: { baseURL: 'http://localhost/v1' }, model: 'mock', languageModel, ...options })
}

async function collectFailure<Snapshot extends NarrativeDocumentSnapshot | ZineDocumentSnapshot>(
  currentRuntime: VercelAiDirectEditAgentRuntime,
  currentTask: DirectEditAgentTask<Snapshot>,
  signal?: AbortSignal,
): Promise<{ events: DirectEditAgentEvent<Snapshot>[]; error: unknown }> {
  const events: DirectEditAgentEvent<Snapshot>[] = []
  let thrown: unknown
  try {
    for await (const event of currentRuntime.run(currentTask, { signal })) events.push(event)
  } catch (error) {
    thrown = error
  }
  return { events, error: thrown }
}

async function requestedToolNames<Snapshot extends NarrativeDocumentSnapshot | ZineDocumentSnapshot>(
  currentTask: DirectEditAgentTask<Snapshot>,
): Promise<string[]> {
  let names: string[] = []
  await collectFailure(runtime(model([[finish('stop')]], (options, callIndex) => {
    if (callIndex === 0) names = (options.tools ?? []).map((entry) => entry.name).toSorted()
  })), currentTask)
  return names
}

async function test(name: string, run: () => Promise<void>): Promise<void> {
  await run()
  console.log(`✓ ${name}`)
}

await test('creates one authoritative narrative batch without proposal events or mutation', async () => {
  const currentTask = task(narrativeSnapshot())
  const before = JSON.stringify(currentTask)
  const events = await collect(runtime(model([
    [call('read', 'read_snapshot', {}), finish('tool-calls')],
    [call('add', 'add_narrative_operation', { operationId: 'op-1', type: 'replace_text', nodeId: 'p1', from: 0, to: 3, replacement: 'New' }), finish('tool-calls')],
    [call('warn', 'report_warning', { code: 'visual_review_recommended', message: 'Review the final rhythm.', severity: 'warning', targetIds: ['p1'] }), finish('tool-calls')],
    [call('submit', 'submit_operation_batch', { summary: ['Updated opening'] }), finish('tool-calls')],
    [{ type: 'text-start', id: 't' }, { type: 'text-delta', id: 't', delta: 'Done.' }, { type: 'text-end', id: 't' }, finish('stop')],
  ])), currentTask)
  const batches = events.filter((event) => event.type === 'operation_batch_created')
  const completed = events.filter((event) => event.type === 'completed')
  const completedStatuses = events.filter((event) => event.type === 'status_changed' && event.status === 'completed')
  assert.equal(batches.length, 1)
  assert.deepEqual(batches[0].batch, { taskId: currentTask.id, capability: 'narrative', baseRevision: 'rev-n1', target: { documentId: 'story-1' }, operations: [{ operationId: 'op-1', type: 'replace_text', nodeId: 'p1', from: 0, to: 3, replacement: 'New' }], summary: ['Updated opening'] })
  assert.equal(completed.length, 1)
  assert.deepEqual(completed[0], { type: 'completed', summary: ['Updated opening'] })
  assert.equal(completedStatuses.length, 1)
  assert.deepEqual(toolOutput(events, 'submit'), {
    ok: true,
    submitted: true,
    operationCount: 1,
    summaryCount: 1,
  })
  assertNoAuthoritativeBatchLeak(events.filter((event) => (
    event.type === 'tool_started' && event.toolCallId === 'submit'
  ) || (
    event.type === 'tool_completed' && event.toolCallId === 'submit'
  )))

  const preparingIndex = eventIndex(events, (event) => event.type === 'status_changed' && event.status === 'preparing_context')
  const analyzingIndex = eventIndex(events, (event) => event.type === 'status_changed' && event.status === 'analyzing')
  const planningIndex = eventIndex(events, (event) => event.type === 'status_changed' && event.status === 'planning')
  assert.ok(preparingIndex < analyzingIndex && analyzingIndex < planningIndex)

  for (const toolCallId of ['read', 'add', 'warn', 'submit']) {
    const startedIndex = eventIndex(events, (event) => event.type === 'tool_started' && event.toolCallId === toolCallId)
    const toolCompletedIndex = eventIndex(events, (event) => event.type === 'tool_completed' && event.toolCallId === toolCallId)
    assert.ok(startedIndex < toolCompletedIndex, toolCallId)
  }
  const warningCompletionIndex = eventIndex(events, (event) => event.type === 'tool_completed' && event.toolCallId === 'warn')
  const warningIndex = eventIndex(events, (event) => event.type === 'warning')
  const operationCompletionIndex = eventIndex(events, (event) => event.type === 'tool_completed' && event.toolCallId === 'add')
  const finalToolOrTextIndex = events.reduce((latest, event, index) => (
    event.type === 'tool_started' || event.type === 'tool_completed' || event.type === 'text_delta' ? index : latest
  ), -1)
  const batchIndex = eventIndex(events, (event) => event.type === 'operation_batch_created')
  const completedIndex = eventIndex(events, (event) => event.type === 'completed')
  const completedStatusIndex = eventIndex(events, (event) => event.type === 'status_changed' && event.status === 'completed')
  assert.ok(warningCompletionIndex < warningIndex)
  assert.ok(operationCompletionIndex < batchIndex)
  assert.ok(finalToolOrTextIndex < batchIndex)
  assert.ok(batchIndex < completedIndex && completedIndex < completedStatusIndex)
  assert.equal(events.some((event) => ['error', 'proposal_created', 'approval_required'].includes(event.type)), false)
  assert.equal(events.some((event) => event.type === 'status_changed' && ['failed', 'stopped'].includes(event.status)), false)
  assert.equal(JSON.stringify(currentTask), before)
})

await test('bounds aggregate accepted operations across one model step', async () => {
  const acceptedCalls = Array.from({ length: MAX_AI_CHANGE_ENTRIES }, (_, index) => call(
    `add-${index}`,
    'add_narrative_operation',
    { operationId: `op-${index}`, type: 'replace_text', nodeId: 'p1', from: 0, to: 0, replacement: `${index}` },
  ))
  const eventsAtLimit = await collect(runtime(model([
    [...acceptedCalls, call('submit-at-limit', 'submit_operation_batch', { summary: ['Bounded'] }), finish('tool-calls')],
    [finish('stop')],
  ])), task(narrativeSnapshot()))
  const batchAtLimit = eventsAtLimit.find((event) => event.type === 'operation_batch_created')
  assert.ok(batchAtLimit)
  assert.equal(batchAtLimit.batch.operations.length, MAX_AI_CHANGE_ENTRIES)

  const eventsOverLimit = await collect(runtime(model([
    [
      ...acceptedCalls,
      call('add-over-limit', 'add_narrative_operation', { operationId: 'op-over-limit', type: 'replace_text', nodeId: 'p1', from: 0, to: 0, replacement: 'overflow' }),
      call('submit-over-limit', 'submit_operation_batch', { summary: ['Still bounded'] }),
      finish('tool-calls'),
    ],
    [finish('stop')],
  ])), task(narrativeSnapshot()))
  const rejected = toolOutput(eventsOverLimit, 'add-over-limit') as { error: { code: string } }
  const boundedBatch = eventsOverLimit.find((event) => event.type === 'operation_batch_created')
  assert.equal(rejected.error.code, 'operation_limit_exceeded')
  assert.ok(boundedBatch)
  assert.equal(boundedBatch.batch.operations.length, MAX_AI_CHANGE_ENTRIES)
  assert.equal(boundedBatch.batch.operations.some((operation) => operation.operationId === 'op-over-limit'), false)
})

await test('bounds aggregate accepted warnings across one model step', async () => {
  const warningCalls = Array.from({ length: MAX_AI_TASK_WARNINGS }, (_, index) => call(
    `warning-${index}`,
    'report_warning',
    { code: `warning-${index}`, message: `Warning ${index}`, severity: 'warning' },
  ))
  const events = await collect(runtime(model([
    [
      ...warningCalls,
      call('warning-over-limit', 'report_warning', { code: 'warning-over-limit', message: 'Overflow', severity: 'warning' }),
      call('submit-warning-limit', 'submit_operation_batch', { summary: ['Warnings bounded'] }),
      finish('tool-calls'),
    ],
    [finish('stop')],
  ])), task(narrativeSnapshot()))
  const rejected = toolOutput(events, 'warning-over-limit') as { error: { code: string } }
  assert.equal(rejected.error.code, 'warning_limit_exceeded')
  assert.equal(events.filter((event) => event.type === 'warning').length, MAX_AI_TASK_WARNINGS)
  assert.equal(events.filter((event) => event.type === 'operation_batch_created').length, 1)
})

await test('snapshots all task truth before the first status event', async () => {
  const originalTask = task(zineSnapshot(), {
    id: 'task-local-copy',
    instruction: 'Keep the original instruction',
    authorization: {
      allowDelete: true,
      deleteTargetIds: ['slot-1'],
      targetSpreadId: 'spread-1',
      projectAssetIds: ['asset-1'],
    },
  })
  let modelInput = ''
  const currentRuntime = runtime(model([
    [
      call('assign-original', 'add_zine_operation', { operationId: 'assign-original', type: 'assign_asset', spreadId: 'spread-1', slotId: 'slot-1', assetId: 'asset-1' }),
      call('assign-injected', 'add_zine_operation', { operationId: 'assign-injected', type: 'assign_asset', spreadId: 'spread-1', slotId: 'slot-1', assetId: 'asset-injected' }),
      call('delete-original', 'delete_slot', { operationId: 'delete-original', spreadId: 'spread-1', slotId: 'slot-1' }),
      call('submit-local-copy', 'submit_operation_batch', { summary: ['Used local truth'] }),
      finish('tool-calls'),
    ],
    [finish('stop')],
  ], (options) => {
    modelInput = JSON.stringify(options)
  }))
  const iterator = currentRuntime.run(originalTask)[Symbol.asyncIterator]()
  assert.deepEqual(await iterator.next(), {
    done: false,
    value: { type: 'status_changed', status: 'preparing_context' },
  })

  const mutableTask = originalTask as unknown as {
    instruction: string
    snapshot: ZineDocumentSnapshot
    authorization: {
      allowDelete: boolean
      deleteTargetIds: string[]
      targetSpreadId?: string
      projectAssetIds?: string[]
    }
    modelCapabilities: {
      vision: boolean
      structuredOutput: boolean
      toolCalling: boolean
    }
  }
  mutableTask.instruction = 'Injected instruction'
  mutableTask.snapshot.projectId = 'project-injected'
  mutableTask.snapshot.targetSpreadId = 'spread-injected'
  mutableTask.snapshot.currentSpread.spreadId = 'spread-injected'
  mutableTask.snapshot.revision = 'rev-injected'
  mutableTask.authorization.targetSpreadId = 'spread-injected'
  mutableTask.authorization.projectAssetIds = ['asset-injected']
  mutableTask.authorization.deleteTargetIds = []
  mutableTask.modelCapabilities.toolCalling = false

  const events: DirectEditAgentEvent<ZineDocumentSnapshot>[] = []
  for (;;) {
    const result = await iterator.next()
    if (result.done) break
    events.push(result.value)
  }

  assert.match(modelInput, /Keep the original instruction/)
  assert.doesNotMatch(modelInput, /Injected instruction|project-injected|spread-injected|rev-injected/)
  assert.equal((toolOutput(events, 'assign-original') as { ok: boolean }).ok, true)
  assert.equal((toolOutput(events, 'assign-injected') as { error: { code: string } }).error.code, 'asset_not_in_project')
  assert.equal((toolOutput(events, 'delete-original') as { ok: boolean }).ok, true)
  const batch = events.find((event) => event.type === 'operation_batch_created')
  assert.ok(batch)
  assert.deepEqual(batch.batch.target, { documentId: 'project-1', spreadId: 'spread-1' })
  assert.equal(batch.batch.baseRevision, 'rev-z1')
  assert.deepEqual(batch.batch.operations.map((operation) => operation.operationId), ['assign-original', 'delete-original'])
})

await test('keeps concurrent runs on one runtime instance independent', async () => {
  const sharedRuntime = runtime(model([
    [
      call('run-a-add', 'add_narrative_operation', { operationId: 'run-a-op', type: 'replace_text', nodeId: 'p1', from: 0, to: 0, replacement: 'A' }),
      call('run-a-warning', 'report_warning', { code: 'run-a-warning', message: 'A', severity: 'info' }),
      call('run-a-submit', 'submit_operation_batch', { summary: ['A'] }),
      finish('tool-calls'),
    ],
    [
      call('run-b-add', 'add_narrative_operation', { operationId: 'run-b-op', type: 'replace_text', nodeId: 'p1', from: 0, to: 0, replacement: 'B' }),
      call('run-b-warning', 'report_warning', { code: 'run-b-warning', message: 'B', severity: 'info' }),
      call('run-b-submit', 'submit_operation_batch', { summary: ['B'] }),
      finish('tool-calls'),
    ],
    [finish('stop')],
    [finish('stop')],
  ]))
  const [eventsA, eventsB] = await Promise.all([
    collect(sharedRuntime, task(narrativeSnapshot(), { id: 'run-a' })),
    collect(sharedRuntime, task(narrativeSnapshot(), { id: 'run-b' })),
  ])
  const batchA = eventsA.find((event) => event.type === 'operation_batch_created')
  const batchB = eventsB.find((event) => event.type === 'operation_batch_created')
  assert.ok(batchA)
  assert.ok(batchB)
  assert.equal(batchA.batch.taskId, 'run-a')
  assert.equal(batchB.batch.taskId, 'run-b')
  assert.deepEqual(batchA.batch.operations.map((operation) => operation.operationId), ['run-a-op'])
  assert.deepEqual(batchB.batch.operations.map((operation) => operation.operationId), ['run-b-op'])
  assert.equal(eventsA.filter((event) => event.type === 'warning').length, 1)
  assert.equal(eventsB.filter((event) => event.type === 'warning').length, 1)
})

await test('creates an exact empty Narrative batch from task-owned identity', async () => {
  const currentTask = task(narrativeSnapshot(), { id: 'task-empty-narrative' })
  const events = await collect(runtime(model([
    [call('submit-empty-narrative', 'submit_operation_batch', { summary: ['No narrative changes'] }), finish('tool-calls')],
    [finish('stop')],
  ])), currentTask)
  const batch = events.find((event) => event.type === 'operation_batch_created')

  assert.ok(batch)
  assert.deepEqual(batch.batch, {
    taskId: 'task-empty-narrative',
    capability: 'narrative',
    baseRevision: 'rev-n1',
    target: { documentId: 'story-1' },
    operations: [],
    summary: ['No narrative changes'],
  })
  assert.equal('spreadId' in batch.batch.target, false)
})

await test('creates an exact empty Zine batch from snapshot and authorization identity', async () => {
  const currentTask = task(zineSnapshot(), { id: 'task-empty-zine' })
  const events = await collect(runtime(model([
    [call('submit-empty-zine', 'submit_operation_batch', { summary: ['No Zine changes'] }), finish('tool-calls')],
    [finish('stop')],
  ])), currentTask)
  const batch = events.find((event) => event.type === 'operation_batch_created')

  assert.ok(batch)
  assert.deepEqual(batch.batch, {
    taskId: 'task-empty-zine',
    capability: 'zine',
    baseRevision: 'rev-z1',
    target: { documentId: 'project-1', spreadId: 'spread-1' },
    operations: [],
    summary: ['No Zine changes'],
  })
})

await test('rejects unknown properties from every Narrative tool schema', async () => {
  const currentTask = task(narrativeSnapshot(), {
    authorization: { allowDelete: true, deleteTargetIds: ['p1'] },
  })
  const validOperation = {
    operationId: 'narrative-valid', type: 'replace_text' as const, nodeId: 'p1', from: 0, to: 3, replacement: 'New',
  }
  const events = await collect(runtime(model([
    [call('read-extra', 'read_snapshot', { extra: true }), finish('tool-calls')],
    [call('read-valid', 'read_snapshot', {}), finish('tool-calls')],
    [call('add-extra', 'add_narrative_operation', { ...validOperation, extra: true }), finish('tool-calls')],
    [call('add-valid', 'add_narrative_operation', validOperation), finish('tool-calls')],
    [call('delete-extra', 'delete_node', { operationId: 'delete-extra', nodeId: 'p1', extra: true }), finish('tool-calls')],
    [call('warning-extra', 'report_warning', { code: 'review', message: 'Review it.', severity: 'warning', extra: true }), finish('tool-calls')],
    [call('submit-extra', 'submit_operation_batch', { summary: ['Invalid'], extra: true }), finish('tool-calls')],
    [call('submit-valid', 'submit_operation_batch', { summary: ['Valid'] }), finish('tool-calls')],
    [finish('stop')],
  ]), { maxAutoFixIterations: 10 }), currentTask)

  for (const toolCallId of ['read-extra', 'add-extra', 'delete-extra', 'warning-extra', 'submit-extra']) {
    assertInvalidToolInput(events, toolCallId)
  }
  const readOutput = toolOutput(events, 'read-valid') as { ok: boolean; snapshot: unknown }
  assert.equal(readOutput.ok, true)
  assert.equal(JSON.stringify(readOutput.snapshot).includes('dataUrl'), false)
  assert.equal(events.some((event) => event.type === 'warning'), false)
  const batch = events.find((event) => event.type === 'operation_batch_created')
  assert.ok(batch)
  assert.deepEqual(batch.batch.operations, [validOperation])
  assert.deepEqual(batch.batch.summary, ['Valid'])
})

await test('rejects unknown properties from every Zine operation and delete schema', async () => {
  const currentTask = task(zineSnapshot(), {
    authorization: { allowDelete: true, deleteTargetIds: ['slot-1'], targetSpreadId: 'spread-1', projectAssetIds: ['asset-1'] },
  })
  const validOperation = {
    operationId: 'zine-valid', type: 'set_image_crop' as const, spreadId: 'spread-1', slotId: 'slot-1',
    crop: { scale: 1, offsetX: 0, offsetY: 0, rotation: 0 },
  }
  const events = await collect(runtime(model([
    [call('zine-extra', 'add_zine_operation', { ...validOperation, extra: true }), finish('tool-calls')],
    [call('zine-nested-extra', 'add_zine_operation', { ...validOperation, operationId: 'zine-nested-extra', crop: { ...validOperation.crop, extra: true } }), finish('tool-calls')],
    [call('zine-valid', 'add_zine_operation', validOperation), finish('tool-calls')],
    [call('slot-extra', 'delete_slot', { operationId: 'slot-extra', spreadId: 'spread-1', slotId: 'slot-1', extra: true }), finish('tool-calls')],
    [call('zine-submit', 'submit_operation_batch', { summary: ['Valid Zine operation'] }), finish('tool-calls')],
    [finish('stop')],
  ]), { maxAutoFixIterations: 10 }), currentTask)

  for (const toolCallId of ['zine-extra', 'zine-nested-extra', 'slot-extra']) {
    assertInvalidToolInput(events, toolCallId)
  }
  const batch = events.find((event) => event.type === 'operation_batch_created')
  assert.ok(batch)
  assert.deepEqual(batch.batch.operations, [validOperation])
})

await test('enforces exact report_warning text boundaries', async () => {
  const exactCode = 'c'.repeat(MAX_AI_SHORT_TEXT_LENGTH)
  const exactMessage = 'm'.repeat(MAX_AI_LONG_TEXT_LENGTH)
  const events = await collect(runtime(model([
    [call('code-too-long', 'report_warning', { code: `${exactCode}c`, message: 'm', severity: 'warning' }), finish('tool-calls')],
    [call('message-too-long', 'report_warning', { code: 'c', message: `${exactMessage}m`, severity: 'info' }), finish('tool-calls')],
    [call('warning-exact-text', 'report_warning', { code: exactCode, message: exactMessage, severity: 'warning' }), finish('tool-calls')],
    [call('warning-text-submit', 'submit_operation_batch', { summary: ['Warnings checked'] }), finish('tool-calls')],
    [finish('stop')],
  ]), { maxAutoFixIterations: 10 }), task(narrativeSnapshot()))

  assertInvalidToolInput(events, 'code-too-long')
  assertInvalidToolInput(events, 'message-too-long')
  const warnings = events.filter((event) => event.type === 'warning')
  assert.deepEqual(warnings, [{
    type: 'warning',
    warning: { code: exactCode, message: exactMessage, severity: 'warning' },
  }])
})

await test('enforces exact report_warning target boundaries', async () => {
  const exactTargetId = 't'.repeat(MAX_AI_SHORT_TEXT_LENGTH)
  const exactTargets = Array.from({ length: MAX_AI_TARGET_IDS }, (_, index) => `target-${index}`)
  const events = await collect(runtime(model([
    [call('target-too-long', 'report_warning', { code: 'target', message: 'm', severity: 'warning', targetIds: [`${exactTargetId}t`] }), finish('tool-calls')],
    [call('targets-too-many', 'report_warning', { code: 'count', message: 'm', severity: 'info', targetIds: [...exactTargets, 'target-overflow'] }), finish('tool-calls')],
    [call('warning-exact-id', 'report_warning', { code: 'exact-id', message: 'Exact ID', severity: 'warning', targetIds: [exactTargetId] }), finish('tool-calls')],
    [call('warning-exact-count', 'report_warning', { code: 'exact-count', message: 'Exact count', severity: 'info', targetIds: exactTargets }), finish('tool-calls')],
    [call('warning-target-submit', 'submit_operation_batch', { summary: ['Warning targets checked'] }), finish('tool-calls')],
    [finish('stop')],
  ]), { maxAutoFixIterations: 10 }), task(narrativeSnapshot()))

  assertInvalidToolInput(events, 'target-too-long')
  assertInvalidToolInput(events, 'targets-too-many')
  const warnings = events.filter((event) => event.type === 'warning')
  assert.deepEqual(warnings, [
    { type: 'warning', warning: { code: 'exact-id', message: 'Exact ID', severity: 'warning', targetIds: [exactTargetId] } },
    { type: 'warning', warning: { code: 'exact-count', message: 'Exact count', severity: 'info', targetIds: exactTargets } },
  ])
})

await test('bounds every model-produced non-delete text and JSON payload', async () => {
  const exactJson = jsonObjectAtCanonicalLimit(MODEL_OPERATION_JSON_LIMIT)
  const oversizedJson = jsonObjectAtCanonicalLimit(MODEL_OPERATION_JSON_LIMIT + 1)
  const cases = [
    {
      name: 'Narrative replacement', capability: 'narrative' as const,
      exact: { operationId: 'replacement-exact', type: 'replace_text', nodeId: 'p1', from: 0, to: 3, replacement: 'x'.repeat(MODEL_OPERATION_TEXT_LIMIT) },
      oversized: { operationId: 'replacement-oversized', type: 'replace_text', nodeId: 'p1', from: 0, to: 3, replacement: 'x'.repeat(MODEL_OPERATION_TEXT_LIMIT + 1) },
    },
    {
      name: 'Narrative attrs', capability: 'narrative' as const,
      exact: { operationId: 'narrative-attrs-exact', type: 'set_node_attrs', nodeId: 'p1', attrs: exactJson },
      oversized: { operationId: 'narrative-attrs-oversized', type: 'set_node_attrs', nodeId: 'p1', attrs: oversizedJson },
    },
    {
      name: 'inserted Narrative node', capability: 'narrative' as const,
      exact: { operationId: 'node-exact', type: 'insert_node', parentId: 'p1', index: 0, node: exactJson },
      oversized: { operationId: 'node-oversized', type: 'insert_node', parentId: 'p1', index: 0, node: oversizedJson },
    },
    {
      name: 'Zine attrs', capability: 'zine' as const,
      exact: { operationId: 'zine-attrs-exact', type: 'set_slot_attrs', spreadId: 'spread-1', slotId: 'slot-1', attrs: exactJson },
      oversized: { operationId: 'zine-attrs-oversized', type: 'set_slot_attrs', spreadId: 'spread-1', slotId: 'slot-1', attrs: oversizedJson },
    },
    {
      name: 'inserted Zine slot', capability: 'zine' as const,
      exact: { operationId: 'slot-exact', type: 'insert_slot', spreadId: 'spread-1', index: 0, slot: exactJson },
      oversized: { operationId: 'slot-oversized', type: 'insert_slot', spreadId: 'spread-1', index: 0, slot: oversizedJson },
    },
    {
      name: 'Zine template options', capability: 'zine' as const,
      exact: { operationId: 'options-exact', type: 'apply_layout_template', spreadId: 'spread-1', templateId: 'template-1', targetSlotIds: [], options: exactJson },
      oversized: { operationId: 'options-oversized', type: 'apply_layout_template', spreadId: 'spread-1', templateId: 'template-1', targetSlotIds: [], options: oversizedJson },
    },
  ]

  for (const boundaryCase of cases) {
    const toolName = boundaryCase.capability === 'narrative' ? 'add_narrative_operation' : 'add_zine_operation'
    const currentRuntime = runtime(model([
      [call(`${boundaryCase.name}-oversized`, toolName, boundaryCase.oversized), finish('tool-calls')],
      [call(`${boundaryCase.name}-exact`, toolName, boundaryCase.exact), finish('tool-calls')],
      [call(`${boundaryCase.name}-submit`, 'submit_operation_batch', { summary: [boundaryCase.name] }), finish('tool-calls')],
      [finish('stop')],
    ]))
    const events = boundaryCase.capability === 'narrative'
      ? await collect(currentRuntime, task(narrativeSnapshot()))
      : await collect(currentRuntime, task(zineSnapshot()))
    const outputs = toolOutputs(events)
    const batch = events.find((event) => event.type === 'operation_batch_created')

    assert.equal((outputs[0] as { error: { code: string } }).error.code, 'invalid_tool_input', boundaryCase.name)
    assert.ok(batch, boundaryCase.name)
    assert.deepEqual(batch.batch.operations, [boundaryCase.exact], boundaryCase.name)
  }
})

await test('bounds Zine template targetSlotIds at 500', async () => {
  const exactTargets = Array.from({ length: MODEL_TEMPLATE_TARGET_LIMIT }, (_, index) => `slot-${index}`)
  const oversizedTargets = [...exactTargets, 'slot-500']
  const events = await collect(runtime(model([
    [call('targets-oversized', 'add_zine_operation', { operationId: 'targets-oversized', type: 'apply_layout_template', spreadId: 'spread-1', templateId: 'template-1', targetSlotIds: oversizedTargets }), finish('tool-calls')],
    [call('targets-exact', 'add_zine_operation', { operationId: 'targets-exact', type: 'apply_layout_template', spreadId: 'spread-1', templateId: 'template-1', targetSlotIds: exactTargets }), finish('tool-calls')],
    [call('targets-submit', 'submit_operation_batch', { summary: ['Applied template'] }), finish('tool-calls')],
    [finish('stop')],
  ])), task(zineSnapshot()))
  const outputs = toolOutputs(events)
  const batch = events.find((event) => event.type === 'operation_batch_created')

  assert.equal((outputs[0] as { error: { code: string } }).error.code, 'invalid_tool_input')
  assert.ok(batch)
  assert.deepEqual(batch.batch.operations, [{ operationId: 'targets-exact', type: 'apply_layout_template', spreadId: 'spread-1', templateId: 'template-1', targetSlotIds: exactTargets }])
})

await test('bounds submitted summary item text and array count', async () => {
  const exactText = 's'.repeat(SUBMIT_SUMMARY_TEXT_LIMIT)
  const exactCount = Array.from({ length: SUBMIT_SUMMARY_COUNT_LIMIT }, (_, index) => `Summary ${index}`)
  const events = await collect(runtime(model([
    [call('summary-text-oversized', 'submit_operation_batch', { summary: [`${exactText}s`] }), finish('tool-calls')],
    [call('summary-count-oversized', 'submit_operation_batch', { summary: [...exactCount, 'Summary 100'] }), finish('tool-calls')],
    [call('summary-exact-text', 'submit_operation_batch', { summary: [exactText] }), finish('tool-calls')],
    [finish('stop')],
  ])), task(narrativeSnapshot()))
  const outputs = toolOutputs(events)
  const batch = events.find((event) => event.type === 'operation_batch_created')

  assert.equal((outputs[0] as { error: { code: string } }).error.code, 'invalid_tool_input')
  assert.equal((outputs[1] as { error: { code: string } }).error.code, 'invalid_tool_input')
  assert.ok(batch)
  assert.deepEqual(batch.batch.summary, [exactText])

  const countEvents = await collect(runtime(model([
    [call('summary-exact-count', 'submit_operation_batch', { summary: exactCount }), finish('tool-calls')],
    [finish('stop')],
  ])), task(narrativeSnapshot()))
  const countBatch = countEvents.find((event) => event.type === 'operation_batch_created')
  assert.ok(countBatch)
  assert.deepEqual(countBatch.batch.summary, exactCount)
})

await test('creates correct Zine target and rejects wrong spread and foreign asset', async () => {
  const events = await collect(runtime(model([
    [call('wrong-spread', 'add_zine_operation', { operationId: 'bad-1', type: 'set_slot_attrs', spreadId: 'spread-2', slotId: 'slot-1', attrs: {} }), finish('tool-calls')],
    [call('foreign-asset', 'add_zine_operation', { operationId: 'bad-2', type: 'assign_asset', spreadId: 'spread-1', slotId: 'slot-1', assetId: 'asset-x' }), finish('tool-calls')],
    [call('good', 'add_zine_operation', { operationId: 'op-z', type: 'assign_asset', spreadId: 'spread-1', slotId: 'slot-1', assetId: 'asset-1' }), finish('tool-calls')],
    [call('submit-z', 'submit_operation_batch', { summary: ['Assigned asset'] }), finish('tool-calls')],
    [finish('stop')],
  ])), task(zineSnapshot()))
  const outputs = events.filter((event) => event.type === 'tool_completed').map((event) => event.output)
  assert.equal((outputs[0] as { error: { code: string } }).error.code, 'wrong_target_spread')
  assert.equal((outputs[1] as { error: { code: string } }).error.code, 'asset_not_in_project')
  const batch = events.find((event) => event.type === 'operation_batch_created')
  assert.ok(batch)
  assert.deepEqual(batch.batch.target, { documentId: 'project-1', spreadId: 'spread-1' })
})

await test('rejects mismatched Zine authorization identity before model invocation', async () => {
  let invocationCount = 0
  const currentTask = task(zineSnapshot(), {
    authorization: { allowDelete: false, deleteTargetIds: [], targetSpreadId: 'spread-2', projectAssetIds: ['asset-1'] },
  })
  const result = await collectFailure(runtime(model([], () => { invocationCount += 1 })), currentTask)

  assert.equal(invocationCount, 0)
  assert.ok(result.error instanceof EditorAiExecutionError)
  assert.equal(result.error.code, 'operation_not_authorized')
  assert.deepEqual(result.events.slice(-2), [
    { type: 'error', code: 'operation_not_authorized', message: 'Zine snapshot target spread does not match the authorized target spread' },
    { type: 'status_changed', status: 'failed' },
  ])
  assert.equal(result.events.some((event) => event.type === 'operation_batch_created' || event.type === 'completed'), false)
})

await test('rejects Narrative authorization with a Zine spread target before model invocation', async () => {
  let invocationCount = 0
  const currentTask = task(narrativeSnapshot(), {
    authorization: { allowDelete: false, deleteTargetIds: [], targetSpreadId: 'spread-1' },
  })
  const result = await collectFailure(runtime(model([], () => { invocationCount += 1 })), currentTask)

  assert.equal(invocationCount, 0)
  assert.ok(result.error instanceof EditorAiExecutionError)
  assert.equal(result.error.code, 'operation_not_authorized')
  assert.deepEqual(result.events.slice(-2), [
    { type: 'error', code: 'operation_not_authorized', message: 'Narrative tasks cannot authorize a target spread' },
    { type: 'status_changed', status: 'failed' },
  ])
})

await test('enforces delete tool exposure and exact targets', async () => {
  const commonTools = ['read_snapshot', 'report_warning', 'submit_operation_batch']
  assert.deepEqual(
    await requestedToolNames(task(narrativeSnapshot())),
    [...commonTools, 'add_narrative_operation'].toSorted(),
  )
  assert.deepEqual(
    await requestedToolNames(task(narrativeSnapshot(), { authorization: { allowDelete: true, deleteTargetIds: ['p1'] } })),
    [...commonTools, 'add_narrative_operation', 'delete_node'].toSorted(),
  )
  assert.deepEqual(
    await requestedToolNames(task(zineSnapshot())),
    [...commonTools, 'add_zine_operation'].toSorted(),
  )
  assert.deepEqual(
    await requestedToolNames(task(zineSnapshot(), {
      authorization: { allowDelete: true, deleteTargetIds: ['slot-1'], targetSpreadId: 'spread-1', projectAssetIds: ['asset-1'] },
    })),
    [...commonTools, 'add_zine_operation', 'delete_slot'].toSorted(),
  )

  const narrativeAuthorized = task(narrativeSnapshot(), { authorization: { allowDelete: true, deleteTargetIds: ['p1'] } })
  const { events: narrativeEvents } = await collectFailure(runtime(model([
    [call('bad-delete', 'delete_node', { operationId: 'delete-1', nodeId: 'p2' }), finish('tool-calls')],
    [finish('stop')],
  ])), narrativeAuthorized)
  const narrativeCompleted = narrativeEvents.find((event) => event.type === 'tool_completed')
  assert.ok(narrativeCompleted && (narrativeCompleted.output as { error: { code: string } }).error.code === 'delete_target_not_authorized')
  assert.equal(narrativeEvents.some((event) => event.type === 'operation_batch_created'), false)

  const zineAuthorized = task(zineSnapshot(), {
    authorization: { allowDelete: true, deleteTargetIds: ['slot-1'], targetSpreadId: 'spread-1', projectAssetIds: ['asset-1'] },
  })
  const zineEvents = await collect(runtime(model([
    [call('bad-zine-delete', 'delete_slot', { operationId: 'delete-bad', spreadId: 'spread-1', slotId: 'slot-2' }), finish('tool-calls')],
    [call('good-zine-delete', 'delete_slot', { operationId: 'delete-good', spreadId: 'spread-1', slotId: 'slot-1' }), finish('tool-calls')],
    [call('submit-zine-delete', 'submit_operation_batch', { summary: ['Deleted authorized slot'] }), finish('tool-calls')],
    [finish('stop')],
  ])), zineAuthorized)
  const zineOutputs = toolOutputs(zineEvents)
  assert.equal((zineOutputs[0] as { error: { code: string } }).error.code, 'delete_target_not_authorized')
  assert.deepEqual(zineOutputs[1], { ok: true, operation: { operationId: 'delete-good', type: 'delete_slot', spreadId: 'spread-1', slotId: 'slot-1' } })
  const zineBatch = zineEvents.find((event) => event.type === 'operation_batch_created')
  assert.ok(zineBatch)
  assert.deepEqual(zineBatch.batch.operations, [{ operationId: 'delete-good', type: 'delete_slot', spreadId: 'spread-1', slotId: 'slot-1' }])
})

await test('rejects duplicate IDs and permits only one successful submit', async () => {
  const events = await collect(runtime(model([
    [call('a1', 'add_narrative_operation', { operationId: 'same', type: 'set_node_attrs', nodeId: 'p1', attrs: { a: 1 } }), finish('tool-calls')],
    [call('a2', 'add_narrative_operation', { operationId: 'same', type: 'set_node_attrs', nodeId: 'p1', attrs: { a: 2 } }), finish('tool-calls')],
    [call('s1', 'submit_operation_batch', { summary: ['One'] }), finish('tool-calls')],
    [call('s2', 'submit_operation_batch', { summary: ['Two'] }), finish('tool-calls')],
    [finish('stop')],
  ])), task(narrativeSnapshot()))
  const outputs = events.filter((event) => event.type === 'tool_completed').map((event) => event.output)
  assert.equal((outputs[1] as { error: { code: string } }).error.code, 'duplicate_operation_id')
  assert.equal((outputs[3] as { error: { code: string } }).error.code, 'batch_already_submitted')
  assert.equal(events.filter((event) => event.type === 'operation_batch_created').length, 1)
})

await test('locks all mutation tools after the authoritative batch is submitted', async () => {
  const authorized = task(narrativeSnapshot(), {
    authorization: { allowDelete: true, deleteTargetIds: ['p1'] },
  })
  const events = await collect(runtime(model([
    [call('submit', 'submit_operation_batch', { summary: ['No changes needed'] }), finish('tool-calls')],
    [call('late-add', 'add_narrative_operation', { operationId: 'late-op', type: 'set_node_attrs', nodeId: 'p1', attrs: { tone: 'warm' } }), finish('tool-calls')],
    [call('late-delete', 'delete_node', { operationId: 'late-delete', nodeId: 'p1' }), finish('tool-calls')],
    [finish('stop')],
  ])), authorized)
  const outputs = events.filter((event) => event.type === 'tool_completed').map((event) => event.output)

  assert.equal((outputs[1] as { error: { code: string } }).error.code, 'batch_already_submitted')
  assert.equal((outputs[2] as { error: { code: string } }).error.code, 'batch_already_submitted')
  const batches = events.filter((event) => event.type === 'operation_batch_created')
  assert.equal(batches.length, 1)
  assert.deepEqual(batches[0].batch.operations, [])
  assert.deepEqual(batches[0].batch.summary, ['No changes needed'])
})

await test('bounds Narrative delete operation and node IDs with the shared short-text limit', async () => {
  const exactLimitId = 'n'.repeat(MAX_AI_SHORT_TEXT_LENGTH)
  const oversizedId = 'n'.repeat(MAX_AI_SHORT_TEXT_LENGTH + 1)
  const authorized = task(narrativeSnapshot(), {
    authorization: { allowDelete: true, deleteTargetIds: [exactLimitId, oversizedId] },
  })
  const events = await collect(runtime(model([
    [call('oversized-operation', 'delete_node', { operationId: oversizedId, nodeId: exactLimitId }), finish('tool-calls')],
    [call('oversized-node', 'delete_node', { operationId: 'delete-oversized-node', nodeId: oversizedId }), finish('tool-calls')],
    [call('exact-limit', 'delete_node', { operationId: exactLimitId, nodeId: exactLimitId }), finish('tool-calls')],
    [call('submit', 'submit_operation_batch', { summary: ['Deleted exact-limit node'] }), finish('tool-calls')],
    [finish('stop')],
  ])), authorized)
  const outputs = events.filter((event) => event.type === 'tool_completed').map((event) => event.output)

  assert.equal((outputs[0] as { error: { code: string } }).error.code, 'invalid_tool_input')
  assert.equal((outputs[1] as { error: { code: string } }).error.code, 'invalid_tool_input')
  const batch = events.find((event) => event.type === 'operation_batch_created')
  assert.ok(batch)
  assert.deepEqual(batch.batch.operations, [{ operationId: exactLimitId, type: 'delete_node', nodeId: exactLimitId }])
})

await test('bounds Zine delete operation, spread, and slot IDs with the shared short-text limit', async () => {
  const exactLimitId = 'z'.repeat(MAX_AI_SHORT_TEXT_LENGTH)
  const oversizedId = 'z'.repeat(MAX_AI_SHORT_TEXT_LENGTH + 1)
  const snapshot = { ...zineSnapshot(), targetSpreadId: exactLimitId, currentSpread: { ...zineSnapshot().currentSpread, spreadId: exactLimitId } }
  const authorized = task(snapshot, {
    authorization: { allowDelete: true, deleteTargetIds: [exactLimitId, oversizedId], targetSpreadId: exactLimitId, projectAssetIds: ['asset-1'] },
  })
  const events = await collect(runtime(model([
    [call('oversized-operation', 'delete_slot', { operationId: oversizedId, spreadId: exactLimitId, slotId: exactLimitId }), finish('tool-calls')],
    [call('oversized-spread', 'delete_slot', { operationId: 'delete-oversized-spread', spreadId: oversizedId, slotId: exactLimitId }), finish('tool-calls')],
    [call('oversized-slot', 'delete_slot', { operationId: 'delete-oversized-slot', spreadId: exactLimitId, slotId: oversizedId }), finish('tool-calls')],
    [call('exact-limit', 'delete_slot', { operationId: exactLimitId, spreadId: exactLimitId, slotId: exactLimitId }), finish('tool-calls')],
    [call('submit', 'submit_operation_batch', { summary: ['Deleted exact-limit slot'] }), finish('tool-calls')],
    [finish('stop')],
  ])), authorized)
  const outputs = events.filter((event) => event.type === 'tool_completed').map((event) => event.output)

  assert.equal((outputs[0] as { error: { code: string } }).error.code, 'invalid_tool_input')
  assert.equal((outputs[1] as { error: { code: string } }).error.code, 'invalid_tool_input')
  assert.equal((outputs[2] as { error: { code: string } }).error.code, 'invalid_tool_input')
  const batch = events.find((event) => event.type === 'operation_batch_created')
  assert.ok(batch)
  assert.deepEqual(batch.batch.operations, [{ operationId: exactLimitId, type: 'delete_slot', spreadId: exactLimitId, slotId: exactLimitId }])
})

await test('emits accepted warnings and JSON-safe tool events', async () => {
  const events = await collect(runtime(model([
    [call('warn', 'report_warning', { code: 'low_contrast', message: 'Needs review', severity: 'warning', targetIds: ['p1'] }), finish('tool-calls')],
    [call('submit', 'submit_operation_batch', { summary: ['Warning reported'] }), finish('tool-calls')],
    [finish('stop')],
  ])), task(narrativeSnapshot()))
  assert.deepEqual(events.find((event) => event.type === 'warning'), { type: 'warning', warning: { code: 'low_contrast', message: 'Needs review', severity: 'warning', targetIds: ['p1'] } })
  assert.doesNotThrow(() => JSON.stringify(events.filter((event) => event.type.startsWith('tool_'))))
})

await test('uses actual prompt adapter for vision and structure-only input', async () => {
  const files: number[] = []
  const imageData: unknown[][] = []
  const inspect = (options: Parameters<MockLanguageModelV4['doStream']>[0], callIndex: number) => {
    if (callIndex !== 0) return
    const parts = options.prompt.flatMap((message) => (
      Array.isArray(message.content) ? message.content as Array<{ type: string; data?: unknown }> : []
    ))
    files.push(parts.filter((part) => part.type === 'file').length)
    imageData.push(parts.filter((part) => part.type === 'file').map((part) => part.data))
  }
  await collect(runtime(model([
    [call('submit-vision', 'submit_operation_batch', { summary: [] }), finish('tool-calls')],
    [finish('stop')],
  ], inspect)), task(narrativeSnapshot()))
  await collect(runtime(model([
    [call('submit-structure', 'submit_operation_batch', { summary: [] }), finish('tool-calls')],
    [finish('stop')],
  ], inspect)), task(narrativeSnapshot(), { modelCapabilities: { vision: false, structuredOutput: true, toolCalling: true } }))
  assert.equal(files[0], 1)
  assert.deepEqual(imageData[0], [{ type: 'data', data: 'QQ==' }])
  assert.equal(files[1], 0)
})

await test('suggestion-only exposes no tools, streams suggestion, and emits no batch', async () => {
  let tools: string[] = []
  const events = await collect(runtime(model([[
    { type: 'text-start', id: 't' }, { type: 'text-delta', id: 't', delta: 'Try stronger pacing.' }, { type: 'text-end', id: 't' }, finish('stop'),
  ]], (options) => { tools = (options.tools ?? []).map((entry) => entry.name) })), task(narrativeSnapshot(), { modelCapabilities: { vision: false, structuredOutput: false, toolCalling: false } }))
  assert.deepEqual(tools.toSorted(), [])
  assert.deepEqual(
    events.filter((event) => event.type === 'status_changed').map((event) => event.status),
    ['preparing_context', 'analyzing', 'planning', 'completed'],
  )
  assert.deepEqual(events.find((event) => event.type === 'text_delta'), { type: 'text_delta', text: 'Try stronger pacing.' })
  assert.equal(events.some((event) => event.type === 'operation_batch_created'), false)
  assert.deepEqual(events.find((event) => event.type === 'completed'), { type: 'completed', summary: ['Try stronger pacing.'] })
})

await test('malformed operation and submit never create a batch', async () => {
  const { events, error } = await collectFailure(runtime(model([
    [call('bad-op', 'add_narrative_operation', { operationId: 'x', type: 'replace_text' }), finish('tool-calls')],
    [call('bad-submit', 'submit_operation_batch', { summary: 'not-array' }), finish('tool-calls')],
    [finish('stop')],
  ])), task(narrativeSnapshot()))
  assert.ok(error instanceof EditorAiExecutionError)
  assert.equal(events.some((event) => event.type === 'operation_batch_created'), false)
  assert.equal(events.filter((event) => event.type === 'tool_completed').length, 2)
})

await test('already-aborted run emits stopped and never invokes model', async () => {
  const controller = new AbortController()
  controller.abort('stop')
  const events: DirectEditAgentEvent[] = []
  await assert.rejects(async () => {
    for await (const event of runtime(model([])).run(task(narrativeSnapshot()), { signal: controller.signal })) events.push(event)
  }, (error: unknown) => error instanceof Error && error.name === 'AbortError')
  assert.deepEqual(events, [{ type: 'status_changed', status: 'preparing_context' }, { type: 'status_changed', status: 'stopped' }])
})

await test('abort during the loop stops before any batch is emitted', async () => {
  const controller = new AbortController()
  const events: DirectEditAgentEvent[] = []
  const currentRuntime = runtime(model([[
    { type: 'text-start', id: 'abort-text' },
    { type: 'text-delta', id: 'abort-text', delta: 'Planning' },
    { type: 'text-end', id: 'abort-text' },
    finish('stop'),
  ]]))

  await assert.rejects(async () => {
    for await (const event of currentRuntime.run(task(narrativeSnapshot()), { signal: controller.signal })) {
      events.push(event)
      if (event.type === 'text_delta') controller.abort('stop during loop')
    }
  }, (error: unknown) => error instanceof Error && error.name === 'AbortError')

  assert.equal(events.some((event) => event.type === 'operation_batch_created'), false)
  assert.equal(events.some((event) => event.type === 'completed'), false)
  assert.deepEqual(events.at(-1), { type: 'status_changed', status: 'stopped' })
})

await test('direct-edit stream without submit fails with a typed invalid batch error', async () => {
  const result = await collectFailure(runtime(model([[finish('stop')]])), task(narrativeSnapshot()))
  assert.ok(result.error instanceof EditorAiExecutionError)
  assert.equal(result.error.code, 'invalid_operation_batch')
  assert.deepEqual(result.events.slice(-2), [
    { type: 'error', code: 'invalid_operation_batch', message: 'Direct edit completed without a successful operation batch submission' },
    { type: 'status_changed', status: 'failed' },
  ])
  assert.equal(result.events.some((event) => event.type === 'operation_batch_created' || event.type === 'completed'), false)
})

await test('successful submit is buffered until later text and tool events finish', async () => {
  const events = await collect(runtime(model([
    [call('add', 'add_narrative_operation', { operationId: 'op-1', type: 'set_node_attrs', nodeId: 'p1', attrs: { tone: 'warm' } }), finish('tool-calls')],
    [call('submit', 'submit_operation_batch', { summary: ['Adjusted tone'] }), finish('tool-calls')],
    [call('read-after-submit', 'read_snapshot', {}), finish('tool-calls')],
    [{ type: 'text-start', id: 'after' }, { type: 'text-delta', id: 'after', delta: 'Final note.' }, { type: 'text-end', id: 'after' }, finish('stop')],
  ])), task(narrativeSnapshot()))
  const types = events.map((event) => event.type)
  assert.equal(types.filter((type) => type === 'operation_batch_created').length, 1)
  assert.ok(types.lastIndexOf('tool_completed') < types.indexOf('operation_batch_created'))
  assert.ok(types.lastIndexOf('text_delta') < types.indexOf('operation_batch_created'))
  assert.deepEqual(types.slice(-3), ['operation_batch_created', 'completed', 'status_changed'])
})

await test('abort after successful submit stops without exposing the buffered batch', async () => {
  const controller = new AbortController()
  const events: DirectEditAgentEvent[] = []
  const currentRuntime = runtime(model([
    [call('submit', 'submit_operation_batch', { summary: ['Ready'] }), finish('tool-calls')],
    [{ type: 'text-start', id: 'later' }, { type: 'text-delta', id: 'later', delta: 'Still working' }, { type: 'text-end', id: 'later' }, finish('stop')],
  ]))
  await assert.rejects(async () => {
    for await (const event of currentRuntime.run(task(narrativeSnapshot()), { signal: controller.signal })) {
      events.push(event)
      if (event.type === 'text_delta') controller.abort('stop after submit')
    }
  }, (error: unknown) => error instanceof Error && error.name === 'AbortError')
  assert.equal(events.some((event) => event.type === 'operation_batch_created' || event.type === 'completed' || event.type === 'error'), false)
  assertNoAuthoritativeBatchLeak(events)
  assert.deepEqual(events.at(-1), { type: 'status_changed', status: 'stopped' })
})

await test('provider failure after submit never exposes the buffered batch', async () => {
  const result = await collectFailure(runtime(model([
    [call('submit', 'submit_operation_batch', { summary: ['Ready'] }), finish('tool-calls')],
    [{ type: 'error', error: new Error('provider exploded') }],
  ])), task(narrativeSnapshot()))
  assert.ok(result.error instanceof EditorAiExecutionError)
  assert.equal(result.error.code, 'invalid_operation_batch')
  assert.deepEqual(result.events.slice(-2), [
    { type: 'error', code: 'invalid_operation_batch', message: 'provider exploded' },
    { type: 'status_changed', status: 'failed' },
  ])
  assert.equal(result.events.some((event) => event.type === 'operation_batch_created' || event.type === 'completed'), false)
  assertNoAuthoritativeBatchLeak(result.events)
})

await test('rejects mismatched Zine outer and nested project identities before model invocation', async () => {
  let invocationCount = 0
  const snapshot = zineSnapshot()
  snapshot.project.projectId = 'project-other'
  const result = await collectFailure(runtime(model([], () => { invocationCount += 1 })), task(snapshot))

  assert.equal(invocationCount, 0)
  assert.ok(result.error instanceof EditorAiExecutionError)
  assert.equal(result.error.code, 'operation_not_authorized')
  assert.match(result.error.message, /project identity/i)
  assert.deepEqual(result.events.slice(-2), [
    { type: 'error', code: 'operation_not_authorized', message: result.error.message },
    { type: 'status_changed', status: 'failed' },
  ])
  assert.equal(result.events.some((event) => event.type === 'operation_batch_created' || event.type === 'completed'), false)
})

await test('rejects mismatched Zine target and current spread identities before model invocation', async () => {
  let invocationCount = 0
  const snapshot = zineSnapshot()
  snapshot.currentSpread.spreadId = 'spread-other'
  const result = await collectFailure(runtime(model([], () => { invocationCount += 1 })), task(snapshot))

  assert.equal(invocationCount, 0)
  assert.ok(result.error instanceof EditorAiExecutionError)
  assert.equal(result.error.code, 'operation_not_authorized')
  assert.match(result.error.message, /current spread identity/i)
  assert.deepEqual(result.events.slice(-2), [
    { type: 'error', code: 'operation_not_authorized', message: result.error.message },
    { type: 'status_changed', status: 'failed' },
  ])
  assert.equal(result.events.some((event) => event.type === 'operation_batch_created' || event.type === 'completed'), false)
})

await test('maxAutoFixIterations zero terminates on the first executable rejection', async () => {
  const result = await collectFailure(runtime(model([
    [call('accept', 'add_narrative_operation', { operationId: 'same', type: 'set_node_attrs', nodeId: 'p1', attrs: {} }), finish('tool-calls')],
    [call('reject', 'add_narrative_operation', { operationId: 'same', type: 'set_node_attrs', nodeId: 'p1', attrs: {} }), finish('tool-calls')],
  ]), { maxAutoFixIterations: 0 }), task(narrativeSnapshot()))
  assert.ok(result.error instanceof EditorAiExecutionError)
  assert.equal(result.error.code, 'validation_failed')
  assert.equal(result.events.some((event) => event.type === 'operation_batch_created'), false)
})

await test('maxAutoFixIterations one permits one rejection and terminates on the second', async () => {
  const result = await collectFailure(runtime(model([
    [call('accept', 'add_narrative_operation', { operationId: 'same', type: 'set_node_attrs', nodeId: 'p1', attrs: {} }), finish('tool-calls')],
    [call('reject-1', 'add_narrative_operation', { operationId: 'same', type: 'set_node_attrs', nodeId: 'p1', attrs: {} }), finish('tool-calls')],
    [call('reject-2', 'add_narrative_operation', { operationId: 'same', type: 'set_node_attrs', nodeId: 'p1', attrs: {} }), finish('tool-calls')],
  ]), { maxAutoFixIterations: 1 }), task(narrativeSnapshot()))
  assert.ok(result.error instanceof EditorAiExecutionError)
  assert.equal(result.error.code, 'validation_failed')
  assert.equal(result.events.filter((event) => event.type === 'tool_completed').length, 2)
  assert.equal(result.events.some((event) => event.type === 'operation_batch_created'), false)
})

await test('invalid maxAutoFixIterations is rejected before model invocation', async () => {
  let invoked = false
  const invalidValues = [-1, 1.5, Number.POSITIVE_INFINITY, Number.NaN]
  for (const value of invalidValues) {
    const result = await collectFailure(runtime(model([[finish('stop')]], () => { invoked = true }), { maxAutoFixIterations: value }), task(narrativeSnapshot()))
    assert.ok(result.error instanceof EditorAiExecutionError)
    assert.equal(result.error.code, 'validation_failed')
  }
  assert.equal(invoked, false)
})

await test('invalid maxSteps values fail validation before model invocation', async () => {
  const invalidValues = [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]

  for (const value of invalidValues) {
    let invocationCount = 0
    const result = await collectFailure(runtime(model([], () => { invocationCount += 1 }), { maxSteps: value }), task(narrativeSnapshot()))

    assert.ok(result.error instanceof EditorAiExecutionError)
    assert.equal(result.error.code, 'validation_failed')
    assert.match(result.error.message, /maxSteps must be a finite positive integer/)
    assert.equal(invocationCount, 0)
    assert.deepEqual(result.events.slice(-2), [
      { type: 'error', code: 'validation_failed', message: 'maxSteps must be a finite positive integer' },
      { type: 'status_changed', status: 'failed' },
    ])
    assert.equal(result.events.some((event) => event.type === 'operation_batch_created' || event.type === 'completed'), false)
  }
})

await test('maxSteps one bounds the model loop and fails when submit is missing', async () => {
  let invocationCount = 0
  const result = await collectFailure(runtime(model([
    [call('add', 'add_narrative_operation', { operationId: 'op-1', type: 'set_node_attrs', nodeId: 'p1', attrs: { tone: 'warm' } }), finish('tool-calls')],
    [call('submit', 'submit_operation_batch', { summary: ['Adjusted tone'] }), finish('tool-calls')],
  ], () => { invocationCount += 1 }), { maxSteps: 1 }), task(narrativeSnapshot()))

  assert.equal(invocationCount, 1)
  assert.ok(result.error instanceof EditorAiExecutionError)
  assert.equal(result.error.code, 'invalid_operation_batch')
  assert.deepEqual(result.events.slice(-2), [
    { type: 'error', code: 'invalid_operation_batch', message: 'Direct edit completed without a successful operation batch submission' },
    { type: 'status_changed', status: 'failed' },
  ])
  assert.equal(result.events.some((event) => event.type === 'operation_batch_created' || event.type === 'completed'), false)
})

await test('configured maxSteps permits a successful submit within the bound', async () => {
  let invocationCount = 0
  const events = await collect(runtime(model([
    [call('add', 'add_narrative_operation', { operationId: 'op-1', type: 'set_node_attrs', nodeId: 'p1', attrs: { tone: 'warm' } }), finish('tool-calls')],
    [call('submit', 'submit_operation_batch', { summary: ['Adjusted tone'] }), finish('tool-calls')],
    [finish('stop')],
  ], () => { invocationCount += 1 }), { maxSteps: 2 }), task(narrativeSnapshot()))

  assert.equal(invocationCount, 2)
  assert.equal(events.filter((event) => event.type === 'operation_batch_created').length, 1)
  assert.deepEqual(events.find((event) => event.type === 'completed'), { type: 'completed', summary: ['Adjusted tone'] })
})
