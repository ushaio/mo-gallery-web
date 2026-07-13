# AI Editor Persistence and Conversation Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the persistence, ownership enforcement, task-metadata lifecycle, and model-capability plumbing required before the Narrative and Zine AI user interfaces can safely consume direct-edit tasks.

**Architecture:** Keep `@mo-gallery/ai-agent` as the single owner of task metadata and capability contracts, add nullable Web conversation ownership with fail-closed repository lookups, and expose narrowly validated persistence endpoints that never perform model or storage work before ownership succeeds. Desktop remains a local single-user adapter with no owner column, but receives equivalent transactional finish/task-state behavior and capability DTOs through generated Wails bindings.

**Tech Stack:** TypeScript strict mode, Zod 4, Prisma 7/PostgreSQL, Hono 4/JWT, Node assertions through `tsx`, Go 1.24, GORM/PostgreSQL, Wails 2.12, pnpm/Vite.

---

## Scope boundaries

This plan covers only persistence, security, and model-capability plumbing needed by the later Narrative/Zine UI plans. It does **not** add or refactor the TipTap editor, Zine host, AI sidebar, editor locking, screenshots, operation execution, or Undo/Redo UI.

The completed foundation already provides `EditorAiTaskMetadata`, `AiChangeSet`, `editorAiTaskMetadataSchema`, `parseEditorAiTaskMetadata()`, and `isEditorAiTaskMetadata()` in `packages/ai-agent/src/domain/changes.ts`. This plan wraps that contract for message persistence; it does not copy or redefine its fields.

Every commit block below is an execution checkpoint. The execution controller must run it only when the user explicitly asks for commits; otherwise it records the intended commit boundary without committing.

## Deployment precondition and migration hazard

The Desktop application currently connects to a configurable PostgreSQL database (`desktop/config/config.go`) and does not run GORM migrations (`desktop/db/db.go` explicitly treats Prisma as the schema owner). The local single-user assumption is valid only when Desktop uses a dedicated local/single-user database or schema.

If Desktop points at the same database/schema as Web, this plan intentionally does not invent a cross-product ownership policy: Desktop's ownerless GORM queries can observe Web-owned rows, and Desktop-created rows have `userId = NULL`, so Web ordinary APIs hide them. Before deploying the updated Desktop against a shared Web database, the operator must decide and enforce database/schema isolation or defer Desktop rollout. In every supported deployment, the Prisma migration in Task 2 must be applied before the updated Web or Desktop binaries use the schema.

## File map

**Create:**

- `packages/ai-agent/src/domain/message-metadata.ts` — backward-compatible message metadata envelope, guard, size limit, and task-state update schema.
- `tests/editor-ai-persistence-contract.test.ts` — migration SQL inspection plus Web DTO/client contract checks.
- `server/lib/editor-ai-repository.ts` — owner-aware repository with injectable Prisma-shaped store and transactional message/task mutations.
- `server/lib/editor-ai-repository.test.ts` — repository ownership, 404-equivalent, atomic finish, and narrow task-state tests using a fake store.
- `server/lib/testing/fake-editor-ai-store.ts` — deterministic Map-backed repository test store with transaction rollback semantics and shared task fixtures.
- `hono/editor-ai.test.ts` — route tests using injected dependencies and counters for model/storage calls.
- `prisma/migrations/20260711180000_add_ai_conversation_owner/migration.sql` — nullable owner foreign key and lookup index, with no backfill.

**Modify:**

- `packages/ai-agent/src/index.ts` — export message persistence contracts.
- `packages/ai-agent/tests/editor-ai-domain.test.ts` — metadata envelope compatibility, visual-payload rejection, and size-bound tests.
- `prisma/schema.prisma` — add nullable `AiConversation.userId`, `User.aiConversations`, relation, and index.
- `server/lib/editor-ai.ts` — keep DTO mapping/types and delegate persistence exports to the owner-aware repository.
- `server/lib/editor-ai-images.ts` — require owner ID and perform owned message lookup before storage configuration/download/upload.
- `hono/editor-ai.ts` — expose a dependency-injected router factory, thread JWT `sub`, add persistence endpoints, and secure every conversation-bearing route.
- `src/lib/api/types.ts` — stopped status, typed metadata, direct-edit capability fields, and persistence input types.
- `src/lib/api/story-ai.ts` — append, finish, and task-state client methods.
- `.env.example` — document conservative Web model capability configuration.
- `server/lib/story-ai.ts` — return explicit direct-edit capability DTO fields.
- `desktop/services/editor-ai.go` — metadata bounds, transactional finish, narrow task-state update, and capability DTO fields.
- `desktop/services/editor_ai_test.go` — GORM transaction/state and capability tests.
- `desktop/config/config.go` — per-provider vision/tools/structured-output/context-window configuration with conservative defaults.
- `desktop/config/config_test.go` — normalization and capability configuration tests.
- `desktop/app.go` — expose task-state update and DTO-returning finish methods to Wails.
- `desktop/frontend/src/lib/api/types.ts` — stopped status, typed metadata, task persistence inputs, and capability fields.
- `desktop/frontend/src/lib/api/editor-ai-local.ts` — local append/finish/task-state adapter parity; prompt logic remains in TypeScript.

**Regenerate, never hand-edit:**

- `desktop/frontend/wailsjs/go/main/App.d.ts`
- `desktop/frontend/wailsjs/go/main/App.js`
- `desktop/frontend/wailsjs/go/models.ts`

## Locked contract decisions

1. New task metadata is stored as `{ type: 'editor_ai_task', task: EditorAiTaskMetadata }`; legacy bare `EditorAiTaskMetadata` remains readable and is normalized by one shared guard.
2. Legacy image and ad-hoc metadata remain JSON-compatible. Task-state mutation is available only when the metadata guard resolves a task envelope.
3. Persisted metadata is capped at 256 KiB and rejects image data URLs through the existing descriptor-safe foundation schema. Screenshots, thumbnails, full snapshots, sandbox copies, and raw model operations are never persisted.
4. Web `AiConversation.userId` is nullable. There is no automatic backfill. Ordinary APIs always include `userId = JWT sub`, so legacy `NULL` rows are invisible.
5. The owner relation uses `ON DELETE SET NULL`: deleting a user preserves historical conversation rows but moves them into the same fail-closed hidden state as legacy rows.
6. Owned and missing resources both produce `404 Conversation not found` or `404 Message not found`; routes never reveal that another user owns an ID.
7. Message completion and conversation `lastModel`/`updatedAt` changes occur in one transaction. Task-state updates may change only `metadata.task.changeSet.state`.
8. Model/upload/proxy routes without a conversation ID retain authentication but require no ownership lookup. Every route that carries a conversation/message performs ownership before model, storage, remote fetch, or image processing.
9. Desktop adds no owner field. Its finish and task-state methods use GORM transactions and preserve all unrelated metadata.
10. Unknown model capabilities default to `vision: false`, `tools: false`, `structuredOutput: false`, and `contextWindow: 8192`; direct edit therefore degrades safely instead of assuming unsupported features.

### Task 1: Shared persisted message metadata envelope

**Files:**

- Create: `packages/ai-agent/src/domain/message-metadata.ts`
- Modify: `packages/ai-agent/src/index.ts`
- Modify: `packages/ai-agent/tests/editor-ai-domain.test.ts`

- [ ] **Step 1: Write failing envelope and compatibility tests**

Append these imports and assertions to `packages/ai-agent/tests/editor-ai-domain.test.ts`:

```ts
import {
  MAX_EDITOR_AI_MESSAGE_METADATA_BYTES,
  editorAiMessageMetadataSchema,
  editorAiTaskStateUpdateSchema,
  readEditorAiTaskMessageMetadata,
} from '../src/domain/message-metadata'

const completedTaskMetadata = {
  taskId: 'task-1',
  capability: 'narrative' as const,
  taskType: 'instruction' as const,
  target: { documentId: 'story-1' },
  status: 'completed' as const,
  model: 'openai:gpt-5.6',
  visualMode: 'structure_only' as const,
  summary: ['Reworked the opening.'],
  warningCodes: [],
  operationSummary: [{ type: 'replace_text', targetIds: ['paragraph-1'] }],
  changeSet: {
    taskId: 'task-1',
    targetLabel: 'Story',
    entries: [],
    warnings: [],
    state: 'applied' as const,
  },
  baseRevision: 'narrative-fnv1a-before',
  resultRevision: 'narrative-fnv1a-after',
  durationMs: 125,
}

test('message metadata reads the discriminated task envelope', () => {
  const metadata = { type: 'editor_ai_task', task: completedTaskMetadata }
  assert.deepEqual(readEditorAiTaskMessageMetadata(metadata), metadata)
})

test('message metadata normalizes legacy bare task metadata', () => {
  assert.deepEqual(readEditorAiTaskMessageMetadata(completedTaskMetadata), {
    type: 'editor_ai_task',
    task: completedTaskMetadata,
  })
})

test('legacy image metadata remains valid but is not a task', () => {
  const image = { type: 'image', uploadedUrl: '/uploads/ai/image.png' }
  assert.deepEqual(editorAiMessageMetadataSchema.parse(image), image)
  assert.equal(readEditorAiTaskMessageMetadata(image), null)
})

test('persisted metadata rejects visual payloads and oversized JSON', () => {
  assert.equal(editorAiMessageMetadataSchema.safeParse({ screenshot: 'data:image/png;base64,AAAA' }).success, false)
  assert.equal(editorAiMessageMetadataSchema.safeParse({ value: 'x'.repeat(MAX_EDITOR_AI_MESSAGE_METADATA_BYTES) }).success, false)
})

test('task-state requests accept only the change-set state', () => {
  assert.deepEqual(editorAiTaskStateUpdateSchema.parse({ state: 'undone' }), { state: 'undone' })
  assert.equal(editorAiTaskStateUpdateSchema.safeParse({ state: 'undone', status: 'failed' }).success, false)
})
```

- [ ] **Step 2: Run the focused test and verify the missing-module failure**

Run:

```bash
pnpm exec tsx packages/ai-agent/tests/editor-ai-domain.test.ts
```

Expected: FAIL with `Cannot find module '../src/domain/message-metadata'`.

- [ ] **Step 3: Add the shared envelope without duplicating task fields**

Create `packages/ai-agent/src/domain/message-metadata.ts`:

```ts
import { z } from 'zod'

import {
  editorAiTaskMetadataSchema,
  isEditorAiTaskMetadata,
  type EditorAiTaskMetadata,
} from './changes'
import type { JsonValue } from './json'

export const MAX_EDITOR_AI_MESSAGE_METADATA_BYTES = 256 * 1024

export interface EditorAiTaskMessageMetadata {
  type: 'editor_ai_task'
  task: EditorAiTaskMetadata
}

export type EditorAiMessageMetadata = JsonValue

const imageDataUrlPattern = /^data:image\//i

function containsImageDataUrl(value: JsonValue): boolean {
  if (typeof value === 'string') return imageDataUrlPattern.test(value)
  if (Array.isArray(value)) return value.some(containsImageDataUrl)
  if (value && typeof value === 'object') return Object.values(value).some(containsImageDataUrl)
  return false
}

function serializedBytes(value: JsonValue): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength
}

const persistedJsonSchema = z.json().superRefine((value, context) => {
  if (containsImageDataUrl(value)) {
    context.addIssue({ code: 'custom', message: 'Persisted metadata cannot contain image data URLs' })
  }
  if (serializedBytes(value) > MAX_EDITOR_AI_MESSAGE_METADATA_BYTES) {
    context.addIssue({ code: 'custom', message: 'Persisted metadata exceeds 256 KiB' })
  }
})

export const editorAiTaskMessageMetadataSchema = z.object({
  type: z.literal('editor_ai_task'),
  task: editorAiTaskMetadataSchema,
}).strict()

export const editorAiMessageMetadataSchema = persistedJsonSchema

export const editorAiTaskStateUpdateSchema = z.object({
  state: z.enum(['applied', 'undone', 'redone']),
}).strict()

export function readEditorAiTaskMessageMetadata(value: unknown): EditorAiTaskMessageMetadata | null {
  const enveloped = editorAiTaskMessageMetadataSchema.safeParse(value)
  if (enveloped.success) return enveloped.data as EditorAiTaskMessageMetadata
  if (isEditorAiTaskMetadata(value)) return { type: 'editor_ai_task', task: value }
  return null
}
```

Export it from `packages/ai-agent/src/index.ts`:

```ts
export * from './domain/message-metadata'
```

- [ ] **Step 4: Run shared tests and typecheck**

Run:

```bash
pnpm --filter @mo-gallery/ai-agent test
pnpm --filter @mo-gallery/ai-agent typecheck
```

Expected: all shared test labels pass and both commands exit 0.

- [ ] **Step 5: Record the shared-contract commit boundary**

```bash
git add packages/ai-agent/src/domain/message-metadata.ts packages/ai-agent/src/index.ts packages/ai-agent/tests/editor-ai-domain.test.ts
git commit -m "feat: add editor AI message metadata envelope"
```

### Task 2: Nullable Web conversation ownership migration

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260711180000_add_ai_conversation_owner/migration.sql`
- Create: `tests/editor-ai-persistence-contract.test.ts`

- [ ] **Step 1: Write a failing migration inspection test**

Create `tests/editor-ai-persistence-contract.test.ts`:

```ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const migration = readFileSync(
  `${root}/prisma/migrations/20260711180000_add_ai_conversation_owner/migration.sql`,
  'utf8',
)

assert.match(migration, /ADD COLUMN "userId" TEXT/)
assert.doesNotMatch(migration, /UPDATE\s+"AiConversation"/i)
assert.match(migration, /ON DELETE SET NULL ON UPDATE CASCADE/)
assert.match(migration, /CREATE INDEX "AiConversation_userId_scopeId_updatedAt_idx"/)
console.log('✓ editor AI ownership migration is nullable, unbackfilled, and indexed')
```

- [ ] **Step 2: Run the inspection and verify the missing migration failure**

Run:

```bash
pnpm exec tsx tests/editor-ai-persistence-contract.test.ts
```

Expected: FAIL with `ENOENT` for `20260711180000_add_ai_conversation_owner/migration.sql`.

- [ ] **Step 3: Add the Prisma relation and composite owner lookup index**

Update the two models in `prisma/schema.prisma`:

```prisma
model User {
  id       String  @id @default(uuid())
  username String  @unique
  password String?

  // existing OAuth and timestamp fields remain unchanged
  aiConversations AiConversation[]

  @@unique([oauthProvider, oauthId])
  @@index([oauthProvider])
}

model AiConversation {
  id           String      @id @default(cuid())
  userId       String?
  scopeId      String
  title        String?
  summary      String?
  lastModel    String?
  systemPrompt String?
  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt

  user     User?       @relation(fields: [userId], references: [id], onDelete: SetNull)
  messages AiMessage[]

  @@index([userId, scopeId, updatedAt])
  @@index([scopeId, updatedAt])
  @@index([updatedAt])
}
```

- [ ] **Step 4: Generate a create-only migration and replace it only after SQL review**

Run against a disposable development database configured through `DATABASE_URL`:

```bash
pnpm exec prisma migrate dev --name add_ai_conversation_owner --create-only
```

Expected: Prisma creates one migration containing one nullable column, one index, and one foreign key. If Prisma chooses a timestamped folder other than `20260711180000_add_ai_conversation_owner`, move the generated SQL into the required folder and remove only the duplicate newly generated folder before continuing.

The reviewed `migration.sql` must be exactly:

```sql
-- AlterTable
ALTER TABLE "AiConversation" ADD COLUMN "userId" TEXT;

-- CreateIndex
CREATE INDEX "AiConversation_userId_scopeId_updatedAt_idx"
ON "AiConversation"("userId", "scopeId", "updatedAt");

-- AddForeignKey
ALTER TABLE "AiConversation"
ADD CONSTRAINT "AiConversation_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
```

There is deliberately no `UPDATE`, guessed owner, username join, or default value.

- [ ] **Step 5: Inspect, generate the client, and rerun the contract test**

Run:

```bash
pnpm exec prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script
pnpm run prisma:generate
pnpm exec tsx tests/editor-ai-persistence-contract.test.ts
```

Expected: the migration inspection passes; Prisma generation exits 0. The diff command may require a shadow database in the local Prisma environment; if unavailable, record that as a DB-dependent review boundary and inspect the checked-in SQL directly rather than applying it to a non-disposable database.

- [ ] **Step 6: Record the migration commit boundary**

```bash
git add prisma/schema.prisma prisma/migrations/20260711180000_add_ai_conversation_owner/migration.sql tests/editor-ai-persistence-contract.test.ts
git commit -m "feat: add nullable editor AI conversation owners"
```

### Task 3: Owner-aware Web repository and atomic message mutations

**Files:**

- Create: `server/lib/editor-ai-repository.ts`
- Create: `server/lib/editor-ai-repository.test.ts`
- Modify: `server/lib/editor-ai.ts`

- [ ] **Step 1: Write failing repository behavior tests with a fake store**

Create `server/lib/editor-ai-repository.test.ts` with an in-memory fake implementing the repository store interface and these assertions:

```ts
import assert from 'node:assert/strict'

import { createEditorAiRepository, EditorAiNotFoundError } from './editor-ai-repository'
import {
  COMPLETED_EDITOR_AI_TASK_METADATA,
  createFakeEditorAiStore,
} from './testing/fake-editor-ai-store'

const store = createFakeEditorAiStore({
  conversations: [
    { id: 'owned', userId: 'user-a', scopeId: 'story:1' },
    { id: 'other', userId: 'user-b', scopeId: 'story:1' },
    { id: 'legacy', userId: null, scopeId: 'story:1' },
  ],
})
const repository = createEditorAiRepository(store)

assert.deepEqual((await repository.listConversations('user-a', 'story:1')).map(({ id }) => id), ['owned'])
assert.equal(await repository.getConversation('user-a', 'other'), null)
assert.equal(await repository.getConversation('user-a', 'legacy'), null)
await assert.rejects(repository.clearConversation('user-a', 'other'), EditorAiNotFoundError)

const assistant = await repository.appendMessage('user-a', {
  conversationId: 'owned', role: 'assistant', content: '', status: 'streaming',
})
await repository.finishMessage('user-a', assistant.id, {
  status: 'completed', content: 'done', model: 'openai:gpt-5.6',
  metadata: { type: 'editor_ai_task', task: COMPLETED_EDITOR_AI_TASK_METADATA },
})
assert.equal(store.transactionCount, 1)
assert.equal(store.messages.get(assistant.id)?.status, 'completed')
assert.equal(store.conversations.get('owned')?.lastModel, 'openai:gpt-5.6')

await repository.updateTaskState('user-a', assistant.id, 'undone')
const metadata = store.messages.get(assistant.id)?.metadata as Record<string, unknown>
assert.equal(((metadata.task as Record<string, unknown>).changeSet as Record<string, unknown>).state, 'undone')
assert.equal(metadata.type, 'editor_ai_task')
await assert.rejects(repository.updateTaskState('user-b', assistant.id, 'redone'), EditorAiNotFoundError)
console.log('✓ editor AI repository hides unowned rows and mutates tasks atomically')
```

Create `server/lib/testing/fake-editor-ai-store.ts` in the same step. It must implement every method in the `EditorAiStore` interface from Step 3 with `Map`-backed records, increment `transactionCount`, clone state before a transaction, and restore the clone if the callback throws. This fake is test-only and must not import Prisma or `server-only`.

- [ ] **Step 2: Run the test and verify missing repository/fake failures**

Run:

```bash
pnpm exec tsx server/lib/editor-ai-repository.test.ts
```

Expected: FAIL because `editor-ai-repository.ts` and the fake store do not exist.

- [ ] **Step 3: Define owner-first repository signatures**

Create `server/lib/editor-ai-repository.ts`. Its public interface must be exactly:

```ts
export interface EditorAiRepository {
  createConversation(userId: string, input: { scopeId: string; title?: string; systemPrompt?: string }): Promise<EditorAiConversationDto>
  listConversations(userId: string, scopeId?: string): Promise<EditorAiConversationDto[]>
  getConversation(userId: string, conversationId: string): Promise<EditorAiConversationDto | null>
  getConversationWithMessages(userId: string, conversationId: string): Promise<EditorAiConversationWithMessagesDto | null>
  deleteConversation(userId: string, conversationId: string): Promise<void>
  clearConversation(userId: string, conversationId: string): Promise<EditorAiConversationDto>
  listMessages(userId: string, conversationId: string, limit?: number): Promise<EditorAiMessageDto[]>
  buildHistory(userId: string, conversationId: string, limit?: number): Promise<EditorAiHistoryMessage[]>
  appendMessage(userId: string, input: EditorAiMessageAppendInput): Promise<EditorAiMessageDto>
  finishMessage(userId: string, messageId: string, input: EditorAiMessageFinishInput): Promise<EditorAiMessageDto>
  updateTaskState(userId: string, messageId: string, state: AiChangeSetState): Promise<EditorAiMessageDto>
  updateConversation(userId: string, conversationId: string, input: EditorAiConversationUpdateInput): Promise<EditorAiConversationDto>
}
```

Use these status and persistence inputs:

```ts
export type EditorAiMessageStatus = 'pending' | 'streaming' | 'completed' | 'failed' | 'stopped'

export interface EditorAiMessageAppendInput {
  conversationId: string
  role: 'system' | 'user' | 'assistant'
  content: string
  status?: EditorAiMessageStatus
  model?: string
  action?: string
  metadata?: EditorAiMessageMetadata
  error?: string
}

export type EditorAiMessageFinishInput =
  | { status: 'completed'; content: string; model?: string; metadata?: EditorAiMessageMetadata }
  | { status: 'failed' | 'stopped'; content?: string; model?: string; metadata?: EditorAiMessageMetadata; error: string }
```

`EditorAiNotFoundError` must carry `resource: 'conversation' | 'message'`, but no owner details.

- [ ] **Step 4: Implement fail-closed queries for every operation**

Every conversation query must include the owner in the database predicate:

```ts
where: { id: conversationId, userId }
```

Every message query must join through the owner:

```ts
where: {
  id: messageId,
  conversation: { userId },
}
```

Creation must set the owner explicitly:

```ts
data: {
  userId,
  scopeId: input.scopeId,
  title: input.title,
  systemPrompt: input.systemPrompt,
}
```

List, read, update, delete, clear, history, append, finish, and task-state methods must never issue a mutation based only on `id` or `conversationId`. Use `findFirst`/`findMany` for owned reads and `updateMany`/`deleteMany` count checks where Prisma cannot express a compound unique owner key. Convert zero-count outcomes to `EditorAiNotFoundError`.

- [ ] **Step 5: Implement atomic finish and narrow task-state transactions**

Use interactive transactions with serializable isolation:

```ts
return store.$transaction(async (tx) => {
  const message = await tx.aiMessage.findFirst({
    where: { id: messageId, conversation: { userId } },
  })
  if (!message) throw new EditorAiNotFoundError('message')

  const updated = await tx.aiMessage.update({
    where: { id: message.id },
    data: {
      status: input.status,
      content: input.content,
      model: input.model,
      metadata: input.metadata,
      error: input.status === 'completed' ? null : input.error,
    },
  })
  await tx.aiConversation.update({
    where: { id: message.conversationId },
    data: {
      updatedAt: new Date(),
      ...(input.status === 'completed' && input.model ? { lastModel: input.model } : {}),
    },
  })
  return toMessageDto(updated)
}, { isolationLevel: 'Serializable' })
```

For task-state updates, parse and normalize existing metadata, replace only `changeSet.state`, validate the complete result with `editorAiTaskMessageMetadataSchema`, and preserve every other field:

```ts
const existing = readEditorAiTaskMessageMetadata(message.metadata)
if (!existing || existing.task.status !== 'completed') {
  throw new EditorAiInvalidMetadataError('Message has no completed editor AI task metadata')
}
const metadata = editorAiTaskMessageMetadataSchema.parse({
  ...existing,
  task: {
    ...existing.task,
    changeSet: { ...existing.task.changeSet, state },
  },
})
```

- [ ] **Step 6: Delegate existing server exports to the default repository**

Keep DTO mappers and exported names in `server/lib/editor-ai.ts`, instantiate `createEditorAiRepository(db)`, and change each export to require `userId` first. No compatibility overload may omit ownership. Representative signatures:

```ts
export const ensureEditorAiConversation = repository.createConversation
export const listEditorAiConversations = repository.listConversations
export const getEditorAiConversation = repository.getConversation
export const getEditorAiConversationWithMessages = repository.getConversationWithMessages
export const buildEditorAiHistoryMessages = repository.buildHistory
export const createEditorAiMessage = repository.appendMessage
export const finishEditorAiMessage = repository.finishMessage
export const updateEditorAiTaskState = repository.updateTaskState
```

- [ ] **Step 7: Run repository tests and typecheck**

Run:

```bash
pnpm exec tsx server/lib/editor-ai-repository.test.ts
pnpm exec tsc --noEmit -p tsconfig.json
```

Expected: repository assertions pass. TypeScript may still report Hono call-site argument errors because routes have not yet threaded `userId`; those exact errors are the expected red state entering Task 4, while repository files themselves have no diagnostics.

- [ ] **Step 8: Record the repository commit boundary**

```bash
git add server/lib/editor-ai.ts server/lib/editor-ai-repository.ts server/lib/editor-ai-repository.test.ts server/lib/testing/fake-editor-ai-store.ts
git commit -m "feat: enforce editor AI conversation ownership"
```

### Task 4: Owner-aware Hono conversation routes and test seam

**Files:**

- Modify: `hono/editor-ai.ts`
- Create: `hono/editor-ai.test.ts`

- [ ] **Step 1: Write failing owner-routing tests with injected dependencies**

In `hono/editor-ai.test.ts`, create a signed token for `user-a`, inject a repository fake recording each user ID, and assert:

```ts
const response = await app.request('/admin/editor-ai/conversations?scopeId=story:1', {
  headers: { Authorization: `Bearer ${userAToken}` },
})
assert.equal(response.status, 200)
assert.equal(repository.calls.listConversations[0]?.userId, 'user-a')

const hidden = await app.request('/admin/editor-ai/conversations/owned-by-b', {
  headers: { Authorization: `Bearer ${userAToken}` },
})
assert.equal(hidden.status, 404)
assert.deepEqual(await hidden.json(), { error: 'Conversation not found' })

for (const request of [
  ['PATCH', '/admin/editor-ai/conversations/owned-by-b'],
  ['DELETE', '/admin/editor-ai/conversations/owned-by-b'],
  ['POST', '/admin/editor-ai/conversations/owned-by-b/clear'],
] as const) {
  const result = await app.request(request[1], {
    method: request[0],
    headers: { Authorization: `Bearer ${userAToken}`, 'Content-Type': 'application/json' },
    body: request[0] === 'PATCH' ? JSON.stringify({ title: 'x' }) : undefined,
  })
  assert.equal(result.status, 404)
}
```

- [ ] **Step 2: Run the route test and verify the missing factory/injection failure**

Run:

```bash
pnpm exec tsx hono/editor-ai.test.ts
```

Expected: FAIL because `createEditorAiRouter()` and injectable dependencies do not exist.

- [ ] **Step 3: Add the dependency-injected router factory**

Define only the seams needed to isolate persistence, model, and storage work:

```ts
export interface EditorAiRouteDependencies {
  repository: EditorAiRepository
  createStream: typeof createEditorAiStream
  fetchModels: typeof fetchStoryAiModels
  generateText: typeof generateStoryAiText
  generateImage: typeof generateStoryAiImage
  getStorage: () => Promise<StorageProvider>
  saveMessageImage: (userId: string, messageId: string, imageUrl: string) => Promise<EditorAiImageSaveResult>
}

export function createEditorAiRouter(dependencies: EditorAiRouteDependencies) {
  const router = new Hono<{ Variables: AuthVariables }>()
  router.use('/admin/editor-ai/*', authMiddleware)
  // register the existing routes against dependencies
  return router
}

const editorAi = createEditorAiRouter(defaultEditorAiRouteDependencies)
export default editorAi
```

Tests inject fakes. Production dependencies wrap the current `server/lib/story-ai.ts`, storage factory, image saver, and default repository exports.

- [ ] **Step 4: Thread JWT subject through all conversation CRUD routes**

At the start of every authenticated handler use:

```ts
const userId = c.get('user').sub
```

Call the repository with `userId` first. Map `EditorAiNotFoundError` through one helper:

```ts
function editorAiNotFound(c: Context, error: unknown) {
  if (!(error instanceof EditorAiNotFoundError)) return null
  const label = error.resource === 'message' ? 'Message' : 'Conversation'
  return c.json({ error: `${label} not found` }, 404)
}
```

Create, list, get-with-messages, list-messages, update, clear, and delete must all use the owner-aware repository. A missing or other-owner ID follows the same 404 path.

- [ ] **Step 5: Run focused route and repository tests**

Run:

```bash
pnpm exec tsx hono/editor-ai.test.ts
pnpm exec tsx server/lib/editor-ai-repository.test.ts
```

Expected: all ownership assertions pass and neither response distinguishes missing from other-owner IDs.

- [ ] **Step 6: Record the Hono ownership commit boundary**

```bash
git add hono/editor-ai.ts hono/editor-ai.test.ts
git commit -m "fix: secure editor AI conversation routes"
```

### Task 5: Web append, finish, task-state, and expensive-work ordering

**Files:**

- Modify: `hono/editor-ai.ts`
- Modify: `hono/editor-ai.test.ts`
- Modify: `server/lib/editor-ai-images.ts`

- [ ] **Step 1: Add failing persistence endpoint tests**

Add route tests for these exact endpoints:

```text
POST  /api/admin/editor-ai/conversations/:id/messages
POST  /api/admin/editor-ai/messages/:id/finish
PATCH /api/admin/editor-ai/messages/:id/task-state
```

Assert a valid append returns `201`, finish returns the updated message, and task-state returns metadata whose only changed leaf is `task.changeSet.state`. Assert invalid task metadata returns `400`, image data URLs return `400`, and another owner's conversation/message returns `404`.

Use these request bodies:

```ts
const appendBody = {
  role: 'assistant',
  content: '',
  status: 'streaming',
  model: 'openai:gpt-5.6',
  action: 'direct_edit',
}

const finishBody = {
  status: 'completed',
  content: 'Applied 3 changes.',
  model: 'openai:gpt-5.6',
  metadata: { type: 'editor_ai_task', task: completedTaskMetadata },
}

const taskStateBody = { state: 'undone' }
```

- [ ] **Step 2: Add failing unauthorized expensive-work tests**

Inject counters and call each route as `user-a` with IDs owned by `user-b`:

```ts
assert.equal((await requestGenerateTitle('other')).status, 404)
assert.equal((await requestGenerate('other')).status, 404)
assert.equal((await requestGenerateImage('other')).status, 404)
assert.equal((await requestSaveImage('message-owned-by-b')).status, 404)
assert.deepEqual(counters, {
  createStream: 0,
  generateText: 0,
  generateImage: 0,
  getStorage: 0,
  saveMessageImage: 0,
  remoteImageFetch: 0,
})
```

- [ ] **Step 3: Run tests and verify missing endpoint/security failures**

Run:

```bash
pnpm exec tsx hono/editor-ai.test.ts
```

Expected: FAIL because the three persistence routes are absent and existing generate/image-save routes do not yet perform owned lookups first.

- [ ] **Step 4: Add exact request schemas using shared metadata schemas**

In `hono/editor-ai.ts`:

```ts
const AppendEditorAiMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string().max(200_000),
  status: z.enum(['pending', 'streaming', 'completed', 'failed', 'stopped']).optional(),
  model: z.string().max(200).optional(),
  action: z.string().max(80).optional(),
  metadata: editorAiMessageMetadataSchema.optional(),
  error: z.string().max(4000).optional(),
}).strict()

const FinishEditorAiMessageSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('completed'),
    content: z.string().max(200_000),
    model: z.string().max(200).optional(),
    metadata: editorAiMessageMetadataSchema.optional(),
  }).strict(),
  z.object({
    status: z.enum(['failed', 'stopped']),
    content: z.string().max(200_000).optional(),
    model: z.string().max(200).optional(),
    metadata: editorAiMessageMetadataSchema.optional(),
    error: z.string().trim().min(1).max(4000),
  }).strict(),
])
```

Parse task-state with the shared `editorAiTaskStateUpdateSchema`.

- [ ] **Step 5: Implement persistence endpoints with owner-first repository calls**

Append supplies the path conversation ID rather than accepting a second body ID:

```ts
const message = await dependencies.repository.appendMessage(userId, {
  conversationId: c.req.param('id'),
  ...AppendEditorAiMessageSchema.parse(await c.req.json()),
})
return c.json({ success: true, data: message }, 201)
```

Finish and task-state call `finishMessage(userId, messageId, input)` and `updateTaskState(userId, messageId, state)`. Return shared 404 responses for missing/unowned IDs and Zod issues as 400.

- [ ] **Step 6: Reorder all existing conversation-bearing routes**

Apply this order exactly:

1. parse cheap request data;
2. read `userId`;
3. owned repository lookup;
4. return 404 if absent;
5. build history;
6. resolve storage/download remote images or call model;
7. append/update owned messages.

Specific corrections:

- `generate-title`: owned conversation lookup before history and `generateText`.
- `generate`: owned conversation lookup before history, message creation, and `createStream`.
- `generate-image`: owned conversation lookup before `getStorage`, storage downloads, remote `fetch`, message creation, and `generateImage`.
- `messages/:id/images/save`: owned message lookup before `saveMessageImage`; pass `userId` into the saver.
- title/message touch callbacks keep passing `userId`, including asynchronous stream completion/error callbacks.
- `/models`, `/upload`, and `/proxy/chat/completions` stay unchanged because their requests do not identify a conversation.

- [ ] **Step 7: Make image-save ownership precede all storage work**

Change the signature in `server/lib/editor-ai-images.ts`:

```ts
export async function saveEditorAiMessageImage(
  userId: string,
  messageId: string,
  imageUrl: string,
) {
  const message = await db.aiMessage.findFirst({
    where: { id: messageId, conversation: { userId } },
  })
  if (!message) throw new EditorAiNotFoundError('message')
  // only now inspect metadata, create storage, download, process, or upload
}
```

Inside its transaction, update the message by the already-owned `message.id`; do not perform a second owner-blind discovery query.

- [ ] **Step 8: Run security and shared tests**

Run:

```bash
pnpm exec tsx hono/editor-ai.test.ts
pnpm exec tsx server/lib/editor-ai-repository.test.ts
pnpm --filter @mo-gallery/ai-agent test
```

Expected: all persistence endpoints pass, unauthorized counters remain zero, and metadata validation rejects visual/oversized payloads.

- [ ] **Step 9: Record the endpoint commit boundary**

```bash
git add hono/editor-ai.ts hono/editor-ai.test.ts server/lib/editor-ai-images.ts
git commit -m "feat: add secure editor AI task persistence routes"
```

### Task 6: Web client types and persistence methods

**Files:**

- Modify: `src/lib/api/types.ts`
- Modify: `src/lib/api/story-ai.ts`
- Modify: `tests/editor-ai-persistence-contract.test.ts`

- [ ] **Step 1: Add failing compile-time client contract assertions**

Append to `tests/editor-ai-persistence-contract.test.ts`:

```ts
import type {
  EditorAiMessageAppendInput,
  EditorAiMessageDto,
  EditorAiMessageFinishInput,
  StoryAiModelOption,
} from '../src/lib/api/types'
import {
  appendEditorAiMessage,
  finishEditorAiMessage,
  updateEditorAiTaskState,
} from '../src/lib/api/story-ai'

const stopped: EditorAiMessageDto['status'] = 'stopped'
const appendInput: EditorAiMessageAppendInput = { role: 'assistant', content: '', status: 'streaming' }
const finishInput: EditorAiMessageFinishInput = { status: 'stopped', error: 'Stopped by user' }
const model: StoryAiModelOption = {
  id: 'openai:gpt-5.6', label: 'gpt-5.6', capabilities: ['chat'],
  vision: false, tools: false, structuredOutput: false, contextWindow: 8192,
}
void [stopped, appendInput, finishInput, model, appendEditorAiMessage, finishEditorAiMessage, updateEditorAiTaskState]
```

- [ ] **Step 2: Run TypeScript and verify missing types/functions**

Run:

```bash
pnpm exec tsc --noEmit -p tsconfig.json
```

Expected: FAIL on the new persistence types, stopped status, capability properties, and client exports.

- [ ] **Step 3: Add typed backward-compatible Web DTOs**

Import `EditorAiMessageMetadata` and `AiChangeSetState` from `@mo-gallery/ai-agent`, then define:

```ts
export type EditorAiMessageStatus = 'pending' | 'streaming' | 'completed' | 'failed' | 'stopped'

export interface EditorAiMessageDto {
  id: string
  conversationId: string
  role: string
  content: string
  status: EditorAiMessageStatus
  model?: string
  action?: string
  metadata?: EditorAiMessageMetadata
  error?: string
  createdAt: string
}

export interface EditorAiMessageAppendInput {
  role: 'system' | 'user' | 'assistant'
  content: string
  status?: EditorAiMessageStatus
  model?: string
  action?: string
  metadata?: EditorAiMessageMetadata
  error?: string
}

export type EditorAiMessageFinishInput =
  | { status: 'completed'; content: string; model?: string; metadata?: EditorAiMessageMetadata }
  | { status: 'failed' | 'stopped'; content?: string; model?: string; metadata?: EditorAiMessageMetadata; error: string }

