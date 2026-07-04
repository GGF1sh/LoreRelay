# Settlement Mode M5 Design - Low-poly Diorama

Status: design only. No implementation in this document.

Track: dream track, default OFF.

Depends on:

- M1 settlement core and optional `settlement_layout.json`
- M3a settlement view snapshot:
  [`docs/SETTLEMENT_MODE_M3_DESIGN.md`](SETTLEMENT_MODE_M3_DESIGN.md)
- M3b read-only Canvas renderer boundary
- M4c Webview boundary:
  [`docs/SETTLEMENT_MODE_M4C_CHATGPT_GATE.md`](SETTLEMENT_MODE_M4C_CHATGPT_GATE.md)
- Settlement design:
  [`docs/SETTLEMENT_MODE_DESIGN.md`](SETTLEMENT_MODE_DESIGN.md) sections 7.4 and M5

This document does not authorize copying code, assets, schemas, names, maps,
models, shaders, art, or prose from Dwarf Fortress, StoneSense, CDDA, Kenshi,
Caves of Qud, RimWorld, or any other reference. Use only high-level design
patterns.

## 0. Goal

M5 adds an optional low-poly diorama view of a settlement. It is a visualizer,
not a simulation layer.

The core rule:

> `settlement_state.json` and `settlement_layout.json` remain canonical. M5a
> derives a sanitized display snapshot from the existing M3 `settlementView`
> snapshot. M5b renders that snapshot with Three.js in the Webview. Neither part
> writes state.

M5 is explicitly a dream track:

- it must be default OFF;
- it must not block Settlement Mode;
- it must not replace the M3 Canvas view;
- it must not introduce gameplay rules, pathfinding, building edits, or
  canonical 3D state.

## 1. Split M5 Into Two Tracks

| Track | Purpose | Shape | Owner |
|---|---|---|---|
| **M5a Diorama Snapshot** | Convert a sanitized M3 settlement view snapshot into capped low-poly scene primitives | pure TypeScript core, no `vscode`, no DOM, no FS, no Three.js | Grok / Codex |
| **M5b Three.js Renderer** | Render the M5a snapshot as a read-only low-poly diorama in the Webview | Webview JS/CSS, Three.js only here, no state writes | Claude |

M5a must land before M5b. M5b must not read settlement JSON directly and must
not invent its own canonical model.

## 2. Feature Gate

M5 is behind a dedicated flag:

```json
{
  "enableSettlementDiorama": false
}
```

Rules:

- default is OFF;
- `enableSettlementMode` alone does not enable M5;
- when OFF, the host should not compute/send `settlementDiorama`;
- when OFF, the Webview must hide the Diorama mode/button;
- M5 may also be hidden if Three.js assets fail to load.

This flag is independent so the ordinary Settlement Mode stack remains light:

- M1/M2/M3/M4 continue to work without Three.js;
- remote/replay exports do not need M5;
- prompt context and GM output are unchanged.

## 3. M5a - Diorama Snapshot Pure Core

### 3.1 Module

Add a pure module:

```ts
// src/settlementDioramaCore.ts
buildSettlementDioramaSnapshot(inputs: SettlementDioramaInputs): SettlementDioramaSnapshot | undefined
```

Rules:

- pure function;
- no `vscode`;
- no `fs`;
- no DOM;
- no Three.js import;
- no prompt text generation;
- no disk writes;
- no mutation of inputs;
- deterministic for same input;
- input is the already-sanitized M3 `SettlementViewSnapshot`, not raw
  canonical files.

### 3.2 Inputs

```ts
type SettlementDioramaInputs = {
  view?: SettlementViewSnapshot;
  options?: {
    maxBlocks?: number;
    maxMarkers?: number;
    maxLabels?: number;
    theme?: SettlementDioramaTheme;
    includeLabels?: boolean;
  };
};
```

`view` should be the selected-layer M3 snapshot that is already safe for the
Webview. M5a does not need `settlement_state.json` or `settlement_layout.json`.

### 3.3 Snapshot Contract

