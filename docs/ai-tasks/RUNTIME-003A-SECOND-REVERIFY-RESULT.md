# RUNTIME-003A Second Reverify Result

- Role: Independent Critical Runtime Re-Verifier
- Current main: `71b41bf1efb38abce1605c5dfb0eeb5f771cc94b`
- Second repair source: `82f80618620a650d1bb1cb3bab4af935ba887d65`
- Second repair report: `f24cbf9d2079c4ae89c7eb7e696f34ac74538f1c`
- Branch: `task/RUNTIME-003A-durable-replay-guard`
- Final verdict: `RUNTIME003A_SECOND_REVERIFY_FAIL`

## Scope

Only the remaining prior blockers R3A-V1, V3, V4, and V5 were reopened, plus narrow regression checks. No source was modified and no merge was performed.

Independent execution was unavailable because no local checkout existed and direct GitHub DNS resolution failed. No workflow run existed for the repair source. This is not the reason for FAIL.

## R3A-V1 — PASS

Canonical witness identity is now recomputed before the witness can match active history, become duplicate authority, or repair the ledger. A valid-shape witness with a forged identity hash fails closed.

Witness set/preserve/clear now routes through stateManager authority, including Git Timeline clear.

Campaign rebind now quarantines retained TurnResult, clears the old canonical witness, archives old accepted-ledger authority, creates a new campaign and epoch, and leaves a fresh valid TurnResult usable as unseen work.

## R3A-V3 — PASS

Parent selection now uses the current campaign+epoch head. Ledger chain validation is per epoch, so the first record in a new epoch has no old-epoch parent.

The first Accepted turn in a new epoch can be recovered from canonical witness after a post-commit/pre-ledger interruption and becomes alreadyAccepted without duplicate mutation.

Scope bootstrap now preserves legacy ambiguity: missing scope plus retained root TurnResult fails closed instead of silently creating a fresh scope.

Rebind separates old ledger authority from the new campaign.

## R3A-V4 — FAIL

The tokenized lease protocol closes the previous established stale-owner takeover race, adds process-start evidence for PID reuse, and adds token-checked heartbeat renewal.

Two safety problems remain.

1. A first acquirer can create the lock directory and be delayed longer than the fixed orphan grace before owner metadata is written. Another host can recover that directory as an orphan and acquire fresh authority. When the delayed first acquirer resumes, its owner/lease writes are not tied to proof that the lock path is still its original directory. It can overwrite the recovery winner's metadata and also return success.

2. Old malformed-authority recovery renames the old lock and later quarantines the lease path. A concurrent recovery winner can install a fresh valid lease in between. The earlier recovery can then quarantine that fresh lease because the quarantine step is not bound to the expected malformed authority.

Therefore at-most-one-live-writer is not yet guaranteed for all requested schedules.

## Stale takeover — PASS

For an established valid stale lease+lock pair, expected-token reread and atomic lock-directory rename produce one winner.

## Orphan recovery — FAIL

A genuine old orphan can recover, but the protocol can misclassify a delayed live first acquirer as orphan after grace. The delayed acquirer can later overwrite the recovery winner and also return success.

## PID reuse — PASS

Stored process start time is compared with actual process-start evidence where available. A mismatched reused PID is recoverable after stale timeout.

## Malformed authority — FAIL

Fresh malformed authority fails closed and single-contender old malformed recovery works, but concurrent old-malformed recovery can invalidate the new winner's lease.

## Heartbeat — PASS

Heartbeat starts after acquisition and renews only when current host identity and lock token still match.

## R3A-V5 — FAIL

Successful restore isolation is now full-transaction: lease, single-flight, quarantine, epoch rotation, raw-hash clear, actual state mutation or Git checkout, witness handling, and completion remain inside one exclusion interval.

However, if restore mutation fails after epoch rotation, only an in-memory repairRequired result is returned. No durable repair latch is stored. If canonical restored state was already written with witness cleared before a later restore step fails, the new epoch can look valid and witness-less after the transaction releases. A queued TurnResult can then preflight as unseen and mutate a partially restored workspace.

## Six restore paths — PASS for successful routing

Undo, rewind, checkpoint restore, regenerate, Git branch-from-turn, and Git branch switch all route their actual restore mutation through the full transaction wrappers.

## Narrow regressions

- Exact retained Accepted duplicate suppression: PASS.
- No double canonical mutation/world simulation/Handled/callback/ACK/consumption/provider dispatch: PASS.
- Fallback lifecycle: PASS.
- R3A-V2 epoch-safe raw hash: PASS.
- World-state separation and CHATGPT-20260706-002 separation: PASS.

## Test quality — FAIL

Coverage improved, but required load-bearing cases remain absent or too weak:

- two-process empty-workspace acquisition;
- delayed first acquisition beyond orphan grace;
- competing orphan recovery against a delayed live acquirer;
- two-process old malformed recovery;
- long provider heartbeat with separate contender;
- post-rotation restore failure followed by queued TurnResult;
- behavioral execution of all six real restore handlers under contention.

Current tests can pass with the remaining V4 and V5 defects.

## Execution

Independent execution: NOT RUN.

Repair report evidence:

- compile: PASS
- full suite: PASS `225/225`
- i18n: PASS

## Remaining blockers

- R3A-V4: delayed initial-acquisition/orphan race and concurrent malformed recovery race.
- R3A-V5: no durable fail-closed state after a post-rotation partial restore failure.

## New findings

1. Delayed first acquisition can overwrite a recovery winner's lock metadata and lease.
2. Malformed recovery can quarantine a concurrent winner's fresh valid lease.
3. Restore failure after epoch rotation is not durably latched before single-flight release.

## Final verdict

`RUNTIME003A_SECOND_REVERIFY_FAIL`
