# AI Direct Edit Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared structured direct-edit protocol, deterministic revisions, capability degradation, validated operation batches, sandbox host contract, and one-commit orchestration required by both the TipTap narrative editor and Desktop Zine editor.

**Architecture:** Add a new direct-edit path beside the existing proposal/approval path so downstream consumers can migrate without breaking current behavior. `@mo-gallery/ai-agent` owns SDK-neutral snapshots, schemas, authorization, task events, prompts, model planning, and exactly one host commit call; TipTap and Zine hosts will later own concrete simulation, validation, native history, and persistence.

**Tech Stack:** TypeScript strict mode, Zod, Vercel AI SDK, OpenAI-compatible provider adapter, Node assertions through `tsx`, pnpm workspace.

---

## Scope and file map

This is plan 1 of 4 for the approved design. It deliberately does not add the sidebar or mutate TipTap/Zine state yet.

**Create:**

- `packages/ai-agent/src/domain/revision.ts` — canonical JSON and stable revisions.
- `packages/ai-agent/src/domain/changes.ts` — unified Story/Blog/Zine change-set and task metadata.
- `packages/ai-agent/src/domain/capabilities.ts` — model capability and context-budget resolution.
- `packages/ai-agent/src/domain/execution.ts` — host sandbox/commit contract and typed errors.
- `packages/ai-agent/src/direct-edit-prompt.ts` — shared narrative/Zine direct-edit prompts.
- `packages/ai-agent/src/runtime/vercel-ai/direct-edit-agent.ts` — structured operation-batch runtime.
- `packages/ai-agent/tests/editor-ai-domain.test.ts` — revisions, schemas, authorization, degradation.
- `packages/ai-agent/tests/editor-ai-direct-edit-runtime.test.ts` — runtime/tool behavior.
- `packages/ai-agent/tests/editor-ai-execution.test.ts` — one-simulation/one-commit orchestration.

**Modify:**

- `packages/ai-agent/src/domain/document.ts` — retain legacy text snapshot and add structured snapshots.
- `packages/ai-agent/src/domain/operations.ts` — retain legacy operation API and add strict direct-edit operations.
- `packages/ai-agent/src/domain/agent.ts` — retain legacy events and add direct-edit task/runtime protocol.
- `packages/ai-agent/src/agent.ts` — retain `runEditorAgent`; add direct-edit orchestrator.
- `packages/ai-agent/src/index.ts` — export new SDK-neutral public API.
- `packages/ai-agent/tests/editor-ai-runtime.test.ts` — explicitly preserve legacy compatibility.
- `packages/ai-agent/package.json` — focused test/typecheck scripts.
- `packages/ai-agent/README.md` — document dual legacy/direct-edit flows.

## Contract decisions locked by this plan

1. Existing `EditorDocumentSnapshot`, `EditorOperation`, `EditorProposal`, `approval_required`, and `runEditorAgent()` remain available until all callers migrate.
2. New structured APIs use `StructuredEditorSnapshot`, `DirectEditorOperation`, `EditorOperationBatch`, and `runDirectEditAgent()`.
3. Change-set `before`/`after` values are `JsonValue`, not arbitrary `unknown`.
4. Completed tasks require a change set and result revision; failed/stopped tasks cannot claim an applied change set.
5. The model proposes operations, but the host simulation creates authoritative Diff entries.
6. Deletion permission is explicit and target-scoped; keyword detection is never the authorization boundary.
7. Every Zine write operation carries `spreadId`; both schema and authorization reject cross-spread writes.
8. Suggestion-only mode never locks, simulates, or commits.

---

### Task 1: Canonical structured revisions

**Files:**

- Create: `packages/ai-agent/src/domain/revision.ts`
- Create: `packages/ai-agent/tests/editor-ai-domain.test.ts`
- Modify: `packages/ai-agent/src/domain/document.ts`

- [ ] **Step 1: Write failing canonical-revision tests**

Add the standalone test harness and assertions to `packages/ai-agent/tests/editor-ai-domain.test.ts`:

```ts
import assert from 'node:assert/strict'

import {
  canonicalizeJson,
  createStructuredRevision,
} from '../src/domain/revision'

function test(name: string, run: () => void): void {
  try {
    run()
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}`)
    throw error
  }
}

test('canonical JSON ignores object insertion order', () => {
  const first = { z: 1, nested: { b: true, a: 'x' } }
  const second = { nested: { a: 'x', b: true }, z: 1 }

  assert.equal(canonicalizeJson(first), canonicalizeJson(second))
  assert.equal(
    createStructuredRevision('narrative', first),
    createStructuredRevision('narrative', second),
  )
})

test('canonical JSON preserves array order', () => {
  assert.notEqual(
    createStructuredRevision('zine', { items: ['a', 'b'] }),
    createStructuredRevision('zine', { items: ['b', 'a'] }),
  )
})

test('revision namespaces cannot collide', () => {
  const value = { content: 'same' }
  assert.notEqual(
    createStructuredRevision('narrative', value),
    createStructuredRevision('zine', value),
  )
})
```

- [ ] **Step 2: Run the test and verify the missing-module failure**

Run:

```bash
pnpm exec tsx packages/ai-agent/tests/editor-ai-domain.test.ts
```

Expected: FAIL because `../src/domain/revision` does not exist.

- [ ] **Step 3: Implement canonicalization and FNV-1a revision generation**

Create `packages/ai-agent/src/domain/revision.ts`:

```ts
import type { JsonValue } from './json'