```ts
type SettlementDioramaSnapshot = {
  version: 1;
  settlementId: string;
  name: string;
  layerId: SettlementLayerId;
  bounds: { width: number; depth: number; height: number };
  camera: SettlementDioramaCamera;
  blocks: SettlementDioramaBlock[];
  markers: SettlementDioramaMarker[];
  labels?: SettlementDioramaLabel[];
  palette: SettlementDioramaPalette;
  warnings?: string[];
};

type SettlementDioramaBlock = {
  id: string;
  x: number;
  y: number;
  z: number;
  w: number;
  d: number;
  h: number;
  code: SettlementTileCode;
  material: SettlementDioramaMaterial;
  tone?: SettlementViewTone;
};

type SettlementDioramaMarker = {
  id: string;
  x: number;
  y: number;
  z: number;
  kind: SettlementViewMarkerKind;
  material: SettlementDioramaMaterial;
  label: string;
};

type SettlementDioramaLabel = {
  id: string;
  x: number;
  y: number;
  z: number;
  text: string;
};
```

Allowed materials are a closed union:

```ts
type SettlementDioramaMaterial =
  | 'stone'
  | 'wood'
  | 'metal'
  | 'cloth'
  | 'water'
  | 'ruins'
  | 'hazard'
  | 'light'
  | 'neutral';
```

Allowed themes are a closed union:

```ts
type SettlementDioramaTheme =
  | 'default'
  | 'postapoc'
  | 'fantasy'
  | 'industrial'
  | 'eastern'
  | 'horror'
  | 'scifi';
```

### 3.4 Mapping From M3 Snapshot

M5a maps M3 tiles/markers into scene primitives.

Tile mapping examples:

| M3 tile code | M5 material | Height |
|---|---|---|
| `floor` / `empty` | `neutral` | low slab |
| `wall` / `gate` | `stone` or `wood` | tall block |
| `market` | `cloth` / `wood` | low stall block |
| `workshop` | `metal` / `wood` | medium block |
| `stockpile` | `wood` | stacked crates |
| `quarters` | `wood` | medium block |
| `clinic` | `cloth` / `neutral` | medium block |
| `barracks` | `metal` / `wood` | medium block |
| `shrine` | `stone` / `light` | medium block |
| `water` | `water` | flat plane |
| `ruins` | `ruins` | broken low block |
| `hazard` | `hazard` | low block + warning marker |
| `unknown` | `neutral` | low slab |

Marker mapping examples:

- residents / visitors / merchants become small marker props;
- incidents become warning props;
- `stock_low` becomes a small supply warning prop;
- `structure_note` becomes a label or small sign prop;
- `player` becomes a distinct marker prop.

M5a must not create new gameplay information. If M3 did not expose it, M5 must
not invent it.

### 3.5 Camera Contract

M5b should get a bounded camera suggestion from M5a:

```ts
type SettlementDioramaCamera = {
  mode: 'fixed_orbit';
  target: { x: number; y: number; z: number };
  distance: number;
  yaw: number;
  pitch: number;
  minDistance: number;
  maxDistance: number;
};
```

Camera rules:

- fixed / limited orbit only;
- no first-person navigation;
- no free fly camera;
- no click-to-move;
- no pathfinding view;
- reset/fit button allowed.

## 4. Caps and Sanitization

Recommended caps:

- blocks: 512
- markers: 80
- labels: 40
- label text: 48 chars
- warning strings: 16
- bounds: derived from M3 width/height, clamped to 8..32

Sanitization:

- allow-list top-level snapshot keys;
- allow-list block/marker/label keys;
- clamp all numeric values;
- reject/normalize non-finite values;
- strip control characters from labels;
- do not include raw stock quantities;
- do not include hidden IDs or prompt-only data;
- do not include raw canonical JSON;
- do not include user-supplied shader/material code;
- do not include external texture URLs.

M5a should be safe to include in Webview/replay/remote payloads, but M5 initial
scope only sends it to the VS Code Webview.

## 5. M5b - Three.js Read-only Renderer

### 5.1 Webview Shape

Add an optional World map mode:

- Mermaid
- Parchment
- Tile
- Settlement
- Diorama (hidden unless M5 flag is ON and `settlementDiorama` exists)

Suggested module:

```text
webview/modules/87-settlement-diorama.js
```

Suggested CSS:

```text
webview/styles/99-settlement-diorama.css
```

Suggested vendor asset:

```text
webview/vendor/three.module.min.js
```

Follow the repo's existing Webview bundling conventions. M5b must degrade
gracefully if Three.js is missing.

