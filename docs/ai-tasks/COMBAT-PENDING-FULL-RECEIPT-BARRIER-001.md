# COMBAT-PENDING-FULL-RECEIPT-BARRIER-001

## Status

READY_TO_IMPLEMENT — exact-head post-merge P1 from PR #65

## Base

- `main`: `2568848ea623e3ba45a0174ee38cff1ed49fbf9e`
- Trigger: PR #65 Codex review on `2fe6abe90122a3c21b39c027ef81b7254776720d`
- Risk: High — save-state ordering / absolute HP application

## Problem

`scanPendingDirectoryForApply()` currently accepts any object with only:

- `schemaVersion === "combat-outcome-receipt-v1"`
- `applyEligible === true`

It does not preflight the complete receipt shape. A partial receipt can therefore pass directory scan, sort after a valid receipt, and fail later inside `applyCombatOutcomeReceiptOnce()` only after the valid receipt has already mutated HP/state. This violates the all-or-nothing pending-directory barrier.

## Required behavior

Before applying any receipt, every `pending/*.json` must pass the same complete structural predicate used by the apply path. Any malformed or incomplete receipt must return one `INVALID_PENDING_RECEIPT` result and apply nothing.

Use or extract one shared complete predicate. Do not add a second weaker or drifting schema check.

## Acceptance criteria

1. Missing `receiptHash`, `simulationResultHash`, `encounterId`, `terminalOutcomeCode`, or `participants` blocks the entire batch before any HP/state/history/APPLIED mutation.
2. A valid receipt that sorts before an incomplete receipt remains unapplied.
3. Malformed JSON, wrong schema, and `applyEligible !== true` remain fail-closed.
4. Structurally valid receipts preserve existing campaign-order sort and stop-on-first-`!ok` behavior.
5. No delete or quarantine.
6. No V1-C prompt/ACK, combat simulation, or consequence-shape changes.
7. Add focused regression tests for a valid lower-revision receipt plus an incomplete higher-revision receipt.
8. Bump package version from `1.84.28` to `1.84.29`; refresh generated/version artifacts.
9. Run Test Console plan, focused tests, final full suite once, CI, and one independent High-risk review.

## Preferred touch set

- shared complete receipt predicate location
- `src/campaignCombatPendingStore.ts`
- focused pending/apply tests
- version/generated artifacts

## Do not

- Do not broaden into UI notification, Windows rename retry, or V1-C feature work.
- Do not resolve or delete old files automatically.
- Do not merge while a concrete P1 remains.

## Final verdict strings

- `READY_FOR_INTEGRATION`
- `BLOCKED_BY_CONCRETE_P1`
