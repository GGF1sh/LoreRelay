# NOAI Phase 0 Verify Result

- Role: Independent NOAI Phase 0 Verifier
- AI: ChatGPT / GPT-5.5 / High
- Review commit: `8438d9659fff1bd66839201023c260ee09bf5b75`
- Implementation base: `17cbdc2674809be26676d9d3feb8f4a8d64f9566`
- Current main at verify: `7a1a83bc950ca227745fc156fcd21ee6b7aec169`
- Branch: `task/NOAI-PHASE0-implementation`
- Final verdict: `NOAI_PHASE0_VERIFY_FAIL`

## Scope

This verification reviewed only the NOAI Phase 0 implementation and the eight requested focus areas:

1. core-only policy inertness;
2. draft creation only after successful trade;
3. stable draft identity;
4. fresh `worldTurn` authority;
5. one trade = one event across flush/retry;
6. event-failure isolation from trade/market persistence;
7. avoidance of hidden `npcBridge` coupling;
8. scope integrity.

No implementation source was modified and no merge was performed.

The authoritative design chain was read before source review:

- `NOAI-PHASE0-IMPLEMENTATION-GATE-RESULT.md`;
- `NOAI-PHASE0-IMPLEMENTATION-GATE-REPAIR-RESULT.md`;
- `NOAI-PHASE0-IMPLEMENTATION-GATE-FINAL-REPAIR.md`;
- `NOAI-PHASE0-IMPLEMENTATION-RESULT.md`.

## 1. Core-only policy inertness

### Verdict: PASS

`aiParticipationPolicy` is added only to `gameRulesCore.ts` as:

```text
'always' | 'onDemand' | 'simulationOnly'
```

with backward-compatible default `always` and enum normalization.

The implementation commit does not add:

- a Webview selector;
- locale strings;
- Start Hub wiring;
- prompt behavior;
- provider behavior;
- simulation branching;
- direct-action branching based on the policy.

Among production source changes, the policy appears only in the pure rules-core normalization file. The other changed production files implement commerce event drafting/persistence and do not read the policy.

Therefore all three values remain behaviorally inert in Phase 0.

## 2. Successful trade only draft generation

### Verdict: PASS

The host flow is:

```text
executeDirectTrade(...)
→ if result.ok is false: return failure immediately
→ only after result.ok is true: build one CommerceTradeEventDraft
→ schedule commerce/market persistence with that draft
```

A failed trade cannot reach draft construction.

A successful trade calls `buildCommerceTradeEventDraft()` once. The draft contains:

- one generated `draftId`;
- normalized trade facts;
- signed `goldDelta` derived from the successful result.

Draft construction is wrapped in `try/catch`. If ID generation or draft construction throws, the already-successful trade still returns `ok: true` and commerce/market persistence is still scheduled without an event draft.

The implementation is correct by source inspection.

Test note: the focused NOAI test suite does not directly execute the host-level successful/failed trade-to-draft boundary; this area is statically clear but not behaviorally covered by the new Phase 0 test file.

## 3. Stable draft identity

### Verdict: PASS for draft identity

Each successful trade generates `draftId` once at action time through the existing `createPromptReceiptId()` helper.

The helper uses:

```text
crypto.randomUUID()
```

with a random-bytes fallback.

The same `draftId` is retained on the pending draft through coalescing and is used as `idSuffix` during materialization.

Draft identity is independent of:

- batch position;
- draft ordering;
- flush boundaries;
- commodity/op repetition.

The same draft object therefore retains the same draft identity.

However, stable draft identity does not produce stable final event identity across a retry after `worldTurn` changes. That is the blocker in section 5.

## 4. Fresh worldTurn authority

### Verdict: PASS

The action-time draft contains no `worldTurn`.

Materialization occurs inside the `writeWorld` closure after a fresh `loadWorldState()` call, and uses:

```text
worldTurn: freshWs.worldTurn
```

This is the single runtime authority point for event time.

The implementation does not thread a stale action-time turn through pending persistence.

## 5. One trade = one event across flush/retry

### Verdict: FAIL

The final gate requires stable per-trade identity across batches, flushes, and retries.

The implementation uses:

```text
idSuffix: draft.draftId
```

but the final event ID is not based on `draftId` alone.

`makeWorldChangeEvent()` calls:

```text
makeEventId(worldTurn, category, suffix)
```

and `makeEventId()` prefixes the event ID with the current `worldTurn`:

```text
wce_<worldTurn>_<category>_<draft-derived-suffix>
```

At the same time, retry materialization intentionally uses the freshly loaded current `worldTurn`.

Therefore this valid retry sequence breaks exactly-once identity:

```text
same successful trade draft D
→ flush/materialize at worldTurn 31
→ event id = wce_31_resource_<D>
→ event is persisted
→ persistence is retried later with the same draft D after worldTurn advances to 32
→ fresh authority requires worldTurn 32
→ event id = wce_32_resource_<D>
```

`mergeRecentChanges()` deduplicates only by final event `id`.

