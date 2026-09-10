# Implementation

- [x] Add six localized layout definitions and a preview renderer using existing slots.
- [x] Preserve optional template text styles during conversion.
- [x] Integrate local/remote sections in the editor Creative Plaza.
- [x] Integrate creative starter cards and atomic initial-spread project creation.
- [x] Run frontend build and focused temporary checks; inspect layout previews.
- [x] Review diff and record completion without committing unrelated work.

Baseline: `pnpm exec tsc --noEmit` currently reports an existing missing `useEffect` import in `PhotoLibraryDialog.tsx` and widened `overflow: string` in `ZinePdfExporter.tsx`. Re-evaluate after integration; apply only minimal type/import fixes if still blocking.

Preserve the heavily modified working tree. Product code ownership is split: the template implementer owns only the new catalog and new preview component; the primary agent owns integration and verification. No browser automation or permanent test files.

## Verification results

- Final `npm run build` in `desktop/frontend`: passed (TypeScript and Vite). Existing vendor annotation, mixed import, and large chunk warnings remain informational.
- Targeted ESLint across all ten touched product files: passed after moving community-loading initialization to the tab/retry user actions.
- Geometry/content check: 120 combinations (six layouts, two languages, five standard paper sizes, both orientations); conservative text fit and rotated print margins passed, minimum spread-edge margin 6.66 mm.
- Actual store/project helpers with an isolated in-memory Wails JSON transport: 12 creative projects and default creation passed save/load round trips, unique IDs, preserved sample text/styles/geometry, single-step undo/redo and seed immutability. No network requests occurred. Old remote layout fields retain their default text/image behavior.
- Twelve actual SVG previews rendered with React server rendering. Chinese and English contact sheets visually inspected; no clipping or unintended overlap found. Artifacts: `tmp/zine-creative-templates/plaza-templates-{zh,en}.{png,svg}`.
- `git diff --check` passed for touched tracked files. No browser/native UI automation, permanent test files, new dependencies, product commits, or remote publishing.

Runtime desktop interaction and native SQLite transport were not exercised. The save/load check covers the real frontend persistence contract with a memory transport; font appearance in the native WebView remains platform-dependent.