export type StructuredRevisionNamespace = 'narrative' | 'zine'

function hashFnv1a(value: string): string {
  let hash = 0x811c9dc5

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }

  return (hash >>> 0).toString(16).padStart(8, '0')
}

function canonicalize(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(canonicalize)
  }

  if (value !== null && typeof value === 'object') {
    const result: Record<string, JsonValue> = {}
    for (const key of Object.keys(value).sort()) {
      result[key] = canonicalize(value[key])
    }
    return result
  }

  return value
}

export function canonicalizeJson(value: JsonValue): string {
  return JSON.stringify(canonicalize(value))
}

export function createStructuredRevision(
  namespace: StructuredRevisionNamespace,
  value: JsonValue,
): string {
  const canonical = canonicalizeJson(value)
  return `${namespace}-fnv1a-${hashFnv1a(canonical)}-${canonical.length}`
}

export function createTextRevision(value: string): string {
  return `fnv1a-${hashFnv1a(value)}-${value.length}`
}
```

Modify `packages/ai-agent/src/domain/document.ts` so `createEditorDocumentRevision()` delegates to `createTextRevision()` while keeping its current signature and output format.

- [ ] **Step 4: Run focused tests**

Run:

```bash
pnpm exec tsx packages/ai-agent/tests/editor-ai-domain.test.ts
pnpm exec tsx packages/ai-agent/tests/editor-ai-runtime.test.ts
```

Expected: all test labels pass and both commands exit 0.

- [ ] **Step 5: Commit the canonical revision foundation**

```bash
git add packages/ai-agent/src/domain/revision.ts packages/ai-agent/src/domain/document.ts packages/ai-agent/tests/editor-ai-domain.test.ts
git commit -m "feat: add canonical AI document revisions"
```

---

### Task 2: Structured narrative and Zine snapshots

**Files:**

- Modify: `packages/ai-agent/src/domain/document.ts`
- Modify: `packages/ai-agent/tests/editor-ai-domain.test.ts`

- [ ] **Step 1: Add failing snapshot revision tests**

Append:

```ts
import {
  createNarrativeDocumentSnapshot,
  createZineDocumentSnapshot,
} from '../src/domain/document'

const imageA = {
  id: 'screen-1',
  dataUrl: 'data:image/jpeg;base64,AAAA',
  mediaType: 'image/jpeg',
  width: 800,
  height: 600,
  byteLength: 4,
}

test('narrative screenshots do not affect revision', () => {
  const base = {
    documentId: 'story-1',
    documentKind: 'story' as const,
    title: 'Story',
    root: { type: 'doc', content: [] },
    nodes: [],
    editorWidth: 760,
  }
  const first = createNarrativeDocumentSnapshot({
    ...base,
    visualSegments: [{ id: 's1', image: imageA, nodeIds: [], startY: 0, endY: 600 }],
  })
  const second = createNarrativeDocumentSnapshot({
    ...base,
    visualSegments: [{
      id: 's1',
      image: { ...imageA, dataUrl: 'data:image/jpeg;base64,BBBB' },
      nodeIds: [],
      startY: 0,
      endY: 600,
    }],
  })
  assert.equal(first.revision, second.revision)
})

test('narrative node attributes affect revision', () => {
  const create = (level: number) => createNarrativeDocumentSnapshot({
    documentId: 'story-1',
    documentKind: 'story',
    root: { type: 'doc' },
    editorWidth: 760,
    visualSegments: [],
    nodes: [{
      id: 'heading-1',
      type: 'heading',
      index: 0,
      depth: 1,
      attrs: { level },
      marks: [],
      childIds: [],
    }],
  })
  assert.notEqual(create(1).revision, create(2).revision)
})

test('Zine preview bytes are volatile but slot geometry is stable input', () => {
  const create = (x: number, dataUrl: string) => createZineDocumentSnapshot({
    projectId: 'zine-1',
    targetSpreadId: 'spread-1',
    project: {
      projectId: 'zine-1',
      settings: { pageSize: 'a5' },
      spreadOrder: ['spread-1'],
      spreadSummaries: [],
    },
    currentSpread: {
      spreadId: 'spread-1',
      index: 0,
      structure: { slots: [{ id: 'slot-1', x }] },
      summary: {},
      preview: { ...imageA, dataUrl },
    },
    adjacentSpreads: [],
    assetCandidates: [],
  })
  assert.equal(create(1, 'data:a').revision, create(1, 'data:b').revision)
  assert.notEqual(create(1, 'data:a').revision, create(2, 'data:a').revision)
})
```

- [ ] **Step 2: Run tests and verify missing exports**

Run:

```bash
pnpm exec tsx packages/ai-agent/tests/editor-ai-domain.test.ts
```

Expected: FAIL because structured snapshot constructors are not exported.

- [ ] **Step 3: Add structured snapshot types and constructors**

Add to `packages/ai-agent/src/domain/document.ts`:

```ts
import { createStructuredRevision } from './revision'
import type { JsonValue } from './json'

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

