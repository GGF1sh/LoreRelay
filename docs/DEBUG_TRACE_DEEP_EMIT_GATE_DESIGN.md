# Debug Trace Deep Emit Gate Design

Status: Design / implementation gate  
Date: 2026-07-04  
Owner: Grok / Codex  
Recommended implementation model: Grok or Codex, reasoning Medium

## 日本語サマリ（開発者向け）

- **目的:** Phase A（v1.77.8）の step サマリ trace より深い粒度で、`event → rule condition → decision → effect` を記録する**安全境界**を先に確定する。
- **最初の対象:** `npcAgency`（食料危機買い付け）・`livingWorldCommerce`（食料危機の市場反応）・`npcRelationship`（派閥紛争 / 共通危機）。直近の再発バグ（派閥警告を食料危機と誤認）の検知に直結。
- **やらないこと:** Webview / UI / disk persistence / GM prompt / Remote / Replay / `statePatch` / `TurnResult` 変更。
- **実装方針:** 既存 pure core（`npcAgencyCore` 等）の**シグネチャは変えない**。`debugTraceEmitCore.ts`（pure）が入力/出力から trace entry を**事後構築**し、host adapter（`livingWorldBridge` 等）が `appendDebugTraceHostEntries` へ渡す。
- **順番:** 本設計ゲート → `debugTraceEmitCore.ts` + テスト → adapter 1 箇所（`tickLivingWorldAfterSim`）→ 統合レビュー（Codex）。

## 1. Summary

P1 core (`debugTraceCore.ts`) and Phase A host (`debugTraceHostCore.ts`, v1.77.8) already provide:

- a bounded in-memory ring buffer;
- `debugTraceUpdate` postMessage when debug console is visible;
- per-step summaries + notable `WorldChangeEvent` rows with a **shallow** `food_crisis_classifier` hint.

That shallow capture is useful but **not sufficient** to answer:

```text
Why did npcAgency move NPC X to market Y this tick?
Was it because isFoodCrisisEvent matched, or because a faction warning was misread?
```

Deep Emit adds **rule-level trace** around Living World subsystems without changing game behavior.

## 2. Why This Gate Exists

Recent cross-subsystem bugs:

| Bug pattern | Subsystems involved | What shallow trace misses |
|-------------|---------------------|---------------------------|
| Faction warning mistaken for food crisis | `worldEvent` → `npcAgency` / commerce | Per-NPC decision + classifier inputs |
| `recentChanges` re-applied | `emergentSimulator` → `npcBridge` | Which events were consumed this tick vs replayed |
| Unrelated faction pairs affected | `npcRelationship` faction_conflict | Which `stepEvents` triggered which faction pair |

Unit tests catch regressions after the fact. Deep Emit makes the **decision path visible in the Inspector** (once Phase B UI lands) without coupling trace to GM prompts.

## 3. Current Baseline (v1.77.8)

| Layer | File | What it emits today |
|-------|------|---------------------|
| P1 vocabulary | `debugTraceCore.ts` | parse / buffer / projection / linkage validation |
| Phase A host | `debugTraceHostCore.ts` | `trace_step_{turn}` + up to 16 notable events/step |
| Capture hook | `worldSimPersist.ts` `afterStep` | calls `captureDebugTraceSimulationStep` before Living World tick |
| UI contract | `DEBUG_TRACE_INSPECTOR_UI_DESIGN.md` | consumes `debugTraceUpdate` (Phase B pending) |

**Gap:** `reactNpcsToWorld`, `applyWorldEventsToMarkets`, `evolveRelationships` produce effects but emit **no rule-level trace**.

## 4. Scope

### In scope (P2 Deep Emit — first slice)

- `src/debugTraceEmitCore.ts` — pure trace builders from subsystem inputs/outputs
- `scripts/test_debug_trace_emit_core.js`
- One host adapter choke point: `livingWorldBridge.tickLivingWorldAfterSim` (after `runLivingWorldTick` + `evolveRelationships`)
- Bounded entry budgets per sim tick
- Parent/child linkage to existing `trace_step_{turn}` rows from Phase A

### Out of scope

- Webview / `81-debug-trace.js` (Claude Phase B)
- Modifying `npcAgencyCore.reactNpcsToWorld` return type or internals
- Disk persistence, Output Channel command, golden trace files
- GM prompt / Context Inspector / `buildRelationshipPromptLines` integration
- Remote Play / replay export / Webview sanitize changes
- Automatic trace in every subsystem (commerce-only, npcBridge-only paths deferred to P2b)