### 5.2 Renderer Rules

- Three.js only in M5b Webview module;
- read-only scene;
- no state writes;
- no `settlementOps`;
- no `insertChatText` in first M5b unless a later gate explicitly approves it;
- no Webview disk access;
- no external model or texture downloads;
- no arbitrary shader strings;
- no animation required for correctness;
- no physics engine;
- no pathfinding;
- no tile editor.

### 5.3 Scene Construction

M5b builds simple geometry from `SettlementDioramaSnapshot`:

- blocks -> `BoxGeometry` or merged box meshes;
- water -> flat translucent plane;
- markers -> small cones/cylinders/billboards;
- labels -> optional DOM overlay or simple text fallback panel;
- lights -> fixed ambient + directional light;
- background -> solid or simple gradient color only.

Do not use generated image assets as textures in M5 initial scope. If a later
phase adds textures, it needs a separate gate.

### 5.4 Interaction

Allowed:

- limited orbit / pan within bounds;
- zoom in/out with clamps;
- reset / fit;
- hover or click selection for sanitized label/detail;
- text fallback list for markers;
- reduced-motion support.

Forbidden:

- editing tiles;
- moving props;
- placing buildings;
- expanding layers;
- changing `settlement_layout.json`;
- sending GM actions;
- first-person movement.

## 6. Host Integration

Recommended `worldView` message addition:

```ts
{
  type: 'worldView',
  ...
  enableSettlementDiorama: boolean,
  settlementDiorama?: SettlementDioramaSnapshot | null
}
```

Host rules:

- compute only when `enableSettlementMode === true`;
- compute only when `enableSettlementDiorama === true`;
- compute from `settlementView`, not raw canonical files;
- do not include `settlementDiorama` in GM prompts;
- do not persist `settlementDiorama`;
- do not send to remote/replay in M5 initial scope unless a later gate approves.

## 7. Tests

### M5a Pure Core Tests

Add:

```text
scripts/test_settlement_diorama_core.js
```

Required cases:

- no `settlementView` returns `undefined`;
- valid M3 snapshot creates bounded block/marker snapshot;
- same input produces identical output;
- input snapshot is not mutated;
- all top-level/block/marker/label keys are allow-listed;
- non-finite coordinates are clamped or dropped;
- labels/details are clamped and control characters stripped;
- tile code to material mapping is closed and deterministic;
- caps add warnings and truncate deterministically;
- no raw stock quantities or unexpected keys leak.

### M5b Webview Tests

Add or extend Webview smoke tests:

- Diorama mode button is present only behind feature flag / payload;
- Three.js module symbols are bundled or gracefully gated;
- Webview module does not reference `fs`, `writeJsonAtomic`, workspace paths, or
  `settlementOps`;
- Webview module does not call `insertChatText` in M5 initial scope;
- renderer can initialize against a tiny mocked snapshot without throwing;
- fallback text is shown if WebGL/Three.js is unavailable.

Manual tests after implementation:

- Settlement Mode ON + Diorama flag ON -> Diorama mode appears;
- flag OFF -> no Diorama mode;
- rotate/zoom/reset do not alter game state;
- switching back to Settlement Canvas still works;
- Webview Developer Tools shows no missing vendor asset error.

## 8. Non-Goals

- No canonical 3D state.
- No state writes.
- No settlement layout editing.
- No layer expansion.
- No freeform building editor.
- No imported 3D models.
- No external texture URLs.
- No shader editor.
- No physics.
- No pathfinding.
- No remote/replay wiring in first pass.
- No GM prompt injection.
- No replacement of the M3 Canvas view.

## 9. AI Division

Recommended order:

1. **Codex/ChatGPT gate**: review this design, confirm M5a/M5b split, caps,
   feature flag, and Webview no-write boundary.
2. **Grok/Codex**: implement M5a `settlementDioramaCore.ts` + tests.
3. **Codex/ChatGPT**: M5a implementation gate.
4. **Claude**: implement M5b Three.js read-only renderer after M5a tests pass.
5. **Codex/ChatGPT**: M5b Webview gate.
6. **Gemini**: README/screenshot wording only after implementation is stable.

The key instruction: M5 is a decorative low-poly projection over an already
sanitized settlement view snapshot. It is not a new simulation engine.
