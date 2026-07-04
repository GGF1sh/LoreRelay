# World Intent Core ChatGPT Gate

> Status: Approved with constraints.
> Scope: WI1 pure core skeleton + vehicleOps adapter only.
> Date: 2026-07-04

This gate reviews `docs/WORLD_INTENT_CORE_DESIGN.md` against the current
`TurnResult`, vehicle, mobile base, settlement layout, cross-ledger, and
`statePatch` implementations.

## Findings

| Severity | Issue | Recommendation |
|---|---|---|
| Critical | WI1 could accidentally become a new mutation channel if added to `TurnResult`, `statePatch`, Webview messages, or ledger persistence. | Do not modify `TurnResult.ts`, `statePatch.ts`, Webview handlers, or any persistence module in WI1. World Intent must be a pure module only. |
| High | `ledgerPlan` in the design is useful later, but too easy to treat as executable persistence now. | WI1 must not emit executable ledger plans. Return preview / in-memory next-state only. Defer real `LedgerMutationPlan` to a State Orchestrator gate. |
| High | `payload: JsonValue` is broad and can carry oversized or hostile objects. | Parse from `unknown`, deep-clone/sanitize, cap serialized payload size, cap arrays, reject functions/prototypes by JSON roundtrip or equivalent safe copier. |
| High | `RequirementExpr` with arbitrary `subject.field` would create path traversal by another name. | WI1 may define placeholder types, but must not evaluate general requirements. Only hard-coded vehicle checks are allowed. |
| Medium | `IntentExecuteResult.status` lacks `unsupported` while query has it. | Add `unsupported` to execute status, or guarantee execute maps unsupported query results to `{ ok:false, attempted:false, status:'unsupported' }`. Prefer adding the status for symmetry. |
| Medium | `valid_noop`, `blocked`, and `invalid` need precise state semantics to avoid the old false partial-failure class of bugs. | Use the definitions below. In particular, "already satisfied" is `valid_noop`; "target exists but policy/state prevents action" is `blocked`; bad shape/id/payload is `invalid`. |
| Medium | `ui`, `player`, and `mod` sources are trust-sensitive. | Parser may preserve source enum, but WI1 execute must not grant write authority based on those sources. Webview/UI usage is query/preview only. |
| Medium | vehicleOps and mobileBaseOps both persist to `vehicle_state.json`; combining both under one intent layer now would blur the write boundary. | WI1 adapter must be vehicleOps only. Mobile Base stays deferred. |
| Low | Existing op cores keep private ID regex helpers. | Duplicating the same conservative ID regex in `worldIntentCore.ts` is acceptable for WI1; keep it documented and tested. |

## Approved WI1 Contract

WI1 is approved only as a pure, no-I/O skeleton.

### Files Allowed

- Add `src/worldIntentCore.ts`.
- Add `scripts/test_world_intent_core.js`.
- Documentation/log updates are allowed.

### Files Not Allowed In WI1

- `src/types/TurnResult.ts`
- `src/statePatch.ts`
- `src/turnLedgerPersistCore.ts`
- `src/vehicleTurnOps.ts`
- `src/mobileBaseTurnOps.ts`
- Webview modules / Webview handlers
- Any filesystem, VS Code, or process-spawning module

### Supported Subsystem / Actions

`subsystem: "vehicle"` only.

Allowed actions are exactly the current V3 vehicle ops:

- `set_active_vehicle`
- `move_vehicle`
- `damage_vehicle`
- `repair_vehicle`
- `refuel_vehicle`

Every other subsystem or action must return `unsupported`.

### Core Exports

Recommended WI1 exports:

```ts
export const WORLD_INTENT_VERSION = 1;

export type WorldIntentQueryStatus =
    | 'allowed'
    | 'valid_noop'
    | 'blocked'
    | 'invalid'
    | 'unsupported';

export type WorldIntentExecuteStatus =
    | 'applied'
    | 'valid_noop'
    | 'blocked'
    | 'invalid'
    | 'unsupported'
    | 'failed';

export function parseWorldIntent(raw: unknown): WorldIntent | undefined;
export function parseWorldIntentBatch(raw: unknown, max?: number): WorldIntent[];

export function worldIntentFromVehicleOp(op: VehicleOp, meta?: Partial<WorldIntent>): WorldIntent;
export function vehicleOpFromWorldIntent(intent: WorldIntent): VehicleOp | undefined;

export function queryWorldIntent(intent: WorldIntent, context: WorldIntentQueryContext): IntentQueryResult;
export function executeWorldIntent(intent: WorldIntent, context: WorldIntentQueryContext): IntentExecuteResult;
```

