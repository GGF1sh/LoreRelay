# Task Packet: RUNTIME-002A

| Field | Description |
|:---|:---|
| **Task ID** | `RUNTIME-002A` |
| **Status** | CONFIRMED |
| **As-of Commit** | `6af4bc5` code baseline |
| **Origin** | `GEMINI-20260705-001`, promoted by Chief Integrator |
| **Severity** | P1 |
| **Priority** | Critical |
| **Depends On** | None |

## Objective

Establish a truthful TurnResult acceptance boundary so a turn is not marked handled, deduped, or accepted before canonical application succeeds.

## Broken Invariant

Current `processTurnResultFileAt()` can:

1. store `lastProcessedTurnHash`,
2. call `markTurnResultHandled()` and fire the pending accepted callback,
3. only then call `processTurnResult(turnResult)`.

`processTurnResult()` can return `false` after validation or canonical commit failure. The caller does not currently treat that `false` as a failed processing result before returning success.

Therefore:

**Handled / Deduped / Accepted can become true before canonical apply succeeds.**

This task is a dependency for any delayed prompt-context consumption that relies on an Accepted boundary.

## Evidence

Primary current paths:

- `src/gameStateSync.ts` — `processTurnResultFileAt()`
- `src/turnResultFallback.ts` — `markTurnResultHandled()` and pending callback lifecycle
- `src/statePatch.ts` — `processTurnResult()` validation, commit, secondary ledger persistence, and failure returns

Important correction to the originating Gemini report:

`processTurnResult()` catches many failures internally and returns `false`; the primary confirmed failure is not necessarily outer `catch` retry followed by self-dedupe. The stronger current issue is that the `false` result can be ignored after handled/dedupe state has already advanced.

## In Scope — Architecture Gate

- Define exact ordering of parse, dedupe reservation, canonical apply, handled marker, accepted callback, and retry eligibility.
- Define how `processTurnResult(false)` propagates to the caller.
- Define when `lastProcessedTurnHash` may become authoritative.
- Define when `markTurnResultHandled()` may fire.
- Define the minimum Accepted boundary needed by downstream tasks such as `PROMPT-001C`.
- Decide how the current compensation policy affects Accepted status when game_state commit succeeds but secondary ledgers partially fail.
- Define failure/retry semantics without redesigning State Orchestrator.

## Out of Scope

- Prompt candidate purity (`PROMPT-001A`).
- Prompt delivery receipts / immutable ACK tokens (`PROMPT-001C`).
- Full multi-ledger atomic transactions (`TEMP-001B/C`).
- State Orchestrator redesign.
- Provider-specific session identity redesign.

## Touch Set

Expected architecture review scope:

- `src/gameStateSync.ts`
- `src/turnResultFallback.ts`
- `src/statePatch.ts`

Implementation Touch Set must be narrowed by the Gate before coding.

## Required Gate Questions

1. Is `processTurnResult()` success the Accepted boundary, or is another post-commit signal required?
2. When may `lastProcessedTurnHash` advance without suppressing a valid retry?
3. Must dedupe support an in-flight/reserved state separate from committed/handled?
4. What should `processTurnResultFileAt()` return when canonical apply returns `false`?
5. When may `markTurnResultHandled()` clear the pending run and fire callbacks?
6. If game_state commit succeeds but secondary ledger persistence partially fails under the existing compensation policy, is the turn Accepted?
7. Is journal append required for acceptance, or observability only?
8. What happens after extension restart with a failed but still-present `turn_result.json`?

## Future Acceptance Criteria

At minimum:

- validation failure does not fire Accepted callback;
- canonical commit failure does not fire Accepted callback;
- failed canonical apply does not permanently suppress retry via committed dedupe state;
- successful canonical apply advances handled/dedupe exactly once;
- `processTurnResult(false)` is observed as failure;
- the Accepted signal occurs after the architecture-defined canonical success boundary;
- existing successful-turn dedupe remains intact;
- secondary-ledger partial failure semantics are explicit and tested.

## Required Future Tests

- invalid semantic TurnResult: no handled callback, retry not suppressed
- schema validation failure: no handled callback
- `commitGameState` failure: no handled callback, retry semantics preserved
- successful apply: handled callback exactly once
- duplicate successful file: deduped without reapply
- failed file then corrected/new file: new valid turn processes
- extension restart with failed pending file
- game_state success + secondary-ledger partial failure: behavior matches approved Accepted policy

## Do Not Touch

- Prompt ACK markers
- Context Engine budgeter
- Temporal checkpoint/restore architecture
- Remote authority/security

## Current Lifecycle Note

This task is confirmed but has not yet received an Architecture Gate. No implementation may start.
