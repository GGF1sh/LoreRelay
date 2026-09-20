# RUNTIME-003A Fourth Reverify Result

- Role: Independent Critical Runtime Fourth Re-Verifier
- Current main: `59c25052c4acf9f03edaddbe8966359e58c64f77`
- Previous third reverify FAIL: `8ab06b590cf2c5f2b6ea8f92b0836cc5c1e02ca8`
- Fourth repair commit: `061b98d001f2e382e3cffe34de4c427d11e25aea`
- Branch: `task/RUNTIME-003A-durable-replay-guard`
- Final verdict: `RUNTIME003A_FOURTH_REVERIFY_PASS`

## Scope and inputs

This reverify reopened only the two remaining blocker classes:

1. malformed-authority quarantine TOCTOU;
2. fail-closed behavior when durable restore repair latch writing itself fails.

Previously-passed RUNTIME-003A areas were checked only narrowly for regression.

`docs/ai-tasks/RUNTIME-003A-THIRD-REVERIFY-FAIL-INTAKE.md` was not present on the reviewed branch. The authoritative previous-failure details were available in `RUNTIME-003A-THIRD-REVERIFY-RESULT.md` and the fourth repair report, so verification continued without broadening scope.

No implementation source was modified and no merge was performed.

## 1. Malformed-authority quarantine TOCTOU

### Verdict: PASS

The prior check-then-rename pattern is removed.

Current recovery sequence is:

```text
acquire a fresh canonical writer-lock token
→ atomically rename canonical lease path to a unique private captured path
→ fingerprint the captured private file
→ compare captured fingerprint with the evidence that authorized recovery
→ pause/test adversarial replacement window if enabled
→ refuse if canonical lease path has reappeared
→ commit fresh lease only if the same canonical lock token is still owned
→ reread committed lease and reverify token + lock ownership
→ return success
```

The stale recoverer no longer validates M and later renames whatever happens to be at the canonical lease path.

After successful capture, it never deletes, renames, or quarantines a replacement canonical lease. The only canonical-path operation after capture is an existence check followed by fresh-lease commit under the same owned lock token.

### Fresh winner attack

Attack:

```text
A captures malformed M privately and validates it
→ A loses lock continuity / pauses
→ B acquires fresh lock and installs valid lease N
→ A resumes
```

Result:

```text
canonical lease path exists
→ A returns failure before fresh lease commit
→ A does not remove or rename N
```

If N has not yet been written but B already owns the lock, A's later `commitFreshLeaseWithOwnedLock()` fails the same-token lock-owner check before writing.

Exactly one writer can return success.

### Identical-content replacement

A canonical replacement containing bytes identical to M is still detected by canonical path reappearance. Content identity is irrelevant after capture.

The stale recoverer does not fingerprint the new canonical path and does not treat identical bytes as permission to act on that replacement generation.

### Other requested attacks

- canonical path reappears with different malformed bytes: fail closed; replacement remains untouched;
- canonical path reappears with valid fresh lease: fail closed; replacement remains untouched;
- lock token changes after capture: `commitFreshLeaseWithOwnedLock()` refuses before write;
- captured fingerprint validation fails: the captured file is restored only when canonical path is still empty; a replacement canonical path is never overwritten;
- crash after private capture: private artifact may remain, canonical lock owner becomes dead, and normal orphan recovery can later recover canonical writer authority;
- crash after validation before commit: same fail-closed/liveness behavior.

No production interleaving was found where evidence from M authorizes destructive action against later authority N.

## 2. Private-capture authority binding

### Verdict: PASS

Authority is bound by two independent facts:

1. the exact file generation captured by atomic rename and validated at the private path;
2. the exact fresh canonical lock token owned by the recoverer.

Fresh lease commit additionally requires:

```text
canonical lease path still absent
AND canonical lock owner still matches this host + lock token
```

The captured file itself is never used to authorize a later rename of the canonical path.

## 3. Malformed recovery test quality

### Verdict: PASS

