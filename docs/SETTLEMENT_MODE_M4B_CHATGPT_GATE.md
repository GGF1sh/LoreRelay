# Settlement Mode M4b ChatGPT Apply Gate

Date: 2026-07-04 JST
Reviewer: Codex / ChatGPT
Status: **Approved for M4b persistence wiring** (narrow scope: `expand_layer` → `settlement_layout.json` only)

Prerequisites:

- M4a pure core implemented and passing (`src/settlementLayerExpansionCore.ts`, `scripts/test_settlement_layer_expansion_core.js`)
- M4 design gate approved M4a only: `docs/SETTLEMENT_MODE_M4_CHATGPT_GATE.md`
- Repository baseline: `package.json` version `1.71.0`, tests `147/147`

This gate reviews whether LoreRelay may persist `turn_result.settlementOps.expand_layer` to disk.
It does **not** authorize code changes; it defines the contract for Grok/Codex M4b implementation.

## Findings

| Severity | Finding | Decision |
|---|---|---|
| Critical | Webview or renderer direct writes would bypass turn_result / commit ordering. | M4b writes only from `statePatch` post-`commitGameState` ledger phase. No Webview disk writes. |
| Critical | Broad `settlementOps` apply would widen M1 stubs into untested dual-write surfaces. | M4b applies **only** `expand_layer`. All other `settlementOps` types remain parse-only stubs. |
| High | Combining layout writes with `game_state` / `world_state` / `settlement_state` risks split-brain. | M4b writes **only** `settlement_layout.json`. No dual-write, no other canonical files. |
| High | Persistence before M4a proof would skip bounded pure-core validation. | M4a exists and passes tests. M4b may proceed under this gate. |
| High | Missing feature gate would persist layout when Settlement Mode is OFF. | Apply runs only when `enableSettlementMode === true` (`settlementModeEnabled`). |
| High | Unserialized concurrent writes to `settlement_layout.json` can corrupt JSON. | Add per-file FIFO queue `runSerializedSettlementLayoutMutation` (discovery/campaign pattern). |
| Medium | Loader cache can serve stale layout inside queued mutation. | Use fresh disk read (`readSettlementLayoutFromDisk`) inside the queue callback; clear layout cache after successful write. |
| Medium | `settlement_state.json` is gameplay canonical; layout apply needs settlement id context. | Read `settlement_state.json` for apply context only; **never write** it in M4b. |
| Medium | Ledger failure after `game_state` commit must not rollback committed gameplay. | Follow `CROSS_LEDGER_COMPENSATION_POLICY`: retain `game_state`, log partial persist, surface failed targets. |
| Medium | Circuit breaker on every file adds complexity without proven failure storms on layout file. | **No circuit breaker** on `settlement_layout.json` (match `discoveries.json` / `campaign_resources.json`). |
| Low | `TurnResult` type lacks `settlementOps` field today. | Add typed `settlementOps` to `TurnResult`; wire through `statePatch` ledger phase. |
| Low | No-op expansions (layer exists, caps) should not touch disk. | Skip `writeJsonAtomic` when serialized before/after JSON is identical or no op applied. |

## Final M4b Persistence Contract

M4b adds **one** post-commit ledger target:

> When Settlement Mode is ON and `turn_result.settlementOps` contains valid `expand_layer` ops,
> apply them in memory via M4a `applyExpandLayerToLayout`, then persist the result to
> `settlement_layout.json` through the workspace queue and atomic write helper.

### Allowed write target

| File | M4b action |
|---|---|
| `settlement_layout.json` | Read (fresh disk), merge `expand_layer`, atomic write |
| `settlement_state.json` | Read-only (apply context) |
| `game_state.json` | Already committed before ledger phase; never touched by M4b |
| `world_state.json` | Read-only (`worldTurn` for seed context); never written by M4b |
| `discoveries.json` / `campaign_resources.json` | Unchanged; existing ledger order preserved |

### Feature gate

