# World Intent WI4 Effect Accounting Design

> Status: Design proposal / Codex gate draft.
> Date: 2026-07-04.
> Scope: one small vehicle fuel/refuel accounting pilot.
> Default posture: no persistence, no gameplay rule change, no canonical write path.

## 1. Why WI4 Exists

WI1-WI3 establish a safe request/query/execute vocabulary for World Intent without taking authority away from existing ledgers.

WI4 should prove the next concept: deterministic "why did this value change?" records.

The first pilot should answer one narrow question:

> When a `refuel_vehicle` operation changes vehicle resources, can LoreRelay produce a bounded, deterministic accounting entry explaining the before/after fuel value and cause?

WI4 must not add fuel consumption, movement costs, automatic resource spending, or any new ledger writes.

## 2. Decision

Approved design direction:

- implement a pure accounting pilot for `vehicle.refuel_vehicle`;
- derive accounting from canonical legacy before/after vehicle state;
- keep accounting in memory / diagnostics only;
- optionally attach accounting to WI3b bridge reports;
- do not persist accounting to `vehicle_state.json`, `game_state.json`, `state_journal.ndjson`, replay files, or export files in WI4.

Deferred:

- accounting for movement fuel consumption;
- accounting for damage/repair/move/set-active;
- generic Effect Kernel;
- replay export;
- GM prompt injection;
- Observatory integration;
- State Orchestrator transaction plans.

## 3. Conceptual Contract

WI4 accounting is not an effect engine. It does not decide what happens.

```text
legacy op + pre-state
  -> legacy canonical apply
  -> post-state
  -> pure accounting derivation
  -> diagnostic explanation
```

Authority remains:

```text
turn_result.vehicleOps -> vehicleOpsCore.applyVehicleOps() -> vehicle_state.json
```

Accounting observes the result. It must never mutate the result.

## 4. Proposed Types

Recommended new module:

```text
src/worldIntentEffectAccountingCore.ts
```

Recommended public types:

```ts
export const EFFECT_ACCOUNTING_VERSION = 1 as const;

export type EffectCauseType =
    | 'vehicle_op'
    | 'world_intent_shadow'
    | 'gm_intent'
    | 'simulation'
    | 'debug';

export interface EffectCause {
    type: EffectCauseType;
    id?: string;
    label?: string;
}

export interface EffectAccountingEntry {
    version: typeof EFFECT_ACCOUNTING_VERSION;
    ledger: 'vehicle_state';
    subsystem: 'vehicle';
    entity: { kind: 'vehicle'; id: string };
    field: 'resources.current';
    resourceType?: string;
    before: number;
    delta: number;
    after: number;
    cause: EffectCause;
    intentId?: string;
    opType: 'refuel_vehicle';
    worldTurn?: number;
}
```

WI4 should intentionally support only:

```text
ledger: vehicle_state
subsystem: vehicle
field: resources.current
opType: refuel_vehicle
```

No arbitrary field paths. No dynamic ledger names. No mod-provided accounting handlers.

## 5. Refuel Accounting Rules

Given:

- parsed canonical `RefuelVehicleOp`;
- pre-apply `VehicleState`;
- post-apply `VehicleState`;
- optional `WorldIntent` / `intentId`;
- optional `worldTurn`;

Produce one `EffectAccountingEntry` only when all are true:

1. vehicle exists in both pre and post;
2. `resources` exists in both states;
3. `resources.powerType !== 'none'`;
4. `resources.current` changed;
5. `post.current > pre.current`;
6. `op.resourceType` is absent or matches `resources.powerType`.

No entry for:

- missing vehicle;
- lost vehicle if legacy did not change state;
- no tank / `powerType:'none'`;
- resource type mismatch;
- fuel already max;
- zero effective delta;
- malformed op;
- non-refuel operations.

The accounting delta is:

```ts
delta = post.resources.current - pre.resources.current
```

It is not necessarily equal to `op.amount` because the max cap may truncate the effective gain.

## 6. Integration with WI3b

WI4 should be easiest to wire after WI3b because WI3b already captures the necessary pre-write state.

Allowed integration:

- In `shadow` / `compare_only`, include accounting entries in the diagnostic batch report.
- In `off`, accounting is not required.
- In tests, accounting helpers may be called directly with pre/post states.

Forbidden integration:

- accounting must not change `TurnLedgerApplyResult`;
- accounting must not introduce a new ledger target;
- accounting must not be written to disk;
- accounting must not make World Intent authoritative;
- accounting must not call `applyVehicleOps()` more than the legacy path already requires, except in pure test/helper contexts where inputs are cloned.

## 7. Files Allowed

WI4 may add/change:

- add `src/worldIntentEffectAccountingCore.ts`;
- extend `src/worldIntentVehicleParityCore.ts` report type to optionally include accounting, if useful;
- extend `src/vehicleWorldIntentBridgeCore.ts` batch report after WI3b;
- add `scripts/test_world_intent_wi4_effect_accounting.js`;
- `package.json` to include tests;
- `CHANGELOG.md`;
- `AI_SHARED_LOG.md`.

