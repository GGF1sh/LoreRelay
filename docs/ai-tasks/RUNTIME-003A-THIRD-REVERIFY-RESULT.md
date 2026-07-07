# RUNTIME-003A Third Reverify Result

- Role: Independent Critical Runtime Third Re-Verifier
- Current main: `a92b819e4d24b1fe86b108ce610f536a9a68f196`
- Third repair source: `0f6908ca0d5ea45f4d40b9f9bd67940eac91ab2d`
- Third repair report: `dfbd4887d05814e6770d3b2a39f4e12129470fb8`
- Branch: `task/RUNTIME-003A-durable-replay-guard`
- Final verdict: `RUNTIME003A_THIRD_REVERIFY_FAIL`

## Scope and execution

Only the three remaining blocker classes were reopened:

1. delayed initial acquirer vs orphan recovery;
2. concurrent malformed-authority recovery;
3. durable fail-closed state after post-rotation restore failure.

Previously-passed areas were checked only narrowly. No source was modified and no merge was performed.

Independent execution was unavailable. No local LoreRelay checkout existed and direct GitHub DNS resolution failed. No GitHub Actions run existed for the third repair source. This is not the reason for FAIL.

## Delayed initial acquisition — PASS

Fresh acquisition now uses a unique tokenized pending directory:

```text
create pending directory
→ write owner metadata into pending directory
→ atomic rename pending → canonical lock directory
→ verify canonical owner token/host continuity
→ write lease
→ reread lease and reverify canonical owner continuity
→ start heartbeat
→ return success
```

The old canonical metadata-less lock window is gone.

Attack results:

- two empty-workspace contenders: only one pending directory can become canonical;
- pause before pending owner metadata: another host may win canonical authority, and the paused contender later loses rename;
- pause after pending owner metadata but before canonical rename: same result;
- pause after canonical rename but before lease: canonical owner metadata identifies the live process, so orphan recovery refuses takeover;
- pause after lease write but before success: lease and canonical owner continuity are rechecked before success.

A contender can return success only after its own token is visible in both canonical lock authority and committed lease.

## Orphan recovery — PASS

Abandoned pending acquisition directories are non-canonical and do not block future acquisition.

Canonical orphan cases are recoverable:

- crash before canonical rename: no canonical authority remains;
- crash after canonical rename but before lease: canonical owner metadata exists, so a live process is protected and a dead process becomes recoverable after grace;
- two contenders recovering the same abandoned canonical authority: only one can rename the canonical lock directory.

The fixed grace period is not the sole safety authority for canonical locks; live owner metadata is checked before recovery.

## Concurrent malformed-authority recovery — FAIL

The fingerprint repair improves the previous race but does not make quarantine atomic with the fingerprint check.

Current sequence is:

```text
fingerprintMatches(leasePath, expected)
→ quarantineLeaseFile(leasePath)
```

These are separate filesystem operations.

A valid interleaving remains:

```text
A renames the old malformed lock away
A reaches fingerprint check and confirms malformed file M
A is descheduled before rename

B quarantines M
B acquires fresh canonical lock
B writes fresh valid lease N
B returns success

A resumes
A renames the current lease path
```

A can therefore quarantine B's fresh valid lease N even though A's authorization came from the earlier malformed file M.

The fingerprint contains size, mtime, and SHA-256, but that does not bind the later rename to the exact file object that was checked. This is a check-then-rename TOCTOU.

The production test pauses A before fingerprint evaluation, lets B fully finish, and then resumes A. That proves changed-file detection after B completes, but it does not exercise the window after A's successful fingerprint comparison and before A's rename.

Expected property remains unmet:

```text
stale recoverer must not delete, rename, quarantine, or overwrite fresh winner authority
```

## Durable restore repair latch — FAIL

Normal latch creation and observation are correctly implemented:

- TurnResult preflight checks the latch first;
- scope bootstrap fails closed while latch exists;
- single-stage provider dispatch checks the latch before writer authority;
- agentic provider dispatch checks the latch;
- malformed latch files also fail closed;
- ordinary state commits do not clear it;
- runtime directory remains outside Git Timeline gameplay authority;
- only the explicit repair helper clears it.

The remaining blocker is latch-write failure itself.

