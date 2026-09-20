# World Intent WI2 ChatGPT Gate

> Status: Approved with constraints.
> Scope: closed vehicle `GameAction` registry + pure legacy↔WorldIntent shadow parity.
> Baseline: `main` @ `7b71e3132ed9642a9271a169196dc62c9f78a33c`.
> Date: 2026-07-04.
> Canonical authority in WI2: legacy `vehicleOpsCore` remains authoritative.

## 1. Decision

WI2 is approved as the next World Intent phase after WI1 + WI1R.

WI2 has two implementation goals only:

1. replace duplicated vehicle action dispatch inside `worldIntentCore.ts` with a closed, deterministic `GameAction` registry for exactly the five V3 vehicle actions;
2. prove semantic parity against the existing `vehicleOpsCore.ts` behavior with a pure shadow comparison layer.

WI2 does **not** approve a host write bridge, `processTurnResult()` integration, canonical World Intent application, persistence migration, Settlement/Mobile Base expansion, Rule Kernel work, or State Orchestrator work.

The WI1R baseline has already corrected the blocking P1 issues around vehicle amount caps, invalid vehicle target kinds, and failed-execute `attempted` semantics. WI2 should now address the remaining architectural drift risk: query and execute must resolve the same closed action entry, and parity must be measured against the legacy vehicle oracle rather than assumed from similar-looking code.

## 2. Source of Truth and Authority Boundary

For WI2 vehicle behavior, `src/vehicleOpsCore.ts` is the semantic oracle.

The relevant legacy facts are:

- supported actions are exactly the five `V3_VEHICLE_OP_TYPES`;
- legacy parsing rejects malformed operation shapes and unknown operation types by dropping them;
- `applyVehicleOps()` clones input state before mutation;
- a changed operation returns a new `VehicleState`;
- a zero-effect or blocked operation returns the original state reference;
- finite `worldTurn` updates `updatedTurn` only when at least one operation changed state;
- missing vehicles, lost vehicles, incompatible fuel state, and already-satisfied state all collapse to legacy "unchanged", so WI2 must refine that legacy observation into the World Intent taxonomy without changing the legacy implementation.

Authority rules:

- `WorldIntent` expresses a request; it is not write authority.
- the closed `GameAction` entry owns deterministic query/execute semantics.
- legacy `vehicleOpsCore` remains canonical for WI2.
- a parity report is diagnostic output only.
- a mismatch must never cause a second write, fallback write, compensating write, or canonical World Intent application.

## 3. Approved WI2 Scope

### 3.1 Approved runtime work

WI2 may:

- refactor `queryWorldIntent()` and `executeWorldIntent()` so both resolve actions through one closed registry;
- keep the existing public WI1 API compatible;
- add an internal action resolution object so execute consumes the same accepted resolution produced by its own query/resolve pass;
- carry an already-computed in-memory candidate next state from query/resolve into execute to avoid applying the same vehicle operation twice inside one `executeWorldIntent()` call;
- add a pure vehicle parity module that compares legacy behavior with World Intent behavior on isolated equivalent inputs;
- return structured parity reports;
- define the future `off` / `shadow` / `compare_only` bridge-mode contract.

### 3.2 Explicitly not approved

WI2 must not:

- add `WorldIntent` to `turn_result.json` or `TurnResult.ts`;
- modify `processTurnResult()` or any host execution path;
- write `vehicle_state.json` or any other ledger;
- call persistence wrappers;
- add an `apply` bridge mode;
- make World Intent authoritative;
- add Settlement, Mobile Base, Campaign, Discovery, Quest, Guild, Domain, Commerce, NPC, World, or Mod actions to the registry;
- implement a dynamic or plugin action registry;
- allow mod-provided action handlers;
- create a generic `actionExecutionCore.ts` service layer;
- create or evaluate general `RequirementExpr` rules;
- implement Effect Accounting, priority, stacking, Event Bus, Scheduler, migration, or State Orchestrator behavior.

## 4. Files Allowed

WI2 implementation may change only:

- `src/worldIntentCore.ts`;
- add `src/worldIntentVehicleParityCore.ts`;
- `scripts/test_world_intent_core.js`;
- add `scripts/test_world_intent_wi2.js`;
- `package.json`, only to register the new WI2 test script in `npm test`;
- `CHANGELOG.md` and `AI_SHARED_LOG.md`, only for the completed WI2 entry.

No dependency installation is required or approved.

## 5. Files and Areas Forbidden

WI2 must not modify or import host authority from:

- `src/types/TurnResult.ts`;
- `src/statePatch.ts`;
- `src/turnLedgerPersistCore.ts`;
- `src/vehicleTurnOps.ts`;
- `src/mobileBaseTurnOps.ts`;
- `processTurnResult()` implementation files;
- Webview code or Webview message handlers;
- Remote Play write paths;
- replay persistence paths;
- filesystem / VS Code / process-spawning modules;
- Settlement or Mobile Base runtime modules;
- any persistence wrapper.

The new parity module must remain pure and must not import `vscode`, `fs`, host turn processors, or persistence modules.

## 6. Closed `GameAction` Registry Contract

### 6.1 Registry membership

WI2 registry membership is exactly:

```text
vehicle:set_active_vehicle
vehicle:move_vehicle
vehicle:damage_vehicle
vehicle:repair_vehicle
vehicle:refuel_vehicle
```

No other key is allowed.

A recommended key type is conceptually:

```ts
type WI2GameActionKey = `vehicle:${V3VehicleOpType}`;
```

The exact implementation type may differ, but the closed membership must not.

### 6.2 Registry shape

The registry may be module-private or exposed through readonly introspection for tests. It must be immutable after module initialization.

Recommended conceptual shape:

```ts
interface GameActionResolution {
    query: IntentQueryResult;
    op?: VehicleOp;
    candidateNextVehicleState?: VehicleState;
}

interface GameAction {
    readonly subsystem: 'vehicle';
    readonly action: V3VehicleOpType;
    query(
        context: WorldIntentQueryContext,
        intent: WorldIntent
    ): GameActionResolution;
    execute(
        context: WorldIntentQueryContext,
        intent: WorldIntent,
        resolution: GameActionResolution
    ): IntentExecuteResult;
}
```

This is a contract sketch, not a required public API.

### 6.3 Registry invariants

The implementation must guarantee:

- exactly five entries;
- unique `(subsystem, action)` keys;
- no `registerAction()`, `unregisterAction()`, mutable map export, plugin hook, or mod hook;
- no dynamic module discovery;
- no fallback string dispatch outside the registry for supported vehicle actions;
- unknown subsystem resolves to `unsupported_subsystem`;
- unknown vehicle action resolves to `unsupported_action`;
- query and execute resolve the same action entry;
- intent `source` never grants authority or changes registry membership;
- registry entries may call vehicle-specific pure helpers, but the registry must not become a service locator.

### 6.4 Query/execute drift rule

WI1 currently has a drift risk because public execute performs query, then independently rebuilds the vehicle op and applies it again. WI2 must close that gap.

Inside one `executeWorldIntent()` call:

```text
resolve one action entry
  -> run that entry's query/resolve once
  -> receive one accepted internal resolution
  -> pass that exact resolution to the same entry's execute
```

For an allowed vehicle action, if query/resolve already computed the candidate next state in order to decide `allowed` versus `valid_noop`, execute should consume that candidate rather than call `applyVehicleOps()` a second time.

Public callers may still call `queryWorldIntent()` and `executeWorldIntent()` separately. Each public call is independently pure and re-evaluates against the context supplied to that call. WI2 does not introduce cross-call caches.

## 7. Legacy ↔ WorldIntent Taxonomy Mapping

### 7.1 General mapping table

