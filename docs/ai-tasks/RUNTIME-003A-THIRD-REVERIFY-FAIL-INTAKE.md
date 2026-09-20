# RUNTIME-003A Third Reverify Fail Intake

Status: `IMPLEMENTING (Fourth Verification Repair)`
Date: 2026-07-07 JST

Source reverify commit:
`8ab06b590cf2c5f2b6ea8f92b0836cc5c1e02ca8`

Reviewed repair source:
`0f6908ca0d5ea45f4d40b9f9bd67940eac91ab2d`

Final verdict:
`RUNTIME003A_THIRD_REVERIFY_FAIL`

## Closed and not to reopen broadly

- R3A-V1 witness semantic authority: PASS
- R3A-V2 epoch-safe raw hash: PASS
- R3A-V3 per-epoch reconciliation / legacy ambiguity / rebind: PASS
- delayed initial acquisition: PASS
- orphan recovery: PASS
- established stale takeover: PASS
- PID reuse: PASS
- normal heartbeat protocol: PASS
- successful restore full isolation: PASS
- queued TurnResult blocking when latch write succeeds: PASS
- normal async Git failure with successful latch write: PASS
- narrow restart regression: PASS
- fallback lifecycle: PASS
- world-state separation: PASS

## Remaining blockers

### R3A-V4 — malformed-authority quarantine TOCTOU

Current flow:

```text
fingerprintMatches(path, expectedMalformedEvidence)
→ quarantineLeaseFile(path)
```

The check and rename are separate operations.

A stale recoverer can validate malformed lease M, pause, allow another host to quarantine M and install fresh valid lease N at the same path, then resume and quarantine N.

Required property:
- recovery authority derived from evidence M must never delete, rename, quarantine, replace, or otherwise invalidate authority N that appeared afterward.

Repair requirement:
- destructive quarantine must be atomically or generation-safely bound to the exact authority object/evidence that authorized it;
- stale evidence must fail rather than act on a replaced path;
- a test must pause after successful evidence validation but before destructive quarantine and prove the fresh winner survives.

### R3A-V5 — fail-closed when durable latch write fails

Normal durable repair latch behavior is correct when the latch file is written successfully.

Remaining failure:

```text
post-epoch restore mutation fails
→ attempt to write durable repair latch
→ latch write itself fails
→ only in-memory repairRequired returned
→ single-flight releases
```

No durable fallback and no process-local blocker remains.

Required property:
- after replay-authority transition, failure to write the durable repair latch must itself fail closed;
- queued/new TurnResult processing must remain blocked in-process before queue release;
- provider dispatch must remain blocked in-process;
- if durable storage remains unavailable, the host must not resume mutation authority silently;
- restart semantics must be described honestly: process-local fallback can protect the current host, but durable protection across restart requires a successful durable marker or explicit operator repair path.

Do not broaden into global rollback or TEMP transaction work.

## Required tests

1. Pause malformed recovery after successful fingerprint/evidence validation but before rename/quarantine.
2. Concurrent fresh winner installs valid lease.
3. Stale recoverer resumes and must not touch fresh winner.
4. Inject repair-latch write failure after epoch rotation and partial restore mutation.
5. Queued TurnResult must remain blocked before single-flight release.
6. Provider dispatch must remain blocked in-process.
7. Verify honest restart behavior when durable latch could not be persisted.

Do not reopen already-closed blocker groups.