WI4 should avoid changing `src/vehicleOpsCore.ts` unless a tiny exported helper is absolutely necessary. Prefer deriving accounting from pre/post state in the new accounting core.

## 8. Files Forbidden

WI4 must not modify:

- `src/types/TurnResult.ts`;
- `src/statePatch.ts`;
- `src/turnLedgerPersistCore.ts`;
- replay/export writers;
- Webview modules;
- Remote Play write paths;
- Mobile Base / Settlement / Campaign Resource apply paths;
- `vehicle_state.json` schema.

## 9. Security and Boundaries

Accounting entries are still derived from GM-provided operations, so keep them bounded.

Rules:

- vehicle id must already be sanitized by canonical parser or parsed state;
- `field` is a closed union, not a free string;
- `ledger` is a closed union;
- `before`, `delta`, `after` are finite non-negative integers;
- `label` is optional and capped if accepted;
- no raw payload copy;
- no arbitrary `JsonValue` before/after in WI4;
- no nested accounting details.

This is deliberately narrower than the design-level `EffectAccountingEntry` sketch in `WORLD_INTENT_CORE_DESIGN.md`.

## 10. Required Tests

Add tests for:

1. partial refuel: 2/10 + amount 3 -> before 2, delta 3, after 5;
2. capped refuel: 8/10 + amount 5 -> delta 2, after 10;
3. fuel already max -> no accounting entry;
4. no resources -> no entry;
5. `powerType:'none'` -> no entry;
6. resource type mismatch -> no entry;
7. missing vehicle -> no entry;
8. lost vehicle with no canonical change -> no entry;
9. non-refuel ops -> no entry;
10. malformed or unparsed op cannot produce accounting;
11. input pre/post states are not mutated;
12. accounting entry uses only closed `ledger`, `subsystem`, `field`, `opType`;
13. optional `intentId` and `worldTurn` are carried when valid;
14. invalid/oversized labels are clamped or ignored;
15. WI3b report integration, if implemented, does not alter ledger result;
16. `npm run compile`;
17. `npm test`;
18. `node scripts/validate_utf8_docs.js`.

## 11. Findings Table

| Severity | Issue | Recommendation |
|---|---|---|
| P0 | Accounting could accidentally become a gameplay rule engine. | WI4 observes legacy before/after only; it does not compute or apply effects. |
| P0 | Fuel accounting could be confused with fuel consumption. | Restrict WI4 to `refuel_vehicle` gains only. Movement fuel costs are a later game-rule phase. |
| P1 | Generic `field: string` would reopen path traversal / schema drift risk. | Use closed field union: `resources.current` only. |
| P1 | Persisting accounting too early creates another ledger. | Keep entries in memory/diagnostics only until replay/export gate. |
| P2 | Deriving from World Intent output may mask legacy mismatch. | Derive from canonical legacy before/post state; World Intent may carry `intentId` as metadata only. |

## 12. Grok Implementation Prompt

```markdown
LoreRelay World Intent WI4 Effect Accounting pilot を実装してください。

推奨モデル: Grok / Codex
推奨推論: High

必読:
1. AI_SHARED_LOG.md の Current Snapshot
2. CHANGELOG.md の [Unreleased]
3. docs/WORLD_INTENT_CORE_DESIGN.md
4. docs/WORLD_INTENT_WI3B_CHATGPT_GATE.md
5. docs/WORLD_INTENT_WI4_EFFECT_ACCOUNTING_DESIGN.md
6. src/worldIntentCore.ts
7. src/worldIntentVehicleParityCore.ts
8. src/vehicleWorldIntentBridgeCore.ts
9. src/vehicleOpsCore.ts
10. src/vehicleCore.ts
11. src/vehicleTurnOpsCore.ts

目的:
`refuel_vehicle` が実際に `vehicle_state.resources.current` を増やした時だけ、純関数で EffectAccountingEntry を生成してください。

絶対条件:
- fuel consumption / movement cost は実装しない。
- `TurnResult.ts` は変更しない。
- `statePatch.ts` は変更しない。
- disk write / replay write / GM prompt injection はしない。
- accounting は diagnostic/in-memory only。
- generic field path や arbitrary ledger name は作らない。

推奨実装:
- add `src/worldIntentEffectAccountingCore.ts`
- expose `buildVehicleRefuelAccountingEntry(...)` and/or batch helper
- optionally attach entries to WI3b compare report only if WI3b exists cleanly
- add `scripts/test_world_intent_wi4_effect_accounting.js`

必須テスト:
docs/WORLD_INTENT_WI4_EFFECT_ACCOUNTING_DESIGN.md §10 を満たしてください。

完了条件:
- npm run compile
- npm test
- node scripts/validate_utf8_docs.js
- CHANGELOG.md / AI_SHARED_LOG.md 更新
```

