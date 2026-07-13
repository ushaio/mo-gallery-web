# Narrative AI Sidebar and Direct-Edit Host Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Story/Blog floating assistant with a fixed right-side AI workspace and connect structured AI edits to TipTap as one locked, atomic, undoable transaction.

**Architecture:** Keep transport injection in each app wrapper and put editor behavior in `packages/tiptap-editor`. The shared editor owns the sidebar, task lock, structured TipTap host, one-transaction commit, and in-chat change cards; Story and Blog only provide document identity and disable their surrounding controls while a task is active.

**Tech Stack:** React 19, TipTap 3, ProseMirror transactions/history, TypeScript strict mode, Tailwind CSS 4, `@mo-gallery/ai-agent`, Node assertion tests through `tsx`.

---

## File map

**Create:**

- `packages/tiptap-editor/src/tiptap-editor/AiSidebar.tsx` - fixed editor-side AI workspace shell.
- `packages/tiptap-editor/src/tiptap-editor/AiChangeSetCard.tsx` - unified task result and diff state card.
- `packages/tiptap-editor/src/tiptap-editor/narrative-direct-edit-host.ts` - structured snapshot, simulation, atomic commit, and revision checks.
- `packages/tiptap-editor/tests/narrative-direct-edit-host.test.ts` - host transaction/history tests.
- `packages/tiptap-editor/tests/ai-sidebar.test.ts` - pure sidebar state and metadata rendering contracts.

**Modify:**

- `packages/tiptap-editor/src/NarrativeTipTapEditor.tsx` - compose editor and fixed sidebar, expose lock state, run direct edits.
- `packages/tiptap-editor/src/TipTapAiAssistant.tsx` - extract conversation behavior from floating portal presentation.
- `packages/tiptap-editor/src/runtime.ts` - add direct-edit persistence and model capability contracts.
- `packages/tiptap-editor/src/tiptap-editor/useNarrativeEditor.ts` - update editability and block paste while locked.
- `packages/tiptap-editor/src/tiptap-editor/useEditorImperativeHandle.ts` - guard external mutations and expose native task undo/redo state.
- `packages/tiptap-editor/src/tiptap-editor.css` - sidebar/editor split layout and reduced-motion styling.
- `src/components/NarrativeTipTapEditor.tsx` - inject Web direct-edit persistence APIs.
- `src/app/admin/logs/stories/StoryEditorView.tsx` - provide Story identity and consume task lock.
- `src/app/admin/logs/BlogTab.tsx` - provide stable Blog draft identity, enable AI, and consume task lock.
- `desktop/frontend/src/components/NarrativeTipTapEditor.tsx` - keep shared editor runtime contract aligned.
- `package.json` and `packages/tiptap-editor/package.json` - focused test scripts.

### Task 1: Fixed AI sidebar shell

- [ ] Write a failing UI-contract test proving the assistant renders inline, starts collapsed, expands from an editor-side button, and never creates a floating launcher portal.
- [ ] Run the focused test and confirm it fails because the assistant is still portal/floating based.
- [ ] Extract the fixed sidebar shell and reuse the existing conversation/model/generation behavior without changing transport semantics.
- [ ] Add accessible labels, pending/disabled states, responsive overlay behavior below desktop width, and reduced-motion-safe transitions.
- [ ] Run focused tests, package typecheck, and scoped ESLint.
- [ ] Complete spec-compliance review followed by code-quality review.

### Task 2: Central narrative task lock

- [ ] Write failing tests for TipTap editability, toolbar guards, paste guards, imperative mutation guards, and guaranteed unlock on success/failure/abort.
- [ ] Add `onAiTaskLockChange` and document identity to editor props.
- [ ] Implement one shared task lock owner; call `editor.setEditable(false)` while locked and disable all editor mutation paths.
- [ ] Disable Story/Blog save, metadata, photo insertion, and navigation controls through the host callback while a task is active.
- [ ] Run focused tests, Story/Blog typecheck, and scoped ESLint.
- [ ] Complete spec-compliance review followed by code-quality review.

### Task 3: Structured TipTap snapshot and simulation

- [ ] Write failing tests for stable node IDs, canonical revisions, offset validation, stale revisions, and all-or-nothing simulation.
- [ ] Build `NarrativeDocumentSnapshot` from TipTap JSON without visual segments in this first slice.
- [ ] Support `replace_text` first and reject unsupported operations with typed validation issues.
- [ ] Produce authoritative `AiChangeEntry[]` from simulation rather than model-authored diffs.
- [ ] Run host tests and `@mo-gallery/ai-agent` domain tests.
- [ ] Complete spec-compliance review followed by code-quality review.

### Task 4: One TipTap transaction and native history integration

- [ ] Write failing tests proving multiple replacements dispatch once, one undo restores the complete pre-task document, and one redo restores the result.
- [ ] Apply replacements in descending document-position order to one `editor.state.tr`.
- [ ] Attach task metadata, close adjacent typing history boundaries, and dispatch exactly once.
- [ ] Track whether the AI task is currently the native history top before enabling card undo/redo.
- [ ] Run transaction/history tests and editor package typecheck.
- [ ] Complete spec-compliance review followed by code-quality review.

### Task 5: Direct-edit orchestration and persisted change cards

- [ ] Write failing integration tests for append/finish/task-state calls and suggestion-only degradation.
- [ ] Invoke `runDirectEditAgent()` with the concrete TipTap host and exact model capabilities.
- [ ] Persist pending, completed, failed, and stopped task messages through the injected runtime.
- [ ] Render the final authoritative `AiChangeSet` inside the conversation; remove apply-confirmation dialogs from the direct-edit path.
- [ ] Wire card undo/redo to native history and persist `applied | undone | redone` only after successful editor history changes.
- [ ] Run editor, API contract, route, and typecheck suites.
- [ ] Complete spec-compliance review followed by code-quality review.

### Task 6: Story and Blog rollout

- [ ] Write failing integration contracts proving both document kinds provide stable scope/document IDs and task lock callbacks.
- [ ] Enable the sidebar for Story using `currentStory.id` and `documentKind: 'story'`.
- [ ] Generate a stable per-draft Blog ID, enable the same sidebar with `documentKind: 'blog'`, and never use the shared literal `new` as scope.
- [ ] Verify draft autosave receives one final HTML/JSON update after each AI commit.
- [ ] Run scoped lint, TypeScript, Web editor tests, and Desktop frontend build.
- [ ] Complete final end-to-end spec and quality reviews.

## Verification

Run from the repository root:

```powershell
pnpm exec tsc --noEmit -p tsconfig.json
pnpm exec eslint "packages/tiptap-editor/src/**/*.{ts,tsx}" "src/components/NarrativeTipTapEditor.tsx" "src/app/admin/logs/BlogTab.tsx" "src/app/admin/logs/stories/StoryEditorView.tsx"
pnpm run test:editor-ai-routes
pnpm --dir packages/tiptap-editor test
pnpm --dir desktop/frontend run build
```

The root production build additionally requires the configured PostgreSQL database to be reachable during `/blog` prerendering.
