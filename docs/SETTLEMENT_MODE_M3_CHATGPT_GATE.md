# Settlement Mode M3 ChatGPT Gate

Date: 2026-07-04 JST
Reviewer: Codex / ChatGPT
Status: Approved for design handoff; implementation must be split

This gate reviews `docs/SETTLEMENT_MODE_M3_DESIGN.md`, focusing on the
snapshot/renderer boundary for a StoneSense-style isometric settlement view.

## Findings

| Severity | Finding | Decision |
|---|---|---|
| Critical | None if M3 remains read-only and snapshot-driven. | Proceed with split implementation. |
| High | A renderer can accidentally become a second canonical model if it computes or stores gameplay state. | All canonical state remains in `settlement_state.json` / optional `settlement_layout.json`; renderer receives `SettlementViewSnapshot` only. |
| High | Clickable isometric tiles can tempt state writes and hidden settlementOps application. | M3 clicks are read-only. No settlementOps, no disk writes, no tile editing. |
| High | Snapshot can leak hidden rooms, private NPC details, raw stocks, or incident secrets. | M3a must sanitize and allow-list tile/marker fields, following M2a discipline. |
| High | M3 can expand into full Z-level simulation. | M3 only displays existing layers. Layer creation and `expand_layer` belong to M4. |
| Medium | Fallback layout without `settlement_layout.json` can become unstable or misleading. | Fallback layout must be deterministic, capped, and marked with a warning such as `layout_fallback`. |
| Medium | Webview rendering may regress existing World map modes. | Add Settlement as an additional mode; Mermaid/Parchment/Tile behavior must remain intact. |
| Medium | Glyph/emoji rendering can reintroduce mojibake and layout bugs. | Renderer must have ASCII-safe fallback and not depend on emoji for correctness. |
| Low | Pan/zoom preferences can clutter canonical state. | Store view preferences in localStorage only. |

## Final M3 Contract

M3 has two separable deliverables.

### M3a - Pure Snapshot Core

Implement:

```ts
buildSettlementViewSnapshot(inputs: SettlementViewInputs): SettlementViewSnapshot | undefined
```

Rules:

- pure TypeScript;
- no `vscode`;
- no DOM;
- no `fs`;
- no prompt generation;
- no disk writes;
- no mutation of inputs;
- deterministic for the same inputs.

Input may include:

- `SettlementStateV1`
- optional `SettlementLayoutV1`
- selected layer ID
- caps/options

Output is a sanitized `SettlementViewSnapshot`.

### M3b - Webview Renderer

Implement only after M3a tests pass.

Rules:

- Canvas renderer first;
- no Three.js;
- no canonical state in renderer;
- no state writes from clicks;
- no tile editor;
- no pathfinding or resident simulation;
- view preferences in localStorage only.

## Snapshot Field Allow-Lists

Tiles may expose only:

- `x`
- `y`
- `z`
- `code`
- `label`
- `tone`

Markers may expose only:

- `id`
- `x`
- `y`
- `z`
- `kind`
- `label`
- `tone`
- `detail`

Snapshot top-level may expose only:

- `version`
- `settlementId`
- `name`
- `layerId`
- `layers`
- `width`
- `height`
- `tiles`
- `markers`
- `legend`
- `warnings`

Tests must prove extra keys do not leak.

## Sanitization Rules

Forbidden in M3 snapshot:

- hidden room IDs;
- raw private NPC fields;
- raw stockpile quantities unless transformed to an allowed qualitative marker;
- full incident text that may contain secret detail;
- prompt-only data;
- arbitrary nested raw objects;
- complete settlement or layout JSON.

Allowed:

- visible zone/tile labels;
- qualitative structure status;
- public residents/visitors/merchants as capped markers;
- incident markers with short sanitized labels;
- low-stock qualitative marker such as `stock_low`.

## Implementation Checklist

### Grok / Codex M3a

1. Add `src/settlementViewCore.ts`.
2. Add snapshot types, tile codes, marker kinds, caps, text sanitizer, and
   allow-list helpers.
3. Implement deterministic fallback layout when layout is absent.
4. Implement selected-layer filtering.
5. Add `scripts/test_settlement_view_core.js`.
6. Hook tests into the repository test aggregator.
7. Do not add Webview rendering in the same task unless explicitly requested.

### Claude M3b

1. Add Settlement map mode to World tab.
2. Add Canvas renderer for `settlementView`.
3. Add layer selector, pan/zoom, reset/fit controls, and text fallback detail.
4. Do not write state from clicks.
5. Keep existing Mermaid/Parchment/Tile modes working.
6. Add Webview smoke/bundle tests.

## Acceptance Commands

For M3a:

```powershell
npm run compile
node scripts/test_settlement_view_core.js
npm test
node scripts/validate_utf8_docs.js
```

For M3b, additionally run the existing webview bundle/smoke tests used by the
repository.

## Non-Goals

- No 3D.
- No Three.js.
- No low-poly diorama.
- No M4 layer expansion.
- No pathfinding.
- No settlementOps application.
- No tile editing.
- No GM prompt tile-grid injection.

## Handoff

Use:

1. `docs/SETTLEMENT_MODE_M3_DESIGN.md`
2. this gate file
3. existing M1/M2 pure-core patterns

The key instruction is: build a read-only snapshot first, then render it. Do not
let the renderer become a game engine.
