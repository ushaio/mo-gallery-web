# Shared contract

- Shared `EditorType = 'tiptap' | 'milkdown'` in packages/api-client/src/types.ts.
- BlogDto/StoryDto: required editorType, contentEditorTypes:EditorType[], tiptapContent:string; optional nullable tiptapContentJson and milkContent. Remove old article content/contentJson fields.
- contentEditorTypes enumerates actual cloud body rows, not truthy bodies. Existing empty rows are valid.
- Create and body PATCH specify editorType; metadata-only PATCH may omit it.
- Explicit conversion: `convertToMilkdown` from `@mo-gallery/milkdown/migration`, input `{tiptapContent?:string|null,tiptapContentJson?:unknown}`.
- `getMilkdownContent` is strict: source editorType milkdown reads milkContent or empty; no automatic TipTap conversion.
- Hosts show conversion for a TipTap-only existing article. On acceptance, set local editorType milkdown, populate milkContent, preserve the TipTap fields. Persist through regular save. New docs start milkdown.
- Public preview follows editorType. Parent selection and body writes are atomic.
- Nested TipTap JSON `content`, editor component props and unrelated AI message content do not change.
- Code evidence: prisma/schema.prisma Blog/Story, hono/blogs.ts, hono/stories.ts, server/lib/queries.ts, src/components/StoryRichContent.tsx, packages/milkdown/src/legacy-content.ts.
