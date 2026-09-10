# Article content by editor and unified Milkdown authoring

## Goal

Split blog and story editor content into related tables, migrate existing articles as TipTap, explicitly convert when target content is missing, and unify Web/Desktop Milkdown authoring.

## Requirements

- Rename article body properties to `tiptapContent` and `tiptapContentJson`; keep unrelated text and TipTap document-node `content` fields unchanged.
- Use `editorType` on parent and related content rows. All existing cloud articles are TipTap, as explicitly confirmed by the user.
- A content row's existence identifies whether that editor has content. Empty saved bodies are valid and never trigger fallback or automatic conversion.
- Missing Milkdown content requires an explicit conversion action from TipTap. Web and Desktop share Milkdown authoring.
- Cover Blog and Story, which share this pipeline, including server queries, clients, previews and local drafts.
- Retain existing publication semantics: a normal cloud save updates body and parent editorType together. No synchronization, history or new publication framework.
- Use a generic EditorContentPrompt whose target/source editor names and conversion/use-existing/unavailable scenario come from the host.
- Successful saves update the current editor and list row in place, preserve caret/scroll and newer input, and keep a stable editing session across first-create ID assignment. Further saves update the same article.
- Fix the observed first-save transaction-acquisition timeout without automatic mutation retries, keeping the server transaction budget within Desktop's HTTP deadline.

## Acceptance Criteria

- [ ] Every old parent receives a TipTap row, preserving strings, JSON, metadata and publication state exactly, including blank bodies.
- [ ] Parent/type is unique and foreign keys cascade deletion.
- [ ] Public body and previews select editorType instead of non-null Milkdown precedence.
- [ ] Both hosts prompt before converting a TipTap-only article, preserve the original, and persist conversion only through normal save.
- [ ] Saving blank content creates/updates a row; reopening remains blank.
- [ ] Body writes specify editorType; metadata-only writes preserve it. API reports matching row availability independently of content length.
- [ ] Existing local drafts survive field renaming and retain editor identity.
- [ ] Relevant quality checks and available UI verification complete.

## Notes

- User direction is recorded in the current conversation's six numbered clarifications and final Web/Desktop parity requirement.
- Preserve all pre-existing worktree changes. Deliver migration files without applying them to the configured live database. No commit or push requested.
