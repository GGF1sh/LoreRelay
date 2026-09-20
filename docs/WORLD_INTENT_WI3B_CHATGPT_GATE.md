# World Intent WI3b ChatGPT Gate

> Status: Approved with constraints.
> Scope: vehicle World Intent host bridge in `off` / `shadow` / `compare_only` modes only.
> Date: 2026-07-04.
> Canonical authority in WI3b: legacy `turn_result.vehicleOps` -> `vehicleTurnOps` -> `vehicle_state.json`.

## 1. Decision

WI3b is approved as a narrow host bridge for diagnostic World Intent parity around the existing vehicle ledger path.

The bridge may run World Intent comparison before the legacy vehicle write, but it must not become a write path. The legacy `vehicleOps` ledger remains the only canonical vehicle mutation path.

WI3b does not approve `WorldIntent` in `TurnResult`, Webview execute buttons, Remote Play writes, State Orchestrator wiring, generic action execution, or an `apply` bridge mode.

## 2. Approved Contract

### Bridge Modes

Allowed modes are exactly:

```ts
type VehicleWorldIntentBridgeMode = 'off' | 'shadow' | 'compare_only';
```

- `off`: no parity work, no diagnostics required.
- `shadow`: legacy vehicle persistence runs as before; parity may run best-effort and log diagnostics.
- `compare_only`: same canonical behavior as `shadow`, but parity reports must be structured enough for tests and operator review.

`apply`, `authoritative`, `migrate`, `repair`, or any other mode is forbidden.

### Authority

For every mode:

1. `vehicleOpsCore.applyVehicleOps()` via the existing `vehicleTurnOps` ledger path remains authoritative.
2. World Intent parity output is diagnostic only.
3. A mismatch must not block, retry, rewrite, compensate, or replace the legacy result.
4. A World Intent exception must be converted to a diagnostic report and must not fail the vehicle ledger write.

## 3. Integration Point

WI3b should be integrated at the existing vehicle ledger boundary, not as a new `statePatch` execution surface.

Recommended implementation shape:

```text
statePatch.persistTurnLedgersAfterCommit()
  -> applyVehicleState()
     -> tryApplyVehicleTurnOps(turnResult)
        -> read current vehicle_state.json once
        -> if bridge mode != off, run parity on cloned pre-write state
        -> run legacy apply/write exactly once
        -> return existing TurnLedgerApplyResult
```

This preserves the existing cross-ledger order:

```text
game_state -> discoveries -> campaign_resources -> settlement_layout -> vehicle_state
```

`statePatch.ts` should ideally require no change. If a small wiring change is unavoidable, it must not add a new apply callback or a separate World Intent ledger target.

## 4. Write Boundary

WI3b may read:

- `turn_result.vehicleOps`
- `vehicle_state.json`
- `game_rules.json` / `enableVehicleSystem`
- `world_state.json` / `worldTurn`
- extension configuration for bridge mode

WI3b may write:

- existing `vehicle_state.json`, only through the existing legacy `vehicleTurnOps` path
- Output Channel / console diagnostics

WI3b must not write:

- `game_state.json`
- `turn_result.json`
- `state_journal.ndjson` solely for parity reports
- `world_state.json`
- `settlement_layout.json`
- Mobile Base state
- any new `world_intent*.json` file

## 5. Configuration Contract

Default mode must be `off`.

Recommended setting:

```json
"textAdventure.worldIntent.vehicleBridgeMode": {
  "type": "string",
  "enum": ["off", "shadow", "compare_only"],
  "default": "off"
}
```

If the implementation chooses another key, it must still satisfy:

- invalid values fall back to `off`;
- `parseVehicleWorldIntentBridgeMode()` is reused or mirrored;
- no workspace data file can silently enable authoritative behavior.

This is an operator/dev diagnostic setting, not a player-facing game rule.

## 6. Files Allowed

WI3b may change:

- `src/worldIntentVehicleParityCore.ts`
- `src/vehicleTurnOpsCore.ts`
- `src/vehicleTurnOps.ts`
- add `src/vehicleWorldIntentBridgeCore.ts`
- add `src/vehicleWorldIntentBridge.ts`
- `package.json` for the bridge-mode configuration and test script
- `scripts/test_world_intent_wi3b*.js`
- `CHANGELOG.md`
- `AI_SHARED_LOG.md`
- `docs/VERSION_TRUTH.md` if version/test-count truth is updated

`src/statePatch.ts` is allowed only for a minimal call-site adaptation if impossible to keep the bridge inside `vehicleTurnOps`. It must not gain a new World Intent apply branch.

## 7. Files Forbidden

WI3b must not modify:

- `src/types/TurnResult.ts`
- schema files to add `worldIntents`
- Webview modules
- Remote Play write handlers
- replay/export write paths
- `mobileBaseTurnOps.ts`
- settlement/campaign/discovery ledger apply code
- mod loader runtime hooks

## 8. Required Behavior

### Pre-write Snapshot

Parity must run against the pre-write vehicle state.

The implementation must not:

- read the state after legacy write and compare against already-mutated state;
- call `tryApplyVehicleTurnOps()` twice;
- run a second filesystem write using World Intent output.

### Batch Cap

At most the parsed `vehicleOps` cap may be compared. If a local bridge cap is added, it must not exceed the legacy parsed-op cap.

### Report Shape

A batch report should include at least:

- bridge mode
- operation count
- report count
- mismatch count
- not-comparable count
- exception count
- per-op `VehicleWorldIntentParityReport[]` or an equivalent safe summary

The report must not include unbounded raw JSON payloads.

### Failure Semantics

| Situation | Ledger result |
|---|---|
| Bridge mode `off` | Existing behavior |
| Parity match | Existing behavior |
| Parity mismatch | Existing behavior + diagnostic |
| Parity not comparable | Existing behavior + diagnostic |
| Parity throws | Existing behavior + diagnostic |
| Legacy vehicle write fails | Existing vehicle ledger failure behavior |

## 9. Findings Table

| Severity | Issue | Recommendation |
|---|---|---|
| P0 | A host bridge can accidentally become a second write path. | Keep WI3b inside/around `vehicleTurnOps`; compare on clones; never persist World Intent output. |
| P0 | Comparing after legacy write hides mismatches and can mutate the wrong baseline. | Capture pre-write `vehicle_state` before `applyVehicleOps()`. |
| P1 | `shadow` and `compare_only` can be ambiguous to future agents. | Define both as diagnostic-only. `compare_only` differs only by more structured report visibility. |
| P1 | A parity exception could become a false ledger failure. | Catch parity failures separately from legacy write failures. |
| P2 | WI2 parity tests were strong for changed paths but thinner for blocked/no-op edge cases. | Add WI3b tests for missing/lost/full/no-tank/resource-mismatch/noop cases before trusting bridge diagnostics. |

## 10. Required Tests

Add or extend tests to cover:

1. mode parser accepts only `off`, `shadow`, `compare_only`; rejects `apply`;
2. default/invalid setting behaves as `off`;
3. `off` mode produces no parity diagnostics and keeps legacy apply behavior;
4. `shadow` mode runs parity on a cloned pre-write state and legacy write still occurs once;
5. `compare_only` mode returns/logs structured batch diagnostics and legacy write still occurs once;
6. mismatch diagnostics do not change `TurnLedgerApplyResult`;
7. parity exceptions do not change `TurnLedgerApplyResult`;
8. missing vehicle maps to diagnostic blocked/not-comparable behavior without throwing;
9. lost vehicle;
10. full fuel refuel no-op;
11. no tank / `powerType:none`;
12. resource type mismatch;
13. exact move no-op;
14. no double write: instrument deps so one legacy write is observed at most;
15. no forbidden file writes in the bridge core;
16. existing WI1/WI2 tests still pass;
17. `npm run compile`;
18. `npm test`;
19. `node scripts/validate_utf8_docs.js`.

## 11. Grok Implementation Prompt

```markdown
LoreRelay World Intent WI3b を実装してください。

推奨モデル: Grok / Codex
推奨推論: High

必読:
1. AI_SHARED_LOG.md の Current Snapshot
2. CHANGELOG.md の [Unreleased]
3. docs/WORLD_INTENT_CORE_DESIGN.md
4. docs/WORLD_INTENT_WI2_CHATGPT_GATE.md
5. docs/WORLD_INTENT_WI3B_CHATGPT_GATE.md
6. src/worldIntentCore.ts
7. src/worldIntentVehicleParityCore.ts
8. src/vehicleTurnOps.ts
9. src/vehicleTurnOpsCore.ts
10. src/statePatch.ts
11. src/turnLedgerPersistCore.ts

目的:
`turn_result.vehicleOps` の既存 legacy ledger path を canonical のまま維持しつつ、`off` / `shadow` / `compare_only` の World Intent vehicle bridge diagnostics を追加してください。

絶対条件:
- `apply` mode は作らない。
- `TurnResult.ts` に `worldIntents` を追加しない。
- `statePatch.ts` に新しい World Intent apply surface を作らない。
- `vehicle_state.json` は既存 legacy path で一度だけ書く。
- parity は pre-write state の clone で走らせる。
- mismatch / not_comparable / parity exception は診断のみ。ledger failure にしない。
- legacy write failure は従来どおり ledger failure として扱う。

推奨実装:
- add `vehicleWorldIntentBridgeCore.ts` for pure batch report helpers.
- add `vehicleWorldIntentBridge.ts` for VS Code/config/output-channel host wrapper if needed.
- integrate from `vehicleTurnOps` / `vehicleTurnOpsCore` so `statePatch.ts` remains unchanged if possible.
- package.json に `textAdventure.worldIntent.vehicleBridgeMode` (`off` default) を追加。

必須テスト:
docs/WORLD_INTENT_WI3B_CHATGPT_GATE.md §10 の Required Tests を満たしてください。

完了条件:
- npm run compile
- npm test
- node scripts/validate_utf8_docs.js
- CHANGELOG.md / AI_SHARED_LOG.md 更新
```

