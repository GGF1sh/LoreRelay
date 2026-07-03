# Settlement Mode M3 Design - StoneSense-style Isometric View

Status: design only. No implementation in this document.

Depends on:

- M1 settlement core (`src/settlementCore.ts`, `src/settlementState.ts`)
- M2 map overlays and event pacing (`src/mapOverlayCore.ts`,
  `src/settlementEventCore.ts`)
- Settlement design: [`docs/SETTLEMENT_MODE_DESIGN.md`](SETTLEMENT_MODE_DESIGN.md)
- M2 design/gate:
  [`docs/SETTLEMENT_MODE_M2_DESIGN.md`](SETTLEMENT_MODE_M2_DESIGN.md),
  [`docs/SETTLEMENT_MODE_M2_CHATGPT_GATE.md`](SETTLEMENT_MODE_M2_CHATGPT_GATE.md)
- Reference patterns:
  [`docs/SETTLEMENT_REFERENCE_PATTERNS.md`](SETTLEMENT_REFERENCE_PATTERNS.md)

This document does not authorize copying code, schemas, sprites, names, data, or
prose from StoneSense, Dwarf Fortress, CDDA, Kenshi, Caves of Qud, RimWorld, or
any other reference. Use high-level design patterns only.

## 0. Goal

M3 adds a readable isometric settlement view inspired by the *idea* of
StoneSense: a view that makes layered settlement state legible.

It is not a new simulation engine.

The core rule:

> `settlement_state.json` and optional `settlement_layout.json` remain
> canonical. M3 produces a read-only display snapshot and renders it.

## 1. Split M3 Into Two Tracks

| Track | Purpose | Shape | Owner |
|---|---|---|---|
| **M3a Settlement View Snapshot** | Build a capped, sanitized, layer-filtered display model from M1 state/layout | pure TypeScript core, no `vscode`, no DOM, no FS | Grok / Codex |
| **M3b Canvas Isometric Renderer** | Render the snapshot in Webview with pan/zoom/layer controls | Webview JS/CSS, no state writes | Claude |

M3a can ship before M3b. M3b must not invent its own canonical model.

## 2. M3a - Settlement View Snapshot

### 2.1 Module

Add a pure module:

```ts
// src/settlementViewCore.ts
buildSettlementViewSnapshot(inputs: SettlementViewInputs): SettlementViewSnapshot
```

Rules:

- pure function;
- no `vscode`;
- no `fs`;
- no DOM;
- no prompt text generation;
- no disk writes;
- no mutation of input state;
- deterministic for the same inputs.

### 2.2 Inputs

```ts
type SettlementViewInputs = {
  state?: SettlementStateV1;
  layout?: SettlementLayoutV1;
  selectedLayerId?: SettlementLayerId;
  options?: {
    maxTiles?: number;
    maxMarkers?: number;
    revealHidden?: boolean; // defaults false; test/debug only
  };
};
```

M3 must not require `settlement_layout.json` to exist. If layout is absent, the
snapshot builder derives a small default layout from settlement structures,
merchants, visitors, and incidents.

### 2.3 Snapshot Contract

```ts
type SettlementViewSnapshot = {
  version: 1;
  settlementId: string;
  name: string;
  layerId: SettlementLayerId;
  layers: SettlementLayerSummary[];
  width: number;
  height: number;
  tiles: SettlementViewTile[];
  markers: SettlementViewMarker[];
  legend: SettlementViewLegendEntry[];
  warnings?: string[];
};

type SettlementViewTile = {
  x: number;
  y: number;
  z: number; // visual depth, derived from layerId
  code: SettlementTileCode;
  label: string;
  tone?: SettlementViewTone;
};

type SettlementViewMarker = {
  id: string;
  x: number;
  y: number;
  z: number;
  kind: SettlementViewMarkerKind;
  label: string;
  tone?: SettlementViewTone;
  detail?: string;
};
```

Allowed tile codes:

```ts
type SettlementTileCode =
  | 'floor'
  | 'wall'
  | 'gate'
  | 'market'
  | 'workshop'
  | 'stockpile'
  | 'quarters'
  | 'clinic'
  | 'barracks'
  | 'shrine'
  | 'water'
  | 'ruins'
  | 'hazard'
  | 'empty'
  | 'unknown';
```

Allowed marker kinds:

```ts
type SettlementViewMarkerKind =
  | 'resident'
  | 'visitor'
  | 'merchant'
  | 'project'
  | 'incident'
  | 'stock_low'
  | 'structure_note'
  | 'player';
```

### 2.4 Layer Model

Allowed layers are inherited from M1:

- `z1`: roof / watchtower / upper deck
- `z0`: plaza / market / workshop / warehouse
- `z-1`: cellar / waterway / shelter
- `z-2`: ruins / polluted zone / scenario-only lower layer

M3 displays existing layers only. It does not generate new layers. M4 owns
bounded layer expansion.

### 2.5 Layout Derivation

If `settlement_layout.json` exists:

- zones become tile clusters;
- layout markers become view markers;
- only the selected layer is expanded into tiles;
- coordinates are clamped to view bounds.

If no layout exists:

- derive a 16x16 or 24x24 fallback layout;
- place a plaza/center tile, then structures by stable hash of structure ID;
- place merchants/visitors/residents as capped markers;
- place incidents near relevant structures when possible, otherwise near center;
- emit `warnings: ['layout_fallback']`.

This fallback exists so M3 can work with M1-only worlds.

