# State Orchestrator SO1 Ledger Descriptor Inventory Design

> Status: Design proposal / Codex gate.
> Date: 2026-07-04.
> Depends on: World Intent WI1-WI7b, existing per-ledger queues, and current `turnLedgerPersistCore.ts`.
> Scope: observation-only ledger descriptor inventory and consistency tests.

## 1. Why SO1 Exists

LoreRelay now has many independent write paths:

- `game_state.json`
- `world_state.json`
- `vehicle_state.json`
- `settlement_layout.json`
- `campaign_resources.json`
- `discoveries.json`
- `npc_registry.json`
- `party.json`
- character files
- memory/session/profile files
- migration backups

The project has stayed stable by keeping each write path local and gated. That remains correct. But as the number of ledgers grows, the project needs one common place to answer:

```text
What ledgers exist?
Who owns each write?
Is it queued?
Is it atomic?
What is its failure policy?
Is it part of GM turn commit?
```

SO1 is the first State Orchestrator phase, but it is intentionally read-only.

It does not orchestrate writes. It inventories them.

## 2. Decision

Approved design direction:

- add a pure descriptor registry for known ledger write surfaces;
- describe existing behavior, do not change it;
- add consistency checks that compare descriptor claims with known constants such as `TURN_LEDGER_PERSIST_ORDER`;
- expose a bounded report for tests and future host diagnostics;
- do not move any existing write path under a new orchestrator yet.

SO1 is a map, not an engine.

## 3. Non-Goals

SO1 must not:

- write files;
- change write order;
- change queues;
- modify `statePatch.ts`;
- modify `TurnResult.ts`;
- modify `turnLedgerPersistCore.ts`;
- wrap `writeJsonAtomic`;
- replace `workspaceStateQueue.ts`;
- introduce transaction plans;
- introduce rollback;
- run during GM turn processing;
- add Webview controls;
- connect to Remote Play;
- migrate old saves;
- make World Intent authoritative.

## 4. Core Concept: Ledger Descriptor

Recommended pure module:

```text
src/stateOrchestratorDescriptorCore.ts
```

Recommended type:

```ts
export type LedgerWriteOwner =
    | 'game_state'
    | 'world_state'
    | 'discovery'
    | 'campaign_resources'
    | 'settlement_layout'
    | 'vehicle_state'
    | 'npc_registry'
    | 'character'
    | 'party'
    | 'migration'
    | 'settings'
    | 'session'
    | 'other';

export type LedgerWritePhase =
    | 'gm_turn_primary'
    | 'gm_turn_secondary'
    | 'simulation_tick'
    | 'user_command'
    | 'migration_command'
    | 'import_export'
    | 'background_async';

export type LedgerFailurePolicy =
    | 'abort_before_commit'
    | 'retain_primary_report_partial'
    | 'skip_and_warn'
    | 'best_effort'
    | 'manual_reconcile';

export interface LedgerDescriptor {
    id: string;
    owner: LedgerWriteOwner;
    fileNamePattern: string;
    phase: LedgerWritePhase;
    canonicalModule: string;
    atomicWrite: boolean;
    serializedQueue?: string;
    participatesInTurnLedgerOrder: boolean;
    turnLedgerOrderKey?: string;
    failurePolicy: LedgerFailurePolicy;
    backupPolicy: 'none' | 'optional_bak' | 'strict_timestamped';
    circuitBreaker: 'none' | 'game_state' | 'world_state';
    notes?: string;
}
```

This is metadata only. It must not include function pointers or execute writes.

## 5. Initial Descriptor Set

SO1 should start with the ledgers that already have explicit turn or queue semantics:

| Descriptor id | File | Existing owner |
|---|---|---|
| `game_state` | `game_state.json` | `stateManager.ts` / `statePatch.ts` |
| `discoveries` | `discoveries.json` | `discoveryTurnOps.ts` |
| `campaign_resources` | `campaign_resources.json` | `campaignResourceTurnOps.ts` |
| `settlement_layout` | `settlement_layout.json` | `settlementLayoutTurnOps.ts` |
| `vehicle_state` | `vehicle_state.json` | `vehicleTurnOps.ts` / `mobileBaseTurnOps.ts` |
| `world_state` | `world_state.json` | `worldState.ts` |
| `npc_registry` | `npc_registry.json` | `npcRegistry.ts` |
| `migration_vehicle_writeback` | `vehicle_state.json` + backups | WI7 |
| `migration_vehicle_restore` | `vehicle_state.json` + restore backups | WI7b |