The focused test uses separate Node processes and deterministic synchronization markers.

The stale recoverer is paused after `captureMalformedLeaseForRecovery()` has:

- atomically captured the old malformed canonical lease;
- successfully validated the captured private fingerprint.

A test-only hook then removes the stale recoverer's lock before the pause, intentionally simulating ownership continuity loss so a separate process can install fresh authority N.

The hook does not alter the production recovery decision after resume. It creates a stronger adversarial schedule: the stale process has already validated M but no longer owns the lock.

The test proves:

- B installs a fresh valid lease while A is paused;
- exactly one process reports success;
- B is the winner;
- A returns `writerConflict`/fail-closed;
- final lease token equals final canonical owner token;
- A does not remove B's lease.

A separate test writes identical malformed bytes back to the canonical lease path after A validated the captured generation and proves the replacement remains untouched.

Removing the private-capture/canonical-reappearance repair would cause these tests to fail.

## 4. Durable latch-write failure

### Verdict: PASS

When post-epoch restore mutation fails:

```text
try durable latch write
```

If durable latch writing fails, the guard synchronously installs a workspace-scoped process-local emergency repair latch before returning from the single-flight callback.

The emergency latch is stored in a module-local `Map` keyed by resolved workspace path.

`getAcceptedTurnRestoreRepairLatchOutcome()` checks process-local emergency authority before reading the durable latch file.

Therefore all callers that already use the shared latch outcome inherit the emergency block.

### Same-process blocking

After durable latch write failure:

- queued TurnResult preflight returns `repairRequired`;
- watcher processing stops before `processTurnResult()`;
- fallback processing reaches the same preflight path and remains blocked;
- `ensureAcceptedTurnScope()` throws before provider/scope bootstrap;
- single-stage provider dispatch checks the latch outcome before writer authority;
- agentic provider dispatch checks the latch outcome before writer authority;
- repeated preflight/provider attempts do not clear the emergency latch;
- ordinary state commits do not touch the emergency latch;
- there is no timeout-based clearing.

## 5. Queued TurnResult after latch-write failure

### Verdict: PASS

The production ordering is:

```text
restore enters single-flight
→ epoch rotates
→ partial restore mutation
→ restore callback fails
→ durable latch write fails
→ process-local emergency latch is installed
→ restore callback returns repairRequired
→ single-flight releases
→ queued TurnResult runs
→ preflight observes emergency latch
→ repairRequired before processTurnResult
```

The focused test forces durable latch write failure after epoch rotation and proves the queued TurnResult waits until restore completion, then remains blocked without a durable latch file.

The watcher integration test separately proves no:

- `processTurnResult` call;
- canonical mutation;
- Handled transition;
- callback;
- dedupe hash commit;
- media/auto-image/bootstrap;
- success UI side effects.

PROMPT ACK and Chronicle/WCS consumption remain downstream of truthful Accepted callback/processing and are not reached by this repairRequired path.

## 6. Provider blocking

### Verdict: PASS

The process-local latch is returned by the same `getAcceptedTurnRestoreRepairLatchOutcome()` used by provider entry points.

Same-process provider/scope bootstrap is blocked through:

- direct latch check in normal GM dispatch;
- direct latch check in agentic GM dispatch;
- `ensureAcceptedTurnScope()` as an additional fail-closed barrier.

Repeated attempts do not clear the latch.

## 7. Emergency-latch failure path

### Verdict: PASS

The emergency installation path is deliberately non-I/O:

```text
path.resolve(valid workspace string)
→ Map.set(workspaceKey, latchObject)
```

Under the supported in-process fault model, this is effectively infallible and has no filesystem/network/async failure window.

If process-local installation itself were to throw because of catastrophic JavaScript runtime failure such as unrecoverable memory exhaustion, the current function would reject rather than install authority, and the internal queue chain could later continue. That is the real code behavior, but it requires failure of basic in-memory object allocation / `Map.set`, not a recoverable application-level error. It is outside the practical fault model requested here and is not treated as a blocker.