After epoch rotation, restore mutation failure does:

```text
try writeRestoreRepairLatch(...)
catch latch error
→ return in-memory repairRequired
→ release single-flight
```

No durable fallback authority and no process-local blocking latch are installed when the latch write fails.

Therefore this sequence remains possible:

```text
epoch rotates
→ partial restore mutation occurs
→ later restore step fails
→ durable latch write fails
→ transaction returns repairRequired
→ single-flight releases
→ queued TurnResult runs
```

If the partial restore already produced a witness-less fresh epoch with no active epoch ledger head, preflight can return `unseen` and mutation can proceed.

This fails the explicit requirement that latch-write failure itself remain fail closed.

## Queued TurnResult after failed restore — PASS when latch write succeeds

For the normal post-rotation failure path where durable latch creation succeeds:

- queued TurnResult waits behind the restore transaction;
- latch exists before queue release;
- preflight returns `repairRequired`;
- `processTurnResult` is not entered;
- no canonical mutation, world simulation, Handled, callback, ACK, context consumption, provider dispatch, or success-only effects occur;
- process-local reset/restart still observes the latch.

The overall V5 verdict remains FAIL because the latch-write-failure branch is not protected.

## Async Git failure — PASS

Actual Git Timeline source routes branch-from-turn and branch switch through the shared full restore transaction wrapper.

The wrapper awaits the async Git mutation and writes the durable latch before releasing single-flight when the callback throws.

Therefore a normal async checkout failure after epoch rotation is blocked when latch writing succeeds.

The focused test uses the shared helper with a Git-style reason rather than executing the real Git call site; source-level call-site inspection is what supports this PASS.

## R3A-V4 overall — FAIL

Closed:

- delayed initial acquisition;
- canonical orphan recovery;
- established valid stale-owner takeover;
- PID reuse handling;
- normal heartbeat ownership checks.

Open:

- malformed recovery fingerprint check-to-rename TOCTOU.

## R3A-V5 overall — FAIL

Closed:

- full successful restore isolation;
- durable latch on normal post-rotation failure;
- latch observation by TurnResult/provider/scope paths;
- restart persistence;
- normal async Git failure handling.

Open:

- failure to write the durable repair latch after replay-authority transition.

## Narrow regressions

Narrow static checks remain PASS:

- R3A-V1 witness semantic authority;
- R3A-V2 epoch-safe raw hash;
- R3A-V3 per-epoch reconciliation / legacy ambiguity / rebind;
- exact retained Accepted duplicate suppression;
- fallback lifecycle;
- established stale takeover;
- PID reuse;
- normal heartbeat;
- successful restore isolation;
- world-state separation and `CHATGPT-20260706-002` separation.

## Test quality — FAIL

Tests are substantially stronger, including separate-process empty acquisition, established stale takeover, delayed canonical-owner pause, malformed recovery race, heartbeat contender, queued TurnResult after restore failure, and latch persistence.

Remaining weaknesses are load-bearing:

1. malformed recovery does not synchronize inside the window between successful fingerprint comparison and quarantine rename;
2. latch-write failure is not injected after epoch rotation;
3. queued TurnResult behavior is tested only for successful latch creation;
4. async Git failure is helper-level rather than behavioral execution of the real Git call site;
5. the delayed-acquirer test pauses after canonical lock installation, not at every pending-authority phase requested.

Current tests can pass with both remaining source defects.

## Execution

Independent execution: NOT RUN.

Third repair report evidence:

- `npm run compile`: PASS
- `npm test`: PASS `225/225`
- i18n validation: PASS

These are implementation-side results, not independent third-reverify execution.

## Remaining blockers

1. `R3A-V4`: malformed-authority quarantine is not atomically bound to the fingerprinted file evidence.
2. `R3A-V5`: latch-write failure after epoch rotation releases the queue without durable or process-local fail-closed authority.

## New findings

1. Fingerprint validation and lease quarantine have a TOCTOU window that can remove a fresh winner's valid lease.
2. Durable latch creation failure is handled only as a returned error; it does not preserve fail-closed mutation blocking after queue release.

## Final verdict

`RUNTIME003A_THIRD_REVERIFY_FAIL`
