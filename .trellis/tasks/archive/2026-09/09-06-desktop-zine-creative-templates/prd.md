# Built-in creative Zine templates

## Goal

Add six offline creative Zine layouts to Creative Plaza and the Zine template browser.

## Background

The user requests several creative built-in templates for the desktop Zine Creative Plaza. The current editor provides basic layouts, while its Creative Plaza tab is remote-only. The design studio's Zine starter browser currently chooses paper dimensions rather than designed layouts.

## Requirements

- R1: Bundle six distinct editable spreads: Field Notes, Urban Rhythm, Contact Archive, Quiet Poetry, Postcards, and Horizon. Include Chinese/English titles, descriptions, and sample text. Photos remain replaceable empty image slots.
- R2: Built-in Creative Plaza templates must remain immediately available while community templates load, fail, or return no results. Community templates retain their existing application and usage reporting.
- R3: Use the same layout data for previews and application, including typography, rotation, stacking, and page-relative geometry. Repeated applications receive new spread/slot IDs.
- R4: Expose the same creative catalog in the Zine starter browser. Choosing a design creates a persisted project containing its designed content spread and the existing cover, while retaining paper-size/custom creation.
- R5: Preserve existing projects, undo/redo, autosave, print settings, and all unrelated working-tree changes.

## Acceptance Criteria

- AC1 (R1): All six designs have distinct image/text arrangements, meaningful editable text, localized discovery labels, and work at standard portrait, landscape, and square page sizes.
- AC2 (R2): A failed or slow remote request cannot replace/hide the built-in grid; applying a built-in template sends no remote usage request.
- AC3 (R3, R5): Applying a template inserts one undoable spread with unique IDs and preserves its normalized geometry and text styles. Existing remote payloads without optional styling retain their defaults.
- AC4 (R4): Starter search includes creative titles/descriptions; selecting one creates the intended content spread, saves it, and opens it. Existing blank-size starters still work.
- AC5: Desktop frontend build and focused static/deterministic checks pass. Respect the related Zine tasks' recorded preference against further browser automation; do not add permanent desktop test files.

## Out of Scope

Remote template publishing, AI generation, new slot kinds, schema changes, real stock photo downloads, unrelated editor interaction changes, and release/commit work.
