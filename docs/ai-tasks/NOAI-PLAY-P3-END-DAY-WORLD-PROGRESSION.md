# NOAI-PLAY-P3: Deterministic End-Day and One-Turn World Progression

## Scope

The Commerce surface now provides **一日を終える**. It opens a read-only preview, requires explicit confirmation, and advances one player-facing world turn without invoking Relay, GM turn processing, LLMs, narration, image generation, or free-text mutation.

## Production authority and cadence

`endDayWorldProgression.ts` reuses `worldSimBulkCore.runBulkWorldSimulation` with `steps: 1` and `maxSteps: 1`. Its `afterStep` calls `applyLivingWorldAfterSimulationStep`, which preserves the production Living World cadence and reaches `worldKitTickCore.runLivingWorldTick` / `worldSimCommerceCore.tickMarketRecovery` once when Commerce is enabled. It does not duplicate simulation or market rules in the webview.

The authoritative turn rule is `endWorldTurn === startWorldTurn + 1`. Commit re-reads `game_state.json` and `world_state.json`; a previewed turn is never accepted as authority. The result includes the before/after turn, current location, emitted event count/categories, current-location market deltas, bounded resource deltas, request identity, and quiet-day status. A quiet day is a successful receipt with zero authoritative events.

## Request and persistence contract

`endDayRequestGate.ts` is a P3-specific, workspace-keyed single-flight gate. It coalesces duplicate pending request IDs, returns `BUSY` for a different pending ID, caches completed results (including failures) with a cap of 32 per workspace, and clears state on panel disposal. Replaying the same request cannot advance a second turn; a new request after completion can advance the next one.

Canonical writes are observed synchronously. `game_state.json` records `world.worldTurnAtLastSync`; `world_state.json` records the simulated state and Living World market result; the NPC registry is written when enabled. Any failed required target yields `PERSIST_FAILED` or `PARTIAL_PERSIST_FAILED`, never a success receipt. The implementation deliberately does not promise rollback when split persistence occurs and carries the diagnostic outcome for the host response. A display refresh failure after confirmed persistence is surfaced separately and does not rewrite the world.

## Preview and UI

The preview exposes only known facts: current/target turn, current location, advancing systems, and proven fixed consumption (currently none). It deliberately does not forecast emergent events. The modal supports keyboard activation, Esc close, focus restoration, a processing state, 400px-width layout, wrap-safe receipt text, stale-response correlation, and an explicit distinction between preview, success, quiet success, and failure.

## Debug fixtures

`node scripts/run_noai_play_p3_fixtures.js [--markdown]` runs only temporary-workspace focused evidence and emits compact JSON or Markdown. The deterministic, resettable scenarios are `quiet_day`, `market_recovery_day`, `event_emission_day`, `duplicate_request_day`, and `persistence_failure_day`. They never target a user workspace.

## Tests

`scripts/test_end_day_world_progression.js` covers preview purity; confirmation; exact +1 boundaries (0, 99, 100, and a large turn); production bulk-simulation invocation; one Living World market cadence; quiet/event receipts; request coalescing/replay/BUSY/lifecycle; total, split, and thrown persistence failure; stale webview-response guard; bundle presence; and no-AI imports. Existing P2 shopkeeper coverage remains in `test_shopkeeper_direct_trade_core.js` and `test_shopkeeper_repair.js`.

Verification completed: focused P3 test and fixture runner passed; `npm run build:webview`, `npm run compile`, `node scripts/check_i18n_keys.js`, `npm run check:symbol-registry`, and `node scripts/check_version_consistency.js` passed. The final `npm test` run used the 244-entry manifest (243 baseline + this P3 test). It reported 242/244 passed and two installer-test failures (`test_antigravity_installer_bootstrap.js` and `test_antigravity_install_chain.js`). The later publish revalidation established the observed cause: child `git branch --show-current` stopped at `fatal: detected dubious ownership` before network access. Independent verification then passed 244/244 with process-scoped `safe.directory`; those later records are authoritative for the failure diagnosis.

## Limitations and P4 dependency

This action advances exactly one turn and does not add travel, gathering, sleep/health simulation, conversations, domain/guild progression, offline progression, queued days, or narration. P4 travel should consume this authoritative end-day receipt/turn boundary rather than create a competing world-tick path.
