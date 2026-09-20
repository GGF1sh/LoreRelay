# RUNTIME-003A Final External Fail Intake

Status: IMPLEMENTING (Fifth Verification Repair)
Date: 2026-07-07 JST

External reviewer verdict:
`RUNTIME003A_FINAL_EXTERNAL_FAIL`

Reviewed source:
`061b98d001f2e382e3cffe34de4c427d11e25aea`

## Confirmed blocker

### P1 — process-global heartbeat timer captures only the first workspace

Final source has one process-global timer:

```text
let heartbeatTimer: NodeJS.Timeout | undefined
```

and `startWriterLeaseHeartbeat(workspacePath)` returns immediately once that timer exists. The timer closure therefore keeps renewing only the first workspace path that started it.

Consequences for multiple active workspaces in one extension host/process:

- workspace A starts the singleton heartbeat;
- workspace B acquires a valid writer lease but gets no periodic renewal;
- B can age past `WRITER_LEASE_TIMEOUT_MS` while the owning process is still alive;
- a competing host can eventually recover B as stale according to the lease protocol;
- the original host later fails closed on B with `writerConflict`.

`releaseAcceptedTurnWriterLeaseForTests(workspacePath)` also clears the same global timer, so releasing one workspace can stop heartbeat service for another.

Required repair:

- manage active writer-heartbeat state per workspace; or
- run one timer that iterates all active workspace paths/tokens.

Required behavior:

- acquiring B must not stop or omit renewal for A;
- acquiring A must not omit renewal for B;
- releasing one workspace must not stop heartbeat for others;
- stale/lost authority must remove only that workspace from active heartbeat state;
- reset-for-tests must clear the whole registry/timer safely.

Required tests:

1. one process acquires two independent workspaces;
2. both remain renewed beyond timeout;
3. releasing A does not stop B renewal;
4. loss of B token does not affect A;
5. a contender cannot stale-take over B while the same-process owner is healthy and B remains registered.

## Secondary finding requiring targeted validation

### Malformed recovery may retain a freshly acquired lock when capture fails

`recoverMalformedLeaseWithFreshLock()` acquires a fresh lock token and returns `false` when `captureMalformedLeaseForRecovery()` fails, without an explicit same-token lock rollback in that branch.

This is a real cleanup asymmetry in source. Its severity depends on whether a protocol-reachable schedule can cause capture failure after fresh-lock acquisition without out-of-scope arbitrary filesystem replacement.

Before broad repair, verify with a deterministic normal-host interleaving:

- can two protocol-compliant hosts cause the expected malformed fingerprint to become stale after A acquires the fresh lock but before A captures the lease?
- if yes, classify as P1 liveness blocker and repair with same-token rollback;
- if only arbitrary external file rewriting can create it, keep as hardening/nonblocking and still consider safe cleanup.

Do not rely on `git restore` as proof unless the runtime directory is actually Git-tracked/restored by the production timeline path.

## Non-blocking cleanup

Rename or split `renewAcceptedTurnWriterLeaseForTests` so production heartbeat does not call an API named as test-only. This is naming/maintainability only unless a behavioral difference is discovered.

## Closed areas not to reopen broadly

- R3A-V1 witness authority
- R3A-V2 epoch-safe raw hash
- R3A-V3 reconciliation / rebind
- delayed acquisition / orphan recovery
- established stale takeover
- PID reuse / process-start evidence
- malformed private-capture TOCTOU fix
- durable repair latch and emergency same-process latch
- successful restore isolation
- fallback lifecycle
- world-state separation

## Verdict

The external review is valid against the final source and identifies one confirmed implementation blocker.

`RUNTIME003A_FIFTH_REPAIR_REQUIRED`
