# Design

## Change boundary

The gap is missing local creative layouts in the Zine catalog. The existing `PlazaSlot` normalized layout and `buildSpreadFromPlazaTemplate` conversion own that behavior. Extend their optional text/rotation fields without changing old remote payload defaults.

- `lib/zine/builtin-plaza-templates.ts`: six localized catalog definitions and recommended page formats.
- `components/zine/ZineTemplatePreview.tsx`: one lightweight layout preview driven by actual slots, reused by both template entry points.
- `lib/zine/plaza.ts`: optional content/font/rotation projection into existing editable slots.
- `lib/zine/plaza-copy.ts`: typed local Chinese/English catalog UI copy, following `editor-copy.ts`.
- `components/zine/TemplateGallery.tsx`: immediate local grid plus independent community loading/error state, shared previews.
- `features/design-studio/zine/ZineTemplateBrowser.tsx`: creative cards/search and atomic creation with a selected content spread.
- `store/zine.ts`: optional initial content spreads in project creation, cloned into a fresh project with the existing cover. No changes to ordinary creation, save, or history commands.
- `pages/zine/ZineEditorPage.tsx`: honor a requested content-spread ID after loading a newly created template project, so the chosen design opens immediately.

Built-ins use stable prefixed IDs and no remote author/usage metadata. The converter accepts the minimal ID/layout contract; remote full templates continue to conform. Sample images are empty slots, so no dependency on network assets or licensing.

## Compatibility

No new persisted schema or slot kinds. Existing saved projects render unchanged. New fields are projected into properties already supported by the editor and PDF output. Built-in use is handled locally; only successfully inserted community templates report remote usage.

## Validation

Capture pre-existing type errors before edits, run the required frontend build after integration, and use temporary deterministic checks for geometry, fresh IDs, localized text, history/persistence, and preview markup. Inspect generated layout contact sheets without browser automation.

Two pre-existing build blockers were isolated to a missing React `useEffect` import and an `overflow` literal widened to string in the PDF renderer; fix only those import/type annotations if they remain at validation time.
