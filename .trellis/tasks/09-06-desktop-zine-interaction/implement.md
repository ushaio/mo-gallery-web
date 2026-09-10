# Implementation

1. Implement atomic store commands and optional lock metadata; review no-op history and save-in-flight behavior.
2. Implement layer selection and precision inspector; retain content controls and add explicit crop entry and duplicate actions.
3. Fix element gesture preview, first-drag selection, pan/zoom conflicts, crop completion/cancellation, and shortcut scope.
4. Integrate inspector visibility and clear canvas tools; verify responsive layout.
5. Run frontend build, focused lint/static checks, and temporary deterministic checks for store/gesture behavior. Do not add a permanent test suite.
6. Review event lifecycles and geometry with focused temporary deterministic checks. User has stopped browser verification; do not call browser/UI automation again and record the resulting validation limit.
7. Review all touched files against the requirements, update the relevant spec with the confirmed gesture contract, and record task status without staging unrelated user changes.

## Validation
`npm run build` from desktop/frontend. Focused ESLint through the root workspace where configuration permits. Temporary checks exercise pure geometry/commands, existing JSON compatibility, and asynchronous saving. Code review covers dragging, cancel, locking, typing, layers, pan, zoom, and layout. No browser checks after user's explicit instruction.
