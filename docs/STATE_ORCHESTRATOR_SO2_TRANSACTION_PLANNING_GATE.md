# State Orchestrator SO2 Transaction Planning Gate

Status: Design / implementation gate  
Date: 2026-07-04  
Owner: Codex / ChatGPT  
Recommended implementation model: Grok or Codex, reasoning High

## 1. Summary

SO1 made the ledger map. SO2 should make the first transaction plan.

SO2 is still not a transaction manager. It must not write files, change queues, execute rollback, or replace `statePatch.ts`. It only builds a deterministic, bounded plan that explains what ledgers would be attempted, in what order, under the current GM turn persist contract.

The goal is to make cross-ledger behavior visible before LoreRelay grows a real State Orchestrator.

## 2. Why This Is Next

LoreRelay now has many write-capable subsystems:

- primary `game_state.json`
- side ledgers: `discoveries.json`, `campaign_resources.json`, `settlement_layout.json`, `vehicle_state.json`
- simulation/background ledgers: `world_state.json`, `npc_registry.json`
- migration commands with strict backups

SO1 can answer:

```text
What ledger surfaces exist?
```

SO2 should answer:

```text
For this proposed operation, which ledger writes would be planned?
What order would they run in?
What failure policy applies to each step?
What is explicitly out of scope?
```

This is the bridge between descriptor inventory and future orchestration.

## 3. Scope

SO2 covers planning only for the existing GM turn ledger order:

```ts
TURN_LEDGER_PERSIST_ORDER = [
  'game_state',
  'discoveries',
  'campaign_resources',
  'settlement_layout',
  'vehicle_state',
]
```

It may also report non-turn descriptors as out-of-plan context:

- `world_state`
- `npc_registry`
- WI7 migration write-back
- WI7b migration restore

But it must not mix them into the GM turn plan.

## 4. Non-Goals

SO2 must not:

- write any file;
- call `writeJsonAtomic`;
- call any existing `apply*TurnOps` function;
- modify `statePatch.ts`;
- modify `turnLedgerPersistCore.ts`;
- modify `TurnResult.ts`;
- alter `TURN_LEDGER_PERSIST_ORDER`;
- add rollback or compensation execution;
- add Webview buttons;
- run during GM turn processing by default;
- connect to Remote Play;
- change World Intent execution;
- change Context Engine prompt behavior;
- migrate ledgers;
- replace per-ledger queues.

The design is a planning gate, not runtime plumbing.

## 5. Proposed Pure Module

Recommended new module:

```text
src/stateOrchestratorPlanCore.ts
```

Recommended types:

```ts
export type StateTransactionPlanKind =
  | 'gm_turn'
  | 'migration_command'
  | 'simulation_tick'
  | 'diagnostic';

export type StateTransactionPlanStepStatus =
  | 'planned'
  | 'skipped_no_ops'
  | 'blocked_by_primary_failure'
  | 'out_of_scope';

export interface StateTransactionPlanRequest {
  kind: StateTransactionPlanKind;
  commitGameStatePlanned: boolean;
  discoveryOpsPresent?: boolean;
  campaignResourceOpsPresent?: boolean;
  settlementLayoutOpsPresent?: boolean;
  vehicleOpsPresent?: boolean;
}

export interface StateTransactionPlanStep {
  order: number;
  ledgerId: string;
  turnLedgerOrderKey?: string;
  fileNamePattern: string;
  owner: LedgerWriteOwner;
  phase: LedgerWritePhase;
  canonicalModule: string;
  queue?: string;
  atomicWrite: boolean;
  backupPolicy: LedgerDescriptor['backupPolicy'];
  failurePolicy: LedgerFailurePolicy;
  circuitBreaker: LedgerDescriptor['circuitBreaker'];
  status: StateTransactionPlanStepStatus;
  reasonCode: string;
}

export interface StateTransactionPlan {
  version: 1;
  kind: StateTransactionPlanKind;
  orderSource: 'TURN_LEDGER_PERSIST_ORDER';
  primaryLedgerId: 'game_state';
  steps: StateTransactionPlanStep[];
  warnings: StateTransactionPlanWarning[];
}
```

Use `LedgerDescriptor` from SO1. Do not duplicate descriptor facts.

## 6. Planning Rules

### Rule 1: game_state is always first for `gm_turn`

If `kind === 'gm_turn'`, the first step must be `game_state`.

If `commitGameStatePlanned` is false:

- `game_state` step status is `skipped_no_ops`;
- side ledgers are `blocked_by_primary_failure`;
- no step is `planned`.

### Rule 2: side ledgers follow `TURN_LEDGER_PERSIST_ORDER`

For GM turn plans, use only the order constant from `turnLedgerPersistCore.ts`.

Current side ledger attempt flags:

| Ledger key | Request flag |
|---|---|
| `discoveries` | `discoveryOpsPresent` |
| `campaign_resources` | `campaignResourceOpsPresent` |
| `settlement_layout` | `settlementLayoutOpsPresent` |
| `vehicle_state` | `vehicleOpsPresent` |

If the flag is false, status is `skipped_no_ops`.

If the flag is true and `commitGameStatePlanned` is true, status is `planned`.

### Rule 3: failure policy is descriptive

SO2 may include existing failure policy metadata:

- `game_state`: `abort_before_commit`
- side ledgers: `retain_primary_report_partial`

But SO2 must not execute or simulate failure.

### Rule 4: no dependency graph yet