No ordinary, realistic second fail-open path was found.

## 8. Restart semantics

### Verdict: PASS

The implementation is honest:

### Durable latch succeeds

The file-backed latch survives extension-host/process restart and continues to block mutation.

### Durable latch fails; emergency latch only

The current process remains blocked.

After actual process restart, process-local state is gone. The implementation does not claim otherwise.

`resetAcceptedTurnReplayGuardForTests()` intentionally clears process-local state to model that restart boundary, and the test explicitly asserts that emergency state does not masquerade as durable restart proof.

## 9. Clearing policy

### Verdict: PASS

Emergency and durable latches are not cleared by:

- startup;
- scope bootstrap;
- provider start;
- state parsing;
- ordinary state commit;
- repeated TurnResult/preflight;
- rebind;
- restore retry;
- timeout.

The production clear authority is the explicit trusted helper `clearAcceptedTurnRestoreRepairLatchForRepair()`, which clears both process-local and durable state.

The test-only reset helper clears process-local state specifically to model process restart/reset and is not ordinary production lifecycle behavior.

## 10. Narrow regressions

### Verdict: PASS

No narrow regression was found in previously-passed areas:

- R3A-V1 witness semantic authority;
- R3A-V2 epoch-safe raw hash;
- R3A-V3 per-epoch reconciliation / legacy ambiguity / rebind;
- delayed initial acquisition;
- orphan recovery;
- established stale takeover;
- PID reuse;
- heartbeat;
- normal durable latch behavior;
- successful restore isolation;
- exact retained Accepted duplicate suppression;
- fallback lifecycle;
- world-state issue separation (`CHATGPT-20260706-002`).

Only `src/acceptedTurnReplayGuard.ts` changed in production source for the fourth repair.

## 11. Test quality

### Verdict: PASS

The two formerly-open repairs are now load-bearing.

Malformed recovery proof includes:

- separate Node processes;
- deterministic pause after successful private captured-file validation;
- fresh winner installation during the pause;
- exactly-one-success assertion;
- stale loser `writerConflict` assertion;
- final lease/owner token equality;
- identical-content replacement survival.

Emergency latch proof includes:

- forced durable latch write failure after epoch rotation;
- queued same-process TurnResult;
- no durable latch file;
- emergency `repairRequired` outcome;
- repeated preflight blocking;
- provider/scope bootstrap blocking;
- honest process-reset semantics;
- explicit trusted clear;
- watcher integration proving no mutation/success side effects.

If either repair were removed, the corresponding focused tests would fail.

## 12. Execution

### Independent execution

NOT RUN.

Reason:

- no local LoreRelay checkout was present;
- `git ls-remote` failed because `github.com` could not be resolved;
- no GitHub Actions workflow run existed for `061b98d001f2e382e3cffe34de4c427d11e25aea`.

Execution unavailability is not a failure reason.

### Repair-side execution evidence

The fourth repair report records:

- `npm ci --include=dev`: PASS;
- `npm run compile`: PASS;
- focused replay guard: PASS;
- runtime TurnResult acceptance: PASS;
- requested pipeline/state/atomicity/cross-ledger/PROMPT/Inspector regressions: PASS;
- `npm test`: PASS `225/225`;
- `node scripts/check_i18n_keys.js`: PASS, 1024 referenced keys and zero missing keys in `ja`, `en`, `zh-CN`, `zh-TW`.

The report also notes that `scripts/validate/check_i18n_keys.js` does not exist; the current user-requested command uses the actual repository path `scripts/check_i18n_keys.js`.

## 13. Remaining blockers

None in the requested fourth-reverify scope.

## 14. New findings

No new runtime blocker was found in the repaired scope.

Nonblocking verification note: the requested third-reverify fail intake document was absent from the branch, but its blocker content was fully present in the previous reverify result and fourth repair report.

## Final verdict

`RUNTIME003A_FOURTH_REVERIFY_PASS`
