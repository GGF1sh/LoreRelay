# INTEGRATION-BLOCKER-WRITER-LEASE-RACE-001

Date: 2026-07-13 JST

## Verdict

The integration failure was a nondeterministic concurrency-test defect, not a production writer-lease exclusivity defect.

No executable probe produced concurrent writer authority. When contenders were synchronized and the successful owner was held alive, Windows directory-lock acquisition and the stale-takeover compare-and-swap path admitted exactly one winner. The competing process returned `writerConflict`, could not replace the winner token, and could acquire only after the winner died and the lease became legitimately recoverable.

## Repository Identity

- Canonical repository: `C:\AI\text-adventure-vsce`
- Required and observed `origin/main`: `fc647b2abbf1297f18b7777646b5e38e7b457363`
- Main version: `1.82.2`
- Debug-sandbox candidate and repair base: `ea0ae47553d25502e82ebca95d15351185abc058`
- Candidate version: `1.82.3`
- Repair branch: `task/INTEGRATION-BLOCKER-WRITER-LEASE-RACE-001`
- Test repair commit: `e8ca1a15e354ace2b3a848979c1fc135ab96fef3`

The branch was created directly from the candidate tip, not from the prior verifier tip.

## Integration Failure

The stopped integration full suite reported both contenders as successful in these two assertions:

```text
FAIL: two-process stale takeover has exactly one winner ([{"code":0,"stderr":"","success":true},{"code":0,"stderr":"","success":true}])
FAIL: two-process empty workspace acquisition has exactly one winner ([{"code":0,"stderr":"","success":true},{"code":0,"stderr":"","success":true}])
```

The integration stopped before any main push.

## Unchanged Blob Evidence

The failing test and production module have identical blobs at required main and the candidate base:

| File | Main blob | Candidate blob |
| --- | --- | --- |
| `scripts/test_runtime_accepted_replay_guard.js` | `b655d782318f5ce941266d4a59f462f0d31356ce` | `b655d782318f5ce941266d4a59f462f0d31356ce` |
| `src/acceptedTurnReplayGuard.ts` | `8f76966e1cd802a62d491a92a1eae861162c40da` | `8f76966e1cd802a62d491a92a1eae861162c40da` |

The candidate's new gameplay test appears later in the manifest, uses no child processes, and leaves no process, timer, environment variable, or shared writer-lease filesystem state. `scripts/run_all_tests.js` runs manifest scripts with synchronous child-process isolation. No candidate-specific ordering influence was found.

## Baseline Reproduction Matrix

Both baseline checkouts were unmodified during reproduction.

| Target / condition | Result | Duration |
| --- | --- | --- |
| Exact main, isolated test, 30 runs | 20 pass, 10 fail | min 4,353 ms; avg 6,348.7 ms; max 9,124 ms |
| Exact candidate, isolated test, 30 runs | 17 pass, 13 fail | min 4,335 ms; avg 5,871.6 ms; max 8,207 ms |
| Exact candidate, load-enhanced process start | 1 pass, 0 fail | 4,657 ms |
| Exact main, barrier + held winner, 150 ms timeout | exactly one winner; loser conflict | pass |
| Exact candidate, barrier + held winner, 150 ms timeout | exactly one winner; loser conflict | pass |
| Exact main, barrier + held winner, 5,000 ms timeout | exactly one winner; loser conflict; live heartbeat protected beyond 5 s | pass |
| Exact candidate, barrier + held winner, 5,000 ms timeout | exactly one winner; loser conflict; live heartbeat protected beyond 5 s | pass |

The load-enhanced baseline pass does not negate the repeated failures; the 60-run unchanged-checkout evidence reproduces the scheduling-sensitive assertion on both identities.

## Timing and Authority Evidence

Temporary instrumentation recorded child readiness, attempt, result, lease token, canonical owner PID/token, child exit, later attempt, and takeover reason.

Representative exact-main empty-workspace sequential evidence:

- PID `38832` acquired token `0f83b41a-7eab-4ccf-bd0c-21b78c5dc58c` at `2026-07-13T13:20:13.951Z` and exited at `2026-07-13T13:20:13.960Z`.
- PID `73424` did not attempt until `2026-07-13T13:20:14.288Z`; the prior PID was already dead and the lease was older than the 150 ms timeout.
- PID `73424` acquired a new token `5b7d891b-e225-4446-95e1-601f80fca64b` at `2026-07-13T13:20:14.304Z` with reason `expired_dead_owner_recovery`.

Representative exact-main synchronized empty-workspace evidence:

- Both children reached the barrier by `2026-07-13T13:20:15.221Z` and both attempted at `2026-07-13T13:20:15.230Z`.
- PID `53084` won with token `8f11e8b4-4265-4cd2-8c4d-204e6d44a810`; the lease and lock-owner files contained that same token and PID.
- PID `36036` returned `writerConflict` with reason `writer lease lock is held`.
- A late contender at `2026-07-13T13:20:15.985Z` also returned `writerConflict` while PID `53084` remained live and heartbeating.
- After the winner exited, PID `72996` acquired new token `e804a0dd-64ae-435c-92da-54fc8ab829d3` through `expired_dead_owner_recovery`.

