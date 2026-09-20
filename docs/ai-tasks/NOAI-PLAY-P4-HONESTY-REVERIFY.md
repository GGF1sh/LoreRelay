# NOAI-PLAY-P4 Honesty Re-Verification

Independent verification of the P4 contention evidence honesty repair.

## Identity

| Item | Value |
|------|--------|
| Canonical repository | `C:\AI\text-adventure-vsce` |
| Verification worktree | `C:\AI\wt-noai-play-p4-honesty-reverify` |
| Verification branch | `task/NOAI-PLAY-P4-honesty-reverify` |
| Base (candidate tip) | `63dcc13e36cc5985fb58a5f4979208c6e4897ad9` |
| `origin/main` | `b5a5789e3e96991cd298eed7024589acfccbebcd` |
| Previous candidate tip | `0ee1fc260837ca07ae08bd231563ed8a707089ea` |
| Previous independent finding | `bff0faf5dbf312ba7455be2e1ae23af81126a06c` |
| Expected version | `1.80.0` (confirmed) |

## 1. Lineage and change scope

Confirmed:

- `origin/main` is exactly `b5a5789e3e96991cd298eed7024589acfccbebcd`
- Candidate tip is exactly `63dcc13e36cc5985fb58a5f4979208c6e4897ad9`
- Package version is exactly `1.80.0`
- Fresh worktree started clean at candidate tip
- `970c8c697208a0c4ba3ce7b271ca5a1ca2638189` parent is `0ee1fc260837ca07ae08bd231563ed8a707089ea` (`test: make P4 contention evidence source-true`)
- `63dcc13e36cc5985fb58a5f4979208c6e4897ad9` parent is `970c8c697208a0c4ba3ce7b271ca5a1ca2638189` (`docs: correct P4 repair evidence`)
- `970c8c6` changes only: `scripts/run_noai_play_p4_fixtures.js`
- `63dcc13` changes only: `docs/ai-tasks/NOAI-PLAY-P4-REPAIR.md`

Two-commit honesty repair lineage:

```
0ee1fc2 (previous candidate tip)
   └─ 970c8c6 test: make P4 contention evidence source-true
         └─ 63dcc13 docs: correct P4 repair evidence  ← candidate tip / reverify base
```

## 2. Exact proof scope (source-truth)

Inspected final `cross_action_travel_contention` in `scripts/run_noai_play_p4_fixtures.js`.

### Claimed and emitted proof kind

- Fixture evidence returns `proofKind: "generic_shared_gate_exclusion"`.
- Comments and assertions describe gate-slot occupation by deterministic holders, not production mid-flight mutation overlap.

### No longer claims

The fixture and report do **not** claim:

- real persisted P2 mutation active mid-flight
- real confirmed P3 mutation active mid-flight
- real P4 disk write paused mid-flight
- production mutation internal overlap

Active holders in cases A–D are deferred deterministic gate holders (`shared.run(..., async () => { await hold.promise; ... })`), not production cores executing mutation.

### Does prove

| Scenario | Proven behavior |
|----------|-----------------|
| A | `shopkeeper_trade` slot occupied → production P4 callback rejected with `WORLD_MUTATION_IN_PROGRESS`; `p4Entered === 0`; zero authoritative writes |
| B | `end_day` slot occupied → production P4 callback rejected; `p4Entered === 0` |
| C | `market_travel` slot occupied → production P2 callback rejected; `p2Entered === 0` |
| D | `market_travel` slot occupied → production P3 callback rejected; `p3Entered === 0` |
| D + B | Workspace B independent P4 completes while A holds a slot |
| Invariants | Same-workspace slot occupancy effectively 1; rejected P4 does not change world turn / credits |

Production loser paths are wired via:

- `runP2` → `executeShopkeeperTrade(...)`
- `runP3` → `executeEndDay(requestId, true, deps)` (**confirmed** production signature)
- `runP4` → `executeMarketTravel(...)`

Rejected production callbacks are never entered (per-case entry counters asserted to `0`).

### Entry-counter arithmetic

Evidence field:

```js
rejectedCallbackEntryCount: p2Entered + p3Entered + p4Entered - 1
```

Runtime path:

- All four rejected production callbacks leave counters at 0.
- One allowed workspace-B P4 enters (`p4Entered` becomes 1).
- Therefore `rejectedCallbackEntryCount = 0 + 0 + 1 - 1 = 0`.

The `-1` excludes the single allowed workspace-B entry from the rejected-callback count. Assertions enforce rejected callbacks are never entered, so the arithmetic is source-true when the fixture passes.

No demand is made for production mid-flight contention after the report explicitly limits the claim to generic shared-gate exclusion.

## 3. Report honesty

`docs/ai-tasks/NOAI-PLAY-P4-REPAIR.md` accurately states:

- Active holders are deterministic gate holders, not mid-flight production mutations
- Rejected production callbacks are wired and never entered (entry counters)
- Active production mutation mid-flight contention is not directly exercised
- Generic shared-gate exclusion / shared gate identity is the claimed proof
- `game_state` location/commerce invariants use temporary disk state
- `worldTurn` / market invariants use the in-memory world harness
- No temporary `world_state.json` disk proof is claimed
- Full-suite environment used process-scoped PSModulePath

No remaining materially false “real active mutation” claim was found in the repair report or the contention fixture comments/assertions/evidence.

## 4. Closed blocker regression

Unchanged and still valid (source inspection + focused tests exit 0):

| Blocker area | Status |
|--------------|--------|
| UI shows correct `旅に出る` | Pass (`test_market_travel_core.js` + module/bundle asserts) |
| No known mojibake markers (`譌`/`蜃`/`繧`/`證`) | Pass |
| Duplicate request uses production `executeMarketTravel` | Pass |
| Duplicate request writes exactly once (`commitCount === 1`) | Pass |
| Same `requestId` with changed destination bound to original receipt | Pass (`r2.destination.id === 'south_port'`) |
| Same/unknown rejection writes zero times | Pass |
| Persistence failure releases gate | Pass (`travel_persistence_failure`) |
| Reload uses new request gate + disk reread | Pass (`travel_reload_persistence`) |
| Temporary workspaces clean up | Pass (`finally` + `tempWorkspaceCleaned: true`) |

## 5. Focused tests

All exit 0:

- `npm run build:webview`
- `npm run compile`
- `node scripts/test_market_travel_core.js`
- `node scripts/run_noai_play_p4_fixtures.js`
- `node scripts/test_deterministic_workspace_mutation_gate.js`
- `node scripts/test_shopkeeper_direct_trade_core.js`
- `node scripts/test_shopkeeper_repair.js`
- `node scripts/test_end_day_world_progression.js`
- `node scripts/run_noai_play_p3_fixtures.js`
- `node scripts/test_webview_bundle.js`
- `node scripts/test_webview_world_modules.js`

### P4 fixture emitted JSON

```json
{"fixtures":["successful_market_travel","same_location_rejection","unknown_destination_rejection","duplicate_request_travel","cross_action_travel_contention","travel_persistence_failure","travel_reload_persistence"],"count":7,"tempWorkspaceCleaned":true}
```

Confirmed from emission:

- `count = 7`
- `tempWorkspaceCleaned = true`

Confirmed from fixture source evidence + successful assertions (nested evidence is stored on the internal `fixtures` array but only fixture IDs are printed at top level):

- `proofKind = generic_shared_gate_exclusion`
- `rejectedCallbackEntryCount = 0` (arithmetic and per-case entry asserts)

## 6. Canonical gates

All exit 0; version `1.80.0`:

- `node scripts/check_i18n_keys.js`
- `npm run check:symbol-registry`
- `node scripts/check_version_consistency.js`

Build dirt restored before this verification document commit (`webview/script.js`, `webview/style.css`, `webview/vendor/mermaid.min.js`).

## 7. Independent full suite

Process-scoped Windows PowerShell module path only:

```text
PSModulePath = $HOME\Documents\WindowsPowerShell\Modules;
  $env:ProgramFiles\WindowsPowerShell\Modules;
  $env:SystemRoot\System32\WindowsPowerShell\v1.0\Modules
```

`powershell.exe -NoProfile -Command "Get-Command Get-FileHash"` → Function `Get-FileHash` Version `3.1.0.0` Source `Microsoft.PowerShell.Utility`.

| Item | Result |
|------|--------|
| Command | `npm test` once |
| Manifest | 246 scripts |
| Result | `Passed: 246/246` |
| Exit code | 0 |
| Failed scripts | 0 |
| External log | `C:\AI\logs\noai-play-p4-honesty-reverify-full-suite.log` |

## 8. Limitations

- No live installer was run.
- No human smoke testing.
- No live player workspace was touched.
- Main was not modified or merged.
- Implementation and production tests were not modified in this verification worktree (only this document is added).
- Nested fixture evidence fields (`proofKind`, `rejectedCallbackEntryCount`) are proven by source return value and assertions; top-level console JSON prints fixture IDs, `count`, and `tempWorkspaceCleaned` only.

## 9. Final verdict

**`NOAI_PLAY_P4_HONESTY_REVERIFY_PASS`**

Contention evidence is source-true as generic shared-gate exclusion; the repair report matches the fixture; closed blockers still hold; focused tests, canonical gates, and the independent full suite all pass at version `1.80.0`.