```ts
settlementModeEnabled(loadGameRules()) === true
```

When OFF:

- `applySettlementLayoutTurnOps` returns `false` immediately
- no queue enqueue
- no disk read/write
- malformed or valid `settlementOps` are ignored at apply layer (parse may still exist for prompts)

### Op filter (apply surface)

1. `parseSettlementOps(turnResult.settlementOps)` — existing M4a parser
2. Keep only `op.type === 'expand_layer'`
3. Drop all other settlement op types silently (they remain future work)
4. If filtered list is empty → return `false` (no persist attempt)

### Apply semantics

For each `expand_layer` op in order:

```ts
applyExpandLayerToLayout(currentLayout, settlementState, op, { worldTurn })
```

Rules:

- `settlementState` must load from disk; if absent/unparseable → return `false`, no write
- start `currentLayout` from `readSettlementLayoutFromDisk()` (undefined allowed — shell created in core)
- fold ops sequentially; last layout wins
- collect warnings in memory only (console debug optional; no new files)
- if **no** op returns `applied: true` and layout JSON unchanged → return `false`, no write
- if layout JSON changed → `writeJsonAtomic(layoutPath, nextLayout)`

### Turn ledger ordering

Extend `TURN_LEDGER_PERSIST_ORDER`:

```ts
['game_state', 'discoveries', 'campaign_resources', 'settlement_layout']
```

`game_state` commits in `commitGameState` **before** any ledger apply (unchanged).
`settlement_layout` runs **after** discovery and campaign_resources in the same
`persistTurnLedgersAfterCommit` call.

## Write Path

End-to-end path (host module, suggested name `settlementLayoutTurnOps.ts`):

```
turn_result.settlementOps
  → parseSettlementOps (settlementCore.ts)
  → filter expand_layer only (settlementLayoutTurnOpsCore.ts)
  → gate: settlementModeEnabled(loadGameRules())
  → gate: settlement state exists (loadSettlementState / readSettlementStateFromDisk)
  → runSerializedSettlementLayoutMutation(() => {
        layout = readSettlementLayoutFromDisk()
        state = readSettlementStateFromDisk()  // or load inside queue with fresh read
        worldTurn = loadWorldState()?.worldTurn
        next = applyExpandLayerOpsToLayout(layout, state, ops, { worldTurn })
        if JSON unchanged → return
        writeJsonAtomic(getSettlementLayoutPath(), next)
        clearSettlementLayoutCache()
        applied = true
     })
  → return applied
```

Suggested pure helper (`settlementLayoutTurnOpsCore.ts`):

```ts
export function filterExpandLayerOps(ops: SettlementOp[]): ExpandLayerOp[]
export function applyExpandLayerOpsToLayout(
  layout: SettlementLayoutV1 | undefined,
  state: SettlementStateV1,
  ops: ExpandLayerOp[],
  context: SettlementLayoutExpansionContext
): { layout: SettlementLayoutV1; anyApplied: boolean }
```

Pure core must not import `vscode` or `fs`.

### settlementState.ts additions

Mirror `discoveryLedger.ts`:

- `readSettlementLayoutFromDisk(layoutPath?)` — fresh parse, bypass cache
- `clearSettlementLayoutCache()` — invalidate layout cache only (split from `clearSettlementStateCache` if needed)

## Queue Contract

Add to `workspaceStateQueue.ts`:

```ts
const settlementLayoutQueue = createSyncFileQueue();

export function runSerializedSettlementLayoutMutation(fn: () => void): void {
    settlementLayoutQueue.enqueue(fn);
}
```

Properties:

- **FIFO** per `settlement_layout.json` (same as discovery/campaign)
- **Synchronous** enqueue; mutation runs on calling turn thread after `commitGameState` ok
- Extend `resetWorkspaceWriteQueueForTests()` and add `getSettlementLayoutWriteQueueDepthForTests()`

Do **not** route settlement layout through `runSerializedWorkspaceMutation` (deprecated combined path).

