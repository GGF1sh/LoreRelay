# RUNTIME-003A Second Reverify Fail Intake

Status: `IMPLEMENTING (Third Verification Repair)`
Date: 2026-07-07 JST

Source reverify commit:
`639fa537401dadfb7e7746378cdd9a6dbf2d37c1`

Reviewed repair source:
`82f80618620a650d1bb1cb3bab4af935ba887d65`

Final verdict:
`RUNTIME003A_SECOND_REVERIFY_FAIL`

## Closed and not to reopen broadly

- R3A-V1 witness semantic authority: PASS
- R3A-V2 epoch-safe raw hash: PASS
- R3A-V3 per-epoch reconciliation / legacy ambiguity / rebind: PASS
- established stale-owner takeover: PASS
- PID reuse: PASS
- heartbeat source protocol: PASS
- six restore paths successful routing: PASS
- narrow restart regression: PASS
- fallback lifecycle: PASS
- world-state separation: PASS

## Remaining blockers

### R3A-V4A — delayed first acquirer vs orphan recovery

A first acquirer may create `lockDir`, pause beyond orphan grace before writing owner metadata, and later resume after another host recovered the apparent orphan and acquired new authority.

Current first-acquirer metadata write is not bound to proof that the current lock path is still the same acquisition authority it created.

Required property:
- a delayed initial acquirer must not be able to overwrite a later recovery winner;
- ownership installation must prove continuity from the exact acquisition primitive/token it created;
- if continuity is lost, the delayed acquirer must fail rather than write metadata or return success.

### R3A-V4B — concurrent malformed-authority recovery

A malformed-recovery contender may move old lock authority, then later quarantine the current lease path without proving that the lease still matches the malformed authority it inspected.

A concurrent winner can install a fresh valid lease in the meantime, which the stale recoverer may then quarantine.

Required property:
- quarantine/removal must be conditional on the exact expected malformed authority/generation/token/state;
- stale evidence must never invalidate a fresh winner.

### R3A-V5 — durable post-rotation repair latch

Successful restore execution is fully serialized, but a restore failure after epoch rotation is only represented in memory.

After queue release, the workspace may look superficially valid (`new epoch`, `no active head`, `no witness`) even though restore failed partially.

Required property:
- any failure after replay-authority transition begins must durably fail closed before single-flight release;
- queued/new TurnResult processing must observe the durable repair-required state and refuse mutation;
- explicit coordinated recovery/repair must be required to clear the latch;
- do not broaden into global rollback or CHATGPT-20260706-002.

## Test requirements

Add behavior tests that fail without each repair:

- two-process empty workspace acquisition;
- delayed initial acquirer beyond orphan grace versus recovering contender;
- two-process concurrent malformed-authority recovery;
- long provider heartbeat with separate contender;
- post-rotation restore failure followed by queued TurnResult;
- real restore handlers under contention where practical.

Do not reopen already-closed blocker groups.
