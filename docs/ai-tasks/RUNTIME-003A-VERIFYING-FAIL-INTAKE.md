# RUNTIME-003A Verification Fail Intake

Status: `IMPLEMENTING (Verification Repair)`
Date: 2026-07-06 JST

Source verification commit:
`97a30f12d78752e2da0870be4528d7f81252a763`

Reviewed implementation:
`e25b7d1307efd126419d6e69754667e10db5c9d5`

## Final verification verdict

`RUNTIME003A_VERIFYING_FAIL`

The architecture remains valid, but implementation misses five load-bearing contracts.

## Blockers

### R3A-V1 — Witness ownership / fail-closed divergence

- Host witness ownership is not centralized at the state write choke point.
- Generic commits can overwrite/drop `runtimeAcceptedTurn`.
- Missing/malformed/wrong-epoch witness can be ignored instead of producing `repairRequired`.

Required repair:
- centralize host-only preserve/install/clear semantics;
- ordinary commits preserve trusted disk witness and ignore incoming authority;
- accepted-turn commit alone installs a new witness;
- malformed/missing/wrong-epoch active-history witness fails closed.

### R3A-V2 — Epoch-unsafe process-local raw hash

- `lastProcessedTurnHash` is checked before durable epoch-aware identity.
- It is not reset or scoped by `timelineEpochId`.
- Same bytes in a valid new alternate-future epoch can be falsely suppressed.

Required repair:
- durable epoch-aware preflight must outrank raw-hash fast path;
- raw hash must be scoped/reset so it cannot cross epochs.

### R3A-V3 — Ledger authority / reconciliation incomplete

Required repair:
- bind ledger authority to current campaign;
- recompute and validate record identity hashes;
- enforce active witness/head consistency;
- reconcile witness-first before evaluating a newer observed TurnResult;
- preserve valid backup during primary recovery;
- broken or foreign authority fails closed.

### R3A-V4 — Writer lease unsound

Current implementation is timestamp-only in practice.

Required repair:
- live owner cannot be stolen after timeout merely because no heartbeat ran;
- simultaneous first acquisition must be exclusive or CAS-like;
- malformed lease is uncertain authority and must not be silently overwritten;
- stale recovery must use more than PID alone;
- long provider runs need lease renewal/heartbeat or equivalent ownership proof.

### R3A-V5 — Restore / rewind / Git runtime authority

Required repair:
- quarantine retained TurnResult before epoch rotation;
- quarantine failure must not rotate epoch;
- restore must serialize with TurnResult processing;
- process-local hash state must not cross epoch;
- runtime authority files must not be accidentally Git-tracked;
- manual divergence must fail closed.

## New in-scope findings

1. Valid `.bak` can be destroyed during backup-based recovery if recovery uses normal backup creation over a corrupt primary.
2. Missing scope plus retained legacy TurnResult does not fail closed as `legacyAmbiguous`.
3. Git Timeline initialization may track `.text-adventure/runtime/` replay-authority files because initial setup uses `git add .` without runtime exclusion.

## Areas that passed and should not be reopened broadly

- narrow restart duplicate suppression path;
- structured outcome taxonomy;
- direct-write fallback static lifecycle;
- process-local single-flight for TurnResult file processing;
- separation from `CHATGPT-20260706-002`.

## Repair discipline

Do not redesign RUNTIME-003A.
Do not broaden into world-state partial mutation.
Do not modify PROMPT-001C semantics.
Do not merge before independent re-verification.
