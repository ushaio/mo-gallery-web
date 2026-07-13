import assert from 'node:assert/strict'

import {
  runDirectEditAgentWithRuntime,
  type RunDirectEditAgentResult,
} from '../src/agent'
import {
  MAX_EDITOR_OPERATION_BATCH_OPERATIONS,
  editorAiTaskMetadataSchema,
  type AiDocumentHost,
  type DeepReadonly,
  type DirectEditAgentEvent,
  type DirectEditAgentRuntime,
  type DirectEditAgentTask,
  type EditorAiCommitBatch,
  type EditorAiCommitResult,
  type EditorAiSimulationResult,
  type NarrativeDocumentSnapshot,
  type NarrativeEditorOperation,
  type ZineDocumentSnapshot,
  type ZineEditorOperation,
} from '../src/index'

async function test(name: string, run: () => void | Promise<void>): Promise<void> {
  try {
    await run()
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}`)
    throw error
  }
}

function snapshot(revision = 'revision-1'): NarrativeDocumentSnapshot {
  return {
    capability: 'narrative',
    documentId: 'story-1',
    documentKind: 'story',
    title: 'Story title',
    root: { type: 'doc' },
    nodes: [],
    editorWidth: 960,
    visualSegments: [],
    revision,
  }
}

const operation: NarrativeEditorOperation = {
  operationId: 'operation-1',
  type: 'replace_text',
  nodeId: 'paragraph-1',
  from: 0,
  to: 6,
  replacement: 'After',
}

function batch(overrides: Partial<EditorAiCommitBatch<'narrative'>> = {}): EditorAiCommitBatch<'narrative'> {
  return {
    taskId: 'task-1',
    capability: 'narrative',
    baseRevision: 'revision-1',
    target: { documentId: 'story-1' },
    operations: [operation],
    summary: ['Replaced opening text'],
    ...overrides,
  }
}

class Host implements AiDocumentHost<'narrative'> {
  readonly calls: string[] = []
  revision = 'revision-1'
  capturedSnapshot = snapshot()
  simulationIssues: EditorAiSimulationResult<NarrativeDocumentSnapshot>['issues'] = []
  simulationError?: Error
  commitError?: Error
  unlockError?: Error
  commitResult: EditorAiCommitResult = {
    resultRevision: 'revision-2', historyEntryId: 'history-1', saved: true,
  }

  lock(): void { this.calls.push('lock') }
  unlock(): void {
    this.calls.push('unlock')
    if (this.unlockError) throw this.unlockError
  }
  async captureSnapshot(): Promise<DeepReadonly<NarrativeDocumentSnapshot>> {
    this.calls.push('capture')
    return this.capturedSnapshot
  }
  getCurrentRevision(): string {
    this.calls.push('revision')
    return this.revision
  }
  async simulate(
    captured: DeepReadonly<NarrativeDocumentSnapshot>,
    operations: ReadonlyArray<DeepReadonly<NarrativeEditorOperation>>,
  ): Promise<EditorAiSimulationResult<NarrativeDocumentSnapshot>> {
    this.calls.push('simulate')
    assert.equal(captured.revision, 'revision-1')
    assert.equal(operations.length, 1)
    if (this.simulationError) throw this.simulationError
    return {
      snapshot: snapshot('revision-2'),
      resultRevision: 'revision-2',
      issues: this.simulationIssues,
      changeEntries: [{
        operation: 'replace_text',
        targetId: 'paragraph-1',
        targetLabel: 'Opening paragraph',
        category: 'content',
        before: 'Before',
        after: 'After',
      }],
    }
  }
  async commit(
    committedBatch: EditorAiCommitBatch<'narrative'>,
    _simulation: EditorAiSimulationResult<NarrativeDocumentSnapshot>,
  ): Promise<EditorAiCommitResult> {
    this.calls.push('commit')
    assert.equal(committedBatch.operations.length, 1)
    if (this.commitError) throw this.commitError
    return this.commitResult
  }
}

function runtime(events: DirectEditAgentEvent<NarrativeDocumentSnapshot>[]): DirectEditAgentRuntime<NarrativeDocumentSnapshot> {
  return ({
    async *run(_task: DirectEditAgentTask<NarrativeDocumentSnapshot>) {
      for (const event of events) yield event
    },
  }) as unknown as DirectEditAgentRuntime<NarrativeDocumentSnapshot>
}

function zineSnapshot(): ZineDocumentSnapshot {
  return {
    capability: 'zine',
    projectId: 'project-1',
    targetSpreadId: 'spread-1',
    project: { projectId: 'project-1', settings: {}, spreadOrder: ['spread-1'], spreadSummaries: {} },
    currentSpread: {
      spreadId: 'spread-1',
      index: 0,
      structure: { slots: [{ id: 'slot-1' }] },
      summary: {},
      preview: {
        id: 'preview',
        dataUrl: 'data:image/png;base64,Qg==',
        mediaType: 'image/png',
        width: 10,
        height: 10,
        byteLength: 1,
      },
    },
    adjacentSpreads: [],
    assetCandidates: [],
    revision: 'revision-1',
  }
}

function identityHost<Captured extends NarrativeDocumentSnapshot | ZineDocumentSnapshot>(capturedSnapshot: Captured) {
  const calls: string[] = []
  return {
    calls,
    lock() { calls.push('lock') },
    unlock() { calls.push('unlock') },
    async captureSnapshot() {
      calls.push('capture')
      return capturedSnapshot
    },
    getCurrentRevision() {
      calls.push('revision')
      return capturedSnapshot.revision
    },
    async simulate() {
      calls.push('simulate')
      throw new Error('simulate must not run')
    },
    async commit() {
      calls.push('commit')
      throw new Error('commit must not run')
    },
  }
}

function neverInvokedRuntime<Snapshot extends NarrativeDocumentSnapshot | ZineDocumentSnapshot>(
  invocationCount: { value: number },
): DirectEditAgentRuntime<Snapshot> {
  return {
    async *run() {
      invocationCount.value += 1
    },
  }
}

const options = (host: Host) => ({
  endpoint: { baseURL: 'https://example.test/v1', apiKey: 'test-key' },
  model: 'test-model',
  instruction: 'Improve the opening.',
  taskType: 'instruction' as const,
  host,
  modelCapabilities: { vision: true, structuredOutput: true, toolCalling: true },
  authorization: { allowDelete: false, deleteTargetIds: [] },
  taskId: 'task-1',
})

await test('commits one authoritative batch after simulation and validation', async () => {
  const host = new Host()
  const observed: string[] = []
  const result = await runDirectEditAgentWithRuntime(
    { ...options(host), onEvent: (event) => observed.push(event.type === 'status_changed' ? event.status : event.type) },
    runtime([
      { type: 'status_changed', status: 'preparing_context' },
      { type: 'status_changed', status: 'analyzing' },
      { type: 'status_changed', status: 'planning' },
      { type: 'operation_batch_created', batch: batch() },
      { type: 'completed', summary: ['Model claims something else'] },
      { type: 'status_changed', status: 'completed' },
    ]),
  )

  assert.equal(result.mode, 'direct_edit')
  if (result.mode !== 'direct_edit') return
  assert.deepEqual(host.calls, ['lock', 'capture', 'simulate', 'revision', 'revision', 'commit', 'unlock'])
  assert.equal(editorAiTaskMetadataSchema.safeParse(result.metadata).success, true)
  assert.deepEqual(result.metadata.changeSet.entries, [{
    operation: 'replace_text', targetId: 'paragraph-1', targetLabel: 'Opening paragraph',
    category: 'content', before: 'Before', after: 'After',
  }])
  assert.deepEqual(observed, ['preparing_context', 'analyzing', 'planning', 'operation_batch_created', 'simulating', 'validating', 'applying', 'completed', 'completed'])
})

await test('rejects missing or multiple batches before simulation', async () => {
  for (const events of [
    [{ type: 'completed', summary: [] }] as DirectEditAgentEvent<NarrativeDocumentSnapshot>[],
    [
      { type: 'operation_batch_created', batch: batch() },
      { type: 'operation_batch_created', batch: batch() },
    ] as DirectEditAgentEvent<NarrativeDocumentSnapshot>[],
  ]) {
    const host = new Host()
    await assert.rejects(runDirectEditAgentWithRuntime(options(host), runtime(events)), { code: 'invalid_operation_batch' })
    assert.deepEqual(host.calls, ['lock', 'capture', 'unlock'])
  }
})

await test('validates batch identity and authorization before simulation', async () => {
  const invalid = [
    batch({ taskId: 'foreign-task' }),
    batch({ baseRevision: 'stale' }),
    batch({ target: { documentId: 'foreign-story' } }),
    batch({ operations: [{ ...operation, type: 'delete_node', nodeId: 'paragraph-1' }] }),
  ]
  for (const candidate of invalid) {
    const host = new Host()
    await assert.rejects(
      runDirectEditAgentWithRuntime(options(host), runtime([{ type: 'operation_batch_created', batch: candidate }])),
    )
    assert.deepEqual(host.calls, ['lock', 'capture', 'unlock'])
  }
})

await test('rejects oversized custom-runtime batches before simulation', async () => {
  const host = new Host()
  const operations = Array.from(
    { length: MAX_EDITOR_OPERATION_BATCH_OPERATIONS + 1 },
    (_, index): NarrativeEditorOperation => ({
      operationId: `operation-${index}`,
      type: 'replace_text',
      nodeId: 'paragraph-1',
      from: 0,
      to: 0,
      replacement: 'x',
    }),
  )
  await assert.rejects(
    runDirectEditAgentWithRuntime(
      options(host),
      runtime([{ type: 'operation_batch_created', batch: batch({ operations }) }]),
    ),
    { code: 'invalid_operation_batch' },
  )
  assert.deepEqual(host.calls, ['lock', 'capture', 'unlock'])
})

await test('validation and stale revision failures never commit and always unlock', async () => {
  const validationHost = new Host()
  validationHost.simulationIssues = [{ code: 'invalid', severity: 'error', message: 'Invalid edit' }]
  await assert.rejects(
    runDirectEditAgentWithRuntime(options(validationHost), runtime([{ type: 'operation_batch_created', batch: batch() }])),
    { code: 'validation_failed' },
  )
  assert.deepEqual(validationHost.calls, ['lock', 'capture', 'simulate', 'unlock'])

  const staleHost = new Host()
  staleHost.revision = 'revision-9'
  await assert.rejects(
    runDirectEditAgentWithRuntime(options(staleHost), runtime([{ type: 'operation_batch_created', batch: batch() }])),
    { code: 'stale_revision' },
  )
  assert.deepEqual(staleHost.calls, ['lock', 'capture', 'simulate', 'revision', 'unlock'])
})

await test('suggestion-only remains read-only and returns runtime text', async () => {
  const host = new Host()
  const result: RunDirectEditAgentResult = await runDirectEditAgentWithRuntime(
    {
      ...options(host),
      modelCapabilities: { vision: false, structuredOutput: false, toolCalling: false },
    },
    runtime([
      { type: 'text_delta', text: 'Try a stronger ' },
      { type: 'text_delta', text: 'opening.' },
      { type: 'completed', summary: ['Fallback'] },
      { type: 'status_changed', status: 'completed' },
    ]),
  )
  assert.deepEqual(host.calls, ['capture'])
  assert.equal(result.mode, 'suggestion_only')
  if (result.mode === 'suggestion_only') {
    assert.equal(result.suggestion, 'Try a stronger opening.')
    assert.deepEqual(result.degradations.map((item) => item.code), [
      'vision_unavailable', 'structured_output_unavailable', 'tool_calling_unavailable',
    ])
  }
})

await test('rejects contradictory direct-edit snapshot and authorization identities before custom runtime invocation', async () => {
  const cases: Array<{
    name: string
    capturedSnapshot: NarrativeDocumentSnapshot | ZineDocumentSnapshot
    authorization: { allowDelete: boolean; deleteTargetIds: string[]; targetSpreadId?: string }
  }> = [
    {
      name: 'nested Zine project ID mismatch',
      capturedSnapshot: { ...zineSnapshot(), project: { ...zineSnapshot().project, projectId: 'project-other' } },
      authorization: { allowDelete: false, deleteTargetIds: [], targetSpreadId: 'spread-1' },
    },
    {
      name: 'Zine current spread ID mismatch',
      capturedSnapshot: { ...zineSnapshot(), currentSpread: { ...zineSnapshot().currentSpread, spreadId: 'spread-other' } },
      authorization: { allowDelete: false, deleteTargetIds: [], targetSpreadId: 'spread-1' },
    },
    {
      name: 'Zine authorization target mismatch',
      capturedSnapshot: zineSnapshot(),
      authorization: { allowDelete: false, deleteTargetIds: [], targetSpreadId: 'spread-other' },
    },
    {
      name: 'Zine authorization target missing',
      capturedSnapshot: zineSnapshot(),
      authorization: { allowDelete: false, deleteTargetIds: [] },
    },
    {
      name: 'Narrative authorization has spread target',
      capturedSnapshot: snapshot(),
      authorization: { allowDelete: false, deleteTargetIds: [], targetSpreadId: 'spread-1' },
    },
  ]

  for (const candidate of cases) {
    const host = identityHost(candidate.capturedSnapshot)
    const invocationCount = { value: 0 }
    const observed: string[] = []
    await assert.rejects(
      runDirectEditAgentWithRuntime(
        {
          endpoint: { baseURL: 'https://example.test/v1', apiKey: 'test-key' },
          model: 'test-model',
          instruction: candidate.name,
          taskType: 'instruction',
          host: host as never,
          modelCapabilities: { vision: true, structuredOutput: true, toolCalling: true },
          authorization: candidate.authorization,
          taskId: 'task-identity',
          onEvent: (event) => observed.push(event.type === 'status_changed' ? event.status : event.type),
        },
        neverInvokedRuntime(invocationCount) as never,
      ),
      (error: unknown) => error instanceof Error
        && 'code' in error
        && error.code === 'operation_not_authorized'
        && /wrong_target_spread/.test(error.message),
      candidate.name,
    )
    assert.equal(invocationCount.value, 0, candidate.name)
    assert.deepEqual(host.calls, ['lock', 'capture', 'unlock'], candidate.name)
    assert.deepEqual(observed, ['error', 'failed'], candidate.name)
  }
})

await test('rejects contradictory suggestion-only snapshots before custom runtime invocation without locking', async () => {
  const capturedSnapshot = zineSnapshot()
  capturedSnapshot.project.projectId = 'project-other'
  const host = identityHost(capturedSnapshot)
  const invocationCount = { value: 0 }
  const observed: string[] = []

  await assert.rejects(
    runDirectEditAgentWithRuntime(
      {
        endpoint: { baseURL: 'https://example.test/v1', apiKey: 'test-key' },
        model: 'test-model',
        instruction: 'Suggest an improvement.',
        taskType: 'instruction',
        host: host as never,
        modelCapabilities: { vision: false, structuredOutput: false, toolCalling: false },
        authorization: { allowDelete: false, deleteTargetIds: [], targetSpreadId: 'spread-1' },
        taskId: 'task-suggestion-identity',
        onEvent: (event) => observed.push(event.type === 'status_changed' ? event.status : event.type),
      },
      neverInvokedRuntime(invocationCount) as never,
    ),
    { code: 'operation_not_authorized' },
  )
  assert.equal(invocationCount.value, 0)
  assert.deepEqual(host.calls, ['capture'])
  assert.deepEqual(observed, ['error', 'failed'])
})

await test('already-aborted work touches neither host nor runtime', async () => {
  const host = new Host()
  const controller = new AbortController()
  controller.abort('cancelled')
  let runtimeCalls = 0
  const abortedRuntime: DirectEditAgentRuntime<NarrativeDocumentSnapshot> = {
    async *run() { runtimeCalls += 1 },
  }
  await assert.rejects(
    runDirectEditAgentWithRuntime({ ...options(host), signal: controller.signal }, abortedRuntime),
    { name: 'AbortError' },
  )
  assert.deepEqual(host.calls, [])
  assert.equal(runtimeCalls, 0)
})

await test('runtime and simulation failures unlock once without committing', async () => {
  const runtimeHost = new Host()
  const failingRuntime = ({
    async *run() { throw new Error('provider failed') },
  }) as unknown as DirectEditAgentRuntime<NarrativeDocumentSnapshot>
  await assert.rejects(runDirectEditAgentWithRuntime(options(runtimeHost), failingRuntime))
  assert.deepEqual(runtimeHost.calls, ['lock', 'capture', 'unlock'])

  const simulationHost = new Host()
  simulationHost.simulationError = new Error('simulation crashed')
  await assert.rejects(
    runDirectEditAgentWithRuntime(options(simulationHost), runtime([{ type: 'operation_batch_created', batch: batch() }])),
    { code: 'simulation_failed' },
  )
  assert.deepEqual(simulationHost.calls, ['lock', 'capture', 'simulate', 'unlock'])
})

await test('commit failure attempts once and unlocks once', async () => {
  const host = new Host()
  host.commitError = new Error('commit crashed')
  await assert.rejects(
    runDirectEditAgentWithRuntime(options(host), runtime([{ type: 'operation_batch_created', batch: batch() }])),
    { code: 'commit_failed' },
  )
  assert.deepEqual(host.calls, ['lock', 'capture', 'simulate', 'revision', 'revision', 'commit', 'unlock'])
})

await test('budgeting affects runtime context but simulation receives the original snapshot', async () => {
  const host = new Host()
  host.capturedSnapshot = {
    ...snapshot(),
    visualSegments: [{
      id: 'segment-1',
      image: {
        id: 'image-1', dataUrl: 'data:image/png;base64,AA==', mediaType: 'image/png',
        width: 1, height: 1, byteLength: 1,
      },
      nodeIds: [], startY: 0, endY: 1,
    }],
  }
  let runtimeSegmentCount = -1
  const inspectingRuntime = ({
    async *run(task: DirectEditAgentTask<NarrativeDocumentSnapshot>) {
      runtimeSegmentCount = task.snapshot.visualSegments.length
      yield { type: 'operation_batch_created', batch: batch() } as DirectEditAgentEvent<NarrativeDocumentSnapshot>
    },
  }) as unknown as DirectEditAgentRuntime<NarrativeDocumentSnapshot>
  const originalSimulate = host.simulate.bind(host)
  host.simulate = async (captured, operations) => {
    assert.equal(captured.visualSegments.length, 1)
    return originalSimulate(captured, operations)
  }
  await runDirectEditAgentWithRuntime({
    ...options(host),
    contextBudget: {
      maxInputTokens: 100_000,
      adjacentPreviewMaxPixels: 1,
      assetCandidateLimit: 0,
      remoteSpreadSummaryLimit: 0,
      narrativeVisualSegmentLimit: 0,
    },
  }, inspectingRuntime)
  assert.equal(runtimeSegmentCount, 0)
})

await test('warnings allow commit and failed save remains completed', async () => {
  const host = new Host()
  host.simulationIssues = [{
    code: 'adjusted', severity: 'warning', message: 'Adjusted placement', targetIds: ['paragraph-1'],
  }]
  host.commitResult = {
    resultRevision: 'revision-3', historyEntryId: 'history-2', saved: false,
    saveError: 'api_key=secret persistence unavailable',
  }
  const result = await runDirectEditAgentWithRuntime(options(host), runtime([
    { type: 'warning', warning: { code: 'adjusted', severity: 'warning', message: 'Adjusted placement', targetIds: ['paragraph-1'] } },
    { type: 'operation_batch_created', batch: batch() },
  ]))
  assert.equal(result.mode, 'direct_edit')
  if (result.mode !== 'direct_edit') return
  assert.equal(result.metadata.resultRevision, 'revision-3')
  assert.deepEqual(result.metadata.warningCodes, ['adjusted', 'save_failed'])
  assert.equal(result.metadata.changeSet.warnings[1].message.includes('secret'), false)
})

await test('equivalent runtime info and host warning retain warning severity', async () => {
  for (const runtimeSeverity of ['info', 'warning'] as const) {
    const host = new Host()
    host.simulationIssues = [{
      code: 'adjusted', severity: runtimeSeverity === 'info' ? 'warning' : 'info',
      message: 'Adjusted placement', targetIds: ['paragraph-1'],
    }]
    const result = await runDirectEditAgentWithRuntime(options(host), runtime([
      {
        type: 'warning',
        warning: {
          code: 'adjusted', severity: runtimeSeverity,
          message: 'Adjusted placement', targetIds: ['paragraph-1'],
        },
      },
      { type: 'operation_batch_created', batch: batch() },
    ]))
    assert.equal(result.mode, 'direct_edit')
    if (result.mode !== 'direct_edit') continue
    assert.deepEqual(result.metadata.warningCodes, ['adjusted'])
    assert.deepEqual(result.metadata.changeSet.warnings, [{
      code: 'adjusted', severity: 'warning', message: 'Adjusted placement', targetIds: ['paragraph-1'],
    }])
  }
})

await test('warning codes remain deduped when warning records are distinct', async () => {
  const host = new Host()
  host.simulationIssues = [{ code: 'adjusted', severity: 'warning', message: 'Host adjustment' }]
  const result = await runDirectEditAgentWithRuntime(options(host), runtime([
    { type: 'warning', warning: { code: 'adjusted', severity: 'info', message: 'Runtime adjustment' } },
    { type: 'operation_batch_created', batch: batch() },
  ]))
  assert.equal(result.mode, 'direct_edit')
  if (result.mode !== 'direct_edit') return
  assert.equal(result.metadata.changeSet.warnings.length, 2)
  assert.deepEqual(result.metadata.warningCodes, ['adjusted'])
})

await test('abort after runtime or simulation prevents commit and unlocks', async () => {
  const runtimeController = new AbortController()
  const runtimeHost = new Host()
  const abortingRuntime = ({
    async *run() {
      yield { type: 'operation_batch_created', batch: batch() } as DirectEditAgentEvent<NarrativeDocumentSnapshot>
      runtimeController.abort('runtime abort')
    },
  }) as unknown as DirectEditAgentRuntime<NarrativeDocumentSnapshot>
  await assert.rejects(
    runDirectEditAgentWithRuntime({ ...options(runtimeHost), signal: runtimeController.signal }, abortingRuntime),
    { name: 'AbortError' },
  )
  assert.deepEqual(runtimeHost.calls, ['lock', 'capture', 'unlock'])

  const simulationController = new AbortController()
  const simulationHost = new Host()
  const originalSimulate = simulationHost.simulate.bind(simulationHost)
  simulationHost.simulate = async (captured, operations) => {
    const result = await originalSimulate(captured, operations)
    simulationController.abort('simulation abort')
    return result
  }
  await assert.rejects(
    runDirectEditAgentWithRuntime(
      { ...options(simulationHost), signal: simulationController.signal },
      runtime([{ type: 'operation_batch_created', batch: batch() }]),
    ),
    { name: 'AbortError' },
  )
  assert.deepEqual(simulationHost.calls, ['lock', 'capture', 'simulate', 'unlock'])
})

await test('runtime error is terminal and preserves its typed failure', async () => {
  for (const events of [
    [{ type: 'error', code: 'invalid_operation_batch', message: 'runtime rejected output' }],
    [
      { type: 'error', code: 'invalid_operation_batch', message: 'runtime rejected output' },
      { type: 'operation_batch_created', batch: batch() },
    ],
  ] as DirectEditAgentEvent<NarrativeDocumentSnapshot>[][]) {
    const host = new Host()
    const observed: string[] = []
    await assert.rejects(runDirectEditAgentWithRuntime({
      ...options(host),
      onEvent: (event) => observed.push(event.type === 'status_changed' ? event.status : event.type),
    }, runtime(events)), { code: 'invalid_operation_batch', message: 'runtime rejected output' })
    assert.deepEqual(observed, ['error', 'failed'])
    assert.deepEqual(host.calls, ['lock', 'capture', 'unlock'])
  }
})

await test('runtime stopped and failed statuses are terminal', async () => {
  const stoppedHost = new Host()
  const stoppedObserved: string[] = []
  await assert.rejects(runDirectEditAgentWithRuntime({
    ...options(stoppedHost),
    onEvent: (event) => stoppedObserved.push(event.type === 'status_changed' ? event.status : event.type),
  }, runtime([
    { type: 'status_changed', status: 'stopped' },
    { type: 'operation_batch_created', batch: batch() },
  ])), { name: 'AbortError' })
  assert.deepEqual(stoppedObserved, ['stopped'])
  assert.deepEqual(stoppedHost.calls, ['lock', 'capture', 'unlock'])

  const failedHost = new Host()
  const failedObserved: string[] = []
  await assert.rejects(runDirectEditAgentWithRuntime({
    ...options(failedHost),
    onEvent: (event) => failedObserved.push(event.type === 'status_changed' ? event.status : event.type),
  }, runtime([{ type: 'status_changed', status: 'failed' }])), {
    code: 'invalid_operation_batch',
    message: 'Direct-edit runtime reported a failed status',
  })
  assert.deepEqual(failedObserved, ['failed'])
  assert.deepEqual(failedHost.calls, ['lock', 'capture', 'unlock'])
})

await test('runtime success terminals stop iteration and ignore later events', async () => {
  for (const terminal of [
    { type: 'completed', summary: ['Done'] },
    { type: 'status_changed', status: 'completed' },
  ] as DirectEditAgentEvent<NarrativeDocumentSnapshot>[]) {
    const missingHost = new Host()
    let iteratorClosed = false
    const lateBatchRuntime = ({
      async *run() {
        try {
          yield terminal
          yield { type: 'operation_batch_created', batch: batch() } as DirectEditAgentEvent<NarrativeDocumentSnapshot>
        } finally {
          iteratorClosed = true
        }
      },
    }) as unknown as DirectEditAgentRuntime<NarrativeDocumentSnapshot>
    await assert.rejects(runDirectEditAgentWithRuntime(options(missingHost), lateBatchRuntime), {
      code: 'invalid_operation_batch',
    })
    assert.equal(iteratorClosed, true)
    assert.deepEqual(missingHost.calls, ['lock', 'capture', 'unlock'])

    const successHost = new Host()
    const result = await runDirectEditAgentWithRuntime(options(successHost), runtime([
      { type: 'operation_batch_created', batch: batch() },
      terminal,
      { type: 'error', code: 'invalid_operation_batch', message: 'late error' },
    ]))
    assert.equal(result.mode, 'direct_edit')
    assert.equal(successHost.calls.filter((call) => call === 'commit').length, 1)
  }
})

await test('suggestion success terminal ignores later runtime errors', async () => {
  const host = new Host()
  const result = await runDirectEditAgentWithRuntime({
    ...options(host),
    modelCapabilities: { vision: false, structuredOutput: false, toolCalling: false },
  }, runtime([
    { type: 'text_delta', text: 'Use the collected suggestion.' },
    { type: 'completed', summary: ['Fallback'] },
    { type: 'error', code: 'invalid_operation_batch', message: 'late error' },
  ]))
  assert.equal(result.mode, 'suggestion_only')
  if (result.mode !== 'suggestion_only') return
  assert.equal(result.suggestion, 'Use the collected suggestion.')
  assert.deepEqual(host.calls, ['capture'])
})

await test('unsafe persistence metadata is rejected before commit', async () => {
  const unsafeEntryHost = new Host()
  const originalSimulate = unsafeEntryHost.simulate.bind(unsafeEntryHost)
  unsafeEntryHost.simulate = async (captured, operations) => ({
    ...await originalSimulate(captured, operations),
    changeEntries: [{
      operation: 'replace_text', targetId: 'paragraph-1', targetLabel: 'Opening paragraph',
      category: 'content', before: 'Before', after: 'data:image/png;base64,secret',
    }],
  })
  await assert.rejects(
    runDirectEditAgentWithRuntime(options(unsafeEntryHost), runtime([{ type: 'operation_batch_created', batch: batch() }])),
    { code: 'validation_failed' },
  )
  assert.equal(unsafeEntryHost.calls.includes('commit'), false)

  const warningHost = new Host()
  await assert.rejects(runDirectEditAgentWithRuntime(options(warningHost), runtime([
    { type: 'warning', warning: { code: 'unsafe', severity: 'warning', message: 'x'.repeat(4001) } },
    { type: 'operation_batch_created', batch: batch() },
  ])), { code: 'validation_failed' })
  assert.equal(warningHost.calls.includes('commit'), false)

  const excessiveHost = new Host()
  await assert.rejects(runDirectEditAgentWithRuntime(options(excessiveHost), runtime([
    ...Array.from({ length: 101 }, (_, index) => ({
      type: 'warning' as const,
      warning: { code: `warning-${index}`, severity: 'warning' as const, message: `Warning ${index}` },
    })),
    { type: 'operation_batch_created', batch: batch() },
  ])), { code: 'validation_failed' })
  assert.equal(excessiveHost.calls.includes('commit'), false)
})

await test('invalid commit revision falls back safely and save errors stay generic', async () => {
  const host = new Host()
  host.commitResult = {
    resultRevision: 'data:image/png;base64,secret',
    historyEntryId: 'history-2',
    saved: false,
    saveError: 'Bearer super-secret data:image/png;base64,secret',
  }
  const result = await runDirectEditAgentWithRuntime(options(host), runtime([
    { type: 'operation_batch_created', batch: batch() },
  ]))
  assert.equal(result.mode, 'direct_edit')
  if (result.mode !== 'direct_edit') return
  assert.equal(result.metadata.resultRevision, 'revision-2')
  assert.deepEqual(result.metadata.warningCodes, ['save_failed', 'commit_revision_invalid'])
  const persisted = JSON.stringify(result.metadata)
  assert.equal(persisted.includes('super-secret'), false)
  assert.equal(persisted.includes('data:image'), false)
  assert.equal(editorAiTaskMetadataSchema.safeParse(result.metadata).success, true)
})

await test('unlock failure after commit resolves applied with a bounded cleanup warning', async () => {
  const host = new Host()
  host.unlockError = new Error('raw unlock secret')
  const observed: string[] = []
  const observedEvents: DirectEditAgentEvent<NarrativeDocumentSnapshot>[] = []
  const result = await runDirectEditAgentWithRuntime({
    ...options(host),
    onEvent: (event) => {
      observedEvents.push(event)
      observed.push(event.type === 'status_changed' ? event.status : event.type)
    },
  }, runtime([{ type: 'operation_batch_created', batch: batch() }]))
  assert.equal(result.mode, 'direct_edit')
  if (result.mode !== 'direct_edit') return
  assert.equal(host.calls.filter((call) => call === 'commit').length, 1)
  assert.equal(host.calls.filter((call) => call === 'unlock').length, 1)
  assert.deepEqual(observed, [
    'operation_batch_created', 'simulating', 'validating', 'applying',
    'warning', 'completed', 'completed',
  ])
  assert.equal(observed.includes('error'), false)
  assert.equal(observed.includes('failed'), false)
  assert.equal(result.metadata.changeSet.state, 'applied')
  assert.deepEqual(result.metadata.warningCodes, ['host_unlock_failed'])
  assert.deepEqual(result.metadata.changeSet.warnings, [{
    code: 'host_unlock_failed',
    message: 'The edit was applied, but the editor could not be unlocked.',
    severity: 'warning',
  }])
  assert.equal(JSON.stringify({ result, observedEvents }).includes('raw unlock secret'), false)
})

await test('unlock failure does not mask a primary failure', async () => {
  const host = new Host()
  host.simulationError = new Error('simulation crashed')
  host.unlockError = new Error('unlock crashed')
  await assert.rejects(
    runDirectEditAgentWithRuntime(options(host), runtime([{ type: 'operation_batch_created', batch: batch() }])),
    { code: 'simulation_failed', message: 'Editor host simulation failed' },
  )
  assert.equal(host.calls.filter((call) => call === 'unlock').length, 1)
})

await test('suggestion runtime terminal events never return a suggestion', async () => {
  for (const terminalEvent of [
    { type: 'error', code: 'invalid_operation_batch', message: 'suggestion failed' },
    { type: 'status_changed', status: 'stopped' },
  ] as DirectEditAgentEvent<NarrativeDocumentSnapshot>[]) {
    const host = new Host()
    await assert.rejects(runDirectEditAgentWithRuntime({
      ...options(host),
      modelCapabilities: { vision: false, structuredOutput: false, toolCalling: false },
    }, runtime([
      terminalEvent,
      { type: 'text_delta', text: 'must be ignored' },
    ])), terminalEvent.type === 'error'
      ? { code: 'invalid_operation_batch', message: 'suggestion failed' }
      : { name: 'AbortError' })
    assert.deepEqual(host.calls, ['capture'])
  }
})

await test('event callback failures are isolated before and after commit', async () => {
  for (const failurePoint of ['planning', 'operation_batch_created', 'completed', 'final_completed', 'always']) {
    const host = new Host()
    let completedEvents = 0
    const result = await runDirectEditAgentWithRuntime({
      ...options(host),
      onEvent: (event) => {
        if (event.type === 'completed') completedEvents += 1
        const eventName = event.type === 'status_changed'
          ? event.status === 'completed' ? 'final_completed' : event.status
          : event.type
        if (failurePoint === 'always' || eventName === failurePoint) throw new Error('listener failed')
      },
    }, runtime([
      { type: 'status_changed', status: 'planning' },
      { type: 'operation_batch_created', batch: batch() },
    ]))
    assert.equal(result.mode, 'direct_edit')
    assert.deepEqual(host.calls, ['lock', 'capture', 'simulate', 'revision', 'revision', 'commit', 'unlock'])
    assert.equal(host.calls.filter((call) => call === 'commit').length, 1)
    if (failurePoint !== 'always') assert.equal(completedEvents, 1)
  }
})

await test('abort or revision change during applying prevents commit', async () => {
  const abortHost = new Host()
  const controller = new AbortController()
  await assert.rejects(runDirectEditAgentWithRuntime({
    ...options(abortHost),
    signal: controller.signal,
    onEvent: (event) => {
      if (event.type === 'status_changed' && event.status === 'applying') controller.abort('late abort')
    },
  }, runtime([{ type: 'operation_batch_created', batch: batch() }])), { name: 'AbortError' })
  assert.deepEqual(abortHost.calls, ['lock', 'capture', 'simulate', 'revision', 'unlock'])

  const staleHost = new Host()
  await assert.rejects(runDirectEditAgentWithRuntime({
    ...options(staleHost),
    onEvent: (event) => {
      if (event.type === 'status_changed' && event.status === 'applying') staleHost.revision = 'revision-9'
    },
  }, runtime([{ type: 'operation_batch_created', batch: batch() }])), { code: 'stale_revision' })
  assert.deepEqual(staleHost.calls, ['lock', 'capture', 'simulate', 'revision', 'revision', 'unlock'])
})

await test('capture failure unlocks, while lock failure does not unlock', async () => {
  const captureHost = new Host()
  captureHost.captureSnapshot = async () => {
    captureHost.calls.push('capture')
    throw new Error('capture failed')
  }
  await assert.rejects(runDirectEditAgentWithRuntime(options(captureHost), runtime([])))
  assert.deepEqual(captureHost.calls, ['lock', 'capture', 'unlock'])

  const lockHost = new Host()
  lockHost.lock = () => {
    lockHost.calls.push('lock')
    throw new Error('lock failed')
  }
  await assert.rejects(runDirectEditAgentWithRuntime(options(lockHost), runtime([])))
  assert.deepEqual(lockHost.calls, ['lock'])
})

await test('zine wrong-spread and foreign-asset batches never simulate', async () => {
  const zineSnapshot: ZineDocumentSnapshot = {
    capability: 'zine',
    projectId: 'project-1',
    targetSpreadId: 'spread-1',
    project: { projectId: 'project-1', settings: {}, spreadOrder: ['spread-1'], spreadSummaries: {} },
    currentSpread: { spreadId: 'spread-1', index: 0, structure: {}, summary: {} },
    adjacentSpreads: [],
    assetCandidates: [{ assetId: 'asset-1', metadata: {} }],
    revision: 'zine-revision-1',
  }
  const calls: string[] = []
  const host = {
    lock() { calls.push('lock') },
    unlock() { calls.push('unlock') },
    async captureSnapshot() { calls.push('capture'); return zineSnapshot },
    getCurrentRevision() { calls.push('revision'); return zineSnapshot.revision },
    async simulate() { calls.push('simulate'); throw new Error('must not simulate') },
    async commit() { calls.push('commit'); throw new Error('must not commit') },
  } as unknown as AiDocumentHost<'zine'>
  const zineOptions = {
    ...options(host as unknown as Host),
    host,
    authorization: {
      allowDelete: false,
      deleteTargetIds: [],
      targetSpreadId: 'spread-1',
      projectAssetIds: ['asset-1'],
    },
  }
  const candidates: EditorAiCommitBatch<'zine'>[] = [
    {
      taskId: 'task-1', capability: 'zine', baseRevision: 'zine-revision-1',
      target: { documentId: 'project-1', spreadId: 'spread-2' },
      operations: [{
        operationId: 'zine-1', type: 'set_slot_attrs', spreadId: 'spread-2', slotId: 'slot-1', attrs: {},
      }],
      summary: ['Wrong spread'],
    },
    {
      taskId: 'task-1', capability: 'zine', baseRevision: 'zine-revision-1',
      target: { documentId: 'project-1', spreadId: 'spread-1' },
      operations: [{
        operationId: 'zine-2', type: 'assign_asset', spreadId: 'spread-1', slotId: 'slot-1', assetId: 'asset-foreign',
      }],
      summary: ['Foreign asset'],
    },
  ]
  for (const candidate of candidates) {
    calls.length = 0
    const zineRuntime = ({
      async *run() {
        yield { type: 'operation_batch_created', batch: candidate } as DirectEditAgentEvent<ZineDocumentSnapshot>
      },
    }) as unknown as DirectEditAgentRuntime<ZineDocumentSnapshot>
    await assert.rejects(runDirectEditAgentWithRuntime(zineOptions, zineRuntime))
    assert.deepEqual(calls, ['lock', 'capture', 'unlock'])
  }
  void (null as unknown as ZineEditorOperation)
})
