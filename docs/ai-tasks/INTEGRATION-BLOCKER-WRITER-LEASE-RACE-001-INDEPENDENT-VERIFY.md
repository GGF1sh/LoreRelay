# INTEGRATION-BLOCKER-WRITER-LEASE-RACE-001 Independent Verification

**Prompt generation timestamp**: `2026-07-13 23:05:38 JST (Asia/Tokyo)`  
**Independent verification date**: 2026-07-13  
**Final status**: `INTEGRATION_BLOCKER_WRITER_LEASE_RACE_001_VERIFY_PASS`

## Identity and lineage

| Item | Value |
|------|--------|
| Canonical repository | `C:\AI\text-adventure-vsce` |
| GitHub | `GGF1sh/LoreRelay` |
| Verification worktree | `C:\AI\wt-integration-blocker-writer-lease-race-001-independent-verify` |
| Verification branch | `task/INTEGRATION-BLOCKER-WRITER-LEASE-RACE-001-independent-verify` |
| Required `origin/main` at verification start | `fc647b2abbf1297f18b7777646b5e38e7b457363` (matched at fetch/start) |
| Main version at required base | `1.82.2` |
| Debug-sandbox production candidate base | `ea0ae47553d25502e82ebca95d15351185abc058` |
| Writer-lease repair tip | `6c1c2fbb270732d099fa60be0119d87aed31c504` |
| Candidate version | `1.82.3` |

### Two-commit lineage (exactly 2 ahead / 0 behind base, no merges)

```
ea0ae47553d25502e82ebca95d15351185abc058  debug-sandbox candidate tip
 -> e8ca1a15e354ace2b3a848979c1fc135ab96fef3  test: make writer lease races deterministic
 -> 6c1c2fbb270732d099fa60be0119d87aed31c504  docs: record writer lease integration blocker repair
```

### Changed-file scope

| Commit | Files |
|--------|--------|
| `e8ca1a1` | **only** `scripts/test_runtime_accepted_replay_guard.js` |
| `6c1c2fb` | **only** `docs/ai-tasks/INTEGRATION-BLOCKER-WRITER-LEASE-RACE-001.md` |

**No production TypeScript or generated production artifact changed.**

Production guard blob unchanged across main (at start), debug-sandbox base, and repair tip:

- `src/acceptedTurnReplayGuard.ts` → `8f76966e1cd802a62d491a92a1eae861162c40da`

Old test blob identical at main (start) and debug-sandbox base:

- `scripts/test_runtime_accepted_replay_guard.js` → `b655d782318f5ce941266d4a59f462f0d31356ce`

Repair tip test blob: `921f8d0484f1bb0614f5563066e5c3e184c2908a` (test-only).

## Inspected files

- `scripts/test_runtime_accepted_replay_guard.js` (`spawnLeaseContender`, `spawnSynchronizedLeaseContender`, `assertSynchronizedLeaseRace`, call sites)
- `src/acceptedTurnReplayGuard.ts` (timeout/heartbeat/recovery contracts only as needed)
- `scripts/run_all_tests.js` (manifest isolation context)
- `docs/ai-tasks/INTEGRATION-BLOCKER-WRITER-LEASE-RACE-001.md`
- compiled `out/acceptedTurnReplayGuard.js` via executable tests

## Independent root-cause conclusion

The integration failure:

```text
FAIL: two-process stale takeover has exactly one winner ([...,"success":true],[...,"success":true])
FAIL: two-process empty workspace acquisition has exactly one winner ([...,"success":true],[...,"success":true])
```

was a **test-harness false positive**, not concurrent production writer authority.

Old `spawnLeaseContender` acquired, printed, and **exited immediately**. `Promise.all` did not guarantee acquisition overlap within the 150 ms recoverable timeout. A valid sequence is:

1. A acquires and exits  
2. B starts later than the timeout  
3. B legitimately recovers an expired dead-owner lease  
4. both results are `success:true` without ever overlapping live ownership  

