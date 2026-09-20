# NOAI-PLAY-P3 Shared Mutation Repair

## Identity

- Exact `origin/main`: `b7fccbeab75e2c86fe0a5b780069f6b9bbd66880`
- P3 implementation: `5a4853170f746dccaa9a95630d485272070b3d28` (parent is exact main)
- P3 publish revalidation: `aab29b8ebeb600127638db1bcbd61dd4501fc3ab` (parent is exact implementation)
- Independent verification evidence: `5fd6fb58a780710229cee7751ab316f821001199` (docs-only, parent is exact main, not candidate ancestry)
- Repair implementation: `5878c5ca953c32cec617e2bcc02102124a4553c9`
- Repair branch: `task/NOAI-PLAY-P3-shared-mutation-repair`
- Version: `1.79.0` (unchanged)

The repair branch was created in a fresh isolated worktree directly from the published P3 tip. No merge, rebase, cherry-pick, installer run, live-world access, AI/Relay gameplay, network gameplay, P4 travel, or P2/P3 UI redesign occurred.

## Blocker reproduction

Independent verification established that `shopkeeperRequestGate` and `endDayRequestGate` independently prevented duplicate requests of their own action kind but did not exclude each other. A pending P2 shopkeeper trade and P3 end-day could therefore both enter their canonical state read/mutation/persistence paths for one workspace. Both paths write `game_state.json` and `world_state.json`; the overlap permitted last-writer-wins loss of credits/cargo/stock/market recovery/world-turn data, interleaved dual-write sets, and contradictory success receipts.

The repair test begins each action while deliberately holding the other action's authoritative section. Before this repair, separate action gates alone could not reject that cross-action overlap. The new host-level gate makes the second action return `WORLD_MUTATION_IN_PROGRESS` before its instrumented canonical read.

## Shared-gate API and lifecycle

`src/deterministicWorkspaceMutationGate.ts` owns the narrow primitive:

```text
run(workspaceKey, { actionKind, requestId }, execute)
```

Results are `completed`, `busy`, or `failed`. Acquisition is synchronous before the callback is scheduled. State is keyed by canonical workspace identity; different workspaces use different entries. An occupied entry returns `busy` immediately—there is no queue, delayed retry, timeout, lease expiry, or wall-clock force unlock. The active owner is removed only in the owning callback's `finally` path. Throwing callbacks become a structured `failed` result and still release the entry.

The instance is extension/host scoped. It is deliberately not disposed when the webview panel closes, so panel lifecycle cannot unlock an in-flight mutation. Extension disposal clears remaining state as shutdown cleanup. The active map has no completed-result cache and therefore remains bounded by concurrently active workspace count. Existing P2/P3 request gates continue to own bounded request replay/coalescing.

## Lock placement and host wiring

The ordering for both actions is now:

```text
action request gate
  -> shared deterministic workspace mutation gate
     -> authoritative state read
     -> validation and mutation/simulation
     -> all required canonical persistence
     -> authoritative response construction
  -> display refresh and postMessage
```

### P2 shopkeeper

`shopkeeperRequestGate` remains the outer request-id authority. Its first execution attempts the shared gate with action kind `shopkeeper_trade`; only after acquisition does `executeLivingWorldDirectTrade` re-read rules, forge, game state, revision, location, world state, markets, and commerce. The shared gate remains held through `flushScheduledCommercePersist`, dual-write outcome evaluation, and receipt/rejection construction.

A cross-action conflict returns a terminal P2 rejection for that request ID:

```text
WORLD_MUTATION_IN_PROGRESS
別の操作を確定中です。
完了後に、もう一度操作してください。自動では再試行しません。
```

The same request ID replays that BUSY result; deliberate retry requires a new request ID. Quantity validation, production Commerce authority, quote/state revalidation, existing rejection codes, and persistence honesty remain in place. Display refresh occurs after the stable protected result exists.

### P3 end-day

`endDayRequestGate` remains the outer request-id authority. Its first execution attempts the same shared instance with action kind `end_day`; only after acquisition does `executeEndDay` perform its commit-time preview/state re-reads. The gate remains held through the exact one-step bulk simulation, Living World after-step/market cadence, game/world/NPC writes, persistence outcome, and receipt/failure construction.

A cross-action conflict returns the same terminal `WORLD_MUTATION_IN_PROGRESS` meaning. No simulation, market recovery, world-turn advance, canonical read, or write occurs for the rejected P3 request. Existing exact +1, quiet-day, persistence-honesty, replay, and refresh-after-persistence behavior remains unchanged.

## BUSY UI behavior

Both shipped P2 and P3 result handlers explicitly recognize `WORLD_MUTATION_IN_PROGRESS`. They display the host's Japanese busy explanation without success styling or automatic retry, clear the pending/processing state, retain stale-request correlation, and focus the next deliberate control. P2 returns focus to review; P3 re-enables/focuses confirm when its preview remains valid. Existing modal widths, wrapping, ordinary success, and other rejection rendering are unchanged. The canonical build regenerated and committed `webview/script.js`.

## Cross-action and lost-update evidence

`scripts/test_deterministic_workspace_mutation_gate.js` combines the real P2 request gate, real P3 request gate, and real shared gate around instrumented canonical state. It proves:

- P2 pending then P3: P2 executes once; P3 is BUSY before canonical read; no P3 write or turn advance.
- P3 pending then P2: P3 advances once; P2 is BUSY before canonical read; no trade delta.
- Near-simultaneous same-workspace requests: exactly one enters; max simultaneous protected mutations is 1.
- Same P2/P3 request IDs still coalesce pending work and replay completed results once.
- BUSY is cached by the relevant action gate and mutates nothing; a new request ID after completion succeeds.
- Separate workspaces enter concurrently without blocking each other.
- Throwing, complete-persistence-failure, and partial-persistence-failure paths release the shared gate and never return success.
- The sequential trade-then-day proof ends at credits 90, cargo 1, stock 11, world turn 1: neither trade stock nor recovery is overwritten, and the end-day snapshot preserves the trade.
- Same-workspace write order is one complete P2 `game_state`/`world_state` pair followed by one complete P3 pair; write sets do not interleave.

## Debug fixture

`cross_action_contention` was added to `scripts/run_noai_play_p3_fixtures.js`. It uses only a temporary workspace, resets canonical JSON, reruns the scenario, and requires identical evidence. Observed evidence:

```json
{"winner":"shopkeeper_trade","loser":"WORLD_MUTATION_IN_PROGRESS","tradeCount":1,"dayCount":0,"maxActive":1,"writes":["trade:game_state","trade:world_state"],"game":{"credits":90,"cargo":1,"worldTurnAtLastSync":0},"world":{"stock":9,"worldTurn":0}}
```

All six P3 fixture scenarios passed, including deterministic reset/rerun of `cross_action_contention`.

## Persistence failure and limitations

Complete and partial persistence outcomes remain failures and never produce authoritative success. The shared gate releases after each outcome and does not automatically retry. The existing split-brain health signal records partial dual-write risk, but it does not currently prohibit a later mutation. This repair does not invent rollback, reconciliation, or a new recovery subsystem; operators must still reconcile a workspace after a reported partial write. That post-partial-write risk remains an explicit limitation.

The primitive currently protects the P2 shopkeeper and P3 end-day authoritative paths requested here. It is not a universal action protocol, registry, event bus, transaction engine, or job scheduler.

P4 travel must acquire this same host-scoped shared gate around its authoritative read/mutation/persistence path; it must not add a competing lock or world-tick authority.

## Document correction

`docs/ai-tasks/NOAI-PLAY-P3-END-DAY-WORLD-PROGRESSION.md` was corrected narrowly. The original two failures were observed at child `git branch --show-current` with `fatal: detected dubious ownership`, before network access. The later publish revalidation and independent verification are identified as authoritative; the unsupported network-only diagnosis was removed.

## Validation

Focused commands and results:

| Command | Result |
| --- | --- |
| `node scripts/test_deterministic_workspace_mutation_gate.js` | PASS |
| `node scripts/test_shopkeeper_direct_trade_core.js` | PASS |
| `node scripts/test_shopkeeper_repair.js` | PASS |
| `node scripts/test_end_day_world_progression.js` | PASS |
| `node scripts/run_noai_play_p3_fixtures.js` | PASS — 6/6 scenarios |
| `node scripts/test_symbol_registry.js` | PASS |
| `node scripts/test_webview_bundle.js` | PASS |
| `node scripts/test_webview_world_modules.js` | PASS |

Canonical gates:

| Command | Result |
| --- | --- |
| `npm run build:webview` | PASS — 33 modules, 15,312-line `script.js` |
| `npm run compile` | PASS |
| `node scripts/check_i18n_keys.js` | PASS — 1,059 references, zero missing in all four locales |
| `npm run check:symbol-registry` | PASS — 4,044 entries, generated files current |
| `node scripts/check_version_consistency.js` | PASS — 1.79.0 |

The fresh worktree reused an existing validated `node_modules` tree through an ignored temporary junction; no dependency installer ran.

### Full suite

The full suite was invoked exactly once with process-scoped Git configuration only:

```text
GIT_CONFIG_COUNT=1
GIT_CONFIG_KEY_0=safe.directory
GIT_CONFIG_VALUE_0=C:/AI/wt-noai-play-p3-shared-mutation-repair
npm test
```

Observed manifest count: **245 scripts** (the verified 244-test baseline plus the new repair test). The process exited **1**. The tool capture was truncated before the runner's summary, so the exact failed entry and passed-count were not retained; this report does not guess them. The repair-specific test had already passed focused validation, and all safe directly affected checks listed above pass. A proposed direct rerun of the two installer fixture scripts was rejected because this task explicitly prohibits running the installer; no workaround or second full-suite run was attempted.

Because the required full-suite gate did not pass with a recoverable exact summary, the repair cannot be classified ready for verification in this run.

Final status: `NOAI_PLAY_P3_REPAIR_TEST_FAILED`
