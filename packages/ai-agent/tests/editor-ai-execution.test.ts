import assert from 'node:assert/strict'

import * as publicApi from '../src/index'
import {
  EditorAiExecutionError,
  assertEditorAiRevision,
  hasEditorAiValidationErrors,
} from '../src/domain/execution'

import type {
  AiChangeEntry,
  AiDocumentHost,
  DeepReadonly,
  EditorAiCommitBatch,
  EditorAiCommitResult,
  EditorAiExecutionCapability,
  EditorAiExecutionErrorCode,
  EditorAiOperationByCapability,
  EditorAiSimulationResult,
  EditorAiSimulationResultForCapability,
  EditorAiSnapshotByCapability,
  EditorAiValidationIssue,
  NarrativeDocumentSnapshot,
  NarrativeEditorOperation,
  ZineDocumentSnapshot,
  ZineEditorOperation,
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

function createSnapshot(revision = 'revision-1'): NarrativeDocumentSnapshot {
  return {
    capability: 'narrative',
    documentId: 'story-1',
    documentKind: 'story',
    title: 'Story',
    root: { type: 'doc' },
    nodes: [],
    editorWidth: 960,
    visualSegments: [],
    revision,
  }
}

function createOperation(): NarrativeEditorOperation {
  return {
    operationId: 'operation-1',
    type: 'replace_text',
    nodeId: 'paragraph-1',
    from: 0,
    to: 5,
    replacement: 'After',
  }
}

function createZineSnapshot(revision = 'zine-revision-1'): ZineDocumentSnapshot {
  return {
    capability: 'zine',
    projectId: 'project-1',
    targetSpreadId: 'spread-1',
    project: {
      projectId: 'project-1',
      settings: {},
      spreadOrder: ['spread-1'],
      spreadSummaries: {},
    },
    currentSpread: {
      spreadId: 'spread-1',
      index: 0,
      structure: {},
      summary: {},
    },
    adjacentSpreads: [],
    assetCandidates: [],
    revision,
  }
}

function createChangeEntry(): AiChangeEntry {
  return {
    operation: 'replace_text',
    targetId: 'paragraph-1',
    targetLabel: 'Opening paragraph',
    category: 'content',
    before: 'Before',
    after: 'After',
  }
}

class FakeHost implements AiDocumentHost<'narrative'> {
  captureCount = 0
  simulationCount = 0
  commitCount = 0
  lockCount = 0
  unlockCount = 0

  async captureSnapshot(_signal?: AbortSignal): Promise<DeepReadonly<NarrativeDocumentSnapshot>> {
    this.captureCount += 1
    return createSnapshot()
  }

  getCurrentRevision(): string {
    return 'revision-1'
  }

  async simulate(
    _snapshot: DeepReadonly<NarrativeDocumentSnapshot>,
    _operations: ReadonlyArray<DeepReadonly<NarrativeEditorOperation>>,
    _signal?: AbortSignal,
  ): Promise<EditorAiSimulationResult<NarrativeDocumentSnapshot>> {
    this.simulationCount += 1
    return {
      snapshot: createSnapshot('revision-2'),
      resultRevision: 'revision-2',
      issues: [{ code: 'style-adjusted', severity: 'info', message: 'Adjusted style' }],
      changeEntries: [createChangeEntry()],
    }
  }

  async commit(
    _batch: EditorAiCommitBatch<'narrative'>,
    _simulation: EditorAiSimulationResult<NarrativeDocumentSnapshot>,
  ): Promise<EditorAiCommitResult> {
    this.commitCount += 1
    return {
      resultRevision: 'revision-2',
      historyEntryId: 'history-1',
      saved: false,
      saveError: 'Persistence unavailable',
    }
  }

  lock(_taskId: string): void {
    this.lockCount += 1
  }

  unlock(_taskId: string): void {
    this.unlockCount += 1
  }
}

class ZineFakeHost implements AiDocumentHost<'zine'> {
  async captureSnapshot(_signal?: AbortSignal): Promise<DeepReadonly<ZineDocumentSnapshot>> {
    throw new Error('compile-only host')
  }

  getCurrentRevision(): string {
    return 'compile-only'
  }

  async simulate(
    _snapshot: DeepReadonly<ZineDocumentSnapshot>,
    _operations: ReadonlyArray<DeepReadonly<ZineEditorOperation>>,
    _signal?: AbortSignal,
  ): Promise<EditorAiSimulationResult<ZineDocumentSnapshot>> {
    throw new Error('compile-only host')
  }

  async commit(
    _batch: EditorAiCommitBatch<'zine'>,
    _simulation: EditorAiSimulationResult<ZineDocumentSnapshot>,
  ): Promise<EditorAiCommitResult> {
    throw new Error('compile-only host')
  }

  lock(_taskId: string): void {}

  unlock(_taskId: string): void {}
}

class UnionCapabilityFakeHost implements AiDocumentHost<EditorAiExecutionCapability> {
  constructor(private readonly activeCapability: EditorAiExecutionCapability) {}

  async captureSnapshot(
    _signal?: AbortSignal,
  ): Promise<DeepReadonly<NarrativeDocumentSnapshot | ZineDocumentSnapshot>> {
    return this.activeCapability === 'narrative'
      ? createSnapshot()
      : createZineSnapshot()
  }

  getCurrentRevision(): string {
    return this.activeCapability === 'narrative'
      ? 'revision-1'
      : 'zine-revision-1'
  }

  async simulate<K extends EditorAiExecutionCapability>(
    _snapshot: DeepReadonly<EditorAiSnapshotByCapability[K]> & { readonly capability: K },
    _operations: ReadonlyArray<DeepReadonly<EditorAiOperationByCapability[NoInfer<K>]>>,
    _signal?: AbortSignal,
  ): Promise<EditorAiSimulationResultForCapability<K>> {
    throw new Error('compile-only host')
  }

  async commit(
    ..._args: Parameters<AiDocumentHost<EditorAiExecutionCapability>['commit']>
  ): Promise<EditorAiCommitResult> {
    throw new Error('compile-only host')
  }

  lock(_taskId: string): void {}

  unlock(_taskId: string): void {}
}

const narrativeHost = new FakeHost() satisfies AiDocumentHost<'narrative'>
const concreteZineHost = new ZineFakeHost() satisfies AiDocumentHost<'zine'>
const concreteUnionHost = new UnionCapabilityFakeHost('narrative') satisfies AiDocumentHost<
  EditorAiExecutionCapability
>
const narrativeOperations = [createOperation()] satisfies ReadonlyArray<
  EditorAiOperationByCapability['narrative']
>
const zineOperation = {
  operationId: 'zine-operation-1',
  type: 'delete_slot',
  spreadId: 'spread-1',
  slotId: 'slot-1',
} satisfies ZineEditorOperation

const narrativeBatch = {
  taskId: 'narrative-task',
  capability: 'narrative',
  baseRevision: 'revision-1',
  target: { documentId: 'story-1' },
  operations: narrativeOperations,
  summary: ['Replace opening text'],
} satisfies EditorAiCommitBatch<'narrative'>
const zineBatch = {
  taskId: 'zine-task',
  capability: 'zine',
  baseRevision: 'zine-revision-1',
  target: { documentId: 'project-1', spreadId: 'spread-1' },
  operations: [zineOperation],
  summary: ['Delete a slot'],
} satisfies EditorAiCommitBatch<'zine'>

async function assertConcreteUnionHostFlow(): Promise<void> {
  const host: AiDocumentHost<EditorAiExecutionCapability> = concreteUnionHost
  const snapshot = await host.captureSnapshot()

  if (snapshot.capability === 'narrative') {
    const result: EditorAiSimulationResult<NarrativeDocumentSnapshot> = await host.simulate(
      snapshot,
      narrativeOperations,
    )
    const documentId: string = result.snapshot.documentId
    void documentId
    await host.commit(narrativeBatch, result)
    // @ts-expect-error Narrative snapshots cannot be simulated with zine operations.
    await host.simulate(snapshot, [zineOperation])
    // @ts-expect-error Narrative simulations cannot be committed with zine batches.
    await host.commit(zineBatch, result)
  } else {
    const result: EditorAiSimulationResult<ZineDocumentSnapshot> = await host.simulate(
      snapshot,
      [zineOperation],
    )
    const projectId: string = result.snapshot.projectId
    void projectId
    await host.commit(zineBatch, result)
    // @ts-expect-error Zine snapshots cannot be simulated with narrative operations.
    await host.simulate(snapshot, narrativeOperations)
    // @ts-expect-error Zine simulations cannot be committed with narrative batches.
    await host.commit(narrativeBatch, result)
  }
}

void assertConcreteUnionHostFlow

async function assertCapturedSnapshotsAreDeeplyReadonly(): Promise<void> {
  const narrativeSnapshot = await narrativeHost.captureSnapshot()
  const narrativeDocumentId: string = narrativeSnapshot.documentId
  const narrativeCapability: 'narrative' = narrativeSnapshot.capability
  void narrativeDocumentId
  void narrativeCapability
  await narrativeHost.simulate(narrativeSnapshot, narrativeOperations)

  // @ts-expect-error Captured snapshot properties are readonly.
  narrativeSnapshot.title = 'Mutated'
  // @ts-expect-error Captured snapshot node arrays are readonly.
  narrativeSnapshot.nodes.push(null as unknown as NarrativeDocumentSnapshot['nodes'][number])
  // @ts-expect-error Captured snapshot node array length is readonly.
  narrativeSnapshot.nodes.length = 0
  const narrativeRoot = narrativeSnapshot.root
  if (narrativeRoot !== null && !Array.isArray(narrativeRoot) && typeof narrativeRoot === 'object') {
    // @ts-expect-error Captured snapshot root JSON is deeply readonly.
    narrativeRoot.type = 'mutated'
  }

  const zineSnapshot = await concreteZineHost.captureSnapshot()
  const zineProjectId: string = zineSnapshot.projectId
  const zineCapability: 'zine' = zineSnapshot.capability
  void zineProjectId
  void zineCapability
  await concreteZineHost.simulate(zineSnapshot, [zineOperation])

  // @ts-expect-error Captured snapshot properties are readonly.
  zineSnapshot.targetSpreadId = 'spread-2'
  // @ts-expect-error Captured spread order arrays are readonly.
  zineSnapshot.project.spreadOrder.push('spread-2')
  // @ts-expect-error Captured spread order array length is readonly.
  zineSnapshot.project.spreadOrder.length = 0
  // @ts-expect-error Captured project settings JSON is deeply readonly.
  zineSnapshot.project.settings.theme = 'dark'
  const currentStructure = zineSnapshot.currentSpread.structure
  if (currentStructure !== null && !Array.isArray(currentStructure) && typeof currentStructure === 'object') {
    // @ts-expect-error Captured current spread JSON is deeply readonly.
    currentStructure.layout = 'mutated'
  }

  const unionHost: AiDocumentHost<EditorAiExecutionCapability> = concreteUnionHost
  const unionSnapshot = await unionHost.captureSnapshot()
  if (unionSnapshot.capability === 'narrative') {
    const result = await unionHost.simulate(unionSnapshot, narrativeOperations)
    const documentId: string = result.snapshot.documentId
    void documentId
    await unionHost.commit(narrativeBatch, result)
  } else {
    const result = await unionHost.simulate(unionSnapshot, [zineOperation])
    const projectId: string = result.snapshot.projectId
    void projectId
    await unionHost.commit(zineBatch, result)
  }
}

void assertCapturedSnapshotsAreDeeplyReadonly

function assertExecutionContractTypes(): void {
  const capability: EditorAiExecutionCapability = 'narrative'
  const snapshot: EditorAiSnapshotByCapability[typeof capability] = createSnapshot()
  void narrativeHost.simulate(snapshot, narrativeOperations)

  void narrativeHost.simulate(snapshot, [
    // @ts-expect-error A narrative host cannot simulate zine operations.
    zineOperation,
  ])

  const zineHost = null as unknown as AiDocumentHost<'zine'>
  void zineHost.simulate(null as unknown as EditorAiSnapshotByCapability['zine'], [
    // @ts-expect-error A zine host cannot simulate narrative operations.
    createOperation(),
  ])

  function assertUnionHostCorrelation(
    host: AiDocumentHost<EditorAiExecutionCapability>,
    narrativeSnapshot: EditorAiSnapshotByCapability['narrative'],
    zineSnapshot: EditorAiSnapshotByCapability['zine'],
    narrativeBatch: EditorAiCommitBatch<'narrative'>,
    zineBatch: EditorAiCommitBatch<'zine'>,
    narrativeSimulation: EditorAiSimulationResult<NarrativeDocumentSnapshot>,
    zineSimulation: EditorAiSimulationResult<ZineDocumentSnapshot>,
  ): void {
    const narrativeResult: Promise<EditorAiSimulationResult<NarrativeDocumentSnapshot>> = host.simulate(
      narrativeSnapshot,
      narrativeOperations,
    )
    const zineResult: Promise<EditorAiSimulationResult<ZineDocumentSnapshot>> = host.simulate(
      zineSnapshot,
      [zineOperation],
    )
    // @ts-expect-error A narrative simulation call cannot return a zine result.
    const wrongNarrativeResult: Promise<EditorAiSimulationResult<ZineDocumentSnapshot>> = host.simulate(
      narrativeSnapshot,
      narrativeOperations,
    )
    void narrativeResult
    void zineResult
    void wrongNarrativeResult
    // @ts-expect-error A union-capability host must preserve snapshot/operation correlation.
    void host.simulate(narrativeSnapshot, [zineOperation])
    // @ts-expect-error A union-capability host must preserve snapshot/operation correlation.
    void host.simulate(zineSnapshot, narrativeOperations)

    void host.commit(narrativeBatch, narrativeSimulation)
    void host.commit(zineBatch, zineSimulation)
    // @ts-expect-error A union-capability host must preserve batch/simulation correlation.
    void host.commit(narrativeBatch, zineSimulation)
    // @ts-expect-error A union-capability host must preserve batch/simulation correlation.
    void host.commit(zineBatch, narrativeSimulation)
    // @ts-expect-error Final commit is noninterruptible and accepts exactly two arguments.
    void host.commit(narrativeBatch, narrativeSimulation, new AbortController().signal)
  }
  void assertUnionHostCorrelation
  void concreteZineHost

  const simulation = null as unknown as EditorAiSimulationResult<NarrativeDocumentSnapshot>
  // @ts-expect-error Simulation properties are readonly.
  simulation.resultRevision = 'revision-3'
  // @ts-expect-error Simulation snapshot node arrays are deeply readonly.
  simulation.snapshot.nodes.push(null as unknown as NarrativeDocumentSnapshot['nodes'][number])
  // @ts-expect-error Simulation snapshot root fields are readonly.
  simulation.snapshot.root = { type: 'mutated' }
  const simulationRoot = simulation.snapshot.root
  if (simulationRoot !== null && !Array.isArray(simulationRoot) && typeof simulationRoot === 'object') {
    // @ts-expect-error Simulation snapshot JSON objects are deeply readonly.
    simulationRoot.type = 'mutated'
  }
  for (const node of simulation.snapshot.nodes) {
    const nodeId: string = node.id
    void nodeId
    // @ts-expect-error Simulation snapshot node attrs are deeply readonly.
    node.attrs.align = 'right'
  }
  // @ts-expect-error Simulation issue arrays are readonly.
  simulation.issues.push({ code: 'injected', severity: 'error', message: 'Injected' })
  // @ts-expect-error Simulation issue array length is readonly.
  simulation.issues.length = 0
  // @ts-expect-error Simulation change entry arrays are readonly.
  simulation.changeEntries.push(createChangeEntry())
  // @ts-expect-error Simulation change entry fields are readonly.
  simulation.changeEntries[0].after = 'mutated'
  const nestedBefore = simulation.changeEntries[0].before
  if (nestedBefore !== undefined && !Array.isArray(nestedBefore) && typeof nestedBefore === 'object') {
    // @ts-expect-error Simulation change entry JSON objects are deeply readonly.
    nestedBefore.heading = 'mutated'
  }

  const issue = null as unknown as EditorAiValidationIssue
  // @ts-expect-error Validation issue fields are readonly.
  issue.message = 'mutated'
  if (issue.targetIds !== undefined) {
    // @ts-expect-error Validation target IDs are readonly.
    issue.targetIds.push('paragraph-2')
  }

  const commit = null as unknown as EditorAiCommitResult
  // @ts-expect-error Commit result fields are readonly.
  commit.saved = true

  const zineSimulation = null as unknown as EditorAiSimulationResult<ZineDocumentSnapshot>
  const projectId: string = zineSimulation.snapshot.project.projectId
  const currentSpreadId: string = zineSimulation.snapshot.currentSpread.spreadId
  void projectId
  void currentSpreadId
  // @ts-expect-error Zine simulation project settings are deeply readonly.
  zineSimulation.snapshot.project.settings.theme = 'dark'
  // @ts-expect-error Zine simulation spread order is deeply readonly.
  zineSimulation.snapshot.project.spreadOrder.push('spread-2')
  const currentStructure = zineSimulation.snapshot.currentSpread.structure
  if (currentStructure !== null && !Array.isArray(currentStructure) && typeof currentStructure === 'object') {
    // @ts-expect-error Zine current spread JSON is deeply readonly.
    currentStructure.layout = 'mutated'
  }

  const narrativeBatch = null as unknown as EditorAiCommitBatch<'narrative'>
  // @ts-expect-error Final commit is noninterruptible and accepts no AbortSignal.
  void narrativeHost.commit(narrativeBatch, simulation, new AbortController().signal)
  // @ts-expect-error Commit operation arrays have readonly length.
  narrativeBatch.operations.length = 0
  // @ts-expect-error Commit targets are readonly.
  narrativeBatch.target.documentId = 'story-2'
  // @ts-expect-error Commit summaries are readonly arrays.
  narrativeBatch.summary.push('Injected')
  for (const operation of narrativeBatch.operations) {
    const operationId: string = operation.operationId
    void operationId
    if (operation.type === 'set_node_attrs') {
      // @ts-expect-error Commit operation attrs are deeply readonly.
      operation.attrs.align = 'right'
    }
  }

  const zineBatch = null as unknown as EditorAiCommitBatch<'zine'>
  for (const operation of zineBatch.operations) {
    if (operation.type === 'set_image_crop') {
      const scale: number = operation.crop.scale
      void scale
      // @ts-expect-error Commit operation crop fields are deeply readonly.
      operation.crop.scale = 2
    }
  }
}

void assertExecutionContractTypes

function assertReadonlySimulationInputTypes(): void {
  const narrativeHost = {
    async captureSnapshot() {
      throw new Error('compile-only host')
    },
    getCurrentRevision() {
      return 'compile-only'
    },
    async simulate(snapshot, operations) {
      const documentId: string = snapshot.documentId
      const operationId: string = operations[0].operationId
      void documentId
      void operationId
      for (const node of snapshot.nodes) {
        const nodeType: string = node.type
        void nodeType
      }
      for (const operation of operations) {
        const type: NarrativeEditorOperation['type'] = operation.type
        void type
      }

      // @ts-expect-error Simulation snapshots expose readonly node arrays.
      snapshot.nodes.push(null as unknown as NarrativeDocumentSnapshot['nodes'][number])
      // @ts-expect-error Simulation snapshot node array length is readonly.
      snapshot.nodes.length = 0
      // @ts-expect-error Simulation snapshot roots are readonly.
      snapshot.root = { type: 'mutated' }
      const root = snapshot.root
      if (root !== null && !Array.isArray(root) && typeof root === 'object') {
        // @ts-expect-error Simulation snapshot root JSON is deeply readonly.
        root.type = 'mutated'
      }
      for (const node of snapshot.nodes) {
        // @ts-expect-error Simulation snapshot node attrs are deeply readonly.
        node.attrs.align = 'right'
      }

      // @ts-expect-error Simulation operation fields are readonly.
      operations[0].operationId = 'mutated'
      for (const operation of operations) {
        if (operation.type === 'set_node_attrs') {
          // @ts-expect-error Simulation operation attrs are deeply readonly.
          operation.attrs.align = 'right'
        }
        if (operation.type === 'insert_node') {
          const insertedNode = operation.node
          if (insertedNode !== null && !Array.isArray(insertedNode) && typeof insertedNode === 'object') {
            // @ts-expect-error Simulation operation node JSON is deeply readonly.
            insertedNode.type = 'mutated'
          }
        }
      }

      throw new Error('compile-only host')
    },
    async commit() {
      throw new Error('compile-only host')
    },
    lock() {},
    unlock() {},
  } satisfies AiDocumentHost<'narrative'>

  const zineHost = {
    async captureSnapshot() {
      throw new Error('compile-only host')
    },
    getCurrentRevision() {
      return 'compile-only'
    },
    async simulate(snapshot, operations) {
      const projectId: string = snapshot.project.projectId
      void projectId
      for (const operation of operations) {
        const operationId: string = operation.operationId
        void operationId
        if (operation.type === 'set_slot_attrs') {
          // @ts-expect-error Zine simulation operation attrs are deeply readonly.
          operation.attrs.align = 'right'
        }
        if (operation.type === 'set_image_crop') {
          const scale: number = operation.crop.scale
          void scale
          // @ts-expect-error Zine simulation operation crop is deeply readonly.
          operation.crop.scale = 2
        }
        if (operation.type === 'insert_slot') {
          const slot = operation.slot
          if (slot !== null && !Array.isArray(slot) && typeof slot === 'object') {
            // @ts-expect-error Zine simulation slot JSON is deeply readonly.
            slot.kind = 'mutated'
          }
        }
      }
      throw new Error('compile-only host')
    },
    async commit() {
      throw new Error('compile-only host')
    },
    lock() {},
    unlock() {},
  } satisfies AiDocumentHost<'zine'>

  void narrativeHost
  void zineHost
}

void assertReadonlySimulationInputTypes

await test('document host contract exposes exact simulation and commit result shapes', async () => {
  const host = new FakeHost()
  const snapshot = await host.captureSnapshot()
  const simulation = await host.simulate(snapshot, [createOperation()])
  const batch: EditorAiCommitBatch<'narrative'> = {
    taskId: 'task-1',
    capability: 'narrative',
    baseRevision: snapshot.revision,
    target: { documentId: snapshot.documentId },
    operations: [createOperation()],
    summary: ['Replace opening text'],
  }
  const commit = await host.commit(batch, simulation)
  host.lock(batch.taskId)
  host.unlock(batch.taskId)

  assert.equal(host.captureCount, 1)
  assert.equal(host.simulationCount, 1)
  assert.equal(host.commitCount, 1)
  assert.equal(host.lockCount, 1)
  assert.equal(host.unlockCount, 1)
  assert.deepEqual(simulation, {
    snapshot: createSnapshot('revision-2'),
    resultRevision: 'revision-2',
    issues: [{ code: 'style-adjusted', severity: 'info', message: 'Adjusted style' }],
    changeEntries: [createChangeEntry()],
  })
  assert.deepEqual(commit, {
    resultRevision: 'revision-2',
    historyEntryId: 'history-1',
    saved: false,
    saveError: 'Persistence unavailable',
  })
})

await test('every execution error code is constructible and preserved', () => {
  const codes: EditorAiExecutionErrorCode[] = [
    'aborted',
    'capability_unavailable',
    'context_budget_exceeded',
    'invalid_operation_batch',
    'operation_not_authorized',
    'stale_revision',
    'simulation_failed',
    'validation_failed',
    'commit_failed',
  ]

  for (const code of codes) {
    const error = new EditorAiExecutionError(code, `Failure: ${code}`)
    assert.equal(error.code, code)
  }
})

await test('execution errors omit cause when options do not include it', () => {
  const error = new EditorAiExecutionError('simulation_failed', 'Simulation failed')

  assert.equal(Object.hasOwn(error, 'cause'), false)
})

await test('execution errors preserve an explicitly undefined cause', () => {
  const error = new EditorAiExecutionError('simulation_failed', 'Simulation failed', {
    cause: undefined,
  })

  assert.equal(Object.hasOwn(error, 'cause'), true)
  assert.equal(error.cause, undefined)
})

await test('execution errors preserve Error identity, message, name, and object cause', () => {
  const cause = new Error('upstream failure')
  const error = new EditorAiExecutionError('simulation_failed', 'Simulation failed', {
    cause,
  })

  assert.equal(error instanceof Error, true)
  assert.equal(error instanceof EditorAiExecutionError, true)
  assert.equal(error.name, 'EditorAiExecutionError')
  assert.equal(error.message, 'Simulation failed')
  assert.equal(error.cause, cause)
})

await test('execution error issues are isolated from input and returned mutations', () => {
  const targetIds = ['paragraph-1']
  const inputIssues: Array<{
    code: string
    severity: 'error' | 'warning' | 'info'
    message: string
    operationId?: string
    targetIds?: string[]
  }> = [{
    code: 'selection-expanded',
    severity: 'warning',
    message: 'Selection expanded',
    operationId: 'operation-1',
    targetIds,
  }]
  const error = new EditorAiExecutionError('validation_failed', 'Validation failed', {
    issues: inputIssues,
  })

  inputIssues[0].message = 'mutated input'
  inputIssues.push({ code: 'injected', severity: 'error', message: 'Injected' })
  targetIds.push('paragraph-2')

  const returned = error.issues
  assert.ok(returned)
  assert.deepEqual(returned, [{
    code: 'selection-expanded',
    severity: 'warning',
    message: 'Selection expanded',
    operationId: 'operation-1',
    targetIds: ['paragraph-1'],
  }])

  const mutableReturned = returned as Array<{
    code: string
    severity: 'error' | 'warning' | 'info'
    message: string
    operationId?: string
    targetIds?: string[]
  }>
  mutableReturned[0].message = 'mutated return'
  mutableReturned[0].targetIds?.push('paragraph-3')
  mutableReturned.push({ code: 'another', severity: 'info', message: 'Another' })

  assert.deepEqual(error.issues, [{
    code: 'selection-expanded',
    severity: 'warning',
    message: 'Selection expanded',
    operationId: 'operation-1',
    targetIds: ['paragraph-1'],
  }])
})

await test('validation helper reports only error severity', () => {
  assert.equal(hasEditorAiValidationErrors([]), false)
  assert.equal(hasEditorAiValidationErrors([
    { code: 'note', severity: 'info', message: 'Note' },
    { code: 'warning', severity: 'warning', message: 'Warning' },
  ]), false)
  assert.equal(hasEditorAiValidationErrors([
    { code: 'failure', severity: 'error', message: 'Failure' },
  ]), true)
})

await test('revision assertion accepts matches and rejects stale revisions', () => {
  assert.doesNotThrow(() => assertEditorAiRevision('revision-1', 'revision-1'))
  assert.throws(
    () => assertEditorAiRevision('revision-1', 'revision-2'),
    (error: unknown) => error instanceof EditorAiExecutionError
      && error.code === 'stale_revision'
      && /revision-1/.test(error.message)
      && /revision-2/.test(error.message),
  )
})

await test('package root exports production execution contracts without Task 5 test seams', () => {
  assert.equal(publicApi.EditorAiExecutionError, EditorAiExecutionError)
  assert.equal(publicApi.hasEditorAiValidationErrors, hasEditorAiValidationErrors)
  assert.equal(publicApi.assertEditorAiRevision, assertEditorAiRevision)
  assert.equal('applyEditorAiContextBudgetWithEstimatorForTest' in publicApi, false)
})
