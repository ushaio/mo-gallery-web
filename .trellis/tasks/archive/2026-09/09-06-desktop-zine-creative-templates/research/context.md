# Context

- `docs/PROJECT_CONTEXT.md` is the authoritative module index; current source overrides the historical desktop design document.
- `desktop/frontend/src/lib/zine/plaza.ts` stores template slots as 0..1 coordinates per page; right-page X gains pageW when projected to a spread. Font size is a fraction of page height, converted to points.
- `Slot` supports image/text, rotation and zIndex; text already supports content, alignment, vertical alignment, font family, line height and color. Persist plain text, not HTML.
- `TemplateGallery.tsx` currently hides everything behind a remote-only loading/error branch. Keep built-ins outside this branch.
- `features/design-studio/zine/ZineTemplateBrowser.tsx` owns new-project template discovery; size starters must stay accessible.
- `store/zine.ts` creates a cover and default content spread, manages fresh IDs, history, autosave and local persistence. Inject selected content during creation instead of constructing temporary add/remove history steps.
- Related Zine interaction/print task PRDs record the user's preference against further browser automation. Use build and deterministic/offscreen artifact checks here.
- Root `AGENTS.md`: avoid unnecessary test code; frontend build is required; preserve unrelated modifications.