| Legacy effective observation | Cause class | Expected query status | Expected execute status | State requirement |
|---|---|---|---|---|
| valid op returns a new state | `changed` | `allowed` | `applied` | World Intent `nextVehicleState` deep-equals legacy next state |
| valid op returns original state because requested state is already satisfied or effective delta is zero | `unchanged_noop` | `valid_noop` | `valid_noop` | no World Intent next state |
| valid shape is prevented by feature/state/resource policy | `unchanged_blocked` | `blocked` | `blocked` | no World Intent next state |
| known action has malformed id/entity/payload/amount | `parse_rejected` | `invalid` | `invalid` | `attempted:false`, no next state |
| subsystem or action is outside WI2 registry | `unsupported` | `unsupported` | `unsupported` | `attempted:false`, no next state |
| World Intent pure execution throws unexpectedly | no valid legacy equivalent | query result as resolved; execute `failed` | `failed` | parity mismatch; legacy remains authoritative |

The legacy path does not itself distinguish all unchanged causes. WI2's parity classifier must use the mapping below to refine legacy unchanged behavior into `valid_noop` versus `blocked`.

### 7.2 Feature gate mapping

`enableVehicleSystem:false` maps to:

```text
legacy effective path: operation not attempted
World Intent query: blocked / vehicle_system_disabled
World Intent execute: blocked, attempted:false
```

For parity, the effective legacy oracle includes the existing vehicle-system gate before `applyVehicleOps()`. The parity helper must not call legacy apply when the effective feature gate is disabled.

### 7.3 Action-specific mapping table

| Action | Legacy changed → World Intent | Legacy unchanged → `valid_noop` | Legacy unchanged → `blocked` |
|---|---|---|---|
| `set_active_vehicle` | target exists, is not lost, and active id changes | target already active | missing target; lost target; vehicle system disabled |
| `move_vehicle` | any location, `parkedAt`, or legacy status transition changes | after blocked causes are excluded, `applyVehicleOps()` returns original state | missing target; lost target; vehicle system disabled |
| `damage_vehicle` | HP changes | HP already zero, or accepted normalized amount produces zero effective delta | missing target; lost target; vehicle system disabled |
| `repair_vehicle` | HP changes | HP already max, or accepted normalized amount produces zero effective delta | missing target; lost target; vehicle system disabled |
| `refuel_vehicle` | resource current changes | fuel already max, or accepted normalized amount produces zero effective delta | missing target; lost target; no resource container; `powerType:'none'`; resource type mismatch; vehicle system disabled |

### 7.4 Move semantics warning

For `move_vehicle`, "same location" alone is **not** sufficient to classify `valid_noop`.

Legacy `applyMoveVehicle()` may still change state when:

- the vehicle is at the same `locationId` but `parkingLocationId` changes;
- `parkedAt.locationId` must be corrected;
- status is `available` or `deployed` and therefore becomes `parked`.

After missing/lost/feature-blocked cases are excluded, the legacy oracle result is authoritative:

```text
legacy returns same state reference -> valid_noop
legacy returns new state -> allowed/applied
```

### 7.5 Parser and normalization boundaries

WI2 must not silently change `vehicleOpsCore` parsing or normalization to make parity easier.

Required rules:

- known action + malformed required payload maps to `invalid`;
- unknown action maps to `unsupported` on the World Intent side;
- amount caps must continue to use `MAX_VEHICLE_OP_AMOUNT` and `MAX_VEHICLE_REFUEL_AMOUNT` from `vehicleOpsCore`;
- current positive-fraction normalization behavior must be characterized by tests rather than changed inside WI2;
- if a canonical legacy `VehicleOp` cannot round-trip through the World Intent adapter, the parity layer must return a structured `not_comparable` / adapter mismatch result, not throw and not mutate state.

Reason codes are not required to equal any legacy value because legacy has no equivalent reason-code taxonomy. Action tests must still assert the established WI1 reason codes for important blocked/invalid/no-op cases.

## 8. Pure Vehicle Shadow Parity Contract

### 8.1 Purpose

`src/worldIntentVehicleParityCore.ts` is a pure comparison layer for one vehicle action at a time.

It exists to answer:

> Given equivalent vehicle input state, action, feature-gate state, and world turn, do legacy `vehicleOpsCore` and World Intent produce compatible taxonomy and identical changed state?

It is not a persistence bridge.

### 8.2 Comparison input

Recommended conceptual input:

