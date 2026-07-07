# RUNTIME-003A o3 Writer Lease Adversarial Audit

Date: 2026-07-06 JST
Role: Specialist adversarial logic audit
Model: o3

Audited implementation:
- Branch: `task/RUNTIME-003A-durable-replay-guard`
- Source commit: `1c988abb3e6228608dcc86ced1502b93a886aa9b`
- File: `src/acceptedTurnReplayGuard.ts`

Final verdict:
`WRITER_LEASE_LOGIC_FAIL`

## Independently confirmed blockers

### 1. Stale takeover race — safety failure

Two contenders can both inspect the same stale prior authority. One contender may remove the stale lock and create a fresh lock; the other contender, still acting on stale evidence, may then remove the first contender's fresh lock and create its own.

Result:
- both acquisition calls may believe they succeeded;
- concurrent writer authority can exist for a window.

Root cause:
- stale takeover uses unconditional lock-directory removal without a fresh ownership compare-and-swap check.

### 2. Orphan lock — liveness failure

Crash window:

```text
mkdir writer_lease.lock
→ crash
→ writer_lease.json never written
```

A later process observes:
- lock directory exists;
- lease metadata absent.

The current recovery logic has no trustworthy prior lease evidence and can remain stuck in `writerConflict` indefinitely.

### 3. PID reuse — liveness failure

The lease records `processStartedAt`, but stale-owner validation does not compare stored process start identity with actual current process-start evidence.

Attack:

```text
old owner dies
→ OS reuses PID for unrelated process
→ lease expires
→ recovery sees PID alive
→ stale owner treated as live indefinitely
```

PID alone therefore remains an unsafe liveness authority.

## Additional o3 concerns

### Malformed metadata

Current fail-closed behavior preserves safety but can permanently block recovery without an explicit operator/recovery path.

### Quick restart

A process restart with a new hostInstanceId can experience a timeout blackout before reacquisition.

### Wall-clock dependence

Renewal and timeout use wall-clock timestamps. Significant clock jumps may distort freshness classification.

These additional concerns should be evaluated during repair, but the confirmed blockers above are sufficient for FAIL.

## Relationship to ChatGPT 5.5 Reverify

The o3 audit independently confirms the same three remaining writer-lease failures already identified in:

`docs/ai-tasks/RUNTIME-003A-REVERIFY-RESULT.md`

Therefore R3A-V4 remains a confirmed blocker.

## Repair direction

Do not apply an unconditional stale-lock delete-and-recreate flow.

Required properties:

1. stale takeover must be compare-and-swap safe;
2. orphan lock recovery must be explicit and bounded;
3. owner identity must distinguish PID reuse using process-start evidence where practical;
4. malformed authority must remain fail-closed but need an explicit safe recovery mechanism;
5. graceful release should reduce restart blackout where possible;
6. any clock/freshness logic must not create a second live writer.

The exact implementation mechanism should be chosen by the repair engineer and re-verified adversarially.
