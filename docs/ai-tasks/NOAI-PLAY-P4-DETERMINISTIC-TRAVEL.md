# NOAI-PLAY-P4: Deterministic Market Travel

Status: NOAI_PLAY_P4_TEST_FAILED

## Base And Scope

- Branch/worktree: `task/NOAI-PLAY-P4-deterministic-travel` at `C:\AI\wt-noai-play-p4`.
- Exact main base: `b5a5789e3e96991cd298eed7024589acfccbebcd`.
- Candidate version: `1.80.0` unchanged.
- No live installer, Antigravity, Relay/LLM gameplay, ComfyUI, image generation, or network gameplay was run.

## Destination Authority

- No explicit production route graph exists for market travel in the inspected slice.
- Destination authority is therefore direct deterministic relocation among canonical known `world_forge.json` locations that also appear in the production commerce market definitions resolved through `resolveCommerceForge`.
- Current location is excluded. Free-text destination input is not accepted.
- The preview and receipt report `reachabilityBasis: "known_market_location"` honestly rather than inventing distance, route cost, encounters, or route identity.

## Zero-Turn Contract

- P4 is a location mutation only.
- `elapsedWorldTurns` is always `0`.
- P4 does not call P3 end-day, bulk world simulation, Living World after-step, market recovery, Relay/GM/AI narration, ComfyUI, or invented event paths.

## Canonical Files Mutated

- Mutated on success: `game_state.json`, specifically `world.currentLocationId`.
- Read but not mutated: `world_state.json`, `world_forge.json`.
- P4 does not write `world_state.json`; world turn and market state remain unchanged.

## Request Gate Behavior

- Added `marketTravelRequestGate`.
- Same `requestId` while pending coalesces.
- Completed replay returns the cached completed result and does not move again.
- Different requestId while P4 is pending returns terminal `BUSY`.
- Malformed or missing `requestId`/destination does not mutate.
- Completed cache is bounded.
- Panel disposal clears completed P4 request state but does not dispose the shared mutation gate.

## Shared Mutation Gate Placement

- Extension handler enters the P4 request gate first.
- It then acquires the existing host-scoped `deterministicWorkspaceMutationGate` with `actionKind: "market_travel"`.
- Only after shared gate acquisition does `executeMarketTravel` reread canonical game/world/forge state and revalidate the destination.
- P2/P3 keep using the same shared gate instance.

## Persistence Truth

- Success requires `commitGameState` success and a post-persist reread proving `world.currentLocationId` equals the destination.
- Persistence failure reports `PERSIST_FAILED`.
- Post-write verification mismatch reports `VERIFY_FAILED`.
- P4 makes no rollback claim.
- Refresh failure after successful persistence is surfaced via `refreshFailed` while preserving success truth.

## Receipt Schema

Successful receipts are bounded and factual:

- `requestId`
- `origin: { id, name }`
- `destination: { id, name }`
- `elapsedWorldTurns: 0`
- `marketAvailable: true`
- `reachabilityBasis: "known_market_location"`
- `persisted: true`
- optional `refreshFailed`

No travel narration is emitted.

## UI Flow

- Added compact `旅に出る` action under `暮らす`.
- Flow: open, choose canonical destination, read-only preview, explicit confirmation, processing state, authoritative receipt.
- No free text.
- Same-location and stale/unknown destinations are rejected by host.
- Stale webview responses are correlated by selected destination/requestId.
- `WORLD_MUTATION_IN_PROGRESS` and `BUSY` are non-success states.
- Esc closes the dialog and focus returns to the initiator.
- Webview bundle `webview/script.js` was rebuilt and committed.

## Contention Evidence

Focused P4 tests prove:

- P4 active -> P2/P3 receive `WORLD_MUTATION_IN_PROGRESS`.
- Cross-workspace P4/P2 may run concurrently.
- Same P4 request executes once.
- Different P4 request while pending returns terminal `BUSY`.
- Thrown P4 callback releases the shared gate.
- Persistence failure releases the shared gate.
- Rejected actions do not perform authoritative mutation.
- World turn remains unchanged.

Existing focused P2/P3 regressions passed.

## Fixture Evidence

Added `scripts/run_noai_play_p4_fixtures.js` with seven temporary-workspace fixture records:

1. `successful_market_travel`
2. `same_location_rejection`
3. `unknown_destination_rejection`
4. `duplicate_request_travel`
5. `cross_action_travel_contention`
6. `travel_persistence_failure`
7. `travel_reload_persistence`

The runner invokes the production P4 core test first and then emits compact deterministic fixture evidence. Temporary files are cleaned.

## Focused Test Results

Passed:

- `node scripts/test_market_travel_core.js`
- `node scripts/run_noai_play_p4_fixtures.js`
- `node scripts/test_deterministic_workspace_mutation_gate.js`
- `node scripts/test_shopkeeper_direct_trade_core.js`
- `node scripts/test_shopkeeper_repair.js`
- `node scripts/test_end_day_world_progression.js`
- `node scripts/run_noai_play_p3_fixtures.js`
- `node scripts/test_antigravity_installer_bootstrap.js`
- `node scripts/test_antigravity_install_chain.js`
- `node scripts/test_webview_bundle.js`
- `node scripts/test_webview_world_modules.js`

Canonical gates passed after regenerating symbol registry:

- `npm run build:webview`
- `npm run compile`
- `node scripts/check_i18n_keys.js`
- `npm run check:symbol-registry`
- `node scripts/check_version_consistency.js`

## Full Suite

- Command: `npm test`
- Durable log: `C:\AI\logs\noai-play-p4-full-suite.log`
- Actual manifest count: `246` scripts.
- Result: exit code `1`, `245/246` passed.
- Failed script: `[unit] test_runtime_accepted_replay_guard.js`.
- Exact full-log failure: `two-process stale takeover has exactly one winner` observed two successful child processes.
- Required diagnostic rerun of only that script: `node scripts/test_runtime_accepted_replay_guard.js` passed.
- Classification: candidate-unrelated concurrency flake/environment timing in `test_runtime_accepted_replay_guard.js`.
- Per instructions, the full suite was not rerun.

## Limitations

- No explicit route graph exists in the inspected production market/location slice, so P4 does not claim route distance, route cost, travel time, encounters, or route identity.
- P4 mutates only player current location and relies on existing market/world view refresh to expose trading at the destination.
- No human smoke test was performed.
