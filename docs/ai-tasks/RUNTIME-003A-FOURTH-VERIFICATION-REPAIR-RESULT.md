# RUNTIME-003A Fourth Verification Repair Result

Date: 2026-07-07

Branch: `task/RUNTIME-003A-durable-replay-guard`

Repair source commit: `0f6908ca0d5ea45f4d40b9f9bd67940eac91ab2d`

Third reverify fail commit: `8ab06b590cf2c5f2b6ea8f92b0836cc5c1e02ca8`

Current `origin/main`: `2bb5e3f6f83df51d9998617fde92cfbbd1c19743`

## Scope

Repaired only the two remaining fourth-verification blockers:

1. Malformed writer-lease recovery TOCTOU between fingerprint validation and canonical lease quarantine.
2. Fail-closed authority when post-epoch restore mutation fails and durable restore repair latch write also fails.

No redesign was made. Previously closed RUNTIME-003A areas were not reopened.

## Changed Files

Source:

- `src/acceptedTurnReplayGuard.ts`

Tests:

- `scripts/test_runtime_accepted_replay_guard.js`
- `scripts/test_runtime_turn_result_acceptance.js`

Report:

- `docs/ai-tasks/RUNTIME-003A-FOURTH-VERIFICATION-REPAIR-RESULT.md`

Existing EOL-only dirty files after build were not part of the repair:

- `webview/script.js`
- `webview/style.css`
- `webview/vendor/mermaid.min.js`

## Malformed TOCTOU Repair

Verdict: closed.

The previous check-then-rename path was removed for malformed writer lease recovery. Recovery now:

1. Recovers any stale/orphaned lock when applicable.
2. Acquires a fresh writer-lock token before touching the malformed canonical lease.
3. Atomically renames the canonical malformed lease to a private quarantine path.
4. Validates the captured private file fingerprint, not the mutable canonical path.
5. Refuses to commit a fresh lease if anything reappears at the canonical lease path after capture.
6. Commits the fresh lease only while the same lock token is still owned.

Authority-binding mechanism: malformed recovery is bound to the fresh lock owner token plus the private captured file. A stale recoverer cannot validate one file generation and later quarantine or overwrite a different canonical generation.

## Malformed TOCTOU Tests

New/updated proof:

- Pauses a stale malformed recoverer after successful captured-file validation.
- Lets a fresh winner install a valid lease while the stale recoverer is paused via a test-only lock-release hook.
- Proves exactly one winner.
- Proves the stale recoverer returns `writerConflict`.
- Proves the final fresh winner lease and lock owner token match.
- Proves identical malformed bytes reappearing at the canonical path are left untouched and cause fail-closed behavior.

Identical-content replacement verdict: covered where practical. The test replaces the canonical lease path with identical malformed bytes after the stale recoverer validated the captured generation; the stale recoverer does not remove or overwrite the replacement.

## Durable Latch-Write Failure Repair

Verdict: closed.

When restore mutation fails after epoch rotation and durable latch write also fails, the guard now installs a workspace-scoped process-local emergency restore repair latch before returning `repairRequired`.

Emergency latch behavior:

- `getAcceptedTurnRestoreRepairLatchOutcome()` observes the process-local emergency latch.
- `preflightAcceptedTurn()` blocks queued TurnResult work through the same outcome path.
- `ensureAcceptedTurnScope()` blocks provider/scope bootstrap through the same outcome path.
- The latch is not automatically cleared by repeated preflight/provider calls.
- `clearAcceptedTurnRestoreRepairLatchForRepair()` clears both durable and process-local latches for trusted repair.
- `resetAcceptedTurnReplayGuardForTests()` clears process-local state to model process restart/reset.

Restart semantics: honest distinction is preserved. Durable latch success survives process reset/restart; process-local emergency latch does not masquerade as durable restart proof after explicit process reset.

## Durable Latch-Write Failure Tests

New proof:

- Forces durable restore repair latch write failure after epoch rotation.
- Verifies no durable latch file exists.
- Verifies queued TurnResult waits until restore mutation exits, then sees process-local emergency latch and returns `repairRequired`.
- Verifies provider scope bootstrap is blocked by the emergency latch.
- Verifies repeated preflight remains blocked until explicit trusted clear/reset.
- Verifies process reset clears only the process-local emergency latch and does not falsely prove durable restart safety.
- Verifies watcher TurnResult path is blocked by process-local emergency latch before `processTurnResult`, Handled, callback, media, auto image, bootstrap, or UI success side effects.

## Regression Results

Commands run:

- `npm ci --include=dev`: pass; 202 packages installed/audited, 0 vulnerabilities.
- `npm run compile`: pass.
- `node scripts/test_runtime_accepted_replay_guard.js`: pass.
- `node scripts/test_runtime_turn_result_acceptance.js`: pass.
- `node scripts/test_turn_result_pipeline.js`: pass.
- `node scripts/test_state_patch.js`: pass.
- `node scripts/test_turn_artifact_commit_atomicity.js`: pass.
- `node scripts/test_cross_ledger_partial_failure.js`: pass.
- `node scripts/test_prompt_receipt_accepted_consumption.js`: pass.
- `node scripts/test_context_inspector_integration.js`: pass.
- `npm test`: pass, `225/225`.
- `node scripts/validate/check_i18n_keys.js`: failed because the path does not exist in this checkout.
- `node scripts/check_i18n_keys.js`: pass, 1024 referenced keys, missing 0 in `ja`, `en`, `zh-CN`, `zh-TW`.

The full suite also ran the i18n check successfully as `check_i18n_keys.js`.

## Git / EOL State

Substantive tracked changes:

- `src/acceptedTurnReplayGuard.ts`
- `scripts/test_runtime_accepted_replay_guard.js`
- `scripts/test_runtime_turn_result_acceptance.js`
- `docs/ai-tasks/RUNTIME-003A-FOURTH-VERIFICATION-REPAIR-RESULT.md`

EOL-only dirty build artifacts remained after compile and were not staged:

- `webview/script.js`
- `webview/style.css`
- `webview/vendor/mermaid.min.js`

`git diff --ignore-space-at-eol` showed no substantive diff for those webview files.

## New Findings

- The requested command `node scripts/validate/check_i18n_keys.js` does not exist in this checkout. The actual repository script is `node scripts/check_i18n_keys.js`, and it passes. `npm test` also executes the i18n check successfully.

## Final Verdict

`RUNTIME003A_FOURTH_VERIFICATION_REPAIR_COMPLETE_READY_FOR_REVERIFY`