## Atomic Write Contract

Use existing `writeJsonAtomic(filePath, data)` from `workspacePaths.ts`:

- write `*.pid.timestamp.tmp` in same directory
- `renameWithRetrySync` to target
- no backup flag required for M4b (match discovery/campaign default)
- create parent directory if missing

No new atomic-write implementation in M4b.

## Circuit Breaker Decision

| Target | Queue | Circuit breaker |
|---|---|---|
| `game_state.json` | yes | yes |
| `world_state.json` | yes | yes |
| `discoveries.json` | yes | **no** |
| `campaign_resources.json` | yes | **no** |
| `settlement_layout.json` | yes | **no** |

Rationale: layout writes are low-frequency, single-file, post-commit side effects.
Discovery/campaign precedent is FIFO-only with try/catch inside mutation.
Do **not** add `settlement_layout` to `WorkspaceWriteTarget` circuit breaker union in M4b.

## Failure / Rollback / Compensation Behavior

### When `commitGameState` fails

- ledger phase skipped entirely (`shouldPersistTurnLedgersAfterCommit(false)`)
- no `settlement_layout.json` write
- unchanged from PR-D behavior

### When `commitGameState` succeeds but `settlement_layout` write fails

Follow `CROSS_LEDGER_COMPENSATION_POLICY`:

- **Do not** rollback `game_state.json`
- **Do not** modify `world_state.json` or `settlement_state.json`
- `applySettlementLayoutTurnOps` returns `false`
- `persistTurnLedgersAfterCommit` adds `'settlementLayout'` to `failedTargets`
- `statePatch` logs partial cross-ledger persist (extend existing `console.error` block)
- prior `settlement_layout.json` on disk remains unchanged (atomic write leaves original file intact on failure)

### Return `false` without error (expected no-op)

- Settlement Mode OFF
- no `settlementOps` or empty after parse
- no `expand_layer` ops after filter
- workspace path unavailable
- `settlement_state.json` missing
- all ops no-op (`applied: false`, JSON identical)

### Return `false` with warning (write attempted)

- `writeJsonAtomic` throws → catch, `console.warn('[settlementLayoutTurnOps] failed to save settlement_layout.json', e)`

### Partial multi-ledger outcome

If discovery succeeds and settlement layout fails (or vice versa):

- `partial: true`
- `failedTargets` lists only failed ledgers
- operator reconcile recommended; no automatic compensation transaction

## TurnResult Type Boundary

Add to `src/types/TurnResult.ts`:

```ts
/** Settlement Mode: layout expansion ops (settlementOps, max 8). M4b applies expand_layer only. */
settlementOps?: Array<{
    type: 'expand_layer';
    layerId: string;
    reason?: string;
    profile?: string;
    seed?: number;
}>;
```

(Other settlement op shapes may be added to the union later; M4b apply ignores them.)

Update `settlementCore.ts` prompt stub line when M4b lands:

- replace "not yet applied automatically" with "expand_layer persists to settlement_layout.json when Settlement Mode is ON"

## Required Tests

Grok M4b implementation must add tests before merge.

### 1. `scripts/test_settlement_layout_turn_ops_core.js` (pure)

- `filterExpandLayerOps` drops non-`expand_layer` ops
- `applyExpandLayerOpsToLayout` folds multiple ops in order
- no-op when layer already exists → `anyApplied: false`
- deterministic output matches M4a single-op tests
- missing/invalid ops in array are skipped via parser

### 2. `scripts/test_settlement_layout_turn_ops.js` (host / temp workspace)

Use temp directory pattern (mirror discovery/campaign host tests if present, or inline `fs` temp workspace):

| Case | Expect |
|---|---|
| Settlement Mode OFF | no file created/modified |
| malformed `settlementOps` | ignored, no write |
| valid `expand_layer`, mode ON | only `settlement_layout.json` changes |
| `game_state.json` / `world_state.json` / `settlement_state.json` | byte-identical before/after apply |
| write uses queue | `getSettlementLayoutWriteQueueDepthForTests` drains to 0 after apply |
| simulated `writeJsonAtomic` throw | returns false, original layout preserved |
| feature ON but no `settlement_state.json` | returns false, no layout write |