```ts
interface VehicleWorldIntentParityInput {
    op: VehicleOp;
    vehicleState?: VehicleState;
    enableVehicleSystem?: boolean;
    worldTurn?: number;
}
```

The helper must create isolated equivalent inputs for the legacy and World Intent runs. Neither run may observe mutation performed by the other.

### 8.3 Report shape

Recommended conceptual report:

```ts
type VehicleParityOutcome = 'match' | 'mismatch' | 'not_comparable';

type VehicleParityMismatchCode =
    | 'adapter_roundtrip'
    | 'query_taxonomy'
    | 'execute_taxonomy'
    | 'applied_flag'
    | 'next_state'
    | 'updated_turn'
    | 'input_mutation'
    | 'unexpected_exception';

interface VehicleWorldIntentParityReport {
    version: 1;
    action: V3VehicleOpType;
    outcome: VehicleParityOutcome;
    expected: {
        legacyClass:
            | 'changed'
            | 'unchanged_noop'
            | 'unchanged_blocked';
        queryStatus: WorldIntentQueryStatus;
        executeStatus: WorldIntentExecuteStatus;
    };
    legacy: {
        attempted: boolean;
        changed: boolean;
        nextVehicleState?: VehicleState;
    };
    worldIntent: {
        queryStatus?: WorldIntentQueryStatus;
        executeStatus?: WorldIntentExecuteStatus;
        attempted?: boolean;
        applied?: boolean;
        nextVehicleState?: VehicleState;
    };
    mismatches: VehicleParityMismatchCode[];
}
```

The exact exported names may differ. The semantic fields must be present or equivalently represented.

### 8.4 Comparison rules

A parity report is `match` only when all applicable checks pass:

- expected query taxonomy matches;
- expected execute taxonomy matches;
- `applied` matches legacy changed/unchanged semantics;
- for changed actions, full normalized `VehicleState` deep equality matches;
- finite `worldTurn` / `updatedTurn` behavior matches;
- legacy input state is not mutated;
- World Intent input state is not mutated;
- comparison helper input state is not mutated.

`mismatches` must have deterministic order.

A report is `not_comparable` when the legacy action cannot be represented through the approved WI2 adapter contract. It must not be silently counted as a match.

The parity helper must never:

- write files;
- call host persistence;
- mutate canonical state;
- publish events;
- invoke Webview code;
- throw merely because the two paths disagree.

Unexpected internal exceptions should become structured `unexpected_exception` mismatch diagnostics so a future shadow bridge can remain non-authoritative. Unit tests may still fail on such reports.

## 9. `off` / `shadow` / `compare_only` Bridge Contract

WI2 defines the contract for later host wiring but does not wire the host.

The only approved modes are:

```ts
type VehicleWorldIntentBridgeMode =
    | 'off'
    | 'shadow'
    | 'compare_only';
```

### `off`

- legacy path only;
- no World Intent comparison is required;
- no parity diagnostics.

### `shadow`

- legacy path remains authoritative;
- World Intent parity may run as best-effort diagnostics;
- mismatch is recorded/reported only;
- mismatch or parity exception never blocks legacy behavior;
- no additional write is allowed.

### `compare_only`

- canonical behavior is identical to `shadow`;
- legacy remains authoritative;
- parity report is explicit and must be available to the caller/test/diagnostic surface;
- callers such as tests may fail on `outcome !== 'match'`;
- runtime comparison still must not alter persistence behavior.

### `apply` is not approved

`apply` is deliberately absent from the WI2 runtime mode union.

WI2 must not:

- accept `apply` as an executable mode;
- normalize `apply` into a hidden authoritative path;
- make World Intent output canonical;
- write World Intent state after legacy state;
- replace the legacy result.

A future gate must explicitly approve and define `apply` before that mode can exist in executable code.

### WI2 host-wiring restriction

No `off` / `shadow` / `compare_only` mode is wired into `processTurnResult()` in WI2.

WI2 delivers only:

- the closed registry;
- pure parity primitives;
- mode semantics for the later host gate.