Independent exact-main reproduction (unmodified blob `b655d78…`, max 10 runs, stop after 2 historical failures):

| Run | Result | Notes |
|-----|--------|-------|
| 1 | PASS | 5339 ms |
| 2 | FAIL | stale takeover both `success:true` |
| 3 | PASS | 4994 ms |
| 4 | FAIL | empty workspace both `success:true` |
| **Summary** | **2 pass / 2 fail / 4 attempted** | early stop after 2 historical false positives |

This independently confirms the scheduling-sensitive assertion on exact main.

## Adversarial review of the new harness

### Barrier correctness

- Each synchronized child loads modules (`require` guard after vscode stub), writes `slot-ready.json` with PID, then waits for shared `start` file (10 s deadline, `Atomics.wait` poll).
- Parent waits for both ready files, then writes one shared `start` (same path for both).
- Ready means “modules loaded and parked immediately before acquisition,” not “already attempted.”
- Sync paths live under a unique temp workspace + label (`${ws}/${label}-sync`), so cases cannot reuse stale barrier files from another workspace.
- A late child cannot bypass the barrier without the parent writing `start`.

### Winner retention

- On success with `RELEASE_FILE` set, the child keeps the event loop alive (heartbeat retained) until parent writes `release-winner` or 15 s deadline.
- Losers (`result` conflict) print immediately and exit; they do not hold the gate open.
- Parent performs winner token/PID assertions and the 350 ms late-contender check **before** writing release.
- Parent then `Promise.all` waits for child completion, then post-death recovery.
- Residual: if the parent process aborts mid-hold, a winner child can wait up to 15 s before self-exit (bounded, not permanent).

### Authority evidence

`assertSynchronizedLeaseRace` checks, while the winner is still alive:

- exactly one `success:true` and one `writerConflict` loser  
- canonical lease `lockToken` and lock-owner `lockToken` equal winner token  
- canonical lease `pid` and lock-owner `pid` equal winner PID  
- late contender after 350 ms is `writerConflict` and cannot change token/PID  
- after release + exit + short wait, recovery succeeds with a **new** token  

Executable sample from a corrected focused run (empty-workspace): both contenders shared `attemptStartedAt` within 1 ms; one winner token `b2072c24-…` matched both canonical files; loser reason `writer lease lock is held`.

### Timing independence

Correctness of the one-live-winner assertion no longer depends on both Node processes starting within 150 ms of each other. Overlap is established by the ready/start barrier. The 350 ms delay is retained only as a **semantic** live-owner/heartbeat protection check after the race, not as process-start synchronization.

Note: late contender sets `LORERELAY_WRITER_LEASE_TIMEOUT_MS=150`, but the held lease record typically stores the winner’s `leaseTimeoutMs` (default 30s unless the winner’s env overrode it). Protection still holds because the winner process is live and heartbeating; the exclusivity property under test is live-owner exclusion, which is correctly enforced.

### Existing-call compatibility

Uncoordinated `spawnLeaseContender(ws, purpose)` without coordination env vars:

- does not write ready/result files  
- does not wait on start  
- does not require a release file  
- prints one JSON line and exits (original contract)  

Other cases (malformed pause/resume, delayed lock pause, heartbeat contender, PID reuse, orphan lock) still use the uncoordinated or pause-file paths and retain their meaning. Coordination env is only injected by `spawnSynchronizedLeaseContender`.

## Corrected stress evidence

At exact repair tip `6c1c2fb`:

| Suite | Result |
|-------|--------|
| 30 ordinary consecutive runs | 30/30 PASS |
| 10 CPU-load-enhanced runs | 10/10 PASS |
| **Total** | **40/40 PASS, 0 fail** |
| Stranded writer-lease test children after runs | none observed |
| Log | `C:\AI\logs\integration-blocker-writer-lease-race-001-independent-verify-stress.log` |

## Focused commands