export interface ZineProjectSummarySnapshot {
  projectId: string
  settings: JsonValue
  spreadOrder: string[]
  spreadSummaries: JsonValue[]
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
  metadata: JsonValue
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

export type StructuredEditorSnapshot =
  | NarrativeDocumentSnapshot
  | ZineDocumentSnapshot

type NarrativeInput = Omit<NarrativeDocumentSnapshot, 'capability' | 'revision'>
type ZineInput = Omit<ZineDocumentSnapshot, 'capability' | 'revision'>

export function createNarrativeDocumentSnapshot(
  input: NarrativeInput,
): NarrativeDocumentSnapshot {
  const revision = createStructuredRevision('narrative', {
    documentId: input.documentId,
    documentKind: input.documentKind,
    title: input.title ?? null,
    root: input.root,
    nodes: input.nodes,
    editorWidth: input.editorWidth,
  })
  return { capability: 'narrative', ...input, revision }
}

export function createZineDocumentSnapshot(input: ZineInput): ZineDocumentSnapshot {
  const revision = createStructuredRevision('zine', {
    projectId: input.projectId,
    targetSpreadId: input.targetSpreadId,
    project: input.project,
    currentSpread: {
      spreadId: input.currentSpread.spreadId,
      index: input.currentSpread.index,
      structure: input.currentSpread.structure,
      summary: input.currentSpread.summary,
    },
    adjacentSpreads: input.adjacentSpreads.map(({ preview: _preview, ...spread }) => spread),
    assetCandidates: input.assetCandidates.map(({ thumbnail: _thumbnail, ...asset }) => asset),
  })
  return { capability: 'zine', ...input, revision }
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
```

Use explicit constructor input interfaces instead of the private aliases if downstream TypeScript needs to name them.

- [ ] **Step 4: Run domain and legacy tests**

```bash
pnpm exec tsx packages/ai-agent/tests/editor-ai-domain.test.ts
pnpm exec tsx packages/ai-agent/tests/editor-ai-runtime.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit structured snapshots**

```bash
git add packages/ai-agent/src/domain/document.ts packages/ai-agent/tests/editor-ai-domain.test.ts
git commit -m "feat: add structured AI editor snapshots"
```

---

### Task 3: Strict direct-edit operations and authorization

**Files:**

- Modify: `packages/ai-agent/src/domain/operations.ts`
- Modify: `packages/ai-agent/tests/editor-ai-domain.test.ts`

- [ ] **Step 1: Add failing schema and authorization tests**

Append tests covering a valid narrative batch, strict unknown-key rejection, delete authorization, cross-spread rejection, and project-asset membership:

```ts
import {
  editorOperationBatchSchema,
  validateOperationAuthorization,
} from '../src/domain/operations'

test('strict direct-edit batches reject unknown keys', () => {
  const result = editorOperationBatchSchema.safeParse({
    taskId: 'task-1',
    capability: 'narrative',
    baseRevision: 'revision-1',
    target: { documentId: 'story-1' },
    operations: [{
      operationId: 'op-1',
      type: 'replace_text',
      nodeId: 'node-1',
      from: 0,
      to: 4,
      replacement: 'new',
      arbitraryCss: 'display:none',
    }],
    summary: ['Updated text'],
  })
  assert.equal(result.success, false)
})

test('delete requires exact target authorization', () => {
  const operations = [{
    operationId: 'op-delete',
    type: 'delete_node' as const,
    nodeId: 'node-1',
  }]
  assert.deepEqual(
    validateOperationAuthorization(operations, {
      allowDelete: false,
      deleteTargetIds: [],
    }).map((issue) => issue.code),
    ['delete_not_authorized'],
  )
  assert.deepEqual(
    validateOperationAuthorization(operations, {
      allowDelete: true,
      deleteTargetIds: ['node-1'],
    }),
    [],
  )
})

test('Zine writes cannot escape the target spread or project assets', () => {
  const issues = validateOperationAuthorization([
    {
      operationId: 'op-1',
      type: 'assign_asset',
      spreadId: 'spread-2',
      slotId: 'slot-1',
      assetId: 'external-asset',
    },
  ], {
    allowDelete: false,
    deleteTargetIds: [],
    targetSpreadId: 'spread-1',
    projectAssetIds: ['asset-1'],
  })
  assert.deepEqual(
    issues.map((issue) => issue.code),
    ['wrong_target_spread', 'asset_not_in_project'],
  )
})
```

- [ ] **Step 2: Run tests and verify missing schema failure**

```bash
pnpm exec tsx packages/ai-agent/tests/editor-ai-domain.test.ts
```

Expected: FAIL because the direct-edit exports do not exist.

- [ ] **Step 3: Add discriminated operation types and strict Zod schemas**

Keep the legacy interfaces at the top of `domain/operations.ts`. Add direct-edit types with these discriminants:

```ts
export type NarrativeEditorOperation =
  | { operationId: string; type: 'replace_text'; nodeId: string; from: number; to: number; replacement: string }
  | { operationId: string; type: 'set_node_attrs'; nodeId: string; attrs: Record<string, JsonValue> }
  | { operationId: string; type: 'move_node'; nodeId: string; targetParentId: string; index: number }
  | { operationId: string; type: 'insert_node'; parentId: string; index: number; node: JsonValue }
  | { operationId: string; type: 'delete_node'; nodeId: string }

export type ZineEditorOperation =
  | { operationId: string; type: 'set_slot_attrs'; spreadId: string; slotId: string; attrs: Record<string, JsonValue> }
  | { operationId: string; type: 'insert_slot'; spreadId: string; index: number; slot: JsonValue }
  | { operationId: string; type: 'delete_slot'; spreadId: string; slotId: string }
  | { operationId: string; type: 'assign_asset'; spreadId: string; slotId: string; assetId: string }
  | { operationId: string; type: 'set_image_crop'; spreadId: string; slotId: string; crop: { scale: number; offsetX: number; offsetY: number; rotation: number } }
  | { operationId: string; type: 'set_layer_order'; spreadId: string; slotId: string; zIndex: number }
  | { operationId: string; type: 'apply_layout_template'; spreadId: string; templateId: string; targetSlotIds: string[]; options?: Record<string, JsonValue> }

export type DirectEditorOperation = NarrativeEditorOperation | ZineEditorOperation
```

Build all schemas with `.strict()`, finite-number refinements, non-negative indices, non-empty IDs, and a discriminated union. Define:

```ts
export interface EditorOperationBatch<
  Capability extends EditorAiCapability = EditorAiCapability,
  Operation extends DirectEditorOperation = DirectEditorOperation,
> {
  taskId: string
  capability: Capability
  baseRevision: string
  target: { documentId: string; spreadId?: string }
  operations: Operation[]
  summary: string[]
}

export const editorOperationBatchSchema: z.ZodType<EditorOperationBatch>

export function parseEditorOperationBatch(value: unknown): EditorOperationBatch {
  return editorOperationBatchSchema.parse(value)
}
```

Implement authorization with deterministic ordering:

```ts
export interface EditorOperationAuthorization {
  allowDelete: boolean
  deleteTargetIds: string[]
  targetSpreadId?: string
  projectAssetIds?: string[]
}

export type EditorOperationAuthorizationErrorCode =
  | 'delete_not_authorized'
  | 'delete_target_not_authorized'
  | 'wrong_target_spread'
  | 'asset_not_in_project'

export function validateOperationAuthorization(
  operations: DirectEditorOperation[],
  authorization: EditorOperationAuthorization,
): EditorOperationAuthorizationError[] {
  const issues: EditorOperationAuthorizationError[] = []
  const deleteTargets = new Set(authorization.deleteTargetIds)
  const projectAssets = new Set(authorization.projectAssetIds ?? [])

  for (const operation of operations) {
    const deleteTarget = operation.type === 'delete_node'
      ? operation.nodeId
      : operation.type === 'delete_slot'
        ? operation.slotId
        : undefined
    if (deleteTarget && !authorization.allowDelete) {
      issues.push({ code: 'delete_not_authorized', operationId: operation.operationId, targetId: deleteTarget, message: 'Delete was not authorized for this task.' })
    } else if (deleteTarget && !deleteTargets.has(deleteTarget)) {
      issues.push({ code: 'delete_target_not_authorized', operationId: operation.operationId, targetId: deleteTarget, message: 'Delete target was not explicitly authorized.' })
    }

    if ('spreadId' in operation && authorization.targetSpreadId && operation.spreadId !== authorization.targetSpreadId) {
      issues.push({ code: 'wrong_target_spread', operationId: operation.operationId, message: 'Zine operation targets a different spread.' })
    }

    if (operation.type === 'assign_asset' && !projectAssets.has(operation.assetId)) {
      issues.push({ code: 'asset_not_in_project', operationId: operation.operationId, targetId: operation.assetId, message: 'Asset is not part of this Zine project.' })
    }
  }
  return issues
}
```

- [ ] **Step 4: Run domain tests and TypeScript check**

```bash
pnpm exec tsx packages/ai-agent/tests/editor-ai-domain.test.ts
pnpm exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit strict operations**

```bash
git add packages/ai-agent/src/domain/operations.ts packages/ai-agent/tests/editor-ai-domain.test.ts
git commit -m "feat: validate structured AI edit operations"
```

---

### Task 4: Unified change sets and task metadata

**Files:**

- Create: `packages/ai-agent/src/domain/changes.ts`
- Modify: `packages/ai-agent/tests/editor-ai-domain.test.ts`

- [ ] **Step 1: Add failing completed/failed metadata tests**

Add assertions that completed metadata requires `changeSet` and `resultRevision`, while stopped metadata rejects them. Also assert a `data:image/` string is rejected anywhere in persisted change entries.

```ts
import { editorAiTaskMetadataSchema } from '../src/domain/changes'

const completedMetadata = {
  taskId: 'task-1',
  capability: 'narrative',
  taskType: 'instruction',
  target: { documentId: 'story-1' },
  status: 'completed',
  model: 'model-1',
  visualMode: 'vision',
  summary: ['Updated page'],
  warningCodes: [],
  operationSummary: [{ type: 'replace_text', targetIds: ['node-1'] }],
  changeSet: {
    taskId: 'task-1',
    targetLabel: 'Story',
    entries: [{ operation: 'replace_text', targetId: 'node-1', targetLabel: 'Paragraph', category: 'content', before: 'old', after: 'new' }],
    warnings: [],
    state: 'applied',
  },
  baseRevision: 'base',
  resultRevision: 'result',
  durationMs: 100,
}

test('completed task metadata requires an applied change set', () => {
  assert.equal(editorAiTaskMetadataSchema.safeParse(completedMetadata).success, true)
  const { changeSet: _changeSet, ...withoutChangeSet } = completedMetadata
  assert.equal(editorAiTaskMetadataSchema.safeParse(withoutChangeSet).success, false)
})

test('stopped task metadata cannot claim applied changes', () => {
  assert.equal(editorAiTaskMetadataSchema.safeParse({
    ...completedMetadata,
    status: 'stopped',
  }).success, false)
})
```

- [ ] **Step 2: Run test and verify failure**

```bash
pnpm exec tsx packages/ai-agent/tests/editor-ai-domain.test.ts
```

Expected: FAIL because `domain/changes` is missing.

- [ ] **Step 3: Implement shared Diff and discriminated metadata schemas**

Create `domain/changes.ts` with:

```ts
export type AiChangeCategory = 'content' | 'structure' | 'style' | 'asset' | 'layout'
export type AiChangeSetState = 'applied' | 'undone' | 'redone'

export interface AiTaskWarning {
  code: string
  message: string
  severity: 'warning' | 'info'
  targetIds?: string[]
}

export interface AiChangeEntry {
  operation: string
  targetId: string
  targetLabel: string
  category: AiChangeCategory
  before?: JsonValue
  after?: JsonValue
}

export interface AiChangeSet {
  taskId: string
  targetLabel: string
  entries: AiChangeEntry[]
  warnings: AiTaskWarning[]
  state: AiChangeSetState
}
```

Define `EditorAiCompletedTaskMetadata` and `EditorAiUnsuccessfulTaskMetadata` as a discriminated union. Add strict Zod schemas with bounded arrays/strings and a recursive rejection of strings beginning with `data:image/`. Export:

```ts
export type EditorAiTaskMetadata =
  | EditorAiCompletedTaskMetadata
  | EditorAiUnsuccessfulTaskMetadata

export const editorAiTaskMetadataSchema: z.ZodType<EditorAiTaskMetadata>

export function isEditorAiTaskMetadata(value: unknown): value is EditorAiTaskMetadata {
  return editorAiTaskMetadataSchema.safeParse(value).success
}

export function summarizeOperations(
  operations: DirectEditorOperation[],
): Array<{ type: string; targetIds: string[] }>
```

For target extraction, use `nodeId`, `slotId`, `parentId`, or `targetSlotIds` according to the discriminant, preserving first-seen operation order.

- [ ] **Step 4: Run focused tests**

```bash
pnpm exec tsx packages/ai-agent/tests/editor-ai-domain.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit unified change sets**

```bash
git add packages/ai-agent/src/domain/changes.ts packages/ai-agent/tests/editor-ai-domain.test.ts
git commit -m "feat: add shared AI change set metadata"
```

---

### Task 5: Model capability degradation and context budgets

**Files:**

- Create: `packages/ai-agent/src/domain/capabilities.ts`
- Modify: `packages/ai-agent/tests/editor-ai-domain.test.ts`

- [ ] **Step 1: Add failing degradation tests**

```ts
import {
  applyEditorAiContextBudget,
  resolveEditorAiCapabilities,
} from '../src/domain/capabilities'

test('vision absence degrades direct edit to structure-only', () => {
  assert.deepEqual(resolveEditorAiCapabilities({
    vision: false,
    structuredOutput: true,
    toolCalling: true,
  }), {
    visualMode: 'structure_only',
    executionMode: 'direct_edit',
    degradations: [{
      code: 'vision_unavailable',
      message: 'The selected model does not support visual input.',
    }],
  })
})

test('missing structured output or tools becomes suggestion-only', () => {
  assert.equal(resolveEditorAiCapabilities({ vision: true, structuredOutput: false, toolCalling: true }).executionMode, 'suggestion_only')
  assert.equal(resolveEditorAiCapabilities({ vision: true, structuredOutput: true, toolCalling: false }).executionMode, 'suggestion_only')
})
```

- [ ] **Step 2: Run test and verify missing module**

```bash
pnpm exec tsx packages/ai-agent/tests/editor-ai-domain.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement capability resolution and deterministic reductions**

Create the exact contracts:

```ts
export interface EditorAiModelCapabilities {
  vision: boolean
  structuredOutput: boolean
  toolCalling: boolean
  maxInputTokens?: number
}

export type EditorAiVisualMode = 'vision' | 'structure_only'
export type EditorAiExecutionMode = 'direct_edit' | 'suggestion_only'

export interface ResolvedEditorAiCapabilities {
  visualMode: EditorAiVisualMode
  executionMode: EditorAiExecutionMode
  degradations: EditorAiDegradation[]
}
```

`resolveEditorAiCapabilities()` must require both structured output and tool calling for direct-edit v1. Implement `applyEditorAiContextBudget()` so it clones snapshots and reduces only reference/visual inputs in this order:

1. adjacent preview images;
2. asset candidate thumbnails and then candidate count;
3. distant spread summaries;
4. narrative visual segment count.

Never remove `root`, `nodes`, `currentSpread.structure`, or the current editable target. If the estimated current editable structure alone exceeds `maxInputTokens`, return `accepted: false`.

- [ ] **Step 4: Add and run budget tests**

Add a fixture whose visual/reference context exceeds a deliberately small budget. Assert `reductions` order and that the editable structure remains deeply equal.

Run:

```bash
pnpm exec tsx packages/ai-agent/tests/editor-ai-domain.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit model degradation**

```bash
git add packages/ai-agent/src/domain/capabilities.ts packages/ai-agent/tests/editor-ai-domain.test.ts
git commit -m "feat: resolve AI editor capability fallbacks"
```

---

### Task 6: Host sandbox and atomic commit contract

**Files:**

- Create: `packages/ai-agent/src/domain/execution.ts`
- Create: `packages/ai-agent/tests/editor-ai-execution.test.ts`

- [ ] **Step 1: Write fake-host contract tests**

Create a fake narrative snapshot/host and tests for lock/unlock, one simulation, one commit, validation failure, and stale revision. The fake host must record counts and return authoritative change entries.

```ts
class FakeHost implements AiDocumentHost<NarrativeDocumentSnapshot, NarrativeEditorOperation> {
  lockCount = 0
  unlockCount = 0
  simulateCount = 0
  commitCount = 0
  currentRevision: string

  constructor(readonly snapshot: NarrativeDocumentSnapshot) {
    this.currentRevision = snapshot.revision
  }

  lock(): void { this.lockCount += 1 }
  unlock(): void { this.unlockCount += 1 }
  getCurrentRevision(): string { return this.currentRevision }
  async captureSnapshot(): Promise<NarrativeDocumentSnapshot> { return this.snapshot }
  async simulate(): Promise<EditorAiSimulationResult<NarrativeDocumentSnapshot>> {
    this.simulateCount += 1
    return {
      snapshot: { ...this.snapshot, revision: 'result-revision' },
      resultRevision: 'result-revision',
      issues: [],
      changeEntries: [{ operation: 'replace_text', targetId: 'node-1', targetLabel: 'Paragraph', category: 'content', before: 'old', after: 'new' }],
    }
  }
  async commit(): Promise<EditorAiCommitResult> {
    this.commitCount += 1
    this.currentRevision = 'result-revision'
    return { resultRevision: 'result-revision', historyEntryId: 'history-1', saved: true }
  }
}
```

Use a small fake runtime in Task 9; for this task, compile the interface and test `EditorAiExecutionError` codes directly.

- [ ] **Step 2: Run test and verify missing contracts**

```bash
pnpm exec tsx packages/ai-agent/tests/editor-ai-execution.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement host-neutral execution types**

Create `domain/execution.ts` with:

```ts
export interface EditorAiValidationIssue {
  code: string
  severity: 'error' | 'warning' | 'info'
  message: string
  operationId?: string
  targetIds?: string[]
}

export interface EditorAiSimulationResult<Snapshot extends StructuredEditorSnapshot> {
  snapshot: Snapshot
  resultRevision: string
  issues: EditorAiValidationIssue[]
  changeEntries: AiChangeEntry[]
}

export interface EditorAiCommitResult {
  resultRevision: string
  historyEntryId: string
  saved: boolean
  saveError?: string
}

export interface AiDocumentHost<Snapshot extends StructuredEditorSnapshot, Operation extends DirectEditorOperation> {
  captureSnapshot(signal?: AbortSignal): Promise<Snapshot>
  getCurrentRevision(): string
  simulate(snapshot: Snapshot, operations: Operation[], signal?: AbortSignal): Promise<EditorAiSimulationResult<Snapshot>>
  commit(batch: EditorOperationBatch<Snapshot['capability'], Operation>, simulation: EditorAiSimulationResult<Snapshot>): Promise<EditorAiCommitResult>
  lock(taskId: string): void
  unlock(taskId: string): void
}
```

Add `EditorAiExecutionError` with codes from the design. Do not let `commit()` accept an AbortSignal; the final host transaction is intentionally short and non-interruptible.

- [ ] **Step 4: Run execution type tests and typecheck**

```bash
pnpm exec tsx packages/ai-agent/tests/editor-ai-execution.test.ts
pnpm exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit host contract**

```bash
git add packages/ai-agent/src/domain/execution.ts packages/ai-agent/tests/editor-ai-execution.test.ts
git commit -m "feat: define atomic AI editor host contract"
```

---

### Task 7: Direct-edit tasks and events

**Files:**

- Modify: `packages/ai-agent/src/domain/agent.ts`
- Modify: `packages/ai-agent/tests/editor-ai-domain.test.ts`

- [ ] **Step 1: Add compile-time task/event usage to tests**

Create task and event literals using the new interfaces and assert their discriminants. This makes later runtime signatures compile against a stable protocol.

- [ ] **Step 2: Add direct-edit protocol without altering legacy types**

Append:

```ts
export type DirectEditTaskStatus =
  | 'preparing_context'
  | 'analyzing'
  | 'planning'
  | 'simulating'
  | 'validating'
  | 'applying'
  | 'completed'
  | 'stopped'
  | 'failed'

export interface DirectEditAgentTask<Snapshot extends StructuredEditorSnapshot = StructuredEditorSnapshot> {
  id: string
  taskType: 'instruction' | 'page_audit'
  instruction: string
  snapshot: Snapshot
  authorization: EditorOperationAuthorization
  modelCapabilities: EditorAiModelCapabilities
}

export type DirectEditAgentEvent =
  | { type: 'status_changed'; status: DirectEditTaskStatus }
  | { type: 'text_delta'; text: string }
  | { type: 'tool_started'; toolCallId: string; toolName: string; input: JsonValue }
  | { type: 'tool_completed'; toolCallId: string; toolName: string; output: JsonValue }
  | { type: 'operation_batch_created'; batch: EditorOperationBatch }
  | { type: 'warning'; warning: AiTaskWarning }
  | { type: 'completed'; summary: string[] }
  | { type: 'error'; code: EditorAiExecutionErrorCode; message: string }

export interface DirectEditAgentRuntime {
  run(task: DirectEditAgentTask, options?: { signal?: AbortSignal }): AsyncIterable<DirectEditAgentEvent>
}
```

Define a discriminated runtime result so direct-edit and suggestion-only are not conflated.

- [ ] **Step 3: Run legacy and domain tests**

```bash
pnpm exec tsx packages/ai-agent/tests/editor-ai-domain.test.ts
pnpm exec tsx packages/ai-agent/tests/editor-ai-runtime.test.ts
```

Expected: PASS; legacy approval events remain unchanged.

- [ ] **Step 4: Commit task protocol**

```bash
git add packages/ai-agent/src/domain/agent.ts packages/ai-agent/tests/editor-ai-domain.test.ts
git commit -m "feat: add direct-edit AI task events"
```

---

### Task 8: Shared direct-edit prompts

**Files:**

- Create: `packages/ai-agent/src/direct-edit-prompt.ts`
- Modify: `packages/ai-agent/tests/editor-ai-domain.test.ts`

- [ ] **Step 1: Add prompt policy tests**

Assert Zine messages contain the target spread ID and mark adjacent spreads read-only; structure-only messages contain no `dataUrl`; unauthorized tasks mention no delete capability.

- [ ] **Step 2: Implement capability-specific message builders**

Export:

```ts
export function buildNarrativeDirectEditMessages(input: {
  task: DirectEditAgentTask<NarrativeDocumentSnapshot>
  capabilities: ResolvedEditorAiCapabilities
}): EditorAiChatMessage[]

export function buildZineDirectEditMessages(input: {
  task: DirectEditAgentTask<ZineDocumentSnapshot>
  capabilities: ResolvedEditorAiCapabilities
}): EditorAiChatMessage[]

export function buildDirectEditMessages(input: {
  task: DirectEditAgentTask
  capabilities: ResolvedEditorAiCapabilities
}): EditorAiChatMessage[]
```

Prompts must explicitly encode stable IDs, current-spread-only writes, project-only assets, no arbitrary CSS, no whole-document replacement, and page-audit safe-fix behavior. Only include image parts in vision mode. Reuse `EditorAiChatMessage` and existing OpenAI-compatible content-part types.

- [ ] **Step 3: Run prompt/domain tests**

```bash
pnpm exec tsx packages/ai-agent/tests/editor-ai-domain.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit shared prompts**

```bash
git add packages/ai-agent/src/direct-edit-prompt.ts packages/ai-agent/tests/editor-ai-domain.test.ts
git commit -m "feat: add shared direct-edit prompts"
```

---

### Task 9: Vercel structured-operation runtime

**Files:**

- Create: `packages/ai-agent/src/runtime/vercel-ai/direct-edit-agent.ts`
- Create: `packages/ai-agent/tests/editor-ai-direct-edit-runtime.test.ts`

- [ ] **Step 1: Write failing mock-model runtime tests**

Follow the existing `MockLanguageModelV4` and `simulateReadableStream` pattern. Cover:

1. exactly one `operation_batch_created` event;
2. no `proposal_created` or `approval_required` event;
3. duplicate operation IDs rejected;
4. cross-spread/asset authorization rejected;
5. already-aborted signal throws `AbortError` with no batch.

- [ ] **Step 2: Run test and verify missing runtime**

```bash
pnpm exec tsx packages/ai-agent/tests/editor-ai-direct-edit-runtime.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement separate direct-edit runtime**

Create `VercelAiDirectEditAgentRuntime` using `ToolLoopAgent`. Reuse:

- `createVercelAiLanguageModel()`;
- `toVercelAiModelInput()`;
- `createAbortError()`;
- `normalizeAiError()`.

Provide `read_snapshot`, capability-specific `add_narrative_operation` or `add_zine_operation`, `report_warning`, and `submit_operation_batch`. Construct tools conditionally so delete operations are absent unless authorized. Independently call `validateOperationAuthorization()` before accepting the final batch. Emit one batch and never mutate a host.

- [ ] **Step 4: Run new and legacy runtime tests**

```bash
pnpm exec tsx packages/ai-agent/tests/editor-ai-direct-edit-runtime.test.ts
pnpm exec tsx packages/ai-agent/tests/editor-ai-runtime.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit structured runtime**

```bash
git add packages/ai-agent/src/runtime/vercel-ai/direct-edit-agent.ts packages/ai-agent/tests/editor-ai-direct-edit-runtime.test.ts
git commit -m "feat: add structured direct-edit AI runtime"
```

---

### Task 10: One-batch direct-edit orchestration

**Files:**

- Modify: `packages/ai-agent/src/agent.ts`
- Modify: `packages/ai-agent/tests/editor-ai-execution.test.ts`

- [ ] **Step 1: Complete fake-runtime execution tests**

Add tests asserting:

- direct-edit mode locks once and unlocks once;
- one batch simulates once and commits once;
- authorization errors commit zero times;
- validation errors commit zero times;
- stale revision after simulation commits zero times;
- warnings appear in `AiChangeSet`;
- suggestion-only mode never locks/simulates/commits;
- abort always unlocks and never commits;
- `saved: false` keeps completed metadata and records a save warning.

- [ ] **Step 2: Run tests and verify missing orchestrator**

```bash
pnpm exec tsx packages/ai-agent/tests/editor-ai-execution.test.ts
```

Expected: FAIL because `runDirectEditAgentWithRuntime` does not exist.

- [ ] **Step 3: Implement direct-edit orchestration beside legacy orchestration**

Add `RunDirectEditAgentOptions`, `RunDirectEditAgentResult`, `runDirectEditAgentWithRuntime()`, and `runDirectEditAgent()` without changing the existing exports.

Required order:

```ts
const capabilities = resolveEditorAiCapabilities(options.modelCapabilities)
if (capabilities.executionMode === 'suggestion_only') {
  return runSuggestionOnlyWithoutLocking(...)
}

host.lock(taskId)
try {
  const snapshot = await host.captureSnapshot(signal)
  const budgeted = applyEditorAiContextBudget(snapshot, budget)
  if (!budgeted.accepted) throw new EditorAiExecutionError('context_budget_exceeded', ...)
  const agentResult = await collectExactlyOneBatch(runtime, task, signal)
  validateBatchIdentityAndAuthorization(...)
  const simulation = await host.simulate(snapshot, batch.operations, signal)
  rejectErrorIssues(simulation.issues)
  if (host.getCurrentRevision() !== batch.baseRevision) throw new EditorAiExecutionError('stale_revision', ...)
  const commit = await host.commit(batch, simulation)
  return buildDirectEditMetadataFromSimulation(...)
} finally {
  host.unlock(taskId)
}
```

The authoritative change set comes from `simulation.changeEntries`, never from model claims.

- [ ] **Step 4: Run all focused package tests**

```bash
pnpm exec tsx packages/ai-agent/tests/editor-ai-domain.test.ts
pnpm exec tsx packages/ai-agent/tests/editor-ai-runtime.test.ts
pnpm exec tsx packages/ai-agent/tests/editor-ai-direct-edit-runtime.test.ts
pnpm exec tsx packages/ai-agent/tests/editor-ai-execution.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit orchestrator**

```bash
git add packages/ai-agent/src/agent.ts packages/ai-agent/tests/editor-ai-execution.test.ts
git commit -m "feat: orchestrate atomic AI direct edits"
```

---

### Task 11: Public API, scripts, compatibility, and documentation

**Files:**

- Modify: `packages/ai-agent/src/index.ts`
- Modify: `packages/ai-agent/tests/editor-ai-runtime.test.ts`
- Modify: `packages/ai-agent/package.json`
- Modify: `packages/ai-agent/README.md`

- [ ] **Step 1: Export all SDK-neutral direct-edit contracts**

Add exports for `revision`, `changes`, `capabilities`, `execution`, `direct-edit-prompt`, and direct-edit runner types/functions. Do not export Vercel `LanguageModel`, `ToolLoopAgent`, or SDK tool types.

- [ ] **Step 2: Make legacy compatibility explicit in tests**

Rename existing proposal test labels to begin with `legacy proposal runtime`. Keep assertions for `approval_required` only on the legacy runtime. Add an import assertion from `src/index.ts` for both `runEditorAgent` and `runDirectEditAgent`.

- [ ] **Step 3: Add package scripts**

Add:

```json
{
  "scripts": {
    "test": "tsx tests/editor-ai-domain.test.ts && tsx tests/editor-ai-runtime.test.ts && tsx tests/editor-ai-direct-edit-runtime.test.ts && tsx tests/editor-ai-execution.test.ts",
    "typecheck": "tsc --noEmit -p ../../tsconfig.json"
  }
}
```

Do not add duplicate tool versions unless pnpm cannot resolve the root workspace binaries.

- [ ] **Step 4: Rewrite README flow documentation**

Document both paths:

```text
Legacy: text snapshot -> proposals -> host review
Direct edit: structured snapshot -> operation batch -> host simulation -> one host commit -> AiChangeSet
```

State that downstream hosts, not the shared package, guarantee one TipTap/Zustand history entry.

- [ ] **Step 5: Run package and repository verification**

```bash
pnpm --filter @mo-gallery/ai-agent test
pnpm --filter @mo-gallery/ai-agent typecheck
pnpm exec eslint packages/ai-agent/src packages/ai-agent/tests
pnpm run lint
pnpm run build
```

Expected: all commands exit 0. If the full build reports a pre-existing unrelated failure, record it with the exact output and keep the focused package checks passing.

- [ ] **Step 6: Commit public foundation**

```bash
git add packages/ai-agent/src/index.ts packages/ai-agent/tests/editor-ai-runtime.test.ts packages/ai-agent/package.json packages/ai-agent/README.md
git commit -m "feat: expose AI direct-edit foundation"
```

---

## Final plan verification checklist

- [ ] Legacy proposal consumers still compile and their tests still pass.
- [ ] Structured snapshots exclude screenshots and volatile URLs from revisions.
- [ ] Every direct operation is strict-schema validated.
- [ ] Delete authorization is explicit and target-scoped.
- [ ] Every Zine write carries and validates `spreadId`.
- [ ] Suggestion-only mode performs no editor lock or host commit.
- [ ] Direct-edit mode calls host simulation once and commit once.
- [ ] Validation, authorization, abort, and stale revision paths commit zero times.
- [ ] Change sets are generated from host simulation before/after values.
- [ ] Persistable metadata rejects screenshots/data URLs.
- [ ] No prompt or policy logic is added to Go, Web wrappers, or Desktop wrappers.

## Follow-on plans after this foundation

1. `2026-07-11-editor-ai-narrative-sidebar.md` — stable TipTap node IDs, full-page snapshot/capture, sandbox operations, one-history transaction, fixed sidebar, unified in-chat Diff, Web/Desktop Story/Blog integration.
2. `2026-07-11-editor-ai-zine.md` — Zine revision/sandbox/validators, canonical preview and screenshot context, project assets, atomic Zustand history, fixed sidebar, Desktop persistence and PDF parity.
3. `2026-07-11-editor-ai-persistence-security.md` — Web conversation ownership migration, Hono authorization, task metadata endpoints, Desktop GORM/Wails parity, undo/redo state persistence.