SO2 must not infer semantic dependencies between side ledgers. For example, it must not claim `vehicle_state` depends on `settlement_layout` even if a future mobile-base operation might conceptually involve both.

The only dependency in SO2 is:

```text
side ledgers require successful game_state commit
```

### Rule 5: non-turn ledgers are out-of-plan

If descriptors exist for `world_state`, `npc_registry`, or migrations, the plan may include a separate `outOfScopeDescriptors` report or warning, but must not insert them into the `gm_turn` step list.

## 7. Relationship With Existing Persist Core

`persistTurnLedgersAfterCommit()` remains the canonical runtime behavior.

SO2 must not call it. SO2 mirrors the same shape for planning and tests:

```text
StateTransactionPlanRequest flags
  -> planned/skipped steps
  -> no writes
```

Recommended parity tests:

- For each request flag combination, the planned attempt booleans match what `persistTurnLedgersAfterCommit()` would attempt.
- Step order matches `TURN_LEDGER_PERSIST_ORDER`.

## 8. Relationship With World Intent

World Intent can eventually produce operation-level intents.

SO2 does not consume `WorldIntent` yet.

Deferred future path:

```text
WorldIntent batch
  -> subsystem ops
  -> proposed ledger writes
  -> SO transaction plan
  -> later SO executor
```

For now, SO2 input is deliberately coarse: boolean presence flags, not operation payloads.

## 9. Relationship With Context Engine

Context Engine P0 explains GM prompt composition.

SO2 explains ledger write plans.

They must remain independent. Do not include Context Inspector accounting in transaction plans, and do not include transaction plans in GM prompts.

## 10. Report Boundaries

SO2 reports are internal diagnostics.

Allowed surfaces:

- pure test output;
- future Output Channel command;
- future local Inspector developer panel.

Forbidden in SO2:

- Remote Play;
- replay export;
- player-facing narrative;
- GM prompt injection.

## 11. Required Warnings

`buildStateTransactionPlan()` should produce bounded deterministic warnings:

| Code | Meaning |
|---|---|
| `missing_descriptor` | a turn order key has no descriptor |
| `descriptor_not_in_turn_order` | descriptor claims turn participation but key is not in order |
| `primary_not_first` | `game_state` is not first in requested order |
| `unknown_kind` | unsupported plan kind |
| `side_ledger_blocked` | side ledger would wait for primary commit |

Warnings are diagnostic only.

## 12. Required Tests

Pure tests:

1. Empty/no-op GM turn produces `game_state: planned` only when `commitGameStatePlanned:true`; all side ledgers `skipped_no_ops`.
2. All side flags true produce five steps in exact `TURN_LEDGER_PERSIST_ORDER`.
3. `commitGameStatePlanned:false` blocks all side ledgers.
4. Missing descriptor produces bounded `missing_descriptor` warning.
5. Duplicate descriptor/order mismatch is surfaced via SO1 check or SO2 warning.
6. Non-turn descriptors are not inserted into GM turn plan.
7. Failure policies come from descriptors, not hard-coded duplicate maps.
8. The report is deterministic across input object key order.
9. Plan builder does not call any apply/write functions; enforce by pure module/no imports from host write modules.
10. The output is bounded to a small number of warnings.

Integration/documentation tests:

11. SO2 tests import `TURN_LEDGER_PERSIST_ORDER` and `LEDGER_DESCRIPTORS`.
12. `npm test` remains green.
13. UTF-8 docs validation remains green.

## 13. Deferred To SO3+

- Transaction executor.
- Rollback.
- Retry queue.
- Multi-ledger atomicity.
- Two-phase commit.
- Savepoint/checkpoint integration.
- Webview apply buttons.
- State Orchestrator host command.
- World Intent operation payload planning.
- Migration plans beyond read-only diagnostics.
- Visual transaction graph.

## 14. Implementation Prompt

```markdown
LoreRelay State Orchestrator SO2 Transaction Planning Gate implementation.

推奨モデル: Grok / Codex
推奨推論: High

Read first:
1. AI_SHARED_LOG.md Current Snapshot
2. CHANGELOG.md [Unreleased]
3. docs/STATE_ORCHESTRATOR_SO1_DESIGN.md
4. docs/STATE_ORCHESTRATOR_SO2_TRANSACTION_PLANNING_GATE.md
5. src/stateOrchestratorDescriptorCore.ts
6. src/turnLedgerPersistCore.ts
7. src/statePatch.ts

Task:
Implement SO2 as a pure transaction planning report only.

Scope:
- Add `src/stateOrchestratorPlanCore.ts`.
- Use existing `LEDGER_DESCRIPTORS` and `TURN_LEDGER_PERSIST_ORDER`.
- Build deterministic `StateTransactionPlan` for `gm_turn`.
- Add focused tests in `scripts/test_state_orchestrator_plan_core.js`.

Forbidden:
- No file writes.
- No call to apply/persist functions.
- No `statePatch.ts` behavior change.
- No `TurnResult.ts` change.
- No Webview/Remote/Replay/GM prompt wiring.
- No transaction executor or rollback.

Verification:
- npm run compile
- node scripts/test_state_orchestrator_plan_core.js
- npm test
- node scripts/validate_utf8_docs.js
```

## 15. Acceptance Criteria

SO2 is accepted when a developer can ask:

```text
If this GM turn has discovery/resource/settlement/vehicle side effects,
what ledger writes would LoreRelay plan, in what order, and under what failure policy?
```

And the answer is produced by a pure function without changing runtime persistence.
