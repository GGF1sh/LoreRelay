# Debug Trace P1 Design

Status: Design / implementation gate  
Date: 2026-07-04  
Owner: Codex / ChatGPT  
Recommended implementation model: Grok or Codex, reasoning Medium

## 1. Summary

`docs/DEBUG_SIMULATION_TEST_ARCHITECTURE.md` already defines the full debug direction. P0 is complete: LoreRelay now has a dedicated simulation regression batch.

P1 should add only the structured trace core.

This is not a Webview debug panel. It is not a new ledger. It is not a logging firehose. It is a small pure module that can answer:

```text
What rule looked at what evidence, made what decision, and produced what effect?
```

The first implementation should be bounded, deterministic, and in-memory only.

## 2. Why P1 Exists

Recent bugs were cross-subsystem causal bugs:

- faction warning was mistaken for food crisis;
- rolling `recentChanges` caused repeated application;
- one event affected unrelated faction pairs.

Unit tests can catch those after the fact. Debug Trace should make the cause visible:

```text
event -> rule condition -> decision -> effect
```

P1 creates the shared trace vocabulary without wiring it into every subsystem yet.

## 3. Scope

P1 includes:

- `src/debugTraceCore.ts`
- `scripts/test_debug_trace_core.js`
- pure trace entry validation
- bounded ring-buffer append
- parent/child linkage checks
- deterministic ordering
- internal vs safe projection

P1 excludes:

- Webview UI
- VS Code command
- Output Channel renderer
- disk persistence
- automatic simulation integration
- GM prompt/context integration
- Remote Play
- replay export
- state mutation

## 4. Core Types

Recommended type shape:

```ts
export type DebugTraceAudience = 'internal' | 'gm_safe' | 'player_safe';

export type DebugTracePhase =
  | 'input'
  | 'query'
  | 'decision'
  | 'effect'
  | 'event'
  | 'persist'
  | 'prompt'
  | 'warning';

export interface DebugTraceRef {
  kind:
    | 'event'
    | 'npc'
    | 'faction'
    | 'location'
    | 'ledger'
    | 'rule'
    | 'vehicle'
    | 'settlement'
    | 'world'
    | 'other';
  id: string;
}

export interface DebugTraceCondition {
  label: string;
  result: boolean;
  actual?: string | number | boolean;
  expected?: string | number | boolean;
}

export interface DebugTraceEntry {
  version: 1;
  runId: string;
  traceId: string;
  parentTraceId?: string;
  worldTurn?: number;
  gmTurn?: number;
  subsystem: string;
  phase: DebugTracePhase;
  ruleId?: string;
  decision?: string;
  message: string;
  inputRefs?: DebugTraceRef[];
  outputRefs?: DebugTraceRef[];
  conditions?: DebugTraceCondition[];
  audience: DebugTraceAudience;
}

export interface DebugTraceBuffer {
  version: 1;
  maxEntries: number;
  entries: DebugTraceEntry[];
}
```

## 5. Validation Rules

Validation must be strict enough to prevent unbounded debug junk.

Rules:

- `runId`, `traceId`, `subsystem`, `phase`, `message`, `audience` are required.
- ids are bounded strings, recommended max 96 chars.
- `message` max 500 chars.
- `conditions` max 24.
- `inputRefs` / `outputRefs` max 32 each.
- `entries` ring buffer max should clamp to a safe range, e.g. 1–1000.
- unknown phase/audience/ref kind is rejected or normalized to safe fallback only if tests lock it.
- no raw ledger JSON blob fields.
- no arbitrary `metadata: unknown` in P1. That becomes a dumping ground.

## 6. Ring Buffer Semantics

Recommended functions:

```ts
export function createDebugTraceBuffer(maxEntries?: number): DebugTraceBuffer;

export function appendDebugTraceEntry(
  buffer: DebugTraceBuffer,
  entry: unknown
): DebugTraceBuffer;

export function appendDebugTraceEntries(
  buffer: DebugTraceBuffer,
  entries: unknown[]
): DebugTraceBuffer;
```

Semantics:

- pure immutable return;
- preserves insertion order;
- trims oldest entries when over capacity;
- invalid entries are dropped with a bounded warning report, or use a structured result:

```ts
export interface DebugTraceAppendResult {
  buffer: DebugTraceBuffer;
  accepted: number;
  rejected: number;
  warnings: DebugTraceWarning[];
}
```

Structured result is preferred.

