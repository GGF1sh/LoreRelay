# NOAI Phase 0 Implementation Gate — Result

Status: GATE_RESULT
Date: 2026-07-07 JST
Owner: Claude Sonnet (high reasoning)
Role: NOAI Phase 0 Implementation Gate Designer
Source task: `docs/ai-tasks/NOAI-PHASE0-IMPLEMENTATION-GATE.md`
Source of truth: `docs/ideas/NOAI-SIMULATION-ONLY-PRODUCT-UX-GATE.md`, `docs/ideas/NARRATION-ON-DEMAND-AI-OPTIONAL-LIVING-WORLD.md`, `docs/ideas/NARRATION-ON-DEMAND-NARRATIVE-SAMPLING-ADDENDUM.md`, `docs/AI_PROMPT_HANDOFF_POLICY.md`

Design only. No code changes. Does not touch `docs/ai-tasks/RUNTIME-003A*` or any runtime replay-guard path.

Audited at `origin/main` commit `2775fe0`.

---

## 1. Repository evidence (Phase-0-specific, beyond the parent product gate)

| Finding | Evidence |
|---|---|
| Direct commerce trade is the only existing AI-free mutation path | `src/livingWorldCommerceUi.ts:53-121` `executeLivingWorldDirectTrade()` → pure `executeDirectTrade()` (`livingWorldCommerceUiCore.ts:60-109`) → `scheduleCommercePersist()`. Gated by `enableCommerce` + `enableCommerceUi`, both default `false` (`gameRulesCore.ts:68-69`). |
| Persistence is debounced and dual-write | `src/livingWorldCommercePersist.ts` schedules a coalesced flush; `writeWorld` closure (lines 49-58) does `loadWorldState()` fresh and `saveWorldState({...freshWs, markets: snap.markets})`. `flushScheduledCommercePersist()` is explicitly documented as "safe to call from GM turn pre-hook and processTurnResult" — meaning trades can sit unflushed until the next GM turn or an explicit flush. |
| Reusable event factory already exists | `src/worldEventLogCore.ts:308-329` `makeWorldChangeEvent()` builds a fully valid `WorldChangeEvent` (stable id via `makeEventId`, clamped message/gmHint) from a plain options object. `mergeRecentChanges()` (lines 261-280) is the existing FIFO-merge-by-id used everywhere else (e.g. `emergentSimulator.ts:177`). **No new event type or schema change is required — both primitives already exist and are reused elsewhere.** |
| `WorldChangeCategory` has no "commerce"/"trade" value | `worldEventLogCore.ts:8`: `'faction' \| 'region' \| 'resource' \| 'npc' \| 'global' \| 'guild'`. Adding a new enum member would touch every switch/consumer of `WorldChangeCategory` — wider blast radius than Phase 0 should take. **Decision: reuse `category: 'resource'`** (a trade is fundamentally a resource-quantity change); do not add a new category. |
| **Critical interaction found: reusing `category: 'resource'` is not neutral** | `src/npcBridgeCore.ts:108`: `if (event.category === 'resource' && event.factionId && event.severity !== 'info') { ... }` triggers the Phase 4 "food crisis" NPC-reaction propagation (raises NPC `material` needs for every NPC in the matching faction). **If a Phase 0 commerce event is ever built with a `factionId` set and `severity` other than `'info'`, it will silently trigger unrelated NPC need escalation.** This is the single highest-risk detail in this gate and must be a hard contract rule, not a convention. |
| `WorldState.worldTurn` is the timestamp source | `src/worldStateCore.ts:63`. Available directly on the freshly-loaded `WorldState` inside the `writeWorld` closure — no need to thread `worldTurn` through the pending-persist payload separately. |
| Settings UI wiring convention | `webview/modules/70-game-rules.js:21-141` — every `GameRules` field has a matching `#gr-*` DOM element wired in three spots: input-ref map, save-payload builder, load-populate block. `enableCommerceUi`/`playerRole` are the closest precedents (boolean + enum-select respectively). |
| i18n convention | `locales/en.json`, `locales/ja.json` (+ zh-CN/zh-TW). New UI copy must follow existing key-naming (`gameRules.*`) across all four locales, per this repo's established multi-locale discipline (seen throughout `AI_ROADMAP.md`). |
| Start Hub / `rulesProfileCore.ts` | Not touched in Phase 0 (explicit constraint: "no broad Start Hub redesign"). The new field is authored only via the Game Rules settings panel for Phase 0; Start Hub interview wiring is deferred to a later phase, mirroring how `enableCommerceUi` itself was later added to the interview after existing independently first. |

---

## 2. Exact minimal contract

**New field** (`src/gameRulesCore.ts`):

```
aiParticipationPolicy?: 'always' | 'onDemand' | 'simulationOnly';
```

