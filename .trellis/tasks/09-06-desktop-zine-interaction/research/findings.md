# Evidence

- `components/zine/SlotView.tsx`: transient gesture/crop refs, conditional Moveable; live frame translation calls commitLiveGeometry which writes left/top/width/height and image placement each pointer event. Selection only on click requires selecting before dragging. Resize and commit each perform snapping. Crop pan does not compensate for outer rotation. No visible crop finish/cancel toolbar.
- `components/zine/SpreadCanvas.tsx`: Space handling is window-global; viewport pan occurs in bubble phase; React onWheel tries preventDefault; zoom anchor calculation ignores centered canvas origin. No hand/select controls.
- `components/zine/ZineEditor.tsx`: global key handlers ignore only editable targets. Commands can affect the canvas while focus is on another button or a dialog. Arrow repeat creates many history entries.
- `components/zine/SlotContextBar.tsx`: compact bottom content bar with fonts/colors/crop reset, no precision geometry, stacking, duplicate, or explicit crop entry.
- `components/zine/PageStrip.tsx`: pages/assets tabs, resizeable rail. Can host a layers tab without another permanent panel.
- `store/zine.ts`: each updateSlot pushes a structuredClone of all spreads before mutation, including no-ops. Saves while saving return false; a follow-up save must be rescheduled when concurrent edits exist.
- Desktop frontend specs are bootstrap placeholders. Current code, PROJECT_CONTEXT.md, and repository instructions are authoritative; no new permanent desktop tests requested.
