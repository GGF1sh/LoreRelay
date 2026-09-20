# NOAI Phase 0 Implementation Gate — Final Repair

Status: GATE_REPAIRED (final)
Date: 2026-07-07 JST
Owner: Claude Sonnet (high reasoning)
Repairs: `docs/ai-tasks/NOAI-PHASE0-GATE-SECOND-REVIEW-INTAKE.md` (reviewing `docs/ai-tasks/NOAI-PHASE0-IMPLEMENTATION-GATE-REPAIR-RESULT.md` @ commit `68d8bed`)

Design only. No code changes. Scope limited to the one remaining event-identity blocker — no other section of the repaired gate is reopened. Does not touch `docs/ai-tasks/RUNTIME-003A*`.

## Preserved from prior repairs (unchanged)

- No inactive-looking policy selector in Phase 0 (`aiParticipationPolicy` stays core-only).
- Trade facts are drafted at action time (`livingWorldCommerceUi.ts`); final `WorldChangeEvent` materialization owns `freshWs.worldTurn` at flush time (`livingWorldCommercePersist.ts`).
- `npcBridgeCore.ts:108` safety rule: commerce events always `severity: 'info'`, never carry `factionId`.

## The remaining blocker

The prior repair's `idSuffix` (`` `${draft.op}_${draft.commodityId}_${index}` ``) is unique only within one coalesced flush batch. `index` is a batch-local position, not a per-trade identity — two identical trades landing in **separate flushes within the same `worldTurn`** (e.g. flush A settles, a second direct trade happens, flush B fires before the `worldTurn` advances) both compute `index = 0` and therefore the same `makeEventId(worldTurn, 'resource', suffix)`. `mergeRecentChanges()`'s id-based dedupe then silently drops the second trade's event, violating "one event per successful direct trade."

## Repair — stable per-trade draft identity, generated once, reused as-is

`CommerceTradeEventDraft` (`livingWorldCommerceUiCore.ts`) gains one new required field:

```
draftId: string;
```

**Generation:** exactly once, at draft-creation time, inside `executeLivingWorldDirectTrade()` in `livingWorldCommerceUi.ts` (the host layer — this file already imports `fs`, so it is not restricted to pure-core determinism the way `livingWorldCommerceUiCore.ts` is). Reuse the existing helper `createPromptReceiptId()` from `src/promptReceiptCore.ts:75-79` (`crypto.randomUUID()` with a `crypto.randomBytes(16).toString('hex')` fallback) rather than inventing a new ID scheme — import it directly, e.g. aliased as `createTradeDraftId`. This is the same pattern already used elsewhere in the codebase for stable per-action identity (`TurnResultPromptReceiptMeta.receiptId`), so no new machinery is introduced.

**Materialization:** in `livingWorldCommercePersist.ts`'s `writeWorld` closure, pass `idSuffix: draft.draftId` to `makeWorldChangeEvent()` — not the batch index, not a composite with `index`. `draftId` alone is the uniqueness source; batch position is no longer part of the id derivation at all.

**Why this satisfies all four required tests:**

1. *Two identical trades in one flush → two distinct IDs* — each draft gets its own `draftId` at creation time regardless of what else is in the batch.
2. *Two identical trades in two separate flushes, same `worldTurn` → two distinct IDs* — `draftId` is generated per-trade at action time, independent of flush timing or `worldTurn`, so it can never collide across flush boundaries the way a batch-local index did.
3. *Retrying persistence of the same pending draft → same ID, not a duplicate* — `draftId` is generated once and stored on the draft object; a retry re-materializes the *same* draft object carrying the *same* `draftId`, so `makeEventId()` recomputes the identical id and `mergeRecentChanges()` treats it as the same event, not a new one.
4. *Reordering unrelated drafts does not change an existing draft's ID* — `draftId` has no dependency on array position, so reordering is a non-event for identity.

**Truncation/collision note (verified against existing code, not new behavior):** `makeEventId()` (`worldEventLogCore.ts:96-113`) slugifies the suffix and, when the slug exceeds 32 characters (a UUID's hyphens become underscores during slugification, e.g. `3fa85f64_5717_4562_...`, well over 32 chars), falls back to a truncated slug plus an 8-character `fnv1aHash8` of the **original, pre-slugified** suffix. Since the hash input is the raw `draftId`, two different UUIDs still produce different hashes even after slug truncation — the existing fallback path already provides the collision resistance this fix needs; no change to `worldEventLogCore.ts` is required.

## Updated required-tests list (replaces the prior batch-index-only tests)

1. Two identical trades in one flush → two distinct event IDs.
2. Two identical trades in two separate flushes during the same `worldTurn` → two distinct event IDs.
3. Retrying persistence of the same pending draft → same event ID, not a duplicate new event.
4. Reordering unrelated drafts does not change the ID of an already-created draft.

(These are the intake's own four tests, unmodified — restated here as the authoritative test list, superseding the batch-index-based test description in the prior repair result.)

## Touch set delta (from the prior repair result)

| File | Change |
|---|---|
| `src/livingWorldCommerceUiCore.ts` | `CommerceTradeEventDraft` gains `draftId: string`. |
| `src/livingWorldCommerceUi.ts` | Import `createPromptReceiptId` from `./promptReceiptCore` (aliased); generate `draftId` once per successful trade when constructing the draft. |
| `src/livingWorldCommercePersist.ts` | Materialization uses `idSuffix: draft.draftId` in place of the batch-index-based suffix. |

No other file in the prior touch set changes. `src/worldEventLogCore.ts` remains untouched — the existing hash-fallback in `makeEventId()` already covers this case.

## Acceptance criteria (delta)

Replaces the prior repair's Acceptance Addition #3 wording ("...via per-draft-unique idSuffix") with: coalesced trade event intents preserve one event per successful direct trade **across batches, flushes, and retries**, verified by the four tests above. All other acceptance criteria from the prior repair result are unchanged.

## Verdict

The one remaining blocker is fixed by generating a stable per-trade identity once, at the point a trade succeeds, and never re-deriving it from position/batch/flush context — reusing an identity primitive (`createPromptReceiptId()`) that already exists in the codebase for exactly this purpose. No new scope, no schema change, no code written.

**Final verdict: NOAI_PHASE0_IMPLEMENTATION_GATE_FINAL_READY**
