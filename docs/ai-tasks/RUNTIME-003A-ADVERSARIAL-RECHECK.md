# RUNTIME-003A Adversarial Recheck

Status: `ADVERSARIAL_PASS`
Date: 2026-07-06 JST
Source: Gemini 3.1 Pro adversarial recheck supplied by user

## Executive Summary

The repaired RUNTIME-003A Architecture Gate resolves the four previously confirmed architecture blockers:

- ambiguous `alreadyAccepted` caller/lifecycle semantics;
- path-based durable scope identity;
- restore/rewind divergence against a monotonic accepted ledger;
- unsupported concurrent writers.

The repaired design is considered safe enough for v1 implementation.

## Recheck Verdicts

| Area | Verdict |
|:---|:---|
| Structured outcomes / liveness | PASS |
| Restore / rewind epoch semantics | PASS |
| Campaign scope identity | PASS |
| Writer lease / concurrency | PASS |
| Canonical witness ownership | PASS |
| World-state issue separation | PASS |
| ACK residual-risk classification | PASS |
| Ledger format | PASS |

## Required Hardening

### Stale writer lease recovery

The implementation must define robust recovery for a lease left behind after process crash.

Required properties:

- lease records sufficient host/process identity and acquisition time;
- startup can distinguish an active owner from a stale lease;
- stale lease recovery must not rely on PID alone because PID reuse is possible;
- live second hosts must still fail closed;
- recovery behavior must be deterministic and behavior-tested.

This is required hardening, not a new architecture blocker.

## Non-blocking Follow-up

### Explicit UI feedback for `alreadyAccepted`

The repaired Gate already proves that provider `gmEnd` is independent of TurnResult file processing and that `alreadyAccepted` must not fabricate ACK, Accepted callbacks, or mutation.

An explicit replay-suppressed UI/trace notification may improve operator clarity, but is not required to close RUNTIME-003A.

## Remaining Blockers

None.

## Final Verdict

`RUNTIME003A_ADVERSARIAL_PASS`