- Default: `'always'`. This is the only value that guarantees zero behavior change for every existing campaign (missing field → normalizes to `'always'`, which is exactly today's universal behavior).
- `'onDemand'` and `'simulationOnly'` are accepted and persisted in Phase 0 but **consumed nowhere** — no code branches on this field's value yet. It is inert plumbing, exactly as the parent task specifies ("without changing engine behavior yet").
- `'Important Events'` is **not** offered as a value in Phase 0 (matches the product gate's recommendation to build it last; there is nothing to select yet).
- Validation follows the existing ad hoc enum pattern used for `playerRole`/`travelEncounterDensity`/`diceDifficulty` in `normalizeGameRules()`: a `Set` of valid values, invalid/missing → fallback to `base.aiParticipationPolicy ?? 'always'`.

**Event-history write** (unconditional, does not depend on `aiParticipationPolicy`):

On every *successful* direct trade (`executeDirectTrade(...).ok === true`), construct exactly one `WorldChangeEvent` via the existing `makeWorldChangeEvent()`:

```
category: 'resource'
severity: 'info'          // HARD REQUIREMENT — see §1 npcBridgeCore finding
source: 'player'          // already a valid WorldChangeSource value
factionId: <omit>         // HARD REQUIREMENT — must not be set
worldTurn: <freshWs.worldTurn at flush time>
locationId: <input.marketLocationId>
message: templated, e.g. "小麦を20個購入 (-120G)" / "毛皮を5個売却 (+340G)"
```

No `gmHint`, no `mapHighlight`, no `expiresAfterTurns` (these direct-trade events should not expire faster than other `recentChanges` entries and don't need a map highlight).

---

## 3. Touch set

| File | Change |
|---|---|
| `src/gameRulesCore.ts` | Add `aiParticipationPolicy` to `GameRules` interface, `DEFAULT_GAME_RULES` (`'always'`), a `VALID_AI_PARTICIPATION_POLICIES` set, and one normalize line in `normalizeGameRules()`. |
| `src/livingWorldCommerceUi.ts` | In `executeLivingWorldDirectTrade()`, after a successful `executeDirectTrade()`, build the `WorldChangeEvent` (import `makeWorldChangeEvent` from `./worldEventLogCore`) and pass it to `scheduleCommercePersist()` as a new `events: [event]` field. |
| `src/livingWorldCommercePersist.ts` | Extend `PendingCommercePersist` with `events?: WorldChangeEvent[]`. Change the pending-merge in `scheduleCommercePersist()` to **concatenate** `events` (`[...(pendingHost?.events ?? []), ...(update.events ?? [])]`), not last-write-wins, so coalesced trades before a flush are not dropped. In the `writeWorld` closure, merge `snap.events` into `freshWs.recentChanges` via existing `mergeRecentChanges()` (import from `./worldEventLogCore`) before `saveWorldState()`; update `worldAttempted` to also be `true` when `snap.events?.length`. |
| `webview/index.html` | One new `<select id="gr-ai-participation-policy">` with three `<option>`s, placed next to the existing Commerce rule fields. |
| `webview/modules/70-game-rules.js` | Wire `aiParticipationPolicy` into the existing three-spot pattern (input-ref map, save-payload, load-populate) exactly like `playerRole`. |
| `locales/en.json`, `locales/ja.json`, `locales/zh-CN.json`, `locales/zh-TW.json` | New label + 3 option-copy strings under a `gameRules.aiParticipationPolicy.*` key, using the §2 recommended user-facing names (Always / Narrate on Demand / Simulation Mode — Important Events not offered). |
| `scripts/test_*.js` (new, e.g. `test_ai_participation_policy_core.js`) + existing commerce UI core test file | Unit coverage per §5 Test Plan; wired into `npm test`. |
| `testing_checklist.md` | One new manual line: settings round-trip + confirm the new event appears in the World tab's existing "World Changes" panel. |

**Explicitly not touched:** `src/worldEventLogCore.ts` (no schema/enum change), `src/npcBridgeCore.ts`, `rulesProfileCore.ts` / Start Hub, any `TurnResult.*Ops` field, Chronicle, any GM prompt builder, `docs/ai-tasks/RUNTIME-003A*`.

---

## 4. Failure matrix

| Scenario | Required behavior |
|---|---|
| Direct trade succeeds, event construction throws/fails validation | Trade result must still return `ok: true` to the caller. Event push is best-effort and must not be able to fail the trade itself. |
| `writeWorld` (cross-file dual write) fails or is partial | Already-existing `executeCrossFileDualWrite` / `recordSplitBrainRisk` handles this; the new event shares the same write as `markets`, so it fails/succeeds atomically with the market write — no new split-brain surface introduced. |
| `game_rules.json` has no `aiParticipationPolicy` (pre-existing campaign) | Normalizes to `'always'`. No crash, no migration needed. |
| `game_rules.json` has an invalid string value | Falls back to `'always'` per the same enum-validation pattern already used for `playerRole`. |
| Multiple direct trades happen before the debounced flush fires | Events must **accumulate** in `pendingHost.events`, not overwrite. This must be verified with a test (§5) since the existing scalar-field merge pattern in `scheduleCommercePersist()` is last-write-wins by default and would silently drop earlier trades' events if copied naively. |
| `enableCommerce`/`enableCommerceUi` is `false` (default) | Entire Phase 0 change is dormant — unreachable code path, zero risk for the majority of existing campaigns. |
| A Phase 0 event is accidentally built with `factionId` set and `severity !== 'info'` | **Must never happen** — this would silently trigger the food-crisis NPC-reaction branch in `npcBridgeCore.ts:108`, escalating unrelated NPC needs from an ordinary trade. Enforced by construction (Phase 0 code never sets `factionId` or a non-`'info'` severity on these events), and covered by a regression test (§5). |
| `MAX_RECENT_CHANGES` (20) FIFO cap is exceeded by a burst of trades | Older `recentChanges` entries (including simulation-originated ones) may be evicted sooner. This is a known, already-documented limitation (parent product gate §7, deferred to Phase 2 retention work) — not a new failure mode, must not be "fixed" inside Phase 0. |

---

## 5. Test plan

- `gameRulesCore`: `normalizeGameRules()` with missing / invalid / each valid `aiParticipationPolicy` value → correct fallback/passthrough. Full existing `npm test` suite must stay green (pure regression check, no existing test should need to change).
- `livingWorldCommerceUiCore` / `livingWorldCommerceUi`: a successful buy/sell produces exactly one well-formed `WorldChangeEvent` with `severity: 'info'`, `source: 'player'`, `category: 'resource'`, and **no** `factionId`. A failed trade (`INVALID_QTY`, `WRONG_LOCATION`, etc.) produces zero events.
- `livingWorldCommercePersist`: two trades coalesced before a single flush produce **two** accumulated events in the flushed payload, not one overwritten; flushing with `events` empty/absent behaves exactly as it does today (no regression for existing commerce-only persists).
- World-state round trip: after flush, `world_state.json.recentChanges` contains the new event(s), FIFO-capped at `MAX_RECENT_CHANGES`, written in the same file operation as `markets` (confirm no additional write path/file was introduced).
- Regression guard: a direct-trade test scenario must confirm `npcBridgeCore`'s food-crisis branch (`category==='resource' && factionId && severity!=='info'`) is **not** triggered by these events.
- Manual (`testing_checklist.md`): Game Rules settings round-trip for the new select field; confirm the new event renders in the World tab's existing "World Changes" panel with zero Webview rendering changes (it's just another `WorldChangeEvent`).

---

## 6. Acceptance criteria

1. `npm test` passes in full, including new tests; no existing test is modified to "make it pass."
2. A pre-existing campaign's `game_rules.json` (no `aiParticipationPolicy` key) loads with the field defaulting to `'always'` and exhibits **zero** behavioral difference from before this change.
3. With `enableCommerce` + `enableCommerceUi` on, a successful direct trade writes exactly one `WorldChangeEvent` into `world_state.json.recentChanges`, visible in the existing World tab panel without any panel/rendering code changes.
4. No engine behavior differs based on the new field's value (`'always'` / `'onDemand'` / `'simulationOnly'` are behaviorally identical in Phase 0 — confirmed by test/inspection, since nothing reads the field yet).
5. `docs/ai-tasks/RUNTIME-003A*` and all runtime replay-guard code are untouched (diff review).
6. `WorldChangeCategory` gains no new member; `'resource'` is reused as-is.
7. No commerce-originated event ever carries `factionId` together with a non-`'info'` severity.

---

## 7. Deferred (explicitly out of scope for Phase 0)

- Start Hub / `rulesProfileCore.ts` goddess-interview wiring of `aiParticipationPolicy`.
- Direct-action parity for travel / time-advance / settlement / domain / guild / vehicle (Phase 1 of the parent product gate).
- Any engine behavior that branches on `aiParticipationPolicy`'s value.
- Narrate-on-Demand button/pipeline (Phase 3).
- Important Events automatic classifier (Phase 5) — and the "Important Events" option is not even offered in the Phase 0 UI enum.
- NotebookLM integration (Phase 6).
- Any new `WorldChangeCategory`, any new event-history type, or any change to `worldEventLogCore.ts`'s schema.
- Event retention/cap changes (Phase 2 of the parent product gate).

---

## 8. Biggest risk carried forward

The `npcBridgeCore.ts:108` food-crisis interaction (§1) is the one place where "just reuse the existing type" is not free — it is a real, silent coupling that would have shipped a bug if this gate had simply said "use category `resource`" without the severity/factionId constraint. Any future phase that reuses `category: 'resource'` for a different direct action (e.g. Phase 1's travel/time-advance) must re-check this same interaction before assuming reuse is safe.

---

**Final verdict: NOAI_PHASE0_IMPLEMENTATION_GATE_READY**