## 5. Canonical Classifiers (do not duplicate logic)

Trace builders must **import and reference** existing classifiers — never reimplement keywords in emit code.

| Classifier | Canonical source | Used by |
|------------|-------------------|---------|
| Food crisis event | `isFoodCrisisEvent` (`livingWorldTypes.ts`) | `npcAgencyCore`, `worldSimCommerceCore`, shallow host capture |
| Conflict event | `isConflictEvent` (`npcRelationshipCore.ts`) | `evolveRelationships` rule 3 |
| Conflict faction pair | `extractConflictFactionPair` | faction relationship mutation |
| Resource→NPC need | `npcBridgeCore` inline: `category === 'resource' && factionId` | **Different** from `isFoodCrisisEvent` — trace must surface this distinction |

**Design rule:** When emit reports a `decision`, `conditions[]` must cite the **same predicate** the subsystem used, including `actual` / `expected` where cheap.

## 6. Emit Architecture

### 6.1 Layering

```text
npcAgencyCore / worldSimCommerceCore / npcRelationshipCore  (unchanged pure)
        │
        ▼
debugTraceEmitCore.ts  (pure: build entries from inputs + outputs)
        │
        ▼
livingWorldBridge.tickLivingWorldAfterSim  (adapter: append if debug trace enabled)
        │
        ▼
debugTraceHostCore.appendDebugTraceHostEntries  (never throws)
        │
        ▼
extension.ts → debugTraceUpdate  (existing Phase A)
```

### 6.2 Why adapter-layer emit first

- Keeps `npcAgencyCore` import-clean (no vscode, no host, no circular deps).
- Lets us ship trace without risking agency/commerce determinism.
- Later optional refactor: return `{ moves, traceEntries }` from cores — **not P2a**.

### 6.3 Debug gating

Deep emit appends only when **the same gate as Phase A** is true:

```ts
isBulkWorldSimDebugEnabled() || isActiveDebugScenario(workspacePath)
```

Implement as a pure helper `shouldEmitDeepDebugTrace(flags)` in emit core; host evaluates flags.

When gate is false: **zero builder calls** (not just zero append).

## 7. First-Slice Emit Points

All entries share `runId` from `beginDebugTraceSimulationRun` (already started in `worldSimPersist`). Deep emit entries use `parentTraceId: trace_step_{worldTurn}` to link under the Phase A step row.

### 7.1 Food crisis classifier (query → decision)

**Subsystem:** cross-cutting  
**Trigger:** `stepEvents.length > 0` on a Living World tick  
**Function:** `buildFoodCrisisScanTrace(runId, worldTurn, stepEvents)`

For each `stepEvent` evaluated by `isFoodCrisisEvent`:

| Field | Value |
|-------|-------|
| `subsystem` | `livingWorldClassifier` |
| `phase` | `query` |
| `ruleId` | `isFoodCrisisEvent` |
| `decision` | `matched` / `not_matched` |
| `conditions` | category === resource, message keyword check (mirror `livingWorldTypes`) |
| `inputRefs` | `[{ kind: 'event', id }]` |
| `audience` | `internal` |

Emit at most **8** classifier rows per tick (cap). Skip `info` severity events unless already notable in Phase A.

### 7.2 Commerce food crisis effect

**Subsystem:** `livingWorldCommerce`  
**Input:** `WorldKitTickInput.stepEvents`, `tickMarketRecovery` / `applyWorldEventsToMarkets` outcome  
**Function:** `buildCommerceFoodCrisisTrace(runId, worldTurn, stepEvents, summary)`

| Field | Value |
|-------|-------|
| `phase` | `effect` |
| `ruleId` | `food_crisis_price_bump` |
| `decision` | `applied` / `skipped_no_match` |
| `message` | e.g. `Wheat priceIndex bumped at N markets` |
| `outputRefs` | `[{ kind: 'location', id: marketLoc }, …]` (max 8) |
| `audience` | `gm_safe` when applied, `internal` when skipped |

### 7.3 npcAgency food crisis buy wheat

**Subsystem:** `npcAgency`  
**Input:** `AgencyReactionInput`, `reactNpcsToWorld` result `{ moves, positions }`  
**Function:** `buildNpcAgencyFoodCrisisTrace(runId, worldTurn, input, result)`