Actual feature-flag parsing and host integration remain deferred to WI3b.

## 10. Failure and Fallback Contract

For the later shadow/compare-only host bridge, WI2 fixes these invariants now:

- legacy result is always authoritative;
- World Intent mismatch never changes the legacy result;
- World Intent exception never blocks the legacy path;
- parity diagnostics failure never blocks vehicle persistence;
- no second `vehicle_state` write;
- no persistence order change;
- no cross-ledger access;
- no retry;
- no rollback;
- no fallback mutation.

The parity layer may report a failure. It may not recover by mutating state.

## 11. Why Settlement and Mobile Base Stay Out of WI2

Settlement and Mobile Base are explicitly excluded.

Reasons:

- Mobile Base and vehicle behavior share `vehicle_state` boundaries;
- Mobile Base carries cross-system docking/parking semantics;
- Settlement expansion has its own gated persistence path;
- adding either subsystem before vehicle parity is proven would mix action-kernel validation with shared-ledger and cross-ledger validation;
- WI2 exists to prove one taxonomy and one oracle first.

No Settlement or Mobile Base registry entry, adapter, parity helper, or bridge code is allowed in WI2.

## 12. Required Tests

Add `scripts/test_world_intent_wi2.js` and include it in `npm test`.

The following coverage is mandatory.

### Registry closure and lifecycle

1. Registry contains exactly five unique keys, matching the five V3 vehicle actions.
2. Registry contains no non-vehicle action and exposes no runtime register/unregister mutation API.
3. Every non-vehicle subsystem returns `unsupported_subsystem`; every unknown vehicle action returns `unsupported_action`.
4. All five supported actions execute through registry resolution while preserving the public WI1 API.
5. Query and execute resolve the same action entry; there is no separate supported-action fallback dispatch outside the registry.
6. One `executeWorldIntent()` call performs one internal action resolution. An allowed vehicle action must consume its resolved candidate next state rather than applying the same vehicle operation a second time inside execute.

### Legacy ↔ WorldIntent taxonomy mapping

7. `set_active_vehicle`: changed → `allowed`/`applied` with state parity.
8. `set_active_vehicle`: already active → `valid_noop`; missing and lost → `blocked`.
9. `move_vehicle`: exact zero-delta move → `valid_noop`.
10. `move_vehicle`: same location but `available`/`deployed` status changes to `parked` → `allowed`/`applied` with state parity.
11. `move_vehicle`: same location but parking metadata changes → `allowed`/`applied` with state parity.
12. `damage_vehicle`: HP change → `applied`; HP already zero / zero effective delta → `valid_noop`; missing/lost → `blocked`.
13. `repair_vehicle`: HP change → `applied`; HP already max / zero effective delta → `valid_noop`; missing/lost → `blocked`.
14. `refuel_vehicle`: resource change → `applied`; fuel already max / zero effective delta → `valid_noop`; no tank, `powerType:'none'`, resource mismatch, missing, and lost → `blocked`.
15. `enableVehicleSystem:false` → World Intent `blocked`, execute `attempted:false`, and effective legacy apply is not attempted.
16. Known action with malformed required payload/entity/id/amount → `invalid`; unknown action/subsystem → `unsupported`.
17. Amount-cap parity covers both `MAX_VEHICLE_OP_AMOUNT` and `MAX_VEHICLE_REFUEL_AMOUNT`; current positive-fraction normalization is characterized without changing `vehicleOpsCore`.
18. Non-vehicle `target.kind` remains `invalid_entity_kind`; payload-only `vehicleId` remains supported where the WI1 contract allows it.

### State and oracle parity

19. For every changed V3 action, World Intent `nextVehicleState` deep-equals legacy `applyVehicleOps()` output.
20. Finite `worldTurn` parity: changed actions update `updatedTurn` identically; no-op/blocked actions do not gain a new update; non-finite turns are ignored identically.
21. Legacy path, World Intent path, and parity helper do not mutate their input `VehicleState` objects.
22. `valid_noop`, `blocked`, `invalid`, and `unsupported` executions return no `nextVehicleState`; attempted/applied flags match the gate taxonomy.
23. A matching parity report has `outcome:'match'` and an empty mismatch list; mismatch-code ordering is deterministic.
24. Adapter round-trip failure becomes explicit `not_comparable` / `adapter_roundtrip`, never an exception and never a silent match.
25. World Intent unexpected execution failure becomes structured parity mismatch diagnostics; legacy remains the authoritative comparison result.