The synchronized stale-owner probes produced the same one-winner result. The loser reported `writer lease stale takeover lost compare-and-swap`; it did not remove or overwrite the fresh winner. Exact candidate probes matched these behaviors.

This evidence also covers Windows directory behavior: synchronized `mkdir`-based lock acquisition produced one lock owner, and canonical lease/owner tokens remained consistent. No probe observed two live processes owning canonical writer authority concurrently.

## Root Cause

The original `spawnLeaseContender` printed its acquisition result and exited immediately. `Promise.all()` started two child processes but did not guarantee that their lease attempts overlapped within the 150 ms lease timeout. A valid sequence was therefore:

1. contender A acquired;
2. contender A exited;
3. contender B started late, after the timeout;
4. contender B observed a dead prior PID and legitimately recovered the expired lease;
5. both final child results were `success:true`, despite never holding authority concurrently.

The original assertion tested "only one process may ever succeed sequentially." The production invariant is narrower: while a live, unexpired, heartbeating writer owns the lease, no second process may acquire authority for the same workspace.

## Test-Only Repair

Only `scripts/test_runtime_accepted_replay_guard.js` changed in the implementation commit. `src/acceptedTurnReplayGuard.ts` and all other production locking code are unchanged.

The corrected empty-workspace and stale-owner tests now use deterministic coordination:

1. each child writes a ready record;
2. the parent waits for both ready records and releases one shared start barrier;
3. each child writes a timestamped result containing PID and lease/lock-owner tokens;
4. the successful child remains alive, retaining its heartbeat and writer authority;
5. the parent verifies exactly one live winner and one `writerConflict` loser;
6. the parent verifies the canonical lease and lock-owner token/PID match the winner;
7. after 350 ms, a late contender verifies heartbeat protection beyond the 150 ms timeout and cannot replace the winner;
8. the parent releases the winner, waits for child completion, and verifies legitimate post-death recovery with a new token.

The barrier controls concurrency. The 350 ms interval is not used to race child startup; it verifies the semantic heartbeat contract beyond the configured timeout.

Existing PID-reuse, malformed-lease, orphan-lock, heartbeat, token-loss, restore-latch, and accepted-turn replay coverage remains in the same focused test and passed.

## Changed Files

- `scripts/test_runtime_accepted_replay_guard.js`: deterministic synchronized contender harness and corrected assertions.
- `docs/ai-tasks/INTEGRATION-BLOCKER-WRITER-LEASE-RACE-001.md`: this durable evidence report.

Temporary instrumentation was removed and raw logs were not committed.

## Focused Stress Validation

The corrected writer-lease test completed 100 consecutive runs with zero failures:

- runs 1-90: ordinary conditions;
- runs 91-100: load-enhanced conditions with six CPU workers;
- completed: 100;
- failures: 0;
- minimum: 5,445 ms;
- average: 7,758.2 ms;
- maximum: 12,249 ms.

## Focused Commands

All required commands exited zero:

```powershell
npm ci
npm run compile
node scripts/test_runtime_accepted_replay_guard.js
node scripts/test_gameplay_input_fastpath.js
node scripts/test_deterministic_workspace_mutation_gate.js
node scripts/test_antigravity_file_bridge.js
node scripts/test_playable_v0_player_action_hub.js
node scripts/test_webview_bundle.js
node scripts/check_version_consistency.js
node scripts/validate_utf8_docs.js
```

`npm ci` installed the lockfile-defined dependency set. Compilation and every focused test/validator passed after the repair.

## Full Suite

- Command: `npm test`
- Manifest scripts: 250
- Passed: 250/250
- Failed scripts: 0
- Runner duration: 126.3 s
- Exit code: 0

The manifest remains 250; no new manifest entry was necessary.

## Evidence Logs

- `C:\AI\logs\integration-blocker-writer-lease-race-001\main-baseline-30.log`
- `C:\AI\logs\integration-blocker-writer-lease-race-001\candidate-baseline-30.log`
- `C:\AI\logs\integration-blocker-writer-lease-race-001\candidate-load-enhanced-baseline.log`
- `C:\AI\logs\integration-blocker-writer-lease-race-001\main-timing-probe.json`
- `C:\AI\logs\integration-blocker-writer-lease-race-001\candidate-timing-probe.json`
- `C:\AI\logs\integration-blocker-writer-lease-race-001-focused-stress.log`
- `C:\AI\logs\integration-blocker-writer-lease-race-001-full-suite.log`

## Version Decision

The version remains `1.82.3`. The evidence supports a test-harness-only repair, so no production or release-truth change is warranted.

## Scope and Limitations

- The required main checkout, main branch, and `origin/main` were not integrated or pushed.
- `C:\AI\wt-human-smoke-debug-sandbox-fastpath-001-integration` was untouched.
- `C:\AI\wt-lorerelay-installer-current` and installer assets were untouched.
- Installed Antigravity extension files were untouched.
- `G:\AI\LoreRelayWorlds\Fantasy` and other live workspaces were untouched.
- The debug-sandbox repair remains a candidate; no human smoke was performed in this task.
- Executable concurrency evidence was collected on this Windows host. A new independent verification is still required before integration resumes.

## Final Verdict

`INTEGRATION_BLOCKER_WRITER_LEASE_RACE_001_CANDIDATE_READY`
