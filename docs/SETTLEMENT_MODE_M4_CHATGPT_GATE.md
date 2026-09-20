# Settlement Mode M4 ChatGPT Gate

Date: 2026-07-04 JST
Reviewer: Codex / ChatGPT
Status: Approved for M4a pure core only; M4b persistence requires a second gate

This gate reviews `docs/SETTLEMENT_MODE_M4_DESIGN.md`, focusing on
`expand_layer`, bounded layer generation, and write-surface control.

## Findings

| Severity | Finding | Decision |
|---|---|---|
| Critical | Direct Webview-driven layer writes would bypass the established turn_result/write-queue discipline. | M4 UI may request or preview only. No direct Webview disk writes. |
| High | `expand_layer` can become an unbounded digging/geology simulator. | Only `z1`, `z0`, `z-1`, and `z-2` are valid. M4 adds missing layers only from this finite set. |
| High | Combining layout writes with game/world/settlement writes risks split-brain failures. | M4b may write only `settlement_layout.json`; no combined game/world/settlement dual-write. |
| High | M3 renderer can accidentally become the layer generator. | M3 displays existing layers only. M4 pure/apply code owns layer creation. |
| High | Persistence wiring before pure-core proof would widen settlementOps too quickly. | Implement M4a pure core first. M4b persistence requires a later implementation gate. |
| Medium | Auto-generated layouts can overwrite handcrafted zones/markers. | Expansion must preserve existing zones/markers and add bounded new entries only. |
| Medium | Profiles can become content clones. | Profiles are generic zone/marker templates only; no copied maps, names, sprites, or setting text. |
| Medium | Optional seed handling can break determinism. | Derive a deterministic seed when explicit seed is absent. Same input must produce same layout. |
| Low | Layer profile names can drift. | Use a small closed union: `cellar`, `waterworks`, `shelter`, `ruins`, `roof`, `watchtower`, `generic`. |

## Final M4 Contract

M4 is split:

- **M4a**: pure in-memory layer expansion.
- **M4b**: optional persistence wiring, blocked until a second gate.

This gate approves M4a only.

## Approved M4a Operation

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
- invalid layer IDs are rejected.
- existing layer is a no-op, not a duplicate.
- one op may add at most one missing layer.
- no full tile array.
- zones/markers only.
- reason text is sanitized and bounded.
- operation count stays under existing settlementOps caps.

## Approved Pure Core

Implement:

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

- pure;
- no `vscode`;
- no `fs`;
- no DOM;
- no mutation of input state/layout/op;
- deterministic;
- cap layers, zones, markers;
- preserve existing zones and markers;
- if layout is absent, create a minimal shell from state;
- never write disk.

## M4b Persistence Boundary

Not approved yet.

Before implementing persistence, run a second gate that reviews:

- write path;
- queue/atomic/circuit breaker usage;
- failure behavior;
- whether `parseSettlementOps` should include `expand_layer`;
- whether `turn_result.settlementOps` apply should be enabled at all.

If later approved, M4b may:

- run only when `enableSettlementMode` is true;
- apply validated `expand_layer`;
- write only `settlement_layout.json`;
- preserve unrelated layout content.

M4b must not:

- write `game_state.json`;
- write `world_state.json`;
- write `settlement_state.json` in the same operation;
- let Webview write directly;
- apply arbitrary user-authored layer names.

## Implementation Checklist For Grok/Codex

M4a only:

1. Add pure expansion code, likely in `src/settlementLayerExpansionCore.ts` or
   another clearly named pure module.
2. Add `ExpandLayerOp` parser support only if it remains a stub and does not
   write disk.
3. Add bounded profile templates.
4. Add deterministic seed derivation.
5. Add tests in `scripts/test_settlement_layer_expansion_core.js`.
6. Hook the test into the repository test aggregator.
7. Update `CHANGELOG.md` and `AI_SHARED_LOG.md`.

Do not implement M4b persistence in the same task.

## Required M4a Tests

- invalid layer ID rejected;
- existing layer no-ops;
- absent layout creates deterministic shell;
- one op adds at most one layer;
- profiles add bounded zones/markers;
- caps are enforced;
- existing zones/markers are preserved;
- same inputs produce identical output;
- input state/layout/op are not mutated;
- output contains no tile array.

## Verification

```powershell
npm run compile
node scripts/test_settlement_layer_expansion_core.js
npm test
node scripts/validate_utf8_docs.js
```

## Non-Goals

- No M4b persistence without second gate.
- No direct Webview writes.
- No tile editor.
- No digging simulator.
- No pathfinding.
- No full geology.
- No Three.js / 3D.
- No settlementOps disk apply in M4a.

## Handoff

Use:

1. `docs/SETTLEMENT_MODE_M4_DESIGN.md`
2. this gate file
3. `src/settlementCore.ts`
4. M3 snapshot contract, because M3 displays the layers M4 creates

The key instruction: M4a proves bounded layer expansion in memory. Persistence
is a later gate, not part of the first implementation task.
