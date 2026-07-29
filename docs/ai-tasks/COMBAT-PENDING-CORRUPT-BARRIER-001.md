# COMBAT-PENDING-CORRUPT-BARRIER-001

## Status

IMPLEMENTED — fail-closed `scanPendingDirectoryForApply` + apply batch gate

## Base

- `main`: `e00d00ac4c492ebc2a8526f49f7469eac1d8f302`
- Trigger: PR #64 exact-head Codex review
- Risk: High — save-state ordering / absolute HP application

## Problem

`listPendingApplyEligibleReceipts()` silently skips malformed JSON and records that do not satisfy the apply-eligible receipt schema. `applyAllPendingCombatOutcomes()` therefore cannot see an older invalid PENDING entry and may apply a newer absolute-HP receipt first. If the older entry is later repaired, campaign combat order is reversed.

## Required behavior

Fail closed before applying any receipt when `pending/` contains a `.json` entry that cannot be parsed or validated as an apply-eligible `combat-outcome-receipt-v1`.

Return a visible blocked/error result such as `INVALID_PENDING_RECEIPT`; do not silently skip, delete, or quarantine the file in this task.

After the directory passes structural validation, preserve the existing campaign-order sort and stop-on-first-`!ok` behavior.

## Acceptance criteria

1. Malformed JSON in `pending/` blocks the whole batch before any state, history, APPLIED marker, or HP mutation.
2. Wrong schema / missing `applyEligible: true` in a `.json` PENDING file blocks the whole batch.
3. A valid newer receipt remains pending and unapplied while any invalid PENDING JSON exists.
4. Once the invalid file is repaired or removed externally, valid receipts apply in the existing campaign order.
5. Non-`.json` files retain current behavior.
6. No change to V1-C prompt ACK semantics, combat simulation, or game-state consequence shape.
7. Add focused regression tests for malformed and structurally invalid barriers.
8. Bump package version from `1.84.27` to `1.84.28`, refresh generated registry/version artifacts, run the Test Console plan, focused tests, final full suite once, CI, and one independent High-risk review.

## Touch set

Prefer the smallest exact set:

- `src/campaignCombatPendingStore.ts`
- `src/campaignCombatApplyHost.ts`
- focused tests
- version/generated artifacts

## Do not

- Do not delete or quarantine corrupt PENDING files automatically.
- Do not allow later receipts to bypass an unresolved invalid entry.
- Do not reopen V1-A/B/C contracts beyond this ordering barrier.
- Do not broaden into UI notification or Windows rename-retry follow-ups.

## Final verdict strings

- `READY_FOR_INTEGRATION`
- `BLOCKED_BY_CONCRETE_P1`