Because the two IDs differ, both events survive:

```text
one trade
→ two recentChanges events
```

This violates the requested property:

```text
one trade = one event across flush/retry
```

and contradicts the final gate's claim that retrying the same pending draft necessarily recomputes the same event ID.

The current retry test misses the defect because it retries the same draft without changing `worldTurn` between flushes.

The source defect is load-bearing even though `draftId` itself is stable: final event identity is still coupled to mutable flush-time authority.

## 6. Event-failure isolation

### Verdict: PASS

Two failure boundaries are isolated.

### Action-time draft construction failure

Draft creation is wrapped after successful trade computation. Failure only skips event drafting; the trade still returns success and market/commerce persistence still schedules.

### Flush-time materialization failure

Event factory calls and `mergeRecentChanges()` are wrapped inside the world write.

If event materialization throws:

- the exception is logged;
- event merge is skipped;
- `nextWs` still contains the new markets;
- `saveWorldState(nextWs)` still runs.

The focused test injects a throwing `makeWorldChangeEvent()` and proves the market stock update persists while no partial event is written.

Thus event failure does not propagate into the successful trade result or block market persistence.

## 7. npcBridge hidden coupling

### Verdict: PASS

Commerce materialization hard-codes:

- `category: 'resource'`;
- `severity: 'info'`;
- `source: 'player'`;
- no `factionId`.

The event factory does not invent a `factionId` when one is omitted.

The relevant NPC bridge branch requires all of:

```text
category === 'resource'
AND factionId exists
AND severity !== 'info'
```

Commerce events satisfy neither of the last two trigger requirements.

The focused integration-style core test materializes a commerce event and feeds it into `applyEventsToNpcRegistry()`, proving no NPC is updated.

No hidden food-crisis propagation was found.

## 8. Scope integrity

### Verdict: PASS

The review commit is exactly one commit after the stated base.

Changed files are limited to:

- `src/gameRulesCore.ts`;
- `src/livingWorldCommerceUiCore.ts`;
- `src/livingWorldCommerceUi.ts`;
- `src/livingWorldCommercePersist.ts`;
- `scripts/test_game_rules_core.js`;
- `scripts/test_noai_phase0.js`;
- `scripts/run_all_tests.js`;
- `testing_checklist.md`;
- `docs/ai-tasks/NOAI-PHASE0-IMPLEMENTATION-RESULT.md`.

No implementation changes were made to:

- RUNTIME-003A;
- Start Hub;
- Narrate on Demand;
- Important Events;
- NotebookLM;
- other direct actions;
- Webview/i18n policy selector work;
- `worldEventLogCore.ts`;
- `npcBridgeCore.ts`.

No scope expansion was found.

## Test quality

### Verdict: FAIL

The focused tests are strong for:

- policy normalization;
- two identical trades in one coalesced flush;
- separate flushes in the same `worldTurn`;
- same-draft retry in the same `worldTurn`;
- ordering independence;
- materialization failure isolation;
- NPC bridge safety.

The load-bearing gap is retry after `worldTurn` changes.

Current retry test:

```text
flush D at worldTurn 31
→ retry D at worldTurn 31
```

Required adversarial test:

```text
flush D at worldTurn 31
→ advance fresh world state to worldTurn 32
→ retry the same D
→ assert recentChanges still contains exactly one event for D
```

The current source would fail that test because final event identity includes `worldTurn`.

Secondary test gap: the new focused test file does not behaviorally exercise the actual host-level successful-trade-only draft generation boundary or draft-construction-failure isolation, although source inspection supports PASS for those areas.

## Execution

### Independent execution

NOT RUN.

Reason:

- no local LoreRelay checkout was present;
- direct `git ls-remote` failed because `github.com` could not be resolved;
- no GitHub Actions workflow run existed for `8438d9659fff1bd66839201023c260ee09bf5b75`.

Execution unavailability is not the reason for FAIL.

### Implementation-side evidence

The implementation result records:

- `npm ci --include=dev`: PASS;
- `npm run compile`: PASS;
- `node scripts/test_game_rules_core.js`: PASS;
- `node scripts/test_living_world_commerce_ui_core.js`: PASS;
- `node scripts/test_noai_phase0.js`: PASS;
- `npm test`: PASS `226/226`.

These results do not cover the cross-worldTurn retry defect.

## Remaining blocker

### NOAI-P0-V1 — final event identity changes when the same draft is retried under a later fresh worldTurn

Stable `draftId` is used only as the suffix of an event ID that also contains mutable `worldTurn`.

A retry after turn advancement therefore bypasses id-based dedupe and can create two history events for one successful trade.

## New finding

The final gate's stable-draft repair closed batch-index instability but did not fully separate event identity from flush-time `worldTurn` authority.

The two requirements are currently coupled:

- event timestamp must use fresh worldTurn;
- retry identity must remain stable.

The implementation satisfies the first and fails the second when the turn changes between attempts.

## Final verdict

`NOAI_PHASE0_VERIFY_FAIL`