### 3. Extend `scripts/test_cross_ledger_partial_failure.js`

- `TURN_LEDGER_PERSIST_ORDER` ends with `settlement_layout` after `campaign_resources`
- `persistTurnLedgersAfterCommit` handles `settlementLayout` attempted/applied/failed
- partial failure: discovery ok + settlement layout fail → `partial: true`, `failedTargets` includes `settlementLayout`
- compensation policy still forbids `game_state` rollback

### 4. Regression

- `scripts/test_settlement_layer_expansion_core.js` unchanged and passing
- `npm test` aggregate includes new scripts
- `npm run compile`

## Implementation Checklist For Grok

1. `src/settlementLayoutTurnOpsCore.ts` — filter + fold apply (pure)
2. `src/settlementLayoutTurnOps.ts` — host apply with queue + atomic write
3. `src/settlementState.ts` — `readSettlementLayoutFromDisk`, `clearSettlementLayoutCache`
4. `src/workspaceStateQueue.ts` — settlement layout queue + test hooks
5. `src/turnLedgerPersistCore.ts` — extend order, targets, outcome, input
6. `src/statePatch.ts` — wire `applySettlementLayoutTurnOps` into ledger phase
7. `src/types/TurnResult.ts` — `settlementOps` field
8. `scripts/test_settlement_layout_turn_ops_core.js`
9. `scripts/test_settlement_layout_turn_ops.js`
10. Extend `scripts/test_cross_ledger_partial_failure.js`
11. Register tests in `scripts/run_all_tests.js`
12. `CHANGELOG.md` Unreleased + `AI_SHARED_LOG.md`
13. Version bump (suggested `1.72.0`)

Do **not** in M4b:

- apply non-`expand_layer` settlement ops
- add Webview write handlers
- add circuit breaker for settlement layout
- write `settlement_state.json`
- change M3 renderer behavior (read-only display after layout exists)

## Explicit Non-Goals

- No full geology / infinite underground / mining simulation
- No tile grid persistence or freeform editor
- No pathfinding or resident simulation
- No Three.js / 3D
- No direct Webview disk writes
- No combined game/world/settlement dual-write transaction
- No automatic `game_state` rollback on layout failure
- No circuit breaker on `settlement_layout.json` (defer unless ops telemetry proves need)
- No apply for `set_score`, `adjust_stock`, `add_incident`, merchants, visitors, structure notes
- No UX preview/request flow (Claude M4 UI — after M4b boundary stable)

## Verification (post-implementation)

```powershell
cd C:\AI\text-adventure-vsce
npm run compile
node scripts/test_settlement_layer_expansion_core.js
node scripts/test_settlement_layout_turn_ops_core.js
node scripts/test_settlement_layout_turn_ops.js
node scripts/test_cross_ledger_partial_failure.js
npm test
node scripts/validate_utf8_docs.js
```

## Handoff To Grok

Read before implementing:

1. `docs/SETTLEMENT_MODE_M4_DESIGN.md` §6 Persistence Boundary
2. `docs/SETTLEMENT_MODE_M4_CHATGPT_GATE.md` (M4a approval)
3. **this file** (M4b approval)
4. `src/settlementLayerExpansionCore.ts` (M4a apply primitive)
5. `src/discoveryTurnOps.ts` + `src/campaignResourceTurnOps.ts` (host mirror)
6. `src/turnLedgerPersistCore.ts` + `src/statePatch.ts` (ledger wiring)
7. `src/workspaceStateQueue.ts` (queue pattern)

The key instruction: M4b persists **one bounded operation** to **one file** through the
existing post-commit ledger discipline. It does not turn LoreRelay into a digging simulator
or widen settlementOps apply beyond `expand_layer`.