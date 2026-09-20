# GAME-ACTION-DRIVER-V1-COMMERCE

Status: implemented; High Risk local verification passed. Risk: **High**.
Integration evidence and final exact-head/main CI: [PR #100](https://github.com/GGF1sh/LoreRelay/pull/100).
Base: `32529df244937f3858064a6ecd2c0785eb8ed9ab`.
Branch: `feat/GAME-ACTION-DRIVER-V1-COMMERCE`.
Contract: [Automation Control Plane V1](LORERELAY-AUTOMATION-CONTROL-PLANE-V1.md).

## Scope and resolved seams

- Shopkeeper production runs `executeLivingWorldDirectTrade`, then
  `flushScheduledCommercePersist`, checking both game and world writes. The pure
  `executeShopkeeperTrade(... persistenceOk)` path is not persistence evidence.
- Travel runs `executeMarketTravel` and `commitGameState`; the existing contract is
  zero elapsed world turns and no fixed cost. The shadow travel adapter is not used.
- End day runs `executeEndDay`, one `runBulkWorldSimulation` step with the Living World
  cadence, and the existing game/world/NPC persistence owners.
- All three use the same Host workspace mutation gate as other canonical operations.
  The new service acquires it once, not through nested per-action locks.
- Destination publication uses existing `normalizeFogWorldState`/`buildFogPayload`:
  locations in discovered regions, plus explicitly visited/current locations. No new
  discovery store. The production market catalog is intersected with that projection.
- Trade preview reads game state and `readWorldStateSnapshotReadOnly`, resolves the
  same commerce forge and initialized-market fallback, and calls `executeDirectTrade`
  on copies. It does not schedule persistence or allocate a trade event ID.
- Existing Accepted Turn scope supplies `campaignInstanceId` and `timelineEpochId`.
  Restore rotates the epoch under the shared gate before the mutation. Read-only
  scope loading plus canonical fingerprints invalidate old previews; no new timeline
  or checkpoint automation is introduced.

## Acceptance

The fixed-catalog CLI runs an entire scenario in one owned disposable workspace:

```
node scripts/run_action_scenario.js --list
node scripts/run_action_scenario.js --describe merchant_route_v1
node scripts/run_action_scenario.js --scenario merchant_route_v1 --format json
```

Only read_player_view, query_available, preview, execute, wait_receipt,
assert_receipt, assert_state and expect_rejection are allowed. Finite steps and time
bounds; no expressions, shell, arbitrary imports, workspace option or JSON patch.
Setup copies the approved fixture; subsequent mutations use the shared service.
Stdout is JSON; safe progress/errors use stderr. Reports include code SHA, fixture,
scenario, receipts and assertions. Volatile paths/timing/tokens are not game digests.

Tests must cover preview invariance, real disk persistence, credits/cargo/market stock,
one travel and one world step, invalid/funds/stale/busy failures, exact replay, changed
payload collisions, hidden-only hash stability, trusted-context forgery, foreign or
expired confirmation, epoch change, partial/unknown outcomes and bounded wait.

## Evidence

- Preflight and continuation: GitHub main equals the exact base; open PR count 0;
  no remote implementation branch. Base CI run `33967689029` succeeded.
- Existing dirty primary checkout preserved. The dedicated worktree is reused.
- Previous phase stopped at its explicit exploration budget; no product blocker was
  established. Continuation authorizes the three bounded seam questions and delivery.
- Test Console at `a132c9d867c771f373f04f3e720bdc29acc82f3a`: complete plan,
  zero unknown files; **28 passed, 0 failed, 0 skipped** (25 focused plus boundaries).
  The Console does not select a full suite here; High Risk independently requires it.
- `test_game_action_commerce.js` passes against real production persistence owners.
  It verifies preview byte invariance, disk-reloaded credits/cargo/stock, travel/day,
  forged contexts and authority fields, delegated capabilities, consent separation,
  foreign handles/receipts, stale canonical and timeline witnesses, replay and
  retention expiry, shared-gate busy, wait timeout without release, partial writes,
  exceptions after commit, and the human adapter's refresh-warning classification.
- The fixed merchant scenario passes twice with identical gameplay digest. CLI
  workspace/script/eval/path inputs are rejected. The fixture starts at 20 credits;
  buying one wheat costs 9 and leaves 11. The insufficient-funds case verifies the
  actual `INSUFFICIENT_CREDITS` code (not merely any rejection).
- Rendered functional smoke: Chromium `152.0.7977.76`, actual built Webview HTML/JS/CSS
  and Japanese locale, connected in the test process to the production human adapter
  and owned fixture. Actual buttons execute purchase, published travel and end day;
  20→11 credits, `north_farm`→`elda_shop`, world turn 0→1, zero page exceptions.
  Local artifacts: `.test-runs/commerce-rendered-smoke.json` and
  `.test-runs/commerce-rendered-smoke.png`. This test exposes no server game-control
  endpoint and adds no live Extension QA bridge to the product.
- Windows native Computer Use initialization failed before any input with
  `windows sandbox failed: helper_unknown_error: apply deny-read ACLs`. The Chromium
  test is not a live Extension Host smoke and is not Human Play evidence.
- Draft [PR #100](https://github.com/GGF1sh/LoreRelay/pull/100), independent review
  requested once at `a132c9d`. Review `5121942838` completed with one P1 and two P2
  findings. One repair pass routes legacy market cards to the same preview/confirm
  UI (the retired transport rejects without writing), renews stale end-day previews,
  and scopes request capacity/cleanup to each trusted caller. The obsolete CI
  assertion requiring `confirmed: true` now checks the Host confirmation token.
- Repair regression: rendered market-card Buy opens a read-only quote; confirmation
  persists 20→11 credits. A day quote created before travel is rejected stale, its
  replacement is displayed, and a second explicit confirmation advances turn 0→1.
  Zero page exceptions. The service test exhausts one caller's 1024-request capacity,
  verifies another caller can execute, then closes/reopens without losing capacity.
- Final repair Test Console at `d660c5415020f869b7bf2f81c31f1636dc998d99`:
  complete plan, zero unknown files; **29 passed, 0 failed, 0 skipped**, including
  26 focused tests plus compile/boundaries. Artifact directory:
  `.test-runs/2026-09-05T16-18-06-610Z-d660c541`.
- One local full suite on the final executable tree at the same commit:
  **345/345 passed**, 171.8 seconds. Included Combat manifest execution:
  **16 groups, 736 tests, 736 passed, 0 failed**. No Combat implementation changed.
  Log: `.test-runs/commerce-full-suite.log`. Subsequent evidence-only documentation
  updates do not change the tested executable tree or require another full suite.
- CI run `33977448283` at that exact code commit passed both validate-and-smoke and
  coverage. All three independent review threads received repair evidence and were
  resolved. Final documentation-head CI and post-merge main CI are recorded in PR #100.
- Human Play remains unperformed. The owner explicitly permits this slice to be
  implemented before Human Play; fixture/renderer automation does not replace it.

Exclusions and threat boundaries remain those in the linked architecture contract.

## Authorized additional repair

The owner explicitly authorized an additional repair after Ready-triggered review
`5122050051` reported two new findings at `443596f2`. Scope remains those two findings:

- P1 `3941266290`: move the pure publication projection to
  `publishedMarketLocationsCore.ts`, update its import, impact rule and registry.
- P2 `3941266292`: ignore selected-destination preview responses whose destination
  no longer matches the pending selection; they cannot replace the initial catalog.
  The behavioral regression executes the real response function for delayed success,
  delayed failure, initial catalog and current quote. Rendered Chromium verification
  retains a selectable catalog after a held response and enables confirmation after
  a fresh preview; no canonical mutation and no page exceptions.

Additional-repair Test Console: **29 passed, 0 failed, 0 skipped**, focused **26/26**,
complete plan with no unknown files. Fingerprint:
`178f3ca3cd8cc32cc2d8f1f3176cd55c7e688bb8411e639721602ff6a51c8df2`.
Artifacts: `.test-runs/2026-09-05T16-43-49-035Z-443596f2` and
`.test-runs/travel-preview-race.json`. The final new-tree full suite, exact-head CI,
review resolution and merge/main CI evidence are maintained in PR #100.