Per **evaluated** NPC (cap **10** = `maxNamedNpcCount`):

1. **Decision row** — `phase: decision`, `ruleId: food_crisis_buy_wheat`
   - `conditions`: `foodCrisisDetected` (any stepEvent matched), `hasFaction`, `hasCheapWheat`, `notInTransit`
   - `decision`: `move_scheduled` / `not_matched` / `skipped_in_transit`
   - `inputRefs`: triggering food crisis events (if any)
   - `audience`: `internal`

2. **Effect row** (only when move emitted) — `phase: effect`, parent = decision traceId
   - `outputRefs`: `[{ kind: 'npc', id: npcId }, { kind: 'location', id: cheapWheat }]`
   - `message`: `NPC {name} restock_wheat → {location} in {days} days`
   - `audience`: `gm_safe`

**Critical regression case to lock in tests:**

```text
stepEvent: category=faction, severity=warning, message="Merchants warn of trade disruption"
→ isFoodCrisisEvent = false
→ foodCrisisDetected condition result: false
→ no food_crisis_buy_wheat move
```

### 7.4 npcRelationship faction conflict

**Subsystem:** `npcRelationship`  
**Input:** `RelationshipEvolveInput.stepEvents`, `evolveRelationships` output `factionChanges`  
**Function:** `buildFactionConflictTrace(runId, worldTurn, stepEvents, factionChanges)`

Per conflict event (cap **4** per tick):

| Field | Value |
|-------|-------|
| `phase` | `decision` |
| `ruleId` | `faction_conflict` |
| `conditions` | `isConflictEvent`, `extractConflictFactionPair` present |
| `decision` | `relation_delta_applied` / `not_matched` |
| `inputRefs` | event ref |
| `outputRefs` | `[{ kind: 'faction', id: factionA }, { kind: 'faction', id: factionB }]` |

Per applied `faction_kinship` (cap **4**): similar with `ruleId: faction_kinship`.

`audience`: `gm_safe` for applied deltas, `internal` for non-matches.

### 7.5 Shared crisis (optional P2a tail)

If `agencyMoves` produce `shared_crisis` relationship deltas, emit one summary row:

- `ruleId: shared_crisis_bond`, `phase: effect`, `audience: gm_safe`
- Cap 4 pair rows.

Defer if entry budget pressure — P2b.

## 8. Boundedness

| Budget | Limit |
|--------|-------|
| Total deep entries per Living World tick | **32** (in addition to Phase A step rows) |
| Classifier query rows | 8 |
| npcAgency per-NPC decision rows | 10 |
| Commerce location refs | 8 |
| Faction conflict rows | 8 |

Builder returns entries in deterministic order:

```text
classifier scans → commerce effect → npcAgency decisions → npcAgency effects → faction conflict
```

If over budget: drop **lowest priority tail** (shared_crisis first, then in-transit skipped NPCs).

Ring buffer global cap remains `DEFAULT_DEBUG_TRACE_BUFFER_ENTRIES` (256).

## 9. Audience & Safety Boundaries

| Content | `audience` | Rationale |
|---------|------------|-----------|
| Classifier internals, skipped NPC eval | `internal` | Developer-only |
| Market price bumps, NPC moves, faction deltas | `gm_safe` | GM narration aid, not player-facing |
| `player_safe` | **unused in P2a** | No semantic redaction yet — do not emit player_safe rows |

**Hard boundaries (review checklist for Codex):**

1. **Prompt Context:** no trace fields added to `PromptContextBreakdown` or GM prompt builders.
2. **Replay / Remote:** no trace in replay export or `gameStateWebviewSanitize` payloads.
3. **Projection:** Webview uses `projectDebugTraceBuffer` locally — host always sends full `internal` buffer; Inspector toggles visibility.
4. **Failure isolation:** `appendDebugTraceHostEntries` try/catch — emit never blocks `tickLivingWorldAfterSim`.
5. **No `recentChanges` reads:** deep emit uses `stepEvents` only for mutation causality (matches `emergentSimulator` comment).

## 10. Relationship to Phase A Shallow Capture

Phase A `buildSimulationStepTraceEntries` in `debugTraceHostCore.ts` duplicates shallow `food_crisis_classifier` on notable events.

**P2a plan:**

- Keep Phase A step summary as parent anchor.
- Move detailed classifier conditions to `debugTraceEmitCore` (canonical).
- Optionally slim Phase A notable rows to `phase: event` only (no conditions) in P2b cleanup — **not required for P2a**.