### 2.6 Caps

Recommended caps:

- width/height: 8..32
- tiles: 1024
- markers: 120
- legend entries: 32
- label: 64 chars
- detail: 160 chars
- warnings: 16

If data exceeds caps, truncate deterministically and add a warning such as
`marker_cap_reached`.

### 2.7 Sanitization

M3 snapshot is a display payload, so it must be sanitized like M2 overlays.

Forbidden in snapshot:

- raw stockpile quantities unless already public and intentionally converted to
  a qualitative marker such as `stock_low`;
- hidden room IDs;
- full incident text when it contains secret details;
- arbitrary extra object keys;
- raw NPC private fields;
- prompt-only data.

Tests must include allow-list checks for tile and marker keys.

## 3. M3b - Canvas Isometric Renderer

### 3.1 Webview Shape

Add a new World map mode:

- existing: Mermaid / Parchment / Tile
- new: Settlement

The Settlement mode renders only when `settlementView` exists. If absent, show a
small empty state with no error.

Suggested Webview module:

```text
webview/modules/87-settlement-isometric.js
```

Suggested CSS:

```text
webview/styles/98-settlement-isometric.css
```

These names are suggestions; follow the current build-webview conventions.

### 3.2 Renderer Rules

- Canvas renderer first.
- No Three.js in M3.
- No state writes from clicks.
- No tile editing.
- No drag-to-build.
- No pathfinding visualization.
- No animation dependency for correctness.
- All visual state preferences live in `localStorage` only.

### 3.3 Controls

Minimum controls:

- layer selector: `Z+1`, `Z0`, `Z-1`, `Z-2`
- reset view
- zoom in / zoom out
- optional fit-to-view
- hover tooltip for tile/marker label

Pan/zoom:

- drag to pan;
- mouse wheel or buttons to zoom;
- clamp zoom to a safe range, e.g. `0.5..3`;
- reset when changing settlement only, not every repaint.

### 3.4 Isometric Projection

Recommended simple projection:

```ts
screenX = (x - y) * tileW / 2
screenY = (x + y) * tileH / 2 - z * layerHeight
```

Use stable dimensions:

- `tileW`: 32 or 40
- `tileH`: 16 or 20
- `layerHeight`: 10 or 12

M3 must remain readable at small panel sizes. Do not use viewport-width-scaled
fonts.

### 3.5 Visual Encoding

The renderer should support two display paths:

1. simple colored block tiles;
2. optional glyph/sprite-like overlay.

Do not depend on emoji or non-ASCII glyphs for correctness. Existing files have
had mojibake issues before; M3 should have an ASCII-safe fallback.

Suggested tile tones:

- `market`: amber
- `workshop`: iron/blue-gray
- `stockpile`: muted gold
- `quarters`: green
- `clinic`: teal
- `barracks`: red/brown
- `shrine`: violet
- `water`: blue
- `ruins`: gray
- `hazard`: red
- `unknown`: neutral

### 3.6 Interaction

Hover:

- show sanitized label/detail.

Click:

- may select a tile/marker for read-only detail;
- must not write state;
- must not emit settlementOps;
- may insert chat text only in a later explicitly-gated UX pass.

Keyboard/accessibility:

- buttons must be focusable;
- tooltips should not be the only way to access selected detail;
- renderer should have a text fallback panel listing visible markers.

## 4. Integration With `worldView`

Recommended host message addition:

```ts
{
  type: 'worldView',
  ...
  settlementView?: SettlementViewSnapshot
}
```

`worldView.ts` should:

- load settlement state only when `enableSettlementMode` is true;
- load optional layout if present;
- call `buildSettlementViewSnapshot`;
- send the snapshot to Webview;
- not include settlementView in GM prompt;
- not persist settlementView.

If feature flag is off, omit or send `undefined`.

## 5. Tests

### M3a Pure Core Tests

Add:

```text
scripts/test_settlement_view_core.js
```

Required cases:

- no state returns an empty/disabled snapshot or `undefined` according to final
  contract;
- no layout creates deterministic fallback with warning;
- selected layer filters tiles/markers;
- invalid layer falls back safely;
- caps are enforced;
- tile/marker keys are allow-listed;
- labels/details are clamped and control characters removed;
- same input produces identical output;
- input state/layout objects are not mutated.

### M3b Webview Tests

Add or extend existing webview bundle tests:

- bundle exposes settlement renderer functions or initializes without reference
  errors;
- mode button appears only when expected;
- switching modes does not resize unrelated panels to zero;
- canvas exists and can draw a smoke snapshot;
- hover/select detail does not call state-writing message types.

## 6. Non-Goals

- No 3D / Three.js.
- No low-poly diorama.
- No canonical state in renderer.
- No freeform building editor.
- No pathfinding.
- No real-time resident simulation.
- No new Z-layer generation.
- No settlementOps application.
- No GM prompt injection of tile grids.

## 7. AI Division

Recommended order:

1. **Codex/ChatGPT gate**: confirm snapshot contract, sanitization, and Webview
   no-write boundary.
2. **Grok or Codex**: implement M3a `settlementViewCore.ts` + tests.
3. **Claude**: implement M3b Webview renderer after M3a tests pass.
4. **Codex/ChatGPT**: implementation review/gate.
5. **Gemini**: user-facing docs and screenshot plan.

The key instruction: M3 is a readable projection over settlement state. It is
not the beginning of a new simulation engine.
