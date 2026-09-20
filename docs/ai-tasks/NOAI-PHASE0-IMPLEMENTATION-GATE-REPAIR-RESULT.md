# NOAI Phase 0 Implementation Gate — Repair Result

Status: GATE_REPAIRED
Date: 2026-07-07 JST
Owner: Claude Sonnet (high reasoning)
Repairs: `docs/ai-tasks/NOAI-PHASE0-GATE-REVIEW-INTAKE.md` (reviewing `docs/ai-tasks/NOAI-PHASE0-IMPLEMENTATION-GATE-RESULT.md` @ commit `f92e775`)

Design only. No code changes. No scope beyond the two recorded blockers (+ one correctness detail required to actually satisfy Blocker 2's own acceptance addition — see §2). Does not touch `docs/ai-tasks/RUNTIME-003A*`.

Everything from the original result not discussed below is **unchanged and preserved**: reuse of `WorldChangeEvent` with no new type/schema, the `npcBridgeCore.ts:108` `severity:'info'`/no-`factionId` hard rule, RUNTIME-003A/Start Hub/Important Events/NotebookLM/retention-redesign kept out of scope, `'always'` default for backward compatibility.

---

## 1. Blocker 1 repair — no active-looking selector for inactive values

**Chosen repair: Option A (preferred minimal pilot).**

Phase 0 now adds `aiParticipationPolicy` **core-only**: interface field, default, and `normalizeGameRules()` validation in `src/gameRulesCore.ts`. No Webview selector is shipped in Phase 0.

Removed from the touch set (previously items 4–6, UI/i18n):

- `webview/index.html` — no new `<select>`.
- `webview/modules/70-game-rules.js` — no wiring.
- `locales/en.json` / `ja.json` / `zh-CN.json` / `zh-TW.json` — no new label/option copy needed. (`WorldChangeEvent.message` strings are plain authored content, not run through i18n — confirmed by existing `emergentSimulator.ts` event messages — so the World-tab-visible commerce event from Blocker 2 needs no locale entries either.)

The field is real, persisted, and testable (unit tests read/write `game_rules.json` directly), but **inert and invisible** until the phase that actually consumes a value adds its own selector. This removes the misleading-UI risk entirely rather than downgrading it to disabled/preview copy — Option A is strictly less UI surface than Option B, so it does not expand scope.

---

## 2. Blocker 2 repair — separate action-time intent from flush-time materialization

**Chosen repair: the recommended shape**, not the alternative — there is no existing authoritative action-time `worldTurn` source at the UI-action call site (`executeLivingWorldDirectTrade()` reads game state but not a guaranteed-fresh `worldTurn`; the value that matters is whatever `worldTurn` the persistence closure's freshly-`loadWorldState()`-ed state has when the write actually happens), so inventing one would be worse than the split.

**New type** (defined in `livingWorldCommerceUiCore.ts`, alongside `DirectTradeInput`/`DirectTradeResult` — no new file):

```
export interface CommerceTradeEventDraft {
    op: 'buy' | 'sell';
    commodityId: string;
    qty: number;
    locationId: string;
    goldDelta: number; // negative for buy (totalCost), positive for sell (totalRevenue)
}
```

Facts only — no `id`, no `worldTurn`, no `message`. This is exactly the "trade facts only" shape the intake recommended.

**Revised flow:**

- `src/livingWorldCommerceUi.ts` — after a successful `executeDirectTrade()`, builds one `CommerceTradeEventDraft` from `input`/`result` and passes it to `scheduleCommercePersist()` as `tradeEventDrafts: [draft]` (renamed from the old `events` field name to make clear these are intents, not finished events). Construction is wrapped so a formatting exception here can only skip queuing the draft — it can never change the already-computed `ok: true` trade result (this also satisfies the intake's "Non-blocking clarification").
- `src/livingWorldCommercePersist.ts` — `PendingCommercePersist.tradeEventDrafts?: CommerceTradeEventDraft[]`, concatenated (not overwritten) exactly as the original result already required for the old `events` field. Inside the `writeWorld` closure, **after** `loadWorldState()` produces `freshWs`, the drafts are materialized into `WorldChangeEvent`s using `makeWorldChangeEvent()` with `worldTurn: freshWs.worldTurn`, `category: 'resource'`, `severity: 'info'`, `source: 'player'`, and a message built from the draft's facts — then merged via `mergeRecentChanges()` before `saveWorldState()`. This is the **single documented authority point** for both `worldTurn` and message text, resolving the conflict directly.

**Correctness detail required to actually satisfy the intake's own Acceptance Addition #3** ("coalesced trade event intents preserve one event per successful trade"):

`makeEventId(worldTurn, category, suffix)` derives id from `worldTurn + category + suffix`. If two drafts in the same coalesced batch share the same `worldTurn` and the same `commodityId`-derived suffix (e.g. two "buy wheat" trades before one flush), naively materializing both would produce the **same id**, and `mergeRecentChanges()`'s id-based de-dup would silently collapse them into one event — directly violating "one event per successful trade" under the exact coalescing scenario the intake is worried about. Repair: when materializing a batch, each draft's `idSuffix` must include its position in the batch, e.g. `` `${draft.op}_${draft.commodityId}_${index}` ``, guaranteeing distinct ids within one flush regardless of how many same-commodity trades coalesced.

The materialization step (factory calls + merge) inside `writeWorld` is wrapped in its own try/catch, isolated from the `markets` write already happening in the same closure: a materialization failure logs and skips the event merge for that flush but does not prevent the market/commerce write from completing (extends the existing best-effort principle to the new split point, satisfying the intake's non-blocking clarification on the persistence side too).

---

## 3. Updated touch set (delta from the original result)

| File | Change (repaired) |
|---|---|
| `src/gameRulesCore.ts` | Unchanged from original result: field + default (`'always'`) + normalize. |
| `src/livingWorldCommerceUiCore.ts` | **New**: add `CommerceTradeEventDraft` interface (pure, no vscode/fs — matches this file's existing pure-core convention). |
| `src/livingWorldCommerceUi.ts` | Build one `CommerceTradeEventDraft` (not a `WorldChangeEvent`) after a successful trade; pass via `tradeEventDrafts: [draft]`. Wrapped so draft-construction failure cannot affect the trade result. |
| `src/livingWorldCommercePersist.ts` | `PendingCommercePersist.tradeEventDrafts?: CommerceTradeEventDraft[]`, concatenated on schedule. `writeWorld` closure materializes drafts into `WorldChangeEvent`s using `freshWs.worldTurn` + per-draft-unique `idSuffix`, merges via `mergeRecentChanges()`, wrapped in its own try/catch isolated from the `markets` write. |
| ~~`webview/index.html`~~ | **Removed** — no selector in Phase 0 (Blocker 1). |
| ~~`webview/modules/70-game-rules.js`~~ | **Removed** — no wiring in Phase 0 (Blocker 1). |
| ~~`locales/*.json`~~ | **Removed** — no UI copy needed (Blocker 1); event messages are plain strings, not localized (confirmed precedent). |
| `scripts/test_*.js` | Test plan updated per §4 below. |
| `testing_checklist.md` | One manual line: confirm the World tab's existing "World Changes" panel shows the new commerce event after a direct trade. (The settings-round-trip line from the original result is removed — there is no UI control to round-trip in Phase 0.) |

**Still explicitly not touched:** `src/worldEventLogCore.ts` (no schema/enum change), `src/npcBridgeCore.ts`, `rulesProfileCore.ts` / Start Hub, any `TurnResult.*Ops` field, Chronicle, any GM prompt builder, `docs/ai-tasks/RUNTIME-003A*`.

---

## 4. Updated test plan (delta)

- `gameRulesCore`: unchanged from original result.
- `livingWorldCommerceUiCore` / `livingWorldCommerceUi`: a successful buy/sell produces exactly one `CommerceTradeEventDraft` with correct `op`/`commodityId`/`qty`/`locationId`/`goldDelta` sign; a failed trade produces zero drafts; a thrown draft-construction error still leaves the trade result `ok: true`.
- `livingWorldCommercePersist` (updated): two coalesced trades before one flush produce **two distinct materialized events** with **two distinct ids**, even when both trade the same commodity in the same `worldTurn` (direct regression test for the id-collision fix in §2); flushing with `tradeEventDrafts` empty/absent behaves exactly as before.
- World-state round trip: after flush, `world_state.json.recentChanges` contains the materialized event(s) with `worldTurn === freshWs.worldTurn` at flush time, FIFO-capped at `MAX_RECENT_CHANGES`, written in the same file operation as `markets`.
- Regression guard (unchanged): `npcBridgeCore`'s food-crisis branch is not triggered by these events.
- New: a materialization exception inside `writeWorld` does not prevent the `markets`/`commerce` write in the same flush from succeeding.
- Manual (`testing_checklist.md`): confirm the World tab panel shows the new event after a direct trade; no settings-panel manual step (none shipped).

---

## 5. Updated acceptance criteria (delta)

Original criteria 1, 2, 5, 6, 7 are unchanged. Criteria 3 and 4 are refined:

3. With `enableCommerce` + `enableCommerceUi` on, a successful direct trade results in exactly one materialized `WorldChangeEvent` in `world_state.json.recentChanges` per trade — including under coalesced-batch conditions with repeated commodities — visible in the existing World tab panel with zero Webview rendering changes.
4. No engine behavior differs based on `aiParticipationPolicy`'s value, **and no UI control in Phase 0 presents any value of that field as an active, working mode** (field is core-only, unexposed).

Plus the intake's four repaired acceptance additions, all satisfied as designed above:

1. No active-looking UI control advertises modes Phase 0 doesn't implement — satisfied (no selector shipped at all).
2. `WorldChangeEvent.worldTurn` has exactly one documented authority point — satisfied (`writeWorld` closure, `freshWs.worldTurn`, materialization time only).
3. Coalesced trade event intents preserve one event per successful trade — satisfied, including the same-commodity-same-turn edge case via per-draft-unique `idSuffix`.
4. Event-intent/materialization failure never changes an already-successful direct-trade result — satisfied at both the draft-construction point (UI layer) and the materialization point (persist layer), each isolated in its own try/catch.

---

## 6. Verdict

Both recorded blockers are repaired without expanding scope — Blocker 1's fix *reduces* the touch set (drops three files), and Blocker 2's fix stays within the same two files already in scope, plus the one type addition the intake itself recommended. The one extra detail added (per-draft-unique `idSuffix`) is not new scope; it is the concrete mechanism required to make the intake's own Acceptance Addition #3 true rather than aspirational.

**Final verdict: NOAI_PHASE0_IMPLEMENTATION_GATE_REPAIRED_READY**