## 7. Parent / Child Linkage

P1 should not require a full graph engine.

Add a pure check:

```ts
export function validateDebugTraceLinks(buffer: DebugTraceBuffer): DebugTraceWarning[];
```

It should report:

- `parentTraceId` missing from buffer;
- `traceId` duplicate;
- self-parent;
- simple direct cycle if easily detectable.

No expensive graph traversal beyond bounded entries.

## 8. Internal vs Safe Projection

P1 must copy Context Accounting's audience boundary.

Recommended function:

```ts
export function projectDebugTraceBuffer(
  buffer: DebugTraceBuffer,
  audience: DebugTraceAudience
): DebugTraceBuffer;
```

Projection rules:

- `internal` sees all valid entries.
- `gm_safe` sees `gm_safe` + `player_safe`.
- `player_safe` sees only `player_safe`.
- P1 should not attempt semantic redaction of internal text. It simply filters entries by declared audience.

This keeps P1 small and avoids false safety.

## 9. Example Entry

```json
{
  "version": 1,
  "runId": "sim_142",
  "traceId": "trace_food_crisis_001",
  "worldTurn": 142,
  "subsystem": "npcAgency",
  "phase": "decision",
  "ruleId": "food_crisis_buy_wheat",
  "decision": "not_matched",
  "message": "Faction warning is not a food crisis.",
  "inputRefs": [
    { "kind": "event", "id": "wce_142_faction_merchants_smiths" }
  ],
  "conditions": [
    { "label": "category === resource", "result": false, "actual": "faction", "expected": "resource" },
    { "label": "message includes food keyword", "result": false }
  ],
  "audience": "internal"
}
```

## 10. Relationship To Existing Systems

### Simulation Test Suite

P1 does not need to wire into `run_simulation_tests.js`. Future P2/P3 can capture traces around failing scenarios.

### State Orchestrator

SO2 explains planned ledger writes. Debug Trace may later emit `persist` phase entries, but P1 does not touch SO code.

### Context Engine

Context Inspector explains prompt inclusion. Debug Trace explains world/simulation decisions. Keep them separate.

### World Intent

World Intent already has query/execute/accounting vocabulary. P1 may reuse ref styles conceptually, but must not depend on World Intent.

## 11. Required Tests

1. Valid entry is accepted.
2. Missing required fields are rejected.
3. Long ids/messages are bounded.
4. Too many refs/conditions are bounded or rejected.
5. Ring buffer evicts oldest entries.
6. Duplicate `traceId` warning.
7. Missing parent warning.
8. Self-parent warning.
9. Projection: `internal` sees all.
10. Projection: `gm_safe` hides `internal`.
11. Projection: `player_safe` hides `internal` and `gm_safe`.
12. Deterministic append order.
13. No mutation of input buffer.

## 12. Deferred To P2+

- Host singleton trace buffer.
- `LoreRelay: Inspect Last Simulation Tick`.
- Output Channel formatting.
- Integration with `runSimulationStep`.
- Integration with `worldSimBulkCore.afterStep`.
- Golden trace files.
- Webview Debug Panel.
- Remote-safe trace summaries.

## 13. Implementation Prompt

```markdown
LoreRelay Debug Trace P1 implementation.

推奨モデル: Grok / Codex
推奨推論: Medium

Read first:
1. AI_SHARED_LOG.md Current Snapshot
2. CHANGELOG.md latest release
3. docs/DEBUG_SIMULATION_TEST_ARCHITECTURE.md
4. docs/DEBUG_TRACE_P1_DESIGN.md
5. scripts/run_simulation_tests.js
6. src/worldSimBulkCore.ts
7. src/debugScenarioCore.ts

Task:
Implement P1 structured trace core only.

Scope:
- Add src/debugTraceCore.ts.
- Add scripts/test_debug_trace_core.js.
- Register the test in the unified test runner if appropriate.
- No runtime wiring.

Forbidden:
- No Webview.
- No VS Code command.
- No disk writes.
- No statePatch / TurnResult changes.
- No Remote/Replay/GM prompt integration.
- No automatic simulation capture yet.

Verification:
- npm run compile
- node scripts/test_debug_trace_core.js
- npm test
- node scripts/validate_utf8_docs.js
```

## 14. Acceptance Criteria

P1 is done when LoreRelay has a pure, tested trace vocabulary and ring buffer that can later be wired into simulation decisions without changing game behavior.
