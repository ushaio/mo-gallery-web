# Desktop zine manual editing

## Goal
Make manual zine composition predictable, fluid, and discoverable: users can place and edit content directly, reach precise layout controls, and recover each completed action with undo.

## Background and authorization
The user requested interaction/UI improvements, additional non-AI editing interactions, and fixes for mouse-drag stutter. They permit changing existing UI rules and have instructed us to continue. They subsequently required code-only development with no further browser calls. Existing uncommitted work must be preserved. Implementation proceeds within this request; no separate process-only approval is needed.

## Requirements
- R1: Element movement previews must avoid per-pointer document writes and repeated image layout work. Dragging an unselected unlocked element should select and move it in one gesture. Escape, pointer cancellation, and window blur must not leave a stuck interaction.
- R2: Element drag, image crop, inline text, and viewport pan must have explicit, mutually compatible modes. Space-drag and middle-button pan must work over elements; zoom must preserve the point under the cursor, with reset/fit available.
- R3: Provide discoverable copy/duplicate, stacking order, lock/unlock, precise geometry, and page alignment controls. Layer selection must expose occluded elements. Keep existing typography controls accessible.
- R4: Expose crop/text editing explicitly and give crop mode visible finish/cancel controls. Constrain movement with Shift. Locked elements stay selectable but reject geometry/content/deletion changes until unlocked.
- R5: One completed edit creates one useful undo step; no-op selection/clicks create none. New slot/spread copies use unique IDs. Editing shortcuts must not intercept typing, dialogs, or native controls. Save new edits arriving while an earlier save is in flight.
- R6: Improve the editor hierarchy without reducing usable canvas unnecessarily; adapt panels to narrow windows. Retain Chinese/English labels, existing design tokens, and keyboard focus indication.

## Acceptance criteria
- AC1 (R1, R5): Drag and resize at different zoom levels keep preview and final geometry consistent; pointer movement does not mutate the project; a completed drag undoes once; cancellation restores the initial state.
- AC2 (R2, R4): Pan over an image/text element does not edit it; crop pan respects frame rotation; Ctrl/Cmd-wheel does not scroll the page; Enter finishes crop and Escape cancels.
- AC3 (R3, R5): Duplicate, layer reorder, lock/unlock, geometry fields, alignment, and spread duplication are reachable and undoable; no-op operations preserve history.
- AC4 (R3, R4, R6): Selection exposes the right content controls; locked and occluded elements are reachable from layers; narrow-window controls remain accessible.
- AC5 (R5): Asynchronous save completion cannot strand a later edit unsaved.
- AC6: Desktop frontend build and relevant static checks pass. Use code review and focused temporary deterministic checks; no further browser/UI automation per user instruction. No new permanent test framework or unnecessary test files.

## Out of scope
AI behavior, new export formats, schema/database migration, replacing Moveable wholesale, group editing, and redesigning other desktop pages.

## Known risks
Moveable works in screen pixels while the persisted model uses spread-relative millimetres. Transformed previews and crop offsets must preserve that boundary. Existing project metadata and user edits must survive. Native Wails responsiveness needs a desktop check in addition to browser verification if native automation is unavailable.
