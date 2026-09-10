# Design

Add EditorType (tiptap, milkdown). Blog and Story retain metadata and editorType; BlogContent and StoryContent hold id, parent foreign key, editorType, tiptapContent, tiptapContentJson, milkContent and timestamps. Unique(parentId, editorType), cascading deletion. Backfill one TipTap row for every old parent, including blank bodies, and remove old parent body columns in a new migration. Do not execute migrations against the configured database.

Keep flat article DTOs: required editorType, contentEditorTypes (existing related row types), tiptapContent:string; optional nullable tiptapContentJson and milkContent. Admin reads include source bodies for conversion; public readers select the parent type. Derive previews from selected content. Keep existing list/detail product behavior.

Create requires editorType. Patch may omit it for metadata-only updates; body writes require it. Save only the matching format, preserve other rows, and update parent/type and content atomically. Empty strings are valid. Switching type without body data requires an existing target row. Reads never create records.

Both hosts use packages/milkdown. Its migration module exposes convertToMilkdown({tiptapContent,tiptapContentJson}) for explicit conversion. getMilkdownContent becomes a strict Milkdown read requiring source.editorType === milkdown, with no TipTap fallback. Existing TipTap-only records show a conversion action before Milkdown editing/saving; conversion sets local editorType to milkdown, then normal save persists it. New documents start as Milkdown. Preview follows form editorType.

Normalize legacy draft property names only at their persistence boundary. Preserve empty Milkdown drafts. Do not rename nested TipTap JSON arrays or unrelated AI/message text.

Ownership: backend worker owns prisma/Hono/server article queries and seed data; Desktop worker owns desktop DTOs/drafts/editor consumers; Web worker owns src Web editors/drafts/public rendering. Parent owns packages/api-client, packages/milkdown conversion helpers, remaining platform readers, integration validation and documentation. All participants preserve the existing 210 worktree changes.
