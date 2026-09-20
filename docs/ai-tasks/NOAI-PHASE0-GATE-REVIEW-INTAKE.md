# NOAI Phase 0 Gate Review Intake

Status: GATE_REPAIR_NEEDED
Date: 2026-07-07 JST

Reviewed result:
- `docs/ai-tasks/NOAI-PHASE0-IMPLEMENTATION-GATE-RESULT.md`
- commit `f92e7750668ce7523b29f840e560bb9610c97307`

## What is good and should be preserved

- Reuses existing `WorldChangeEvent`; no new event type or schema.
- Correctly identifies the `npcBridgeCore.ts` coupling for `category === 'resource'` with `factionId` and non-`info` severity.
- Keeps RUNTIME-003A, Start Hub, Important Events, NotebookLM, and retention redesign out of scope.
- Requires accumulation of coalesced commerce events rather than last-write-wins.
- Defaults missing/invalid policy to `always` for backward compatibility.

## Blocker 1 — inactive policy values must not be presented as working user modes

The result proposes exposing a three-option Game Rules selector in Phase 0 while explicitly requiring that all three values are behaviorally identical and consumed nowhere.

This creates misleading product behavior:

- user selects `onDemand` or `simulationOnly`;
- UI persists the choice;
- engine continues current always-narrate behavior;
- user reasonably interprets this as a broken setting.

Repair one of these ways:

A. Preferred minimal pilot:
- add/normalize/persist the field in core only;
- do not expose the selector until a later phase actually consumes it.

B. Acceptable alternative:
- expose the selector only as disabled preview copy clearly marked unavailable/not active;
- do not imply the mode is in effect.

Do not ship an active-looking selector whose values intentionally do nothing.

## Blocker 2 — event construction location conflicts with the required worldTurn source

The result says:

- `livingWorldCommerceUi.ts` should construct the `WorldChangeEvent` after successful direct trade;
- event `worldTurn` must come from `freshWs.worldTurn` at flush time inside `livingWorldCommercePersist.ts`.

Those requirements conflict. The UI action path does not own the fresh world state loaded by the persistence closure.

Repair the contract by separating action-time event intent from flush-time event materialization.

Recommended shape:

- `livingWorldCommerceUi.ts` emits a small typed commerce-event draft/receipt containing trade facts only (item, qty, buy/sell, gold delta, location, stable action identity if available);
- `livingWorldCommercePersist.ts`, after loading `freshWs`, materializes the final `WorldChangeEvent` with `freshWs.worldTurn` and merges it into `recentChanges` in the same world-state save as markets.

Alternative:
- construct the final event at action time only if the gate deliberately accepts action-time worldTurn from an already-authoritative source and documents that choice.

Do not leave the gate with both action-time construction and flush-time timestamp authority.

## Non-blocking clarification

The failure matrix says event construction is best-effort and must not fail a successful trade. The implementation gate should explicitly require the event-intent creation path to be caught/isolated so a formatting/factory exception cannot change the already-successful trade result.

## Repaired gate acceptance additions

1. No active-looking UI control may advertise modes that Phase 0 does not implement.
2. Final `WorldChangeEvent.worldTurn` has exactly one documented authority point.
3. Coalesced trade event intents preserve one event per successful trade.
4. Event-intent/materialization failure never changes an already-successful direct-trade result.

## Verdict

`NOAI_PHASE0_GATE_REPAIR_NEEDED`
