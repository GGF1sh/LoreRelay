# Settlement Mode M4 Design - Limited Z-Level Expansion

Status: design only. No implementation in this document.

Depends on:

- M1 settlement core and settlementOps stubs
- M2 map overlays / event pacing
- M3 settlement view snapshot and renderer contracts
- Settlement design:
  [`docs/SETTLEMENT_MODE_DESIGN.md`](SETTLEMENT_MODE_DESIGN.md)
- M3 design/gate:
  [`docs/SETTLEMENT_MODE_M3_DESIGN.md`](SETTLEMENT_MODE_M3_DESIGN.md),
  [`docs/SETTLEMENT_MODE_M3_CHATGPT_GATE.md`](SETTLEMENT_MODE_M3_CHATGPT_GATE.md)

This document does not authorize copying code, schemas, sprites, names, data, or
prose from Dwarf Fortress, StoneSense, CDDA, Kenshi, or any other reference.
Use only high-level design patterns.

## 0. Goal

M4 adds a bounded way to create or reveal additional settlement layers, such as
cellars, roofs, watch platforms, waterworks, shelters, ruins, or a polluted
lower level.

It does **not** add a full underground simulation.

The rule:

> M4 may modify `settlement_layout.json` through a narrow, tested operation. It
> must not mutate renderer state, generate unlimited layers, or let Webview
> clicks write directly to disk.

## 1. Scope Split

M4 has two separable parts:

| Part | Purpose | Write Surface |
|---|---|---|
| **M4a expand_layer contract/core** | Parse, validate, and apply a bounded layer expansion to a layout object in memory | pure function only |
| **M4b apply gate / persistence wiring** | Decide whether `turn_result.settlementOps` can persist the operation to `settlement_layout.json` | gated write path |

M4a can be implemented safely before M4b. M4b must not happen without a
separate implementation gate.

## 2. Layer Contract

Allowed layer IDs are inherited from M1:

- `z1`
- `z0`
- `z-1`
- `z-2`

No other layer ID is valid.

Layer meanings:

| Layer | Meaning |
|---|---|
| `z1` | roof, watchtower, upper deck, crane, signal platform |
| `z0` | plaza, market, workshop, stockpile, warehouse |
| `z-1` | cellar, waterway, shelter, bunker, undercroft |
| `z-2` | ruins, polluted zone, sealed vault, scenario-only lower layer |

M4 may add a missing layer from this finite set. It may not create `z-3`,
`z2`, arbitrary names, or unbounded depth.

## 3. `expand_layer` Operation

Add a future settlement op:

```ts
type ExpandLayerOp = {
  type: 'expand_layer';
  layerId: SettlementLayerId;
  reason?: string;
  profile?: SettlementLayerExpansionProfile;
  seed?: number;
};

type SettlementLayerExpansionProfile =
  | 'cellar'
  | 'waterworks'
  | 'shelter'
  | 'ruins'
  | 'roof'
  | 'watchtower'
  | 'generic';
```

Rules:

- `layerId` must be one of `z1`, `z0`, `z-1`, `z-2`.
- `reason` is short sanitized text.
- `profile` selects a bounded layout pattern.
- `seed` is optional; implementation may derive a deterministic seed from
  `settlementId`, `layerId`, `profile`, and current world turn instead.
- operation count remains capped by existing settlementOps caps.

## 4. Pure Expansion Core

M4a should introduce a pure function:

```ts
applyExpandLayerToLayout(
  layout: SettlementLayoutV1 | undefined,
  state: SettlementStateV1,
  op: ExpandLayerOp,
  context: {
    worldTurn?: number;
    seed?: number;
  }
): SettlementLayoutExpansionResult
```

Result:

```ts
type SettlementLayoutExpansionResult = {
  layout: SettlementLayoutV1;
  applied: boolean;
  warnings: string[];
};
```

Rules:

- no `fs`;
- no `vscode`;
- no DOM;
- no mutation of input layout/state/op;
- deterministic for same inputs;
- cap zones, markers, and layer count;
- if the target layer already exists, return `applied: false` with a warning;
- if layout is absent, create a minimal layout shell from state;
- never create a full tile array.