Do not attempt to catalog every minor config/session file in SO1. Add them later once the main ledger map is stable.

## 6. Turn Ledger Order Consistency

`turnLedgerPersistCore.ts` currently defines:

```text
game_state
discoveries
campaign_resources
settlement_layout
vehicle_state
```

SO1 must not change this order.

SO1 should provide a pure check:

```ts
export function checkTurnLedgerDescriptorOrder(input: {
    descriptors: readonly LedgerDescriptor[];
    turnOrder: readonly string[];
}): StateOrchestratorDescriptorIssue[];
```

It should report:

- descriptor says it participates in turn order but has no key;
- key exists in descriptor but not in `TURN_LEDGER_PERSIST_ORDER`;
- `TURN_LEDGER_PERSIST_ORDER` key has no descriptor;
- duplicate turn order keys;
- descriptor order disagrees with the constant.

The check is diagnostic only.

## 7. Queue Consistency

SO1 should describe existing queue ownership:

| Ledger | Queue |
|---|---|
| `game_state` | `runSerializedGameStateMutation` |
| `world_state` | `runSerializedWorldStateMutation` |
| `discoveries` | `runSerializedDiscoveryMutation` |
| `campaign_resources` | `runSerializedCampaignResourcesMutation` |
| `settlement_layout` | `runSerializedSettlementLayoutMutation` |
| `vehicle_state` | `runSerializedVehicleStateMutation` |

SO1 must not enforce these queues at runtime in the first phase.

It may add tests that the descriptor registry names the known queue functions. This is a maintenance tripwire, not an orchestrator.

## 8. Failure Policy Inventory

SO1 should encode existing policy:

```text
game_state primary commit failure -> abort turn side-ledgers
side-ledger failure after game_state -> retain game_state, report partial
world_state circuit breaker -> skip/open circuit where existing code already does
migration writeback -> strict backup before write, manual reconcile on failure
migration restore -> strict pre-restore backup before write
```

The descriptor should match existing behavior. If behavior and descriptor disagree, fix the descriptor first unless a separate gate approves behavior change.

## 9. Report Shape

Recommended report:

```ts
export type StateOrchestratorDescriptorSeverity = 'info' | 'warning' | 'error';

export interface StateOrchestratorDescriptorIssue {
    severity: StateOrchestratorDescriptorSeverity;
    code: string;
    descriptorId?: string;
    message: string;
}

export interface StateOrchestratorDescriptorReport {
    version: 1;
    descriptorCount: number;
    issues: StateOrchestratorDescriptorIssue[];
}
```

Issues must be bounded and deterministic.

## 10. Relationship with World Intent

World Intent answers:

```text
What action is being requested, and would it be valid?
```

State Orchestrator descriptors answer:

```text
If an existing subsystem writes, what ledger surface does it use?
```

SO1 must not turn `WorldIntent.execute()` into persistence.

Later phases may connect intent execution results to orchestrator transaction plans. SO1 does not.

## 11. Relationship with Migration WI6-WI7b

WI6-WI7b are good first examples of explicit ledger ownership:

- preview is read-only;
- write-back is strict backup + atomic write;
- restore is manual + pre-restore backup.

SO1 should include migration descriptors as user-command phase entries. It must not absorb migration logic or broaden it to all ledgers.

## 12. Relationship with AI Command Tower

AI Command Tower coordinates human/AI work.

SO1 describes runtime write surfaces.

The two may cross-reference each other, but SO1 must be source-code-level metadata and tests, not prose-only policy.

## 13. Files Allowed

SO1 implementation may add/change:

- `src/stateOrchestratorDescriptorCore.ts`;
- `scripts/test_state_orchestrator_descriptor_core.js`;
- optionally `docs/STATE_ORCHESTRATOR_SO1_DESIGN.md`;
- `CHANGELOG.md`;
- `AI_SHARED_LOG.md`;
- `package.json` / `scripts/run_all_tests.js` for test registration.

## 14. Files Forbidden

SO1 must not modify:

- `src/statePatch.ts`;
- `src/types/TurnResult.ts`;
- `src/turnLedgerPersistCore.ts`;
- `src/workspaceStateQueue.ts`;
- `src/workspacePaths.ts`;
- any Webview module;
- Remote Play handlers;
- replay/export writers;
- GM prompt builders.

If a test needs `TURN_LEDGER_PERSIST_ORDER`, import it read-only.

## 15. Required Tests

Add tests for:

1. descriptor ids are unique;
2. all descriptors have bounded non-empty ids, owners, file patterns, phases, modules;
3. all `participatesInTurnLedgerOrder` descriptors have `turnLedgerOrderKey`;
4. `TURN_LEDGER_PERSIST_ORDER` keys are covered by descriptors;
5. descriptor turn order matches `TURN_LEDGER_PERSIST_ORDER`;
6. duplicate order keys are reported;
7. unknown order keys are reported;
8. known queue names are listed for queued ledgers;
9. migration descriptors use `strict_timestamped` backup policy;
10. side-ledger descriptors use `retain_primary_report_partial` where appropriate;
11. report issues are bounded and deterministic;
12. pure core imports no `fs`, `vscode`, or DOM;
13. no runtime write modules are modified;
14. `npm run compile`;
15. `npm test`;
16. `node scripts/validate_utf8_docs.js`.

## 16. Findings Table

| Severity | Issue | Recommendation |
|---|---|---|
| P0 | "State Orchestrator" can become a rewrite of persistence. | SO1 is descriptor inventory only; no write path changes. |
| P0 | Changing ledger order can alter gameplay persistence semantics. | SO1 imports order read-only and tests descriptor parity. |
| P1 | Descriptor drift can create false confidence. | Add tests against current constants and known queues. |
| P1 | Function-pointer registries can accidentally execute writes. | Metadata only; no function references. |
| P2 | Cataloging every small file at once creates noise. | Start with main ledgers and migration surfaces only. |

## 17. Grok Implementation Prompt

```markdown
LoreRelay State Orchestrator SO1 Ledger Descriptor Inventory を実装してください。
推奨モデル: Grok / Codex
推奨推論: High

必読:
1. AI_SHARED_LOG.md の Current Snapshot
2. CHANGELOG.md の [Unreleased]
3. docs/STATE_ORCHESTRATOR_SO1_DESIGN.md
4. docs/AI_COMMAND_TOWER_DESIGN.md §12
5. docs/WORLD_INTENT_CORE_DESIGN.md §3/§17
6. src/turnLedgerPersistCore.ts
7. src/workspaceStateQueue.ts
8. src/statePatch.ts は読むだけ

目的:
State Orchestrator の最初の段階として、既存 ledger write surface を記述する pure descriptor registry と consistency checks を追加してください。

絶対条件:
- write path は変更しない。
- ledger order は変更しない。
- queue 実装は変更しない。
- `statePatch.ts` / `TurnResult.ts` / `turnLedgerPersistCore.ts` / `workspaceStateQueue.ts` を変更しない。
- Webview / Remote / Replay / GM prompt に接続しない。
- transaction plan / rollback / orchestrated write は実装しない。

推奨実装:
- add `src/stateOrchestratorDescriptorCore.ts`
- export descriptor list and `buildStateOrchestratorDescriptorReport`
- include descriptors for game_state, discoveries, campaign_resources, settlement_layout, vehicle_state, world_state, npc_registry, WI7 writeback, WI7b restore
- add `scripts/test_state_orchestrator_descriptor_core.js`

必須テスト:
docs/STATE_ORCHESTRATOR_SO1_DESIGN.md §15 を満たしてください。

完了条件:
- npm run compile
- npm test
- node scripts/validate_utf8_docs.js
- CHANGELOG.md / AI_SHARED_LOG.md 更新
```

