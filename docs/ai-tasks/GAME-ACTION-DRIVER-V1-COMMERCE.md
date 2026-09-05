# GAME-ACTION-DRIVER-V1-COMMERCE

Status: implementation in progress. Risk: **High**.
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
- Focused tests, Test Console, independent implementation review, final full suite,
  PR/exact-head CI, merge and post-merge CI: pending. No new Human Play evidence.

Exclusions and threat boundaries remain those in the linked architecture contract.