### Bridge boundary and scope regression

26. WI2 executable bridge modes, if a pure mode parser/type is added, are only `off`, `shadow`, and `compare_only`; `apply` is rejected or unsupported.
27. Static assertion: WI2 core/parity modules do not import `vscode`, `fs`, `statePatch`, `turnLedgerPersistCore`, `vehicleTurnOps`, `mobileBaseTurnOps`, Webview modules, or persistence wrappers.
28. Regression assertion: WI2 requires no changes to `TurnResult.ts`, `statePatch.ts`, `processTurnResult()` host files, Webview files, Settlement runtime, or Mobile Base runtime.
29. Existing WI1/WI1R tests continue to pass unchanged in semantics.
30. `npm run compile`, `npm test`, and `node scripts/validate_utf8_docs.js` all pass.

## 13. Acceptance Criteria

WI2 is complete only when:

- registry membership is closed to the five vehicle actions;
- query and execute share one registry lifecycle;
- execute does not independently rebuild and re-apply an already-resolved allowed action;
- the pure parity report covers taxonomy, changed state, input non-mutation, and `updatedTurn`;
- required parity cases pass against `vehicleOpsCore`;
- legacy remains canonical;
- there is no host bridge and no persistence change;
- `apply` does not exist as an approved executable mode;
- all required validation passes.

Any P0/P1 parity mismatch blocks WI3b host-bridge work.

P2 diagnostics may remain only if they are explicitly documented, deterministic, non-authoritative, and do not weaken the five-action parity contract.

## 14. Grok Implementation Prompt

```markdown
LoreRelay World Intent WI2 を実装してください。

必読:
- docs/WORLD_INTENT_WI2_CHATGPT_GATE.md
- docs/WORLD_INTENT_CORE_CHATGPT_GATE.md
- src/worldIntentCore.ts
- src/vehicleOpsCore.ts
- src/vehicleCore.ts

Baseline:
- main @ 7b71e3132ed9642a9271a169196dc62c9f78a33c

Gate Approved 範囲のみ:
- `worldIntentCore.ts` の vehicle dispatch を、5 action 固定の closed GameAction registry にする。
- query/execute は同じ action entry と同じ内部 resolution を使う。
- allowed action の execute 内で同じ vehicle op を二重 apply しない。
- pure `src/worldIntentVehicleParityCore.ts` を追加し、`vehicleOpsCore` を oracle とした legacy↔WorldIntent parity report を実装する。
- `scripts/test_world_intent_wi2.js` を追加して npm test に登録し、Gate Required Tests を満たす。

Bridge contract:
- `off` / `shadow` / `compare_only` の契約まで。
- WI2 では host / processTurnResult に配線しない。
- legacy が常に authoritative。
- `apply` は未承認。実装しない。

禁止:
- TurnResult.ts
- statePatch.ts
- turnLedgerPersistCore.ts
- vehicleTurnOps.ts
- mobileBaseTurnOps.ts
- processTurnResult host wiring
- Webview
- persistence
- Settlement / Mobile Base expansion
- dynamic registry / mod registration
- actionExecutionCore.ts / ruleCore.ts
- RequirementExpr 実評価
- Effect Accounting / Event Bus / migration / State Orchestrator

検証:
- npm run compile
- node scripts/test_world_intent_core.js
- node scripts/test_world_intent_wi2.js
- npm test
- node scripts/validate_utf8_docs.js

完了後:
- CHANGELOG.md [Unreleased] と AI_SHARED_LOG.md に WI2 のみ追記。
- WI2 以外の差分を混ぜず、単独コミット＆push。
- parity mismatch が残る場合は action / legacy class / query status / execute status / mismatch codes を報告する。
```
