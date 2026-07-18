# LOGISTICS-GRAPH-NAVIGATION-POLISH-001

Deferred polish items for the logistics graph large-view / navigation chrome.

These are intentionally **not** part of `LOGISTICS-GRAPH-CANVAS-SLICE6-HUMAN-BLOCKERS-F` (1.84.14).

## Deferred

1. **Arbitrary window dragging** of the logistics large-view dialog (move by title-bar drag across the Webview).
2. **Freeform dialog resize** handles / corner grip (beyond the binary maximize/restore control shipped in 1.84.14).
3. Product-wide light-theme contrast pass (out of scope for logistics Human Gate recoveries).
4. Full responsive-shell integration of the logistics large view (owned by the frozen `UX-RESPONSIVE-NARROW-001` candidate; must not be merged from this lane).

## Shipped in 1.84.14 instead

- Maximize / restore control next to the large-view close button.
- Optional title-bar double-click to toggle maximize.
- Near-full Webview usage while maximized, preserving camera, selection, filters, and layout.
