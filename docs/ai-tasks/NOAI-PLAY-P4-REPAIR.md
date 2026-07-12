# NOAI-PLAY-P4 Repair Report

## 1. Identity & Base
- **Exact Base SHA**: `94690406e81813c31419355b5eb9b2840528b35f`
- **Exact Verifier SHA**: `097499ae73c638185e3d1954d7ac3ebee6cd56d8`
- **Version**: `1.80.0`

## 2. Product UI Mojibake Repair
- Replaced mojibake string `譌・↓蜃ｺ繧・` with correct Japanese `旅に出る` in `webview/modules/85-world.js`.
- Rebuilt `webview/script.js` to ensure the correct string is bundled and visually rendered.
- **Negative Checks Added**: The core suite (`test_market_travel_core.js`) asserts `ui.includes('旅に出る')` and strictly negative-asserts the absence of known mojibake markers: `譌`, `蜃`, `繧`, `證`.

## 3. Fixture Architecture (Follow-up Strengthened)
The fixture runner (`scripts/run_noai_play_p4_fixtures.js`) was entirely rewritten. 
It now runs seven discrete assertions. Each fixture provably:
- Creates and executes within its own isolated, fresh temporary workspace created via `createHarness()` (or multiple workspaces for concurrency proofs).
- Wires the production P4 paths (`deterministicMarketTravel`, `marketTravelRequestGate`, `deterministicWorkspaceMutationGate`).
- Tracks exact write counts via a `commitGameState` invocation counter.
- Cleans up its temporary directory via a `finally` block before the script concludes.

### 4. Observed Evidence for All Seven Fixtures
1. **`successful_market_travel`**: Persisted is true, origin is `north_farm`, destination is `south_port`. The disk location changed exactly once, the write count was exactly 1. Invariants maintained: world turn unchanged, `world_state` (including market data) unchanged, player `credits`/`cargo`/`food` unchanged. Elapsed turns is 0.
2. **`same_location_rejection`**: Returned `SAME_LOCATION`, mutated is false. Write count is exactly 0, and canonical file bytes remained unchanged.
3. **`unknown_destination_rejection`**: Returned `UNKNOWN_DESTINATION`, mutated is false. Write count is exactly 0, and canonical file bytes remained unchanged.
4. **`duplicate_request_travel`**: Executed identical request IDs through the request gate. The write count was strictly 1. Changing the destination on the duplicate request did not falsely claim the new destination and did not write to disk again. The replay moved exactly once.
5. **`cross_action_travel_contention`**: 
   - Proved all four contention directions: Real P2 (shopkeeper direct-trade core) active -> P4 rejected. Real P3 (end-day core) active -> P4 rejected. P4 active -> P2 rejected. P4 active -> P3 rejected.
   - Max same-workspace protected mutation is 1. Rejected actions returned `WORLD_MUTATION_IN_PROGRESS`.
   - Write count for rejected mutations was 0 (no authoritative writes).
   - Invariants: player credits/cargo/world turn are not lost/changed from rejected P4.
   - A separate workspace B successfully completed an independent P4 action concurrently.
6. **`travel_persistence_failure`**: Production writer failure successfully returned `PERSIST_FAILED`, leaving gate released and success unreported.
7. **`travel_reload_persistence`**: Performed travel through a request gate, discarded the gate, and created a brand new gate with a mock-cleared reader context. The canonical disk state was reread, proving the destination persists reliably without relying on the cache or in-memory state.

## 5. Tests & Gates
### Focused Test Results
All requested focused tests passed, including:
- `test_market_travel_core.js`
- `run_noai_play_p4_fixtures.js` (strengthened)
- `test_deterministic_workspace_mutation_gate.js`
- `test_shopkeeper_direct_trade_core.js`
- `test_shopkeeper_repair.js`
- `test_end_day_world_progression.js`
- `run_noai_play_p3_fixtures.js`
- `test_webview_bundle.js`
- `test_webview_world_modules.js`

### Canonical Gate Results
- `npm run build:webview`: Passed.
- `npm run compile`: Passed.
- `node scripts/check_i18n_keys.js`: Passed.
- `npm run check:symbol-registry`: Passed.
- `node scripts/check_version_consistency.js`: Passed. Version remained exactly `1.80.0`.

## 6. Full Suite Manifest/Result
- **Environment**: Tested on Windows running PowerShell (`Microsoft.PowerShell.Utility` module providing `Get-FileHash` v3.1.0.0). No environment blocks or local missing commands.
- **Run Type**: `npm test` executed exactly once.
- **Manifest**: 246 scripts ran.
- **Result**: `Passed: 246/246` (Exit code 0).
- **External Log Path**: `C:\AI\logs\noai-play-p4-repair-followup-full-suite.log`

## 7. Limitations
- No live installer was run.
- No human smoke testing or live player workspace involvement.
- No Antigravity, Relay/LLM gameplay, ComfyUI, image generation or network gameplay.
- Main branch was not modified or merged.

## 8. Final Status
The fixture runner has been successfully strengthened to satisfy the execution and invariant contracts.

**Status**: `NOAI_PLAY_P4_REPAIR_FOLLOWUP_READY_FOR_VERIFY`
