# RUNTIME-003A Fifth Reverify Result

- Role: Independent Critical Runtime Fifth Re-Verifier
- AI: ChatGPT / GPT-5.5 / High
- Review commit: `d01b3a068164bde79134f4cd15991faecd15defa`
- Repair base: `78d8ac210f7f7d2055a5b2978fe03b20a941d568`
- Current main at reverify: `ac96ba00a389bf3d017f50bc5aeaf7ef833655ab`
- Branch: `task/RUNTIME-003A-durable-replay-guard`
- Final verdict: `RUNTIME003A_FIFTH_REVERIFY_PASS`

## Scope

This reverify reviewed only the Fifth Verification Repair:

1. multi-workspace heartbeat;
2. workspace release isolation;
3. token-loss isolation;
4. malformed capture failure rollback.

Previously closed RUNTIME-003A areas were not reopened.

The requested external intake was not present on the task branch or review commit, but it was present on current `main` and was read there. It identifies the process-global heartbeat singleton blocker and the targeted malformed-capture cleanup validation that this repair addresses.

No implementation source was modified and no merge was performed.

## 1. Multi-workspace heartbeat

### Verdict: PASS

The previous singleton timer closure bug is closed.

The process still uses one timer, but active heartbeat authority is now stored in a workspace-keyed registry:

```text
resolved workspace path
→ workspace path + expected writer lock token
```

Every interval iterates a snapshot of all registered workspaces.

For each workspace, renewal requires:

- a valid current lease;
- the current host instance;
- the expected registered lock token;
- matching canonical lock ownership.

A workspace that fails renewal or throws is removed individually. The interval continues iterating other entries.

The timer stops only when the registry is empty.

Therefore:

```text
A acquires
→ B acquires
```

registers both A and B under the same process timer. B no longer depends on being the first workspace captured by a timer closure.

The focused test loads a short heartbeat interval and timeout, acquires two independent workspaces in one process, and observes both leases renew. This would fail under the prior first-workspace-only implementation.

## 2. Workspace release isolation

### Verdict: PASS

`releaseAcceptedTurnWriterLeaseForTests(workspacePath)` now:

1. validates that the requested workspace lease and lock belong to this process;
2. removes that workspace's lock and lease;
3. removes only that resolved workspace key from the heartbeat registry;
4. stops the timer only if no registered workspace remains.

Releasing workspace A cannot clear workspace B's registry entry or stop the process timer while B remains registered.

The focused test reads B's renewal timestamp after A is released and waits for a strictly later B renewal. This proves B continues to receive heartbeat service after A release.

## 3. Token-loss isolation

### Verdict: PASS

Heartbeat renewal is bound to the lock token registered for that specific workspace.

If workspace B loses authority:

```text
registered token != current lease token
OR
current canonical lock owner no longer matches
OR
renewal throws
```

B renewal returns false or throws. The interval removes only B's workspace key.

A remains registered and continues renewing.

The focused test mutates B's lease token to foreign authority, then proves:

- A receives a later heartbeat renewal;
- B's foreign token is not overwritten by the stale process heartbeat.

Static source also covers canonical lock-token loss because `lockOwnerMatches()` is part of renewal authority validation.

A separate contender test keeps a healthy registered workspace alive beyond the shortened timeout and proves an independent process receives `writerConflict` instead of stale takeover.

## 4. Malformed capture failure rollback

### Verdict: PASS

The previous cleanup asymmetry is closed.

Malformed recovery now:

```text
acquire fresh lock token T
→ attempt private malformed lease capture
→ validate capture / canonical reappearance / fresh lease commit
→ keep lock only after successful lease commit
→ otherwise finally release lock only if canonical owner still matches T
```

`keepLock` starts false and is set true only when `commitFreshLeaseWithOwnedLock()` succeeds.

Every failure branch after fresh lock acquisition therefore reaches the same `finally` cleanup:

- capture rename fails;
- captured fingerprint validation fails;
- canonical lease reappears;
- fresh lease commit fails.

Cleanup is targeted through `releaseWriterLeaseLockIfOwned(workspacePath, lockToken)`. It removes the canonical lock only when the current owner still matches the failed recoverer's exact token and host authority.

A different host's lock is not removed by this cleanup path.

## 5. Protocol-reachable capture-failure validation

### Verdict: PASS

The external intake correctly asked whether a normal protocol-compliant second host could invalidate the expected malformed fingerprint after A acquired the fresh lock but before A captured the lease.

The focused test pauses A after fresh canonical lock acquisition and before capture, then starts protocol-compliant B.

Result:

- B returns `writerConflict`;
- B does not mutate the malformed canonical lease;
- A resumes and completes recovery;
- final lease token matches final lock-owner token.

This supports the repair report's classification: a normal protocol host cannot create that fingerprint-staleness race while A owns the live fresh lock. Remaining capture failure requires external/non-protocol filesystem fault or injected I/O failure.

## 6. Capture-failure cleanup test

### Verdict: PASS

A deterministic test injects failure into the malformed canonical lease rename after the fresh lock has been acquired.

The test proves:

- the failure reaches the post-lock capture path;
- public outcome is `writerConflict`;
- the freshly acquired canonical lock is removed afterward.

Combined with the production same-token guard, the rollback is load-bearing and targeted rather than a broad recursive lock delete.

## 7. Test quality

### Verdict: PASS

The Fifth Repair tests cover the exact external findings:

- one process acquires two independent workspaces;
- both workspace leases renew;
- release of A is followed by a new B renewal;
- loss of B authority leaves A renewal active;
- B's foreign token is not overwritten;
- a separate process cannot stale-take over healthy registered B beyond timeout;
- normal protocol B cannot mutate malformed authority while A owns the fresh lock before capture;
- injected capture failure after fresh lock acquisition returns `writerConflict` and rolls back the fresh lock.

The tests are load-bearing:

- restoring the old first-workspace-only timer would leave B unrenewed;
- restoring global timer clearing on A release would prevent the required later B renewal;
- removing per-workspace token binding would overwrite or continue servicing lost B authority;
- removing the malformed recovery `finally` rollback would leave the injected fresh lock present.

## 8. Narrow scope integrity

### Verdict: PASS

The review commit is exactly one commit after the Fourth Reverify result and changes only:

- `src/acceptedTurnReplayGuard.ts`;
- `scripts/test_runtime_accepted_replay_guard.js`;
- `docs/ai-tasks/RUNTIME-003A-FIFTH-VERIFICATION-REPAIR-RESULT.md`.

No previously closed architecture area was redesigned in this repair.

## 9. Execution

### Independent execution

NOT RUN.

Reason:

- no local LoreRelay checkout was present;
- direct `git ls-remote` failed because `github.com` could not be resolved;
- no GitHub Actions workflow run existed for `d01b3a068164bde79134f4cd15991faecd15defa`.

Execution unavailability is not a failure reason.

### Repair-side execution evidence

The Fifth Verification Repair report records:

- `npm run compile`: PASS;
- `node scripts/test_runtime_accepted_replay_guard.js`: PASS;
- `npm test`: PASS `225/225`.

These are implementation-side results, not independent execution evidence.

## 10. Remaining blockers

None in the requested Fifth Verification Repair scope.

## 11. New findings

No new merge-blocking runtime finding was found in the reviewed scope.

Nonblocking note: `RUNTIME-003A-FINAL-EXTERNAL-FAIL-INTAKE.md` is on `main`, not on the reviewed task branch/review commit.

## Final verdict

`RUNTIME003A_FIFTH_REVERIFY_PASS`