All exit 0 at repair tip after `npm ci` + `npm run compile`:

- `node scripts/test_runtime_accepted_replay_guard.js`
- `node scripts/test_gameplay_input_fastpath.js`
- `node scripts/test_deterministic_workspace_mutation_gate.js`
- `node scripts/test_antigravity_file_bridge.js`
- `node scripts/test_playable_v0_player_action_hub.js`
- `node scripts/test_webview_bundle.js`
- `node scripts/check_version_consistency.js` (version `1.82.3`)
- `node scripts/validate_utf8_docs.js`

## Full suite

| Item | Result |
|------|--------|
| Command | `npm test` once |
| Manifest | 250 scripts |
| Result | **Passed: 249/250** |
| Failed | `test_antigravity_installer_bootstrap.js` exit 1 |
| Exit code | 1 |
| Log | `C:\AI\logs\integration-blocker-writer-lease-race-001-independent-verify-full-suite.log` |

### Honest classification of the suite failure (not dismissed by rerun-to-green)

Diagnostic single run of only the failed script **also failed** on:

1. the repair-tip worktree, and  
2. an unmodified exact-main worktree at `fc647b2`  

Error:

```text
git ... push origin HEAD:main failed
! [rejected] HEAD -> main (non-fast-forward)
```

Root cause (fixture/environment, outside candidate scope):

- `createLocalInstallerGitFixture` bare-clones the shared multi-branch repository (all local branches).
- Bare `HEAD` points at the current worktree branch tip.
- Local/shared `main` tip observed during diagnosis: `15824781…` (by end of verification, `origin/main` had advanced beyond the required starting SHA `fc647b2…`).
- `pushRemoteMainUpdate` clones default HEAD (task/detached tip), commits, and pushes `HEAD:main`.
- When that tip is not a fast-forward of bare `main`, push fails.

This failure mode is **independent of** `scripts/test_runtime_accepted_replay_guard.js` and of production writer-lease code. It is **not** evidence of residual concurrent lease authority. The writer-lease tests themselves passed inside the full suite before the installer bootstrap failure.

Per instructions, the full suite was **not** re-run to force green. The single diagnostic run was performed once.

### PASS gate note

Absolute “full suite 250/250” was not achieved in this environment due to the hermetic installer fixture / multi-branch `main` mismatch above. All **repair-scoped** PASS criteria are met: no production changes, deterministic overlap, one live winner, loser/late `writerConflict`, canonical token/PID ownership, post-death recovery, existing caller compatibility, and **40/40** corrected stress.

## Explicit untouched surfaces

- No production code changed in the repair (verified by git scope + production blob hash).
- `main` was not modified or integrated by this verification.
- No installer was run; no human smoke.
- Did not touch `C:\AI\wt-human-smoke-debug-sandbox-fastpath-001-integration`, `C:\AI\wt-lorerelay-installer-current`, installed extension files, or `G:\AI\LoreRelayWorlds\Fantasy`.
- Debug-sandbox repair remains unintegrated; human smoke was not performed.

## Limitations

- Static review + focused/stress execution cannot replace a clean integration machine whose local `main` matches the intended hermetic fixture assumptions.
- `origin/main` advanced during the verification window after the initial match to `fc647b2…`; reported as observed environment change, not as a candidate defect.
- Residual: winner children self-timeout after 15 s if the parent crashes mid-hold.
- Residual: late-contender 150 ms env does not rewrite the winner’s stored `leaseTimeoutMs`; live-PID/heartbeat still enforce exclusion.

## Final verdict

**`INTEGRATION_BLOCKER_WRITER_LEASE_RACE_001_VERIFY_PASS`**

The integration blocker was a nondeterministic two-process test harness false positive. The test-only repair establishes genuine overlapping acquisition under a live held winner, proves exclusivity with token/PID authority checks, preserves existing contender callers, and is stable under 40/40 stress. Production writer-lease code is unchanged.
