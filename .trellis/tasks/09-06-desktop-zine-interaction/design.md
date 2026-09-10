# Design

## Ownership and boundaries
- Main agent: `SlotView`, `SpreadCanvas`, `ZineEditor`, canvas input/gesture helpers, toolbar integration, browser verification.
- Store implementer: `store/zine.ts`, optional backward-compatible `SlotBase.locked`, and store-adjacent helpers only. Own command/history/persistence semantics.
- UI implementer: `SlotContextBar`, new `SlotInspector`, `SlotLayers`, `PageStrip`, and a new scoped `lib/zine/editor-copy.ts` bilingual copy module. Own explicit layout controls and layer/page UI.

The current implementation already uses transient refs during drag, but `SlotView` rewrites left/top, dimensions and image transforms on each drag sample. Moveable and `GestureSession` both snap, risking extra snapping on release. `SpreadCanvas` uses a bubble-phase Space pan listener and a wheel handler on a React passive listener. These are the smallest relevant sources of the behavior gaps.

## Shared contracts
- `SlotBase.locked?: boolean` defaults false; rendering/export remains unchanged.
- Store commands: `duplicateSlot(spreadId, slotId)`, `copySlot(spreadId, slotId)`, `pasteSlot(spreadId)`, `reorderSlot(spreadId, slotId, direction)` with direction `front | back | forward | backward`, `setSlotLocked(spreadId, slotId, locked)`, and `duplicateSpread(spreadId)`.
- Store transient edit request: `editingSlotId: string | null`, `editSlot(slotId: string | null)`. Selecting another slot/spread or undo/redo clears edit request. SlotView owns transient text/crop sessions, using editSlot for explicit entry/exit.
- `updateSlot` accepts an optional fourth options argument `{ recordHistory?: boolean }` (default true) for repeat-key batching. Locked slots reject updates/remove, except explicit setSlotLocked. Copying a locked slot produces an unlocked copy.
- `SlotInspector` is rendered in an ordinary panel by ZineEditor. UI worker may export it standalone with no required props; main agent handles opening/collapsing it.
- `SlotContextBar` keeps content controls and uses editSlot for explicit content edit/crop entry. Only visible controls and labels are changed; no new AI feature.
- `editor-copy.ts` exports a typed `zineEditorCopy(language)` function; independent main-agent labels can remain in a separate local copy object to avoid concurrent edits.

## Gesture implementation
Use transform translation for live drag; calculate the persisted geometry from the initial millimetre geometry plus screen delta / scale, commit once. Avoid re-reading image geometry during frame translation. Make selection/hand/preview modes explicit; capture viewport pan before slot handlers; cancel/release on blur and pointercancel. Native non-passive wheel handlers own zoom/crop wheel cancellation. Store only final crop transforms. Preserve selection while opening controls and avoid finalizing a click-only drag via snapping.

## Compatibility
No geometry version bump and no exported render changes. Optional locked metadata is carried by existing spread clones and JSON persistence. Clipboard is scoped to the current project and uses fresh IDs on paste. The native bridge remains unchanged.