## 11. File-Level Breakdown

### P2a — pure emit core (Grok/Codex)

| File | Action |
|------|--------|
| `src/debugTraceEmitCore.ts` | New — builders in §7, budgets §8 |
| `scripts/test_debug_trace_emit_core.js` | New — regression cases §7.3, boundedness |
| `scripts/run_all_tests.js` | Register test |

### P2a — host adapter (Grok/Codex)

| File | Action |
|------|--------|
| `src/livingWorldBridge.ts` | After `runLivingWorldTick` + `evolveRelationships`, call emit builders + append when gated |
| `src/debugTraceHostCore.ts` | Export `isDebugTraceCaptureEnabled()` helper or accept flags from bridge via small host util |

**Do not modify:** `webview/*`, `gmPromptBuilder*`, `replayExport*`, `npcAgencyCore.ts` signatures.

### P2b — deferred

- `npcBridgeCore.applyEventsToNpcRegistry` emit (resource need path vs `isFoodCrisisEvent` mismatch visibility)
- `emergentSimulator` faction event generation trace
- Output Channel / `LoreRelay: Inspect Last Simulation Tick` command

### P2c — deferred

- Golden trace fixtures in `scripts/run_simulation_tests.js`
- Semantic redaction for `player_safe`

## 12. Required Tests (`test_debug_trace_emit_core.js`)

1. Faction warning event → `isFoodCrisisEvent` not matched → no `food_crisis_buy_wheat` move trace.
2. Resource + food keyword event → classifier matched → agency move trace with parent link.
3. NPC in transit → `skipped_in_transit` decision, no effect row.
4. `isConflictEvent` + valid pair → `faction_conflict` applied row with faction refs.
5. Per-tick entry count ≤ 32; deterministic ordering across two runs with same input.
6. Builder does not import `vscode` / `fs` / `statePatch`.
7. Malformed partial input → empty array, never throws.

## 13. Implementation Prompt (P2a)

```markdown
LoreRelay Debug Trace Deep Emit P2a.

推奨モデル: Grok / Codex
推奨推論: Medium

Read first:
1. docs/DEBUG_TRACE_DEEP_EMIT_GATE_DESIGN.md (this file)
2. docs/DEBUG_TRACE_P1_DESIGN.md
3. src/debugTraceCore.ts
4. src/debugTraceHostCore.ts
5. src/npcAgencyCore.ts (reactNpcsToWorld)
6. src/worldSimCommerceCore.ts (applyWorldEventsToMarkets)
7. src/npcRelationshipCore.ts (evolveRelationships, isConflictEvent)
8. src/livingWorldBridge.ts (tickLivingWorldAfterSim)
9. scripts/test_living_world_bridge.js (if present)

Task:
Implement P2a deep emit per §11 — pure builders + livingWorldBridge adapter only.

Scope:
- src/debugTraceEmitCore.ts
- scripts/test_debug_trace_emit_core.js
- livingWorldBridge.ts append hook (gated)
- scripts/run_all_tests.js registration

Forbidden:
- No Webview / Inspector UI changes
- No npcAgencyCore / npcRelationshipCore signature changes
- No GM prompt / TurnResult / statePatch / replay / remote changes
- No disk persistence

Verification:
- npm run compile
- node scripts/test_debug_trace_emit_core.js
- npm test
```

## 14. Acceptance Criteria

P2a Deep Emit is done when a debug-gated bulk sim tick produces linked trace rows showing:

- which `stepEvents` matched `isFoodCrisisEvent`;
- whether `reactNpcsToWorld` scheduled `food_crisis_buy_wheat` per NPC and why;
- whether commerce bumped wheat prices;
- which faction conflict events moved faction relationships;

—all without changing world state, prompts, or player-visible behavior, and with `npm test` green.

## 15. Review Handoff (Codex — after P2a implementation)

Integration review checklist:

- [ ] Trace entries absent from `PromptContextBreakdown` and GM prompt output
- [ ] `player_safe` projection hides all P2a rows (they are `internal` or `gm_safe` only)
- [ ] Per-tick + ring buffer bounds enforced in tests
- [ ] No new fields in replay export or Remote sanitize paths
- [ ] `stepEvents`-only causality — no `recentChanges` replay in emit builders
- [ ] Classifier conditions match canonical `isFoodCrisisEvent` / `isConflictEvent` semantics