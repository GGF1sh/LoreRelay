# Debug Trace Deep Emit Gate Design

Status: **Approved** (implementation gate)  
Date: 2026-07-04  
Owner: Grok  
Recommended implementation model: Grok or Codex, reasoning Medium–High

## 日本語サマリ

- **目的:** Inspector（v1.77.9）に意味のある rule-level trace を流す。第一候補は `npcAgencyCore` の食料危機判定。
- **契約:** `debugTraceEmitCore.ts`（pure）が `stepEvents` + subsystem 入出力から entry を構築 → `livingWorldBridge` が debug ゲート時のみ append。
- **フェーズ:** P1a pure builders + テスト → P1b host adapter → P2 commerce / npcRelationship / npcBridge。
- **禁止:** GM prompt、disk、Remote/Replay、`npcAgencyCore` シグネチャ変更。

---

## Findings / Risks

### Findings

| # | Finding | Implication |
|---|---------|-------------|
| F1 | Stack is ready: P1 core (v1.77.7), host snapshot (v1.77.8), Inspector UI (v1.77.9) all consume `debugTraceUpdate`. | Deep emit can ship without UI work. |
| F2 | Phase A (`debugTraceHostCore`) emits shallow `food_crisis_classifier` on **notable** events only — no per-NPC decision path. | Inspector shows *that* an event was notable, not *why* NPC Elda moved. |
| F3 | `isFoodCrisisEvent` (`livingWorldTypes.ts`) is the **canonical** food-crisis predicate for `reactNpcsToWorld`. | Trace `conditions[]` must mirror this function — never duplicate keyword lists in emit-only code. |
| F4 | `reactNpcsToWorld` uses **`stepEvents` only** (documented in `AgencyReactionInput`). `recentChanges` is never read. | Emit builders must accept `stepEvents` only; tests must prove `recentChanges` is ignored. |
| F5 | `test_npc_agency_step_events.js` already locks the regression: faction warning → 0 moves; resource+food keyword → `restock_wheat`. | Deep emit tests should mirror these cases as trace assertions. |
| F6 | `npcBridgeCore` uses `category === 'resource' && factionId` — **broader** than `isFoodCrisisEvent`. | Out of P1 scope; document as P2 risk (R3). |
| F7 | `traceId` in entries must be unique within buffer. Event ids (`wce_*`) are unique per sim event. | Use `trace_fc_scan_{eventId}`; dedupe duplicate ids within one `stepEvents` array. |

### Risks

| # | Risk | Mitigation |
|---|------|------------|
| R1 | Trace volume per tick blows ring buffer (256). | Per-tick budget **24** deep entries (P1a); global ring unchanged. |
| R2 | Emit throws into `tickLivingWorldAfterSim` and breaks Living World. | `appendDebugTraceHostEntries` already never throws; builders return `[]` on bad input. |
| R3 | `npcBridge` resource path fires when `isFoodCrisisEvent` is false (mana low, etc.). | P2 emit for `npcBridge`; P1a documents divergence in §Findings F6. |
| R4 | Phase A shallow rows duplicate P1a classifier conditions. | P1a entries use distinct `traceId` prefix `trace_fc_*`; optional P2 cleanup to slim Phase A rows. |
| R5 | `internal` decision text leaks via `gm_safe` toggle misunderstanding. | P1a emits decision rows as `internal` only; effects as `gm_safe`. No `player_safe` in P1. |
| R6 | Host builds trace when debug gate off → perf cost. | `shouldEmitDeepDebugTrace(flags)` short-circuits **before** any builder call. |

---

## Approved Deep Emit P1 Contract

### Architecture

```text
npcAgencyCore.reactNpcsToWorld  (unchanged — no trace imports)
        │
        ▼
debugTraceEmitCore.ts           (pure — build entries from input + output)
        │
        ▼
livingWorldBridge.ts            (adapter — if shouldEmitDeepDebugTrace)
        │
        ▼
debugTraceHostCore.ts           (append — never throws)
        │
        ▼
debugTraceUpdate → 80a-debug-trace.js
```

### Input contract (P1a)

```ts
export interface FoodCrisisAgencyEmitInput {
    runId: string;
    worldTurn: number;
    parentTraceId: string;           // trace_step_{worldTurn} from Phase A
    stepEvents: WorldChangeEventLike[];  // THIS TICK ONLY — never recentChanges
    agencyInput: AgencyReactionInput;
    agencyResult: { moves: NpcAgencyOp[]; positions: NpcPositionsMap };
    maxNpcTraces?: number;           // default 10
}
```

### Entry chain (per sim tick, npcAgency food crisis)

| Step | `phase` | `subsystem` | `ruleId` | `traceId pattern | Purpose |
|------|---------|-------------|----------|-------------------|---------|
| 1 | `query` | `livingWorldClassifier` | `isFoodCrisisEvent` | `trace_fc_scan_{eventId}` | Per **unique** stepEvent: evidence + conditions |
| 2 | `decision` | `npcAgency` | `food_crisis_gate` | `trace_fc_gate_t{turn}` | Tick-level: any match + cheap wheat market exists |
| 3 | `decision` | `npcAgency` | `food_crisis_buy_wheat` | `trace_fc_npc_{npcId}_t{turn}` | Per evaluated NPC: why move / skip |
| 4 | `effect` | `npcAgency` | `food_crisis_buy_wheat` | `trace_fc_effect_{npcId}_t{turn}` | Only when move in `agencyResult.moves` |

**Linkage:** steps 1–2 parent → `trace_step_{turn}`; step 3 parent → `trace_fc_gate_t{turn}`; step 4 parent → step 3.

### `isFoodCrisisEvent` → conditions[] (step 1)

Mirror `livingWorldTypes.ts` exactly:

```ts
[
  { label: 'category === resource', result: ev.category === 'resource', actual: ev.category, expected: 'resource' },
  { label: 'message includes food keyword', result: <keyword match>, actual: <truncated message>, expected: '(food|wheat|食料|小麦)' },
]
```

`decision`: `matched` if both true, else `not_matched`.

### `food_crisis_gate` → conditions[] (step 2)

```ts
[
  { label: 'any stepEvent matched isFoodCrisisEvent', result: foodCrisis, actual: matchedCount, expected: '>=1 when crisis' },
  { label: 'cheapestWheatMarket exists', result: !!cheapWheat, actual: cheapWheat ?? '(none)' },
]
```

`decision`: `gate_open` | `gate_closed`.

### Per-NPC `food_crisis_buy_wheat` → conditions[] (step 3)

Evaluate NPCs in same order as `reactNpcsToWorld` (`registryNpcIds` slice):

```ts
[
  { label: 'food_crisis_gate open', result: gateOpen },
  { label: 'npc has factionId', result: reg.factionId !== undefined, actual: reg.factionId ?? '(none)' },
  { label: 'npc not in transit', result: !(existing?.arrivesTurn > worldTurn) },
]
```

`decision` values:

| Value | Meaning |
|-------|---------|
| `move_scheduled` | All conditions true → move will be emitted |
| `skipped_in_transit` | Gate open but in transit |
| `skipped_no_faction` | Gate open but no `factionId` |
| `not_matched` | Gate closed |

### Audience boundary (approved)

| Row kind | `audience` | Visible in Inspector |
|----------|------------|---------------------|
| Classifier scan (`query`) | `internal` | Internal only |
| Gate + per-NPC decision | `internal` | Internal only |
| Move effect (`effect`) | `gm_safe` | Internal + GM-safe |
| `player_safe` | **not emitted in P1** | N/A |

Host sends full buffer; Webview `projectDebugTraceBuffer` filters locally (v1.77.9).

### Boundedness (P1a)

| Limit | Value |
|-------|-------|
| Unique `stepEvents` scanned (step 1) | 8 |
| NPC decision rows (step 3) | 10 (`maxNamedNpcCount`) |
| Effect rows (step 4) | ≤ moves.length |
| **Total deep entries per tick** | **24** |
| Builder function | Returns trimmed array; never throws |

### Optional / gated

```ts
export function shouldEmitDeepDebugTrace(flags: {
    bulkWorldSimDebug: boolean;
    debugScenarioActive: boolean;
}): boolean {
    return flags.bulkWorldSimDebug || flags.debugScenarioActive;
}
```

When false: adapter does not call builders.

### Non-goals (hard)

- No `recentChanges` in any builder input type.
- No writes to `world_state`, `npc_registry`, markets, positions.
- No `PromptContextBreakdown`, GM prompt, replay export, Remote sanitize fields.
- No disk persistence of trace buffer.
- No changes to `npcAgencyCore.ts` function signatures.

### stepEvents-only verification shape

Every P1a builder input type **must not include** `recentChanges`. Tests pass `recentChanges` with conflict events alongside **empty** `stepEvents` and assert **zero** food-crisis trace rows — mirrors `test_npc_relationship_core.js` §7c.

### eventId deduplication

Within one tick's `stepEvents` array:

- Scan each event once by key: `ev.id ?? anon:{worldTurn}|{category}|{factionId}|{message}`.
- Second identical key → skip scan row (no duplicate `trace_fc_scan_*`).

---

## Trace Entry Examples

### Example A — Faction warning (false positive regression)

`stepEvents`:

```json
[{
  "id": "wce_5_faction_merchants_smiths",
  "worldTurn": 5,
  "category": "faction",
  "severity": "warning",
  "message": "Merchants and Smiths relations soured",
  "factionId": "faction_merchants"
}]
```

**Entry 1 — query (scan):**

```json
{
  "version": 1,
  "runId": "sim_4_1",
  "traceId": "trace_fc_scan_wce_5_faction_merchants_smiths",
  "parentTraceId": "trace_step_5",
  "worldTurn": 5,
  "subsystem": "livingWorldClassifier",
  "phase": "query",
  "ruleId": "isFoodCrisisEvent",
  "decision": "not_matched",
  "message": "Scan stepEvent for food crisis semantics.",
  "inputRefs": [{ "kind": "event", "id": "wce_5_faction_merchants_smiths" }],
  "conditions": [
    { "label": "category === resource", "result": false, "actual": "faction", "expected": "resource" },
    { "label": "message includes food keyword", "result": false }
  ],
  "audience": "internal"
}
```

**Entry 2 — gate decision:**

```json
{
  "version": 1,
  "runId": "sim_4_1",
  "traceId": "trace_fc_gate_t5",
  "parentTraceId": "trace_step_5",
  "worldTurn": 5,
  "subsystem": "npcAgency",
  "phase": "decision",
  "ruleId": "food_crisis_gate",
  "decision": "gate_closed",
  "message": "No food crisis stepEvent matched; npcAgency wheat rush gate closed.",
  "conditions": [
    { "label": "any stepEvent matched isFoodCrisisEvent", "result": false, "actual": 0 },
    { "label": "cheapestWheatMarket exists", "result": true, "actual": "cheap_farm" }
  ],
  "audience": "internal"
}
```

No per-NPC rows. `agencyResult.moves` empty. Inspector: gate_closed + ✗ category visible at a glance.

### Example B — Food crisis → NPC move

`stepEvents`:

```json
[{
  "id": "wce_6_resource_merchants_food",
  "worldTurn": 6,
  "category": "resource",
  "severity": "warning",
  "message": "Merchants: 食料が底をついた",
  "factionId": "faction_merchants"
}]
```

**Entry — scan (matched):** `decision: "matched"`, both conditions ✓.

**Entry — gate:** `decision: "gate_open"`.

**Entry — NPC decision (`npc_elda`):**

```json
{
  "version": 1,
  "runId": "sim_5_1",
  "traceId": "trace_fc_npc_npc_elda_t6",
  "parentTraceId": "trace_fc_gate_t6",
  "worldTurn": 6,
  "subsystem": "npcAgency",
  "phase": "decision",
  "ruleId": "food_crisis_buy_wheat",
  "decision": "move_scheduled",
  "message": "Elda scheduled for wheat restock.",
  "inputRefs": [{ "kind": "event", "id": "wce_6_resource_merchants_food" }],
  "conditions": [
    { "label": "food_crisis_gate open", "result": true },
    { "label": "npc has factionId", "result": true, "actual": "faction_merchants" },
    { "label": "npc not in transit", "result": true }
  ],
  "audience": "internal"
}
```

**Entry — effect:**

```json
{
  "version": 1,
  "runId": "sim_5_1",
  "traceId": "trace_fc_effect_npc_elda_t6",
  "parentTraceId": "trace_fc_npc_npc_elda_t6",
  "worldTurn": 6,
  "subsystem": "npcAgency",
  "phase": "effect",
  "ruleId": "food_crisis_buy_wheat",
  "decision": "applied",
  "message": "restock_wheat → cheap_farm in 3 days",
  "outputRefs": [
    { "kind": "npc", "id": "npc_elda" },
    { "kind": "location", "id": "cheap_farm" }
  ],
  "audience": "gm_safe"
}
```

### Example C — recentChanges must not emit (verification)

Input to builder:

```ts
stepEvents: []
recentChanges: [{ category: 'conflict', ... }]  // NOT in input type — adapter must not pass
```

**Expected:** zero P1a entries (only Phase A `trace_step_{turn}` may exist from host).

---

## Implementation Phases

### P1a — Pure emit core (Grok/Codex)

| Deliverable | Detail |
|-------------|--------|
| `src/debugTraceEmitCore.ts` | `buildFoodCrisisAgencyTraceEntries(input)` + helpers + `shouldEmitDeepDebugTrace` |
| `scripts/test_debug_trace_emit_core.js` | Required tests below |
| `scripts/run_all_tests.js` | Register test |

**No host wiring.**

### P1b — Host adapter (Grok/Codex)

| Deliverable | Detail |
|-------------|--------|
| `src/livingWorldBridge.ts` | After `runLivingWorldTick`, if gated, build + `appendDebugTraceHostEntries` |
| Pass `runId` | Thread from `debugTraceHostCore` — add `getActiveDebugTraceRunId()` or begin run in bridge from `state.worldTurn` at tick start |
| `src/debugTraceHostCore.ts` | Export active `runId` for current bulk sim run |

**No `npcAgencyCore` edits.**

### P2 — Deferred

| Item | Subsystem |
|------|-----------|
| Commerce price bump trace | `worldSimCommerceCore` |
| Faction conflict trace | `npcRelationshipCore` |
| Resource need vs food crisis divergence | `npcBridgeCore` |
| Slim Phase A notable-event conditions | `debugTraceHostCore` cleanup |
| Golden fixtures in simulation batch | `run_simulation_tests.js` |

---

## Required Tests

`scripts/test_debug_trace_emit_core.js`:

1. **Faction warning** (`test_npc_agency_step_events` parity) → scan `not_matched`, gate `gate_closed`, 0 NPC rows, 0 effects.
2. **Resource + food keyword** → scan `matched`, gate `gate_open`, NPC `move_scheduled`, effect with `gm_safe` audience.
3. **Resource without food keyword** (mana low) → scan `not_matched`, no moves trace.
4. **NPC in transit** → gate open but NPC decision `skipped_in_transit`, no effect row.
5. **NPC without factionId** → `skipped_no_faction`.
6. **Duplicate event id in stepEvents** → single scan row only.
7. **Empty stepEvents** → gate closed, no scan rows (or zero scans).
8. **recentChanges not in input type** — builder has no parameter; static test on `debugTraceEmitCore.ts` source forbids `recentChanges` identifier.
9. **Per-tick entry count ≤ 24** with max NPCs + 8 events.
10. **Deterministic order** — two identical inputs produce byte-identical entry arrays.
11. **Malformed partial input** → `[]`, no throw.
12. **No forbidden imports** — `vscode`, `fs`, `statePatch` absent from emit core.

After P1b:

13. **Integration smoke** — gated off → `appendDebugTraceHostEntries` not called (mock listener count 0).

---

## Implementation Prompt (Grok/Codex)

```markdown
LoreRelay Debug Trace Deep Emit P1a + P1b.

推奨モデル: Grok / Codex
推奨推論: Medium–High

Read first:
1. docs/DEBUG_TRACE_DEEP_EMIT_GATE_DESIGN.md (this file — Approved P1 contract)
2. src/debugTraceCore.ts
3. src/debugTraceHostCore.ts
4. src/npcAgencyCore.ts (reactNpcsToWorld — do not modify signatures)
5. src/livingWorldTypes.ts (isFoodCrisisEvent)
6. src/livingWorldBridge.ts (tickLivingWorldAfterSim)
7. scripts/test_npc_agency_step_events.js
8. webview/modules/80a-debug-trace.js (consumer — do not modify)

Task:
Implement Approved Deep Emit P1 contract § "Approved Deep Emit P1 Contract".

P1a:
- src/debugTraceEmitCore.ts — buildFoodCrisisAgencyTraceEntries + shouldEmitDeepDebugTrace
- scripts/test_debug_trace_emit_core.js — all Required Tests 1–12
- scripts/run_all_tests.js registration

P1b:
- Thread runId from debugTraceHostCore (getActiveDebugTraceRunId or equivalent)
- livingWorldBridge.ts: after runLivingWorldTick, gated append
- Do not modify npcAgencyCore.ts

Forbidden:
- npcAgencyCore / npcRelationshipCore signature changes
- recentChanges in builder inputs
- Webview / GM prompt / replay / remote / disk
- player_safe entries in P1

Verification:
- npm run compile
- node scripts/test_debug_trace_emit_core.js
- npm test
```

---

## Acceptance Criteria

P1 (P1a + P1b) is done when:

1. Debug-gated bulk sim produces linked `trace_fc_*` rows under `trace_step_{turn}`.
2. Faction warning tick shows `not_matched` + `gate_closed` in Inspector (internal audience).
3. Food crisis tick shows per-NPC decision + `gm_safe` effect row.
4. `npm test` green; no game behavior change when debug gate off.
5. Codex integration review checklist (§Review Handoff) can run on PR.

## Review Handoff (Codex — post-P1)

- [ ] No trace in `PromptContextBreakdown` / GM prompt strings
- [ ] `player_safe` toggle hides all P1 rows (all are `internal` or `gm_safe`)
- [ ] Per-tick ≤24 + ring buffer 256 unchanged
- [ ] Replay export / Remote sanitize unchanged
- [ ] Builders source: `stepEvents` only — grep audit
- [ ] `isFoodCrisisEvent` conditions match `livingWorldTypes.ts`