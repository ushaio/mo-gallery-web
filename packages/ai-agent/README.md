# @mo-gallery/ai-agent

`@mo-gallery/ai-agent` is the shared, SDK-neutral editor AI contract and
orchestration package used by MO Gallery Web, Desktop, and editor hosts.

## Editing paths

### Legacy proposal path

```text
linear text snapshot
  -> proposal generation
  -> approval request
  -> host review and application
```

`runEditorAgent` and `runEditorAgentWithRuntime` preserve the original
`EditorDocumentSnapshot` -> `EditorProposal[]` workflow. The runtime never
applies a proposal itself. The host reviews approval events and owns the final
application.

This path is temporary compatibility for existing narrative integrations.
New structured integrations should migrate to direct edit while legacy hosts
continue to receive `proposal_created` and `approval_required` events.

#### Compatibility-only legacy proposal example

This example is for hosts that have not migrated yet. The package generates
proposals; the host still reviews and applies an approved text replacement.

```ts
import {
  getTextReplacementOperation,
  runEditorAgent,
  type EditorDocumentSnapshot,
  type EditorProposal,
  type ReplaceTextOperation,
} from '@mo-gallery/ai-agent'

// Host-owned integration points: capture the live editor, present one proposal
// for approval, read the live revision, and apply one guarded replacement.
declare const host: {
  captureLegacySnapshot(): Promise<EditorDocumentSnapshot>
  chooseApprovedProposal(
    proposals: EditorProposal[],
  ): Promise<EditorProposal | null>
  getCurrentRevision(): string
  applyLegacyReplacement(
    operation: ReplaceTextOperation,
    expectedRevision: string,
  ): Promise<void>
}

const document = await host.captureLegacySnapshot()

const result = await runEditorAgent({
  endpoint: { baseURL: 'https://ai.example.com/v1' },
  model: 'your-editor-model',
  instruction: 'Tighten the second paragraph.',
  document,
})

// Review and apply at most one proposal generated from this captured snapshot.
const proposal = await host.chooseApprovedProposal(result.proposals)
if (proposal !== null) {
  const operation = getTextReplacementOperation(proposal)
  if (operation === null) {
    throw new Error('The approved proposal is not one text replacement')
  }
  if (
    proposal.baseRevision !== result.documentRevision
    || host.getCurrentRevision() !== result.documentRevision
  ) {
    throw new Error('The approved proposal is stale')
  }
  await host.applyLegacyReplacement(operation, result.documentRevision)
}
```

Do not sequentially apply multiple proposal objects generated from the same
base revision. After applying any proposal, recapture the current document and
rerun the agent before reviewing another proposal. A separately validated,
atomic multi-proposal host transaction is outside this compatibility example.

### Direct-edit path

```text
structured snapshot
  -> capability and context resolution
  -> structured tool runtime
  -> one operation batch
  -> host simulation and validation
  -> one host commit
  -> AiChangeSet and task metadata
```

`runDirectEditAgent` and `runDirectEditAgentWithRuntime` coordinate the full
transaction. A successful task produces exactly one authoritative operation
batch and invokes one host commit after revision checks, simulation, and
validation. The completed result includes an `AiChangeSet` in task metadata.

## Ownership boundaries

The package owns:

- SDK-neutral snapshots, revisions, operations, changes, capabilities,
  authorization, agent protocols, and execution contracts;
- legacy and direct-edit prompts;
- orchestration, including capability degradation, context budgeting,
  revision checks, simulation/validation sequencing, and task metadata.

The Vercel AI SDK is confined to `src/runtime/vercel-ai/**` as a runtime
adapter. Its `LanguageModel`, tool, `ToolLoopAgent`, runtime classes, and test
injection hooks are not part of the package-root API.

Hosts own editor semantics and side effects: TipTap or Zine interpretation,
native history, persistence, and the exact one-undo behavior for one committed
AI task. The package does not persist raw visual inputs or screenshots.

## Host conversation/history and save ownership

The package does not own the Web or Desktop conversation database, active
conversation UI, message lifecycle, undo-state persistence, or editor/project
save. The host supplies the current conversation history to the chat or prompt
path when applicable and persists only lightweight `EditorAiTaskMetadata` and
`AiChangeSet` data on assistant messages--never screenshots, full document
snapshots, or raw model tool output.

The Web host uses authenticated server/Hono persistence. The Desktop host uses
local Go/GORM persistence exposed through Wails. In both hosts, native editor
history is authoritative; persisted `changeSet.state` is display state, not a
replacement for TipTap or Zine history. If saving fails after a commit, the
edit remains applied and dirty, and the host keeps it retryable rather than
rolling it back.

## Capability and authorization model

- **Narrative** tasks may operate on the structured story/blog document and
  its mapped visual segments.
- **Zine** writes are restricted to the current target spread. Project
  summaries, adjacent spreads, and approved asset candidates are context or
  references, not permission to mutate other spreads or arbitrary assets.
- **Visual mode** uses visual inputs when model vision is available.
- **Structure-only mode** degrades visual analysis to structured context.
- **Suggestion-only mode** is used when structured output or tool calling is
  unavailable and performs no direct commit.
- Deletion requires explicit `allowDelete` authorization and authorized target
  IDs. Zine operations must also satisfy target-spread and project-reference
  authorization.
- Visual inputs inform a task but are never stored in `AiChangeSet` or task
  metadata as raw data URLs.

## Public API example

The host supplies an SDK-neutral `AiDocumentHost` implementation. No Vercel AI
SDK types are needed at the call site.

```ts
import {
  runDirectEditAgent,
  type AiDocumentHost,
  type RunDirectEditAgentResult,
} from '@mo-gallery/ai-agent'

declare const host: AiDocumentHost<'narrative'>

const result: RunDirectEditAgentResult = await runDirectEditAgent({
  endpoint: { baseURL: 'http://localhost:11434/v1' },
  model: 'editor-model',
  instruction: 'Tighten the opening while preserving its tone.',
  taskType: 'instruction',
  host,
  modelCapabilities: {
    vision: true,
    structuredOutput: true,
    toolCalling: true,
  },
  authorization: {
    allowDelete: false,
    deleteTargetIds: [],
  },
})

if (result.mode === 'direct_edit') {
  console.log(result.metadata.changeSet, result.commit.historyEntryId)
}
```

For deterministic tests or another SDK-neutral runtime implementation, use
`runDirectEditAgentWithRuntime` and provide a `DirectEditAgentRuntime`.

## Legacy-to-direct-edit migration

1. Keep `runEditorAgent` available while existing consumers migrate.
2. Replace the linear `EditorDocumentSnapshot` with a capability-specific
   structured snapshot that has stable IDs and a stable revision. Do not
   reinterpret legacy exact-text operations as structured IDs; capture a new
   structured snapshot and generate structured operations instead.
3. Implement `AiDocumentHost` capture, simulation, validation, one commit, and
   native-history integration. The host, not this package, creates the single
   TipTap or Zine history entry.
4. Switch the model path to `runDirectEditAgent` and remove proposal/approval
   dialogs from that migrated flow.
5. Render the returned `AiChangeSet` in chat and persist its lightweight task
   metadata on the assistant message.
6. After every consumer has migrated, the legacy proposal API may be removed
   in a separate change; it is not removed as part of this migration step.

## Testing

From the workspace root:

```bash
pnpm --filter @mo-gallery/ai-agent test
pnpm --filter @mo-gallery/ai-agent typecheck
pnpm exec eslint packages/ai-agent/src packages/ai-agent/tests
```

Repository verification additionally uses `pnpm run lint`, `pnpm run build`,
and the Desktop frontend build when shared package exports are consumed there.