export interface EditorAiTaskStateUpdateInput {
  state: AiChangeSetState
}
```

Because `EditorAiMessageMetadata` is JSON-compatible, existing image/ad-hoc metadata remains assignable while `readEditorAiTaskMessageMetadata()` provides safe task narrowing.

- [ ] **Step 4: Add exact Web client methods**

In `src/lib/api/story-ai.ts`:

```ts
export function appendEditorAiMessage(
  token: string,
  conversationId: string,
  input: EditorAiMessageAppendInput,
): Promise<EditorAiMessageDto> {
  return apiRequestData(`/api/admin/editor-ai/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: 'POST', body: JSON.stringify(input),
  }, token)
}

export function finishEditorAiMessage(
  token: string,
  messageId: string,
  input: EditorAiMessageFinishInput,
): Promise<EditorAiMessageDto> {
  return apiRequestData(`/api/admin/editor-ai/messages/${encodeURIComponent(messageId)}/finish`, {
    method: 'POST', body: JSON.stringify(input),
  }, token)
}

export function updateEditorAiTaskState(
  token: string,
  messageId: string,
  state: AiChangeSetState,
): Promise<EditorAiMessageDto> {
  return apiRequestData(`/api/admin/editor-ai/messages/${encodeURIComponent(messageId)}/task-state`, {
    method: 'PATCH', body: JSON.stringify({ state }),
  }, token)
}
```

- [ ] **Step 5: Run focused contract and TypeScript checks**

Run:

```bash
pnpm exec tsx tests/editor-ai-persistence-contract.test.ts
pnpm exec tsc --noEmit -p tsconfig.json
```

Expected: both commands exit 0.

- [ ] **Step 6: Record the Web client commit boundary**

```bash
git add src/lib/api/types.ts src/lib/api/story-ai.ts tests/editor-ai-persistence-contract.test.ts
git commit -m "feat: expose editor AI task persistence client"
```

### Task 7: Desktop transactional metadata persistence

**Files:**

- Modify: `desktop/services/editor-ai.go`
- Modify: `desktop/services/editor_ai_test.go`

- [ ] **Step 1: Add failing Go tests with an isolated PostgreSQL test transaction**

Extend `desktop/services/editor_ai_test.go` to use `EDITOR_AI_TEST_DATABASE_URL`. When absent, call `t.Skip("EDITOR_AI_TEST_DATABASE_URL is required for GORM persistence tests")`; never use the configured production database. Seed one conversation and one streaming assistant message inside a transaction rolled back with `t.Cleanup`.

Add these tests:

```go
func TestFinishMessageCommitsStatusMetadataAndConversationTogether(t *testing.T) {
    service, database, conversationID, messageID := newEditorAiPersistenceTest(t)
    metadata := json.RawMessage(`{"type":"editor_ai_task","task":{"taskId":"task-1","status":"completed","changeSet":{"state":"applied"}}}`)
    result, err := service.FinishMessage(EditorAiMessageFinishInput{
        MessageID: messageID, Status: "completed", Content: "done",
        Model: "openai:gpt-5.6", Metadata: metadata,
    })
    if err != nil { t.Fatal(err) }
    if result.Status != "completed" { t.Fatalf("status = %q", result.Status) }
    var conversation db.AiConversation
    if err := database.First(&conversation, "id = ?", conversationID).Error; err != nil { t.Fatal(err) }
    if conversation.LastModel == nil || *conversation.LastModel != "openai:gpt-5.6" { t.Fatalf("lastModel = %#v", conversation.LastModel) }
}

func TestUpdateTaskStatePreservesUnrelatedMetadata(t *testing.T) {
    service, _, _, messageID := newCompletedTaskPersistenceTest(t)
    result, err := service.UpdateTaskState(EditorAiTaskStateUpdateInput{MessageID: messageID, State: "undone"})
    if err != nil { t.Fatal(err) }
    encoded, _ := json.Marshal(result.Metadata)
    if !bytes.Contains(encoded, []byte(`"summary":["kept"]`)) || !bytes.Contains(encoded, []byte(`"state":"undone"`)) {
        t.Fatalf("metadata = %s", encoded)
    }
}

func TestMetadataRejectsVisualAndOversizedPayloads(t *testing.T) {
    service, _, _, messageID := newEditorAiPersistenceTest(t)
    for _, metadata := range []json.RawMessage{
        json.RawMessage(`{"screenshot":"data:image/png;base64,AAAA"}`),
        json.RawMessage(`{"value":"` + strings.Repeat("x", maxEditorAiMetadataBytes) + `"}`),
    } {
        _, err := service.FinishMessage(EditorAiMessageFinishInput{MessageID: messageID, Status: "completed", Content: "x", Metadata: metadata})
        if err == nil { t.Fatal("expected metadata validation error") }
    }
}
```

- [ ] **Step 2: Run Go tests and verify missing fields/method failures**

Run:

```bash
cd desktop && go test ./services -run 'Test(FinishMessage|UpdateTaskState|Metadata)' -count=1
```

Expected: compile FAIL because `Status`, `Metadata`, DTO-returning `FinishMessage`, and `UpdateTaskState` do not exist. DB tests skip only when the dedicated test DSN is absent.

- [ ] **Step 3: Add bounded metadata input and stopped status**

Use raw JSON at the Wails boundary so Go validates bytes before unmarshalling:

```go
const maxEditorAiMetadataBytes = 256 * 1024

type EditorAiMessageFinishInput struct {
    MessageID string          `json:"messageId"`
    Status    string          `json:"status"`
    Content   string          `json:"content,omitempty"`
    Model     string          `json:"model,omitempty"`
    Metadata  json.RawMessage `json:"metadata,omitempty"`
    Error     string          `json:"error,omitempty"`
}

type EditorAiTaskStateUpdateInput struct {
    MessageID string `json:"messageId"`
    State     string `json:"state"`
}
```

`validateEditorAiMetadata()` must reject invalid JSON, values above 256 KiB, and any recursively discovered string beginning with `data:image/`. It must not reject ordinary legacy image metadata containing local paths or uploaded URLs.

- [ ] **Step 4: Replace FinishMessage with one GORM transaction**

Return the updated DTO and update the conversation in the same transaction:

```go
func (s *EditorAiService) FinishMessage(input EditorAiMessageFinishInput) (*EditorAiMessageDTO, error) {
    if input.MessageID == "" { return nil, errors.New("messageId 必填") }
    if input.Status != "completed" && input.Status != "failed" && input.Status != "stopped" {
        return nil, errors.New("status 必须是 completed、failed 或 stopped")
    }
    metadata, err := validateEditorAiMetadata(input.Metadata)
    if err != nil { return nil, err }
    var result db.AiMessage
    err = db.DB.Transaction(func(tx *gorm.DB) error {
        var message db.AiMessage
        if err := tx.Where("id = ?", input.MessageID).First(&message).Error; err != nil { return err }
        updates := map[string]interface{}{"status": input.Status}
        if input.Content != "" || input.Status == "completed" { updates["content"] = input.Content }
        if input.Model != "" { updates["model"] = input.Model }
        if metadata != nil { updates["metadata"] = datatypes.JSON(metadata) }
        if input.Status == "completed" { updates["error"] = nil } else { updates["error"] = input.Error }
        if err := tx.Model(&db.AiMessage{}).Where("id = ?", message.ID).Updates(updates).Error; err != nil { return err }
        conversationUpdates := map[string]interface{}{"updatedAt": time.Now()}
        if input.Status == "completed" && input.Model != "" { conversationUpdates["lastModel"] = input.Model }
        if err := tx.Model(&db.AiConversation{}).Where("id = ?", message.ConversationID).Updates(conversationUpdates).Error; err != nil { return err }
        return tx.Where("id = ?", message.ID).First(&result).Error
    })
    if err != nil { return nil, fmt.Errorf("结束消息失败: %w", err) }
    dto := toMessageDTO(result)
    return &dto, nil
}
```

- [ ] **Step 5: Implement narrow task-state metadata mutation**

Within a transaction, load the message, decode metadata into `map[string]interface{}`, accept either the new `{type, task}` envelope or a legacy bare task object, require task status `completed`, require `changeSet`, mutate only `changeSet["state"]`, revalidate size/visual constraints, update metadata, and return the DTO. Valid states are exactly `applied`, `undone`, and `redone`.

Normalize legacy bare task metadata to the new envelope when writing:

```go
normalized := map[string]interface{}{
    "type": "editor_ai_task",
    "task": task,
}
```

- [ ] **Step 6: Run Go tests**

Run:

```bash
cd desktop && go test ./services -run 'Test(FinishMessage|UpdateTaskState|Metadata)' -count=1
cd desktop && go test ./... -count=1
```

Expected: persistence tests pass with the dedicated DSN or report explicit skips; all non-DB Go tests pass.

- [ ] **Step 7: Record the Desktop persistence commit boundary**

```bash
git add desktop/services/editor-ai.go desktop/services/editor_ai_test.go
git commit -m "feat: persist desktop editor AI task state atomically"
```

### Task 8: Wails application methods and generated bindings

**Files:**

- Modify: `desktop/app.go`
- Regenerate: `desktop/frontend/wailsjs/go/main/App.d.ts`
- Regenerate: `desktop/frontend/wailsjs/go/main/App.js`
- Regenerate: `desktop/frontend/wailsjs/go/models.ts`

- [ ] **Step 1: Change App methods to return DTOs and expose task-state update**

In `desktop/app.go`:

```go
func (a *App) FinishEditorAiMessage(input services.EditorAiMessageFinishInput) (*services.EditorAiMessageDTO, error) {
    return a.EditorAi.FinishMessage(input)
}

func (a *App) UpdateEditorAiTaskState(input services.EditorAiTaskStateUpdateInput) (*services.EditorAiMessageDTO, error) {
    return a.EditorAi.UpdateTaskState(input)
}
```

- [ ] **Step 2: Verify the existing generated declaration is stale**

Run:

```bash
pnpm exec tsx -e "import { readFileSync } from 'node:fs'; const d = readFileSync('desktop/frontend/wailsjs/go/main/App.d.ts','utf8'); if (!d.includes('FinishEditorAiMessage(arg1:services.EditorAiMessageFinishInput):Promise<void>')) process.exit(1)"
```

Expected: exit 0 before regeneration, proving the binding still returns `Promise<void>`.

- [ ] **Step 3: Regenerate bindings through the installed Wails version**

From `desktop`, run the CLI version pinned in `desktop/go.mod`:

```bash
go run github.com/wailsapp/wails/v2/cmd/wails@v2.12.0 generate module
```

Expected: Wails regenerates frontend bindings. Do not manually patch any file under `desktop/frontend/wailsjs`.

- [ ] **Step 4: Verify generated signatures and models**

Run:

```bash
pnpm exec tsx -e "import { readFileSync } from 'node:fs'; const d = readFileSync('desktop/frontend/wailsjs/go/main/App.d.ts','utf8'); if (!d.includes('FinishEditorAiMessage(arg1:services.EditorAiMessageFinishInput):Promise<services.EditorAiMessageDTO>')) process.exit(1); if (!d.includes('UpdateEditorAiTaskState(arg1:services.EditorAiTaskStateUpdateInput):Promise<services.EditorAiMessageDTO>')) process.exit(1)"
```

Expected: exit 0. Also inspect `models.ts` for `status`, `metadata`, and `state`; generated classes must match Go JSON tags.

- [ ] **Step 5: Record the Wails binding commit boundary**

```bash
git add desktop/app.go desktop/frontend/wailsjs/go/main/App.d.ts desktop/frontend/wailsjs/go/main/App.js desktop/frontend/wailsjs/go/models.ts
git commit -m "feat: expose desktop editor AI task persistence bindings"
```

### Task 9: Desktop frontend type and adapter parity

**Files:**

- Modify: `desktop/frontend/src/lib/api/types.ts`
- Modify: `desktop/frontend/src/lib/api/editor-ai-local.ts`

- [ ] **Step 1: Add typed imports and let the desktop build expose missing parity**

At the top of `desktop/frontend/src/lib/api/types.ts`, import:

```ts
import type {
  AiChangeSetState,
  EditorAiMessageMetadata,
} from '@mo-gallery/ai-agent'
```

Replace `status: string` and `metadata?: unknown` with the same status and metadata types introduced for Web in Task 6, and add `EditorAiMessageAppendInput`, `EditorAiMessageFinishInput`, and `EditorAiTaskStateUpdateInput` with identical field names.

- [ ] **Step 2: Update local persistence calls to the new finish contract**

Change successful and stopped/failed calls in `desktop/frontend/src/lib/api/editor-ai-local.ts`:

```ts
await FinishEditorAiMessage({
  messageId: assistantMessage.id,
  status: 'completed',
  content: fullContent,
  model,
})

await FinishEditorAiMessage({
  messageId: assistantMessage.id,
  status: error instanceof Error && error.name === 'AbortError' ? 'stopped' : 'failed',
  error: message,
  model,
}).catch(() => {})
```

- [ ] **Step 3: Add local append/finish/task-state adapter exports**

Expose functions matching Web semantics, without token use:

```ts
export async function appendLocalEditorAiMessage(
  conversationId: string,
  input: EditorAiMessageAppendInput,
): Promise<EditorAiMessageDto> {
  return await AppendEditorAiMessage({ conversationId, ...input })
}

export async function finishLocalEditorAiMessage(
  messageId: string,
  input: EditorAiMessageFinishInput,
): Promise<EditorAiMessageDto> {
  return await FinishEditorAiMessage({ messageId, ...input })
}

export async function updateLocalEditorAiTaskState(
  messageId: string,
  state: AiChangeSetState,
): Promise<EditorAiMessageDto> {
  return await UpdateEditorAiTaskState({ messageId, state })
}
```

Do not add prompt strings, operation interpretation, or layout decisions to Go. Existing `buildEditorAiMessages`, title prompts, and future direct-edit orchestration remain in `@mo-gallery/ai-agent` and this TypeScript adapter.

- [ ] **Step 4: Build the Desktop frontend**

Run:

```bash
cd desktop/frontend && pnpm build
```

Expected: `tsc && vite build` exits 0; generated bindings and local adapter types agree.

- [ ] **Step 5: Record the Desktop adapter commit boundary**

```bash
git add desktop/frontend/src/lib/api/types.ts desktop/frontend/src/lib/api/editor-ai-local.ts
git commit -m "feat: align desktop editor AI persistence adapter"
```

### Task 10: Web model capability DTOs with conservative defaults

**Files:**

- Modify: `.env.example`
- Modify: `server/lib/story-ai.ts`
- Modify: `src/lib/api/types.ts`
- Modify: `tests/editor-ai-persistence-contract.test.ts`

- [ ] **Step 1: Add failing Web model capability assertions**

Extract and export a pure resolver from `server/lib/story-ai.ts`, then test it in `tests/editor-ai-persistence-contract.test.ts`:

```ts
import { resolveStoryAiModelCapabilities } from '../server/lib/story-ai'

assert.deepEqual(resolveStoryAiModelCapabilities('unknown-model', {
  visionModels: new Set(), toolModels: new Set(), structuredOutputModels: new Set(), contextWindows: new Map(),
}), { vision: false, tools: false, structuredOutput: false, contextWindow: 8192 })

assert.deepEqual(resolveStoryAiModelCapabilities('gpt-5.6', {
  visionModels: new Set(['gpt-5.6']), toolModels: new Set(['gpt-5.6']),
  structuredOutputModels: new Set(['gpt-5.6']), contextWindows: new Map([['gpt-5.6', 128000]]),
}), { vision: true, tools: true, structuredOutput: true, contextWindow: 128000 })
```

- [ ] **Step 2: Run the test and verify the missing resolver failure**

Run:

```bash
pnpm exec tsx tests/editor-ai-persistence-contract.test.ts
```

Expected: FAIL because `resolveStoryAiModelCapabilities` is not exported.

- [ ] **Step 3: Add explicit Web capability configuration**

Document these values in `.env.example`:

```dotenv
# Direct-edit capabilities are deny-by-default. Comma-separated model IDs.
AI_VISION_MODELS=
AI_TOOL_MODELS=
AI_STRUCTURED_OUTPUT_MODELS=
# JSON object mapping model ID to positive context-window tokens.
AI_MODEL_CONTEXT_WINDOWS={}
```

Parse once inside `getStoryAiConfig()`. Reject malformed JSON and non-positive/non-integer context windows as configuration errors; do not infer vision/tools/structured output from model names.

- [ ] **Step 4: Return capability fields on every chat model**

Extend the server and Web DTO:

```ts
export interface StoryAiModelOption {
  id: string
  label: string
  capabilities?: Array<'chat' | 'image'>
  vision: boolean
  tools: boolean
  structuredOutput: boolean
  contextWindow: number
}
```

For each model use:

```ts
const directEdit = resolveStoryAiModelCapabilities(id, capabilityConfig)
return { id, label: id, capabilities: [supportsImage ? 'image' : 'chat'], ...directEdit }
```

Image-only models also receive conservative direct-edit defaults. The default model inserted when absent from `/models` must use the same resolver.

- [ ] **Step 5: Run Web capability tests and typecheck**

Run:

```bash
pnpm exec tsx tests/editor-ai-persistence-contract.test.ts
pnpm exec tsc --noEmit -p tsconfig.json
```

Expected: capability assertions pass and TypeScript exits 0.

- [ ] **Step 6: Record the Web capability commit boundary**

```bash
git add .env.example server/lib/story-ai.ts src/lib/api/types.ts tests/editor-ai-persistence-contract.test.ts
git commit -m "feat: expose web editor AI model capabilities"
```

### Task 11: Desktop capability configuration and DTO parity

**Files:**

- Modify: `desktop/config/config.go`
- Modify: `desktop/config/config_test.go`
- Modify: `desktop/services/editor-ai.go`
- Modify: `desktop/services/editor_ai_test.go`
- Modify: `desktop/frontend/src/lib/api/types.ts`
- Modify: `desktop/frontend/src/lib/api/editor-ai-local.ts`
- Regenerate: `desktop/frontend/wailsjs/go/models.ts`

- [ ] **Step 1: Add failing conservative-default and configured capability tests**

Extend `desktop/config/config_test.go` and `desktop/services/editor_ai_test.go`:

```go
provider := config.AIProviderConfig{
    Models: []string{"gpt-5.6", "unknown"},
    VisionModels: []string{"gpt-5.6"},
    ToolModels: []string{"gpt-5.6"},
    StructuredOutputModels: []string{"gpt-5.6"},
    ContextWindows: map[string]int{"gpt-5.6": 128000},
}
capable := resolveDesktopModelCapabilities(provider, "gpt-5.6")
if !capable.Vision || !capable.Tools || !capable.StructuredOutput || capable.ContextWindow != 128000 { t.Fatalf("capable = %#v", capable) }
unknown := resolveDesktopModelCapabilities(provider, "unknown")
if unknown.Vision || unknown.Tools || unknown.StructuredOutput || unknown.ContextWindow != 8192 { t.Fatalf("unknown = %#v", unknown) }
```

- [ ] **Step 2: Run Go tests and verify missing config fields**

Run:

```bash
cd desktop && go test ./config ./services -run 'Test.*(Model|Capabilities)' -count=1
```

Expected: compile FAIL because capability configuration and DTO fields are missing.

- [ ] **Step 3: Extend provider config using snake-case persisted keys**

In `desktop/config/config.go`:

```go
type AIProviderConfig struct {
    BaseURL                string         `json:"base_url"`
    APIKey                 string         `json:"api_key"`
    Models                 []string       `json:"models"`
    ImageModels            []string       `json:"image_models,omitempty"`
    VisionModels           []string       `json:"vision_models,omitempty"`
    ToolModels             []string       `json:"tool_models,omitempty"`
    StructuredOutputModels []string       `json:"structured_output_models,omitempty"`
    ContextWindows         map[string]int `json:"context_windows,omitempty"`
}
```

`Normalize()` must initialize a nil `ContextWindows` map and remove entries whose model ID is empty or whose value is not a positive integer. It must not auto-add capability model IDs based on names.

- [ ] **Step 4: Extend Desktop model DTOs with frontend-facing camel-case keys**

```go
type StoryAiModelOption struct {
    ID               string   `json:"id"`
    Label            string   `json:"label"`
    Provider         string   `json:"provider"`
    Model            string   `json:"model"`
    Capabilities     []string `json:"capabilities,omitempty"`
    Vision           bool     `json:"vision"`
    Tools            bool     `json:"tools"`
    StructuredOutput bool     `json:"structuredOutput"`
    ContextWindow    int      `json:"contextWindow"`
}
```

`resolveDesktopModelCapabilities()` uses exact membership in the provider arrays and defaults `ContextWindow` to `8192`. Apply it in both `GetModels()` and `GetProviderModels()`; remotely discovered models not present in configuration remain conservative.

- [ ] **Step 5: Regenerate Wails models and map all fields in TypeScript**

Run from `desktop`:

```bash
go run github.com/wailsapp/wails/v2/cmd/wails@v2.12.0 generate module
```

Then extend `StoryAiModelOption` in `desktop/frontend/src/lib/api/types.ts` and map in `getLocalStoryAiModels()`:

```ts
vision: model.vision,
tools: model.tools,
structuredOutput: model.structuredOutput,
contextWindow: model.contextWindow,
```

Do not manually edit generated `wailsjs` files.

- [ ] **Step 6: Run Go and Desktop frontend checks**

Run:

```bash
cd desktop && go test ./config ./services -count=1
cd desktop/frontend && pnpm build
```

Expected: Go tests pass (DB-dependent persistence tests may explicitly skip without their dedicated DSN), and the Vite build exits 0.

- [ ] **Step 7: Record the Desktop capability commit boundary**

```bash
git add desktop/config/config.go desktop/config/config_test.go desktop/services/editor-ai.go desktop/services/editor_ai_test.go desktop/frontend/src/lib/api/types.ts desktop/frontend/src/lib/api/editor-ai-local.ts desktop/frontend/wailsjs/go/models.ts
git commit -m "feat: expose desktop editor AI model capabilities"
```

### Task 12: Full verification and deployment boundary review

**Files:**

- Verify only; no production-code creation is expected.

- [ ] **Step 1: Run shared package tests and typecheck**

```bash
pnpm --filter @mo-gallery/ai-agent test
pnpm --filter @mo-gallery/ai-agent typecheck
```

Expected: all domain/runtime/orchestration tests pass and typecheck exits 0.

- [ ] **Step 2: Run focused persistence/security tests**

```bash
pnpm exec tsx tests/editor-ai-persistence-contract.test.ts
pnpm exec tsx server/lib/editor-ai-repository.test.ts
pnpm exec tsx hono/editor-ai.test.ts
```

Expected: migration inspection, owner repository behavior, endpoint validation, and unauthorized expensive-work counters all pass.

- [ ] **Step 3: Validate and generate Prisma artifacts without applying to production**

```bash
pnpm exec prisma validate
pnpm run prisma:generate
pnpm exec prisma migrate status
```

Expected: schema validation and client generation pass. `migrate status` may report the new migration pending; that is correct before deployment. Do not run `prisma migrate deploy` against a production or shared database as part of implementation verification.

- [ ] **Step 4: Run Desktop Go verification**

```bash
cd desktop && go test ./... -count=1
```

Expected: all non-DB tests pass. Persistence transaction tests pass when `EDITOR_AI_TEST_DATABASE_URL` points to an isolated migrated PostgreSQL database; otherwise they report explicit skips, which must be recorded as a DB-dependent verification boundary.

- [ ] **Step 5: Run repository lint and builds**

```bash
pnpm run lint
pnpm run build
cd desktop/frontend && pnpm build
```

Expected: ESLint, Next.js production build, Desktop TypeScript, and Vite production build exit 0.

- [ ] **Step 6: Inspect migration and generated bindings**

Confirm all of the following manually:

- migration SQL contains no backfill and uses nullable `userId` plus `ON DELETE SET NULL`;
- every ordinary Web conversation/message query includes JWT `sub` ownership;
- missing and other-owner IDs return identical 404 payloads;
- model/storage/remote image counters stay zero after unauthorized requests;
- Web and Desktop message DTOs include `stopped` and JSON-compatible typed metadata;
- task-state updates preserve all metadata except `changeSet.state`;
- no persisted task metadata contains screenshot/thumbnail data URLs or exceeds 256 KiB;
- generated Wails files were produced by the CLI and not hand-edited;
- no prompt or layout decision logic was added to Go;
- Desktop deployment is blocked unless its database/schema isolation assumption is satisfied and the Prisma migration is applied.

- [ ] **Step 7: Record the final verification checkpoint**

```bash
git status --short
git diff --check
```

Expected: `git diff --check` exits 0. The working tree may contain the planned implementation changes; do not commit, push, apply the migration, or deploy unless the user explicitly requests those actions.

## Requirement coverage index

- Shared metadata discriminator/guard without contract duplication: Task 1.
- Nullable Prisma owner, no backfill, hidden legacy rows, conservative deletion, exact SQL: Task 2.
- Owner-aware repository signatures, all owned lookups, atomic finish, narrow state: Task 3.
- JWT threading, new routes, validation, ownership before expensive work, unchanged ownerless routes: Tasks 4-5.
- Web status/metadata types and clients: Task 6.
- Desktop local single-user persistence, transaction, state preservation, size/visual bounds, Go tests: Task 7.
- App methods and generated Wails bindings: Task 8.
- Desktop frontend parity and no Go prompts: Task 9.
- Web/Desktop model capabilities with conservative defaults: Tasks 10-11.
- Focused package/repository/route/migration/Go/client/build verification: Task 12.
- Shared-database Desktop hazard and deployment precondition: deployment precondition section and Task 12.

## Self-review

- **Spec coverage:** All twelve requested persistence/security/capability areas map to explicit tasks above. TipTap, Zine host/editor/sidebar, visual capture, operation execution, and Undo UI are explicitly excluded.
- **Placeholder scan:** The plan contains no `TBD`, `TODO`, “implement later,” or cross-task “similar to” instruction. Code-changing steps include exact paths, signatures, schemas, SQL, commands, and expected outcomes.
- **Type consistency:** The shared names remain `EditorAiTaskMetadata`, `AiChangeSet`, and `AiChangeSetState`; the persistence wrapper is consistently `EditorAiTaskMessageMetadata`; status includes `stopped` across Web, Go, Wails, and Desktop TypeScript; capability DTOs consistently use `vision`, `tools`, `structuredOutput`, and `contextWindow`, while persisted Desktop config uses `structured_output_models`.
- **Security ordering:** Every conversation-bearing path resolves JWT ownership before history, models, storage, downloads, image processing, or message mutations. Ownerless model/upload/proxy routes remain unchanged.
- **Migration safety:** No automatic owner backfill is present. `SET NULL` preserves data while ordinary owner-filtered APIs hide orphaned rows. Applying migrations remains a separate DB-dependent deployment action.
