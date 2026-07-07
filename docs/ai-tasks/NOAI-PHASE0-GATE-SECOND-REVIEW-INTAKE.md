# NOAI Phase 0 Gate Second Review Intake

Status: ONE_REMAINING_GATE_BLOCKER
Date: 2026-07-07 JST

Reviewed repair:
- `docs/ai-tasks/NOAI-PHASE0-IMPLEMENTATION-GATE-REPAIR-RESULT.md`
- commit `68d8bede83ad3b774c9be9e52c1b2345b24b1e20`

## Preserved repairs

The two recorded blockers are correctly repaired:

- no inactive-looking policy selector is exposed in Phase 0;
- trade facts are drafted at action time and final `WorldChangeEvent` materialization owns `freshWs.worldTurn` at flush time.

The `npcBridgeCore` safety rule (`severity: 'info'`, no `factionId`) remains required and valid.

## Remaining blocker — event ID uniqueness only within one flush batch

The repaired gate proposes an event suffix such as:

```text
${draft.op}_${draft.commodityId}_${index}
```

where `index` is the draft position inside one coalesced flush batch.

This prevents collisions within a single batch, but not across separate flushes in the same `worldTurn`.

Example:

```text
worldTurn = 10
flush A: buy wheat, batch index 0
flush B: buy wheat, batch index 0
```

If `makeEventId()` is derived from `worldTurn + category + suffix`, both events can still receive the same ID and the later one can be removed by `mergeRecentChanges()` id-based dedupe.

This violates the repaired acceptance requirement:

> one event per successful direct trade

## Required repair

The action-time draft must carry a collision-resistant stable per-trade identity that survives batching and retry.

Preferred minimal shape:

- add `tradeEventId` / `draftId` generated once when the successful direct trade creates the draft;
- use that stable draft identity in the final `WorldChangeEvent.idSuffix`;
- batching, flush boundaries, and retry must not change the ID;
- do not rely on batch-local index as the sole uniqueness source.

The ID should be generated once per successful direct trade and then preserved unchanged through pending merge and flush-time materialization.

## Required tests

1. Two identical trades in one flush -> two distinct event IDs.
2. Two identical trades in two separate flushes during the same `worldTurn` -> two distinct event IDs.
3. Retrying persistence of the same pending draft -> same event ID, not a duplicate new event.
4. Reordering unrelated drafts does not change the ID of an already-created draft.

## Verdict

`NOAI_PHASE0_GATE_ONE_IDENTITY_REPAIR_NEEDED`