## 5. Expansion Profiles

Profiles are small zone/marker templates, not copied maps.

### `cellar`

Typical layer: `z-1`

May create:

- storage zone
- shelter marker
- stair/access marker

### `waterworks`

Typical layer: `z-1` or `z-2`

May create:

- water zone
- pump/sluice marker
- hazard marker if settlement safety is low

### `shelter`

Typical layer: `z-1`

May create:

- quarters/shelter zone
- clinic marker
- stockpile marker

### `ruins`

Typical layer: `z-2`

May create:

- ruins zone
- hazard marker
- discovery marker placeholder

### `roof`

Typical layer: `z1`

May create:

- roof/walkway zone
- signal marker
- lookout marker

### `watchtower`

Typical layer: `z1`

May create:

- watch platform zone
- guard marker

### `generic`

Fallback profile. It should create only a minimal access marker and a generic
zone.

## 6. Persistence Boundary

M4a pure core does not write disk.

M4b persistence, if implemented later, must:

- run only when `enableSettlementMode` is true;
- parse `turn_result.settlementOps`;
- accept only `expand_layer` after validation;
- write only `settlement_layout.json`;
- use existing workspace queue / atomic write / circuit breaker patterns;
- not write `game_state.json` or `world_state.json` as part of the same op;
- preserve unrelated layout zones/markers;
- reject operations that exceed caps.

If write failure occurs, gameplay state must not be partially mutated elsewhere.

## 7. Webview / UX Boundary

M4 may eventually expose a request UI, but not direct writes.

Allowed UX:

- "Request cellar expansion" inserts a chat/action prompt;
- preview shows a ghost layer derived from the pure function;
- confirm flow can ask the GM to emit `settlementOps.expand_layer`.

Forbidden UX:

- click tile to dig/write immediately;
- drag-to-build;
- freeform editor;
- direct Webview write to `settlement_layout.json`;
- arbitrary user-defined layer names.

M3 renderer may display the new layer after it exists in the layout. M3 renderer
must not create it.

## 8. Prompt Boundary

The GM may suggest expansion, but persistent expansion requires
`turn_result.settlementOps`.

Prompt guidance:

```text
If a new settlement layer should become persistent, emit
settlementOps.expand_layer with an allowed layerId and profile. Do not invent
unbounded underground levels. The renderer only displays layers already present
in settlement_layout.json.
```

Do not include full layout JSON or tile grids in the GM prompt.

## 9. Tests

### M4a Pure Core Tests

Add:

```text
scripts/test_settlement_layer_expansion_core.js
```

Required cases:

- rejects invalid layer IDs;
- rejects or no-ops when layer already exists;
- creates deterministic layout shell when layout is absent;
- adds only one allowed layer per op;
- caps layers, zones, and markers;
- preserves existing zones/markers;
- profile-specific zones are bounded;
- same input produces identical output;
- input state/layout/op are not mutated;
- no full tile array is introduced.

### M4b Persistence Gate Tests

Only when M4b is implemented:

- settlement mode OFF means no apply;
- malformed `settlementOps` are ignored;
- valid `expand_layer` writes only `settlement_layout.json`;
- write path uses queue/atomic/circuit breaker pattern;
- failure leaves `game_state.json`, `world_state.json`, and
  `settlement_state.json` untouched.

## 10. Non-Goals

- No full geology.
- No infinite underground.
- No pathfinding.
- No mining simulation.
- No freeform construction editor.
- No Three.js / 3D.
- No tile grid persistence.
- No direct Webview disk writes.
- No combined game/world/settlement dual-write.

## 11. AI Division

Recommended order:

1. **Codex/ChatGPT gate**: confirm operation contract, write boundary, and M4a
   vs M4b split.
2. **Grok/Codex**: implement M4a pure core + tests.
3. **Codex/ChatGPT**: apply-gate review before any persistence wiring.
4. **Grok/Codex**: implement M4b only if explicitly approved.
5. **Claude**: UX preview/request flow only after M4a/M4b boundary is stable.

The key instruction: M4 creates bounded layers through explicit operations. It
does not turn LoreRelay into a digging simulator.
