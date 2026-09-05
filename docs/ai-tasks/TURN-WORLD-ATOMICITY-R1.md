# TURN-WORLD-ATOMICITY-R1

- Status: `IMPLEMENTING`
- Risk: High — Accepted Turn authority, concurrent revision handling, cross-ledger persistence
- Base: `2a9ecd3cbb6ae1654228434b47c4bbbeef9aecbd`
- Branch: `fix/TURN-WORLD-ATOMICITY-R1`
- Source review: GPT-6 Pro cross-cutting review at prior main, focused-confirmed on the base above

## Scope

Repair only R1: an unaccepted or retried TurnResult must not publish world progression, and a fresh-revision reapply must not execute `elapsedWorldTurns` twice.

R2 was independently confirmed at the same time: checkpoint restore rebuilds a display-oriented `GmSnapshot` and replace-persists it, so canonical roots and side ledgers are not a complete temporal snapshot. R2 remains a separate High Risk slice/PR and is not changed here. It overlaps the existing `TEMP-001B` / `TEMP-001C` backlog contract.

## Confirmed failure

On the base tree, `processTurnResult()` called `persistWorldSimulationSteps()` and `saveWorldState()` before schema validation and `commitGameState()`. When a newer disk revision was detected, `applyTurnResultToGameState(..., false)` still called `persistWorldSimulationSteps()` a second time. A failed commit could therefore leave world-only progress, and the optimistic reapply path could advance the same TurnResult twice.

This also overlaps the existing `CHATGPT-20260706-002` finding; the GPT-6 Pro review broadened the same boundary from the double-simulation case to all pre-commit world/NPC publication.

## Repair contract

- Start process-local world and NPC write deferrals before applying TurnResult world effects.
- Reads during the synchronous Accepted Turn see the latest staged snapshots.
- A failed schema check, authorization check, or canonical commit discards staged state and invalidates caches.
- Only a successful canonical `game_state` commit publishes staged `world_state` / `npc_registry` snapshots.
- Fresh-revision reapply computes game-state fields against the staged world snapshot but does not rerun elapsed-world simulation.
- Post-commit side-ledger publication failure remains an Accepted compensation case; the installed Accepted witness prevents a retry from advancing the world twice.

## Verification

- Focused host regression: `scripts/test_runtime_turn_result_acceptance.js`
- Real filesystem deferral regression: `scripts/test_accepted_turn_side_effect_deferral.js`
- Test Console plan before broader verification
- One full suite on the final unchanged executable tree
- Existing GPT-6 Pro review is the independent pre-repair review; do not create a review chain

> Before planning verification, follow `docs/DEVELOPMENT_VERIFICATION_POLICY.md`. Do not escalate beyond its risk tier without a concrete reason.
