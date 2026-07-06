# RUNTIME-003A Implementation Result

1. Exact main baseline: `696aa001c40bba99ba0db747a913c03c032d567c`
2. Branch: `task/RUNTIME-003A-durable-replay-guard`
3. Implementation commit: `e25b7d1307efd126419d6e69754667e10db5c9d5`
4. Changed files:
   - `src/acceptedTurnReplayGuardCore.ts`
   - `src/acceptedTurnReplayGuard.ts`
   - `src/gameStateSync.ts`
   - `src/statePatch.ts`
   - `src/turnResultFallback.ts`
   - `src/workspaceStateQueueCore.ts`
   - `src/gmBridgeRunner.ts`
   - `src/agenticGmRunner.ts`
   - `src/checkpointHandlers.ts`
   - `src/gitManager.ts`
   - `scripts/test_runtime_accepted_replay_guard.js`
   - `scripts/test_runtime_turn_result_acceptance.js`
   - `scripts/run_all_tests.js`
5. Architecture contract mapping:
   - Pure replay identity core is isolated in `acceptedTurnReplayGuardCore.ts`.
   - Durable runtime scope, accepted ledger, writer lease, ledger recovery, and epoch rotation are implemented in `acceptedTurnReplayGuard.ts`.
   - The existing RUNTIME-002A Accepted boundary remains in `statePatch.processTurnResult`; the witness is injected into the same canonical `game_state.json` commit.
   - `gameStateSync.processTurnResultFileAt` now returns structured outcomes and blocks `alreadyAccepted` before `processTurnResult`.
   - `turnResultFallback` makes lifecycle decisions from structured outcomes instead of a collapsed boolean.
6. Stale lease recovery design:
   - Lease file: `.text-adventure/runtime/writer_lease.json`.
   - Lease owner uses process-local host UUID, PID, hostname, acquired/renewed timestamps, process-start timestamp, and a deterministic timeout.
   - A live foreign lease returns `writerConflict`; a stale/dead lease can be recovered by overwriting with the current host lease.
   - PID alone is not trusted as ownership.
7. Restore epoch implementation:
   - Undo, rewind, checkpoint restore, regenerate, Git Timeline branch-from-turn, and Git Timeline branch switch acquire writer authority, quarantine retained `turn_result.json`, rotate `timelineEpochId`, then proceed.
   - The accepted-turn ledger is not truncated during epoch rotation.
8. Structured outcome implementation:
   - Outcome classes are defined as `newlyAccepted`, `alreadyAccepted`, `missing`, `retryableFailure`, `rejected`, `quarantined`, `repairRequired`, and `writerConflict`.
   - `newlyAccepted` is the only path that marks Handled, fires callbacks, posts success UI/media effects, queues auto image, or schedules protagonist bootstrap.
   - `alreadyAccepted` emits diagnostic evidence and does not re-enter canonical mutation or success-only effects.
9. Crash-window behavior:
   - Pre-commit failure remains `retryableFailure` and leaves the durable file retryable.
   - Post-commit/pre-ledger failure is repaired by the canonical witness when it is exactly one step ahead of the ledger.
   - Primary ledger corruption recovers from a valid `.bak`; primary and backup corruption becomes `repairRequired`.
10. Known limitations:
   - RUNTIME-003A intentionally does not solve `CHATGPT-20260706-002`.
   - It does not claim global multi-file exactly-once or pre-commit `world_state` rollback.
   - Writer lease is deterministic local-file coordination, not a perfect network/shared-filesystem lock.
11. New findings:
   - Existing compile rewrites generated webview artifacts as EOL-only dirty files in this environment; actual diff is empty and these files were not included in the implementation commit.
12. Tests:
   - `npm ci --include=dev`: PASS
   - `npm run compile`: PASS
   - `node scripts/test_runtime_accepted_replay_guard.js`: PASS
   - `node scripts/test_runtime_turn_result_acceptance.js`: PASS
   - `node scripts/test_turn_result_pipeline.js`: PASS
   - `node scripts/test_state_patch.js`: PASS
   - `node scripts/test_turn_artifact_commit_atomicity.js`: PASS
   - `node scripts/test_cross_ledger_partial_failure.js`: PASS
   - `node scripts/test_context_inspector_integration.js`: PASS
   - `node scripts/test_prompt_candidate_purity.js`: PASS
   - `node scripts/test_prompt_inspector_readonly.js`: PASS
   - `node scripts/test_gm_prompt_builder_core.js`: PASS
   - `node scripts/check_i18n_keys.js`: PASS
   - `npm test`: PASS, `225/225`
13. Final verdict: `RUNTIME003A_IMPLEMENTATION_COMPLETE_READY_FOR_VERIFYING`
