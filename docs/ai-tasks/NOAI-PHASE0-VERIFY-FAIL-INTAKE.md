# NOAI Phase 0 Verify Fail Intake

Status: IMPLEMENTING (Verification Repair)
Date: 2026-07-07 JST

Verification result:
- `docs/ai-tasks/NOAI-PHASE0-VERIFY-RESULT.md`
- document-only commit `dd9e800291880dcef27b3527f6b718ac808686d6`
- verdict `NOAI_PHASE0_VERIFY_FAIL`

Implementation under review:
- `8438d9659fff1bd66839201023c260ee09bf5b75`

## Confirmed blocker — NOAI-P0-V1

### Stable draft identity is not stable final event identity across later-turn retry

The implementation correctly generates a stable `draftId` once per successful direct trade and carries that draft identity across batching and retry.

However, materialization currently calls `makeWorldChangeEvent()` with:

```text
worldTurn: freshWs.worldTurn
idSuffix: draft.draftId
```

The global event factory derives the final ID from:

```text
makeEventId(worldTurn, category, suffix)
```

so the final event ID still changes when the same draft is retried after `worldTurn` advances.

Example:

```text
same draft D
flush at worldTurn 31 -> wce_31_resource_<D>
retry at worldTurn 32 -> wce_32_resource_<D>
```

`mergeRecentChanges()` deduplicates only by final `event.id`, so both survive.

This violates:

```text
one successful trade = one history event across flush/retry
```

## Repair contract

Keep the two authorities separate:

- `worldTurn` remains fresh flush-time event metadata;
- final event identity remains stable per trade and must derive from the action-time stable draft identity, not from mutable flush-time `worldTurn`.

Preferred narrow repair:

- do not redesign global `worldEventLogCore` identity semantics;
- add a commerce-local stable event ID derivation from `draftId`, or preserve an explicit stable event ID generated once at draft creation;
- materialized `WorldChangeEvent.worldTurn` still uses fresh `freshWs.worldTurn`;
- retrying the same draft at any later worldTurn must produce the same final `event.id`;
- distinct successful trades must still produce distinct IDs;
- final IDs must satisfy existing `WorldChangeEvent.id` validation constraints.

Do not change the policy UI, other direct actions, Narrate on Demand, Important Events, NotebookLM, Start Hub, or RUNTIME-003A.

## Required tests

1. Same draft flushed at worldTurn 31, then retried at worldTurn 32 -> one event remains.
2. The surviving event ID is identical across both materializations.
3. Fresh event metadata on first successful persistence still records the authoritative flush-time worldTurn.
4. Two distinct drafts at different worldTurns remain two distinct events.
5. Existing same-flush, same-turn separate-flush, retry, reorder, materialization-failure, and npcBridge safety tests continue to pass.

## Secondary test gap

Add focused host-level behavior coverage if practical within the same narrow touch set:

- failed trade creates no draft;
- successful trade creates exactly one draft;
- draft construction failure does not revoke the successful trade or block market/commerce persistence.

This is secondary and must not expand the repair beyond NOAI Phase 0.

## Closed areas

The following verification areas passed and should not be redesigned:

- core-only policy inertness;
- successful-trade-only source ordering contract;
- stable action-time draft identity;
- fresh `worldTurn` authority;
- event failure isolation;
- npcBridge hidden coupling avoidance;
- Phase 0 scope integrity.

## Verdict

`NOAI_PHASE0_VERIFICATION_REPAIR_REQUIRED`