`executeWorldIntent()` is still pure in WI1. It may return an in-memory
`nextVehicleState`, but it must not write files and must not return an
executable ledger plan.

### Query Context

WI1 context should be narrow:

```ts
export interface WorldIntentQueryContext {
    gameRules?: {
        enableVehicleSystem?: boolean;
    };
    vehicleState?: VehicleState;
    worldTurn?: number;
}
```

Do not pass workspace paths, VS Code objects, write callbacks, or ledger
callbacks.

### Status Definitions

- `allowed`: supported action, feature gate permits it, target exists, and the action can change state.
- `valid_noop`: supported action, feature gate permits it, target exists, but the current state already satisfies the request or the action has no effective delta.
- `blocked`: shape is valid, but policy or current state prevents action. Examples: vehicle system disabled, vehicle is lost, refuel resource type mismatches, vehicle has no fuel container.
- `invalid`: malformed intent, malformed entity id, missing required payload, invalid amount, payload too large, invalid entity kind for the action.
- `unsupported`: subsystem or action is outside WI1.
- `failed`: execute attempted a pure adapter and hit an unexpected exception. This should be rare and covered by defensive tests.

### Vehicle Semantics

Use current `vehicleOpsCore.ts` behavior as the source of truth.

- `set_active_vehicle`
  - already active: `valid_noop`
  - missing/lost vehicle: `blocked`
- `move_vehicle`
  - same location and same parking state: `valid_noop`
  - missing/lost vehicle: `blocked`
- `damage_vehicle`
  - amount <= 0 or non-finite: `invalid`
  - missing/lost vehicle: `blocked`
  - hp already 0: `valid_noop`
- `repair_vehicle`
  - amount <= 0 or non-finite: `invalid`
  - missing/lost vehicle: `blocked`
  - hp already max: `valid_noop`
- `refuel_vehicle`
  - amount <= 0 or non-finite: `invalid`
  - missing/lost vehicle: `blocked`
  - no resource tank / `powerType:"none"` / resource mismatch: `blocked`
  - fuel already max: `valid_noop`

## Deferred Items

- Adding `WorldIntent` to `turn_result.json`.
- Any `statePatch` integration.
- Any cross-ledger persistence or `turnLedgerPersistCore` integration.
- State Orchestrator transaction planning.
- `mobileBaseOps`, `settlementOps`, `campaignResourceOps`, `discoveryOps`, `resolvedQuests`, guild/domain adapters.
- RequirementExpr evaluator.
- EffectAccountingEntry beyond an optional inert type definition.
- Webview execute buttons, remote play writes, or mod-originated execution.
- Conflict resolution, priority, stacking, or batch transaction semantics.

## Deep Research Addendum

The later DeepResearch synthesis agrees that LoreRelay should move toward a
thin Action Execution Kernel, but this gate does **not** approve that full
kernel for WI1.

Interpretation for implementers:

- WI1 is still only `WorldIntent` pure skeleton + vehicleOps adapter.
- Do not create `actionExecutionCore.ts` or `ruleCore.ts` unless a later gate
  explicitly asks for them.
- Do not implement a dynamic GameAction registry in WI1; a closed vehicle
  dispatch table is enough.
- Do not implement general RequirementExpr evaluation in WI1.
- Do not implement EffectGroup / stacking / priority in WI1.
- Do not implement Event Bus, Scheduler Descriptor, Deferred Simulation, or
  per-ledger migration helpers in WI1.
- Do not expose `WorldIntent` through `turn_result.json`, Webview, Remote Play,
  or persistence.

The DeepResearch items become future gates:

| Future Gate | Topic | Earliest Phase |
|---|---|---|
| WI2 Gate | closed action registry + vehicle shadow-mode parity | after WI1 review |
| WI3 Gate | compatibility bridge into `processTurnResult()` | after WI2 |
| WI4 Gate | small EffectCause / EffectAccounting pilot | after vehicle parity |
| WI5 Gate | semantic sanity checker for rules/mods | after MOD/RP stabilizes |
| WI6 Gate | per-ledger schema migration helper | after ledger version pressure appears |
| Scheduler Gate | descriptor-only system ordering audit | design only until needed |

## Required Tests

Add `scripts/test_world_intent_core.js` and include it in `npm test`.

Required coverage:

1. `parseWorldIntent()` rejects non-objects, arrays, missing subsystem/action, invalid IDs, invalid entity kinds.
2. Payload sanitizer caps serialized size and cannot preserve prototype pollution keys.
3. `parseWorldIntentBatch()` caps count and drops invalid items.
4. Every non-vehicle subsystem returns `unsupported`.
5. Every unsupported vehicle action returns `unsupported`.
6. `enableVehicleSystem:false` returns `blocked` for otherwise valid vehicle actions.
7. Vehicle adapter round-trips every V3 vehicle op through `worldIntentFromVehicleOp()` and `vehicleOpFromWorldIntent()`.
8. `queryWorldIntent()` distinguishes `allowed` vs `valid_noop` for active vehicle, move same place, full repair, max refuel, and hp-zero damage.
9. `queryWorldIntent()` returns `blocked` for missing vehicle, lost vehicle, no fuel tank, and fuel type mismatch.
10. `executeWorldIntent()` does not mutate input `vehicleState`.
11. `executeWorldIntent()` returns an in-memory next state only for allowed WI1 vehicle actions.
12. `executeWorldIntent()` returns `attempted:false` for `blocked`, `invalid`, and `unsupported`.
13. Static assertion: `src/worldIntentCore.ts` must not import `vscode`, `fs`, `statePatch`, `turnLedgerPersistCore`, or any host persistence wrapper.
14. Regression assertion: WI1 implementation does not require changes to `TurnResult.ts` or `statePatch.ts`.

## Grok Implementation Prompt

```markdown
LoreRelay World Intent Core WI1 を実装してください。

必読:
- docs/WORLD_INTENT_CORE_DESIGN.md
- docs/WORLD_INTENT_CORE_CHATGPT_GATE.md
- src/vehicleOpsCore.ts
- src/vehicleCore.ts

スコープ:
- `src/worldIntentCore.ts` を新規追加。
- `scripts/test_world_intent_core.js` を新規追加し、`package.json` の `npm test` に組み込む。
- WI1 は pure core skeleton + vehicleOps adapter のみ。
- `TurnResult.ts`, `statePatch.ts`, `turnLedgerPersistCore.ts`, Webview, persistence wrappers は触らない。

実装すること:
- `WorldIntent` / `EntityRef` / query result / execute result の型。
- `parseWorldIntent()` / `parseWorldIntentBatch()`。
- vehicleOps adapter:
  - `worldIntentFromVehicleOp()`
  - `vehicleOpFromWorldIntent()`
- `queryWorldIntent()`。
- pure `executeWorldIntent()`。これは `vehicleState` の in-memory next state を返してよいが、disk write / ledger plan / statePatch は絶対に行わない。

許可 subsystem/action:
- subsystem は `vehicle` のみ。
- action は `set_active_vehicle`, `move_vehicle`, `damage_vehicle`, `repair_vehicle`, `refuel_vehicle` のみ。

ステータス契約:
- `allowed`, `valid_noop`, `blocked`, `invalid`, `unsupported`, `failed` を `docs/WORLD_INTENT_CORE_CHATGPT_GATE.md` の定義どおりに使う。

検証:
- `npm run compile`
- `node scripts/test_world_intent_core.js`
- `npm test`
- `node scripts/validate_utf8_docs.js`

完了後:
- CHANGELOG.md [Unreleased] と AI_SHARED_LOG.md に WI1 実装内容とテスト数を追記。
- コミットは小さく、WI1 以外の未コミット差分を混ぜない。
```
