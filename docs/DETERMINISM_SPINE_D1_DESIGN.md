# LoreRelay Determinism Spine D1 Design

> Status: Design only  
> Date: 2026-07-05 JST  
> Scope: deterministic state hashing + drift detection contract for Game QA Runner  
> Related: Game QA Runner QA1, Debug Trace, Simulation regression batch, State Orchestrator SO2, future Replay

## 0. Summary

LoreRelay now has enough deterministic automation (`run_game_qa.js`, simulation regression batch, World Intent sanity, SO2 previews) to start measuring whether the same inputs produce the same canonical state.

Determinism Spine D1 is the smallest useful version:

- normalize a bounded set of canonical workspace files;
- hash them with a stable algorithm;
- record hashes at QA snapshot / world-sim boundaries;
- compare two deterministic runs of the same scenario;
- report the first step where drift appears.

D1 does **not** make the whole game deterministic. It detects drift in deterministic runners and creates a contract later systems can extend.

## 1. Goals

1. Give Game QA Runner a cheap way to detect state drift.
2. Make drift reports point to a scenario step, not just "final state changed".
3. Keep hashing pure and testable (`determinismSpineCore.ts`).
4. Avoid touching live player workspaces.
5. Avoid LLM / Webview / ComfyUI / clock-dependent behavior.
6. Prepare future Replay and Debug Trace integration without coupling to them yet.

## 2. Non-Goals

- No live gameplay enforcement.
- No automatic repair.
- No cryptographic security guarantee.
- No full input-only replay system.
- No seed stream registry in D1.
- No canonical hash for image/audio/binary outputs.
- No Git integration.
- No change to `statePatch` write ordering.

## 3. Current Anchors

Existing code D1 should build on:

| Existing component | D1 use |
|---|---|
| `src/gameQaRunnerCore.ts` | report types, scenario parsing, snapshot step vocabulary |
| `scripts/run_game_qa.js` | temp workspace execution, snapshot collection, JSON/MD reports |
| `scripts/game_qa_scenarios/*.json` | scenario-level opt-in for drift checks |
| `src/debugTraceCore.ts` | future trace/run correlation; D1 does not write debug trace |
| `scripts/run_simulation_tests.js` | separate deterministic sim batch; D1 can reuse ideas, not merge runners |

The latest QA Runner already writes reports under `.tmp/game_qa` and mutates only temp workspace copies. D1 must preserve that boundary.

## 4. Canonical Hash Contract

### 4.1 Canonical file set

D1 hashes only known JSON ledgers that are already meaningful to QA:

```ts
const DETERMINISM_CANONICAL_FILES = [
  "game_state.json",
  "world_state.json",
  "game_rules.json",
  "game_history.json",
  "vehicle_state.json",
  "mobile_base_state.json",
  "settlement_state.json",
  "settlement_layout.json",
  "discoveries.json",
  "campaign_kit.json",
  "campaign_resources.json",
  "npc_registry.json",
  "world_forge.json"
] as const;
```

Rules:

- Missing optional files are represented as `{ exists:false }`.
- JSON parse errors are represented as `{ exists:true, parseError:"json_parse_error" }` and still contribute to the hash.
- Unknown files are ignored in D1.
- Binary/media files are ignored in D1.
- `state_journal.ndjson` is ignored in D1 because append-only audit logs can contain narration and size noise.

### 4.2 Stable JSON normalization

D1 uses a deterministic structural serializer:

- object keys sorted lexicographically;
- arrays preserve order;
- numbers must be finite;
- strings preserved as-is;
- `undefined` omitted;
- non-JSON values become explicit sentinel strings only inside test fixtures, never from parsed JSON.

Important: D1 should not use `JSON.stringify(value, null, 2)` directly for hashing because object key order can vary by construction path.

### 4.3 Excluded volatile fields

D1 should support a small allowlisted redaction pass. Initial exclusions:

| Path pattern | Reason |
|---|---|
| `$.meta.generatedAt` | clock-derived |
| `$.lastSavedAt` | clock-derived if present |
| `$.debug.*` | debug-only |
| `$.report.*` | QA output accidentally copied into fixture |

Do not add broad regexes. Every volatile exclusion must be named and tested.

### 4.4 Hash algorithm

Use SHA-256 through Node `crypto` in the host/script wrapper. The pure core may accept a `hashText(text): string` dependency to avoid importing Node APIs if desired.

Report format should identify the algorithm:

```ts
interface DeterminismHash {
  algorithm: "sha256";
  value: string;
}
```

## 5. D1 Data Contracts

### 5.1 Snapshot

```ts
interface DeterminismFileHash {
  path: string;
  exists: boolean;
  hash?: DeterminismHash;
  bytes?: number;
  parseError?: string;
}

interface DeterminismSnapshot {
  version: 1;
  label: string;
  stepId?: string;
  stepIndex?: number;
  worldTurn?: number;
  aggregateHash: DeterminismHash;
  files: DeterminismFileHash[];
  warnings: string[];
}
```

The aggregate hash is a stable hash of the ordered file hash records, not a hash of raw concatenated file contents.

### 5.2 Drift comparison

```ts
interface DeterminismDrift {
  ok: false;
  firstDifferentSnapshot: {
    index: number;
    label: string;
    leftHash: string;
    rightHash: string;
  };
  fileDiffs: Array<{
    path: string;
    leftHash?: string;
    rightHash?: string;
    leftExists: boolean;
    rightExists: boolean;
  }>;
}

type DeterminismComparison =
  | { ok: true; snapshots: number }
  | DeterminismDrift;
```

D1 only compares snapshot streams from two runs of the same scenario. It does not attempt semantic diffs.

### 5.3 QA report extension

`QaRunReport.metrics` may gain:

```ts
metrics: {
  fileBytes: Record<string, number>;
  determinism?: {
    enabled: boolean;
    snapshots: DeterminismSnapshot[];
    baselineRunId?: string;
    comparison?: DeterminismComparison;
  };
}
```

For report bloat control:

- quick mode keeps full snapshot entries for at most 20 snapshots;
- benchmark mode may keep more, but must obey scenario `limits.maxReportEvents`;
- Markdown report shows aggregate hash per snapshot and only first file-level drift.

## 6. Scenario Contract

D1 can add optional determinism config to QA scenarios:

```json
{
  "determinism": {
    "enabled": true,
    "snapshotOn": ["start", "after_step", "finish"],
    "compareRuns": 2,
    "failOnDrift": true
  }
}
```

Recommended D1 defaults:

| Field | Default |
|---|---|
| `enabled` | `false` |
| `snapshotOn` | `["start", "finish"]` |
| `compareRuns` | `1` |
| `failOnDrift` | `true` when `compareRuns >= 2`, else `false` |

Do not enable by default for every QA scenario. Start with one dedicated scenario.

## 7. Runner Flow

### Single-run recording

1. Setup temp workspace.
2. If determinism enabled, capture `start`.
3. For each step:
   - execute step;
   - optionally capture `after_step:<step.id>`.
4. Capture `finish`.
5. Write determinism snapshots into report JSON/Markdown.

### Two-run comparison

When `compareRuns:2`:

1. Execute the same scenario twice in two separate temp workspaces.
2. Use the same scenario input and deterministic runner options.
3. Compare snapshot streams by index and label.
4. Fail the scenario if `failOnDrift` and aggregate hashes differ.
5. Keep both temp workspaces on drift, even without `--keep-temp`.

D1 should avoid comparing wall-clock duration, run ID, report paths, or temp directory names.

## 8. Failure Classes

Add or reuse failure classes carefully.

Recommended:

```ts
type QaFailureClass =
  | existing
  | "determinism_drift";
```

Do not overload `assert_failed`; drift is a distinct diagnosis.

## 9. Debug Trace Relationship

D1 does not emit Debug Trace entries by default.

Future D2 may add:

- trace row at snapshot capture (`subsystem:"determinism"`, phase:`event`);
- `aggregateHash` reference;
- first drift row on comparison failure.

Reason to defer: Debug Trace ring buffers are bounded and audience-projected. QA reports are the correct source of truth for D1 drift data.

## 10. Replay Relationship

D1 is not a replay engine, but it prepares replay work:

- canonical hash format;
- snapshot labels;
- drift pinpointing by step index;
- file-level hash comparison.

Future replay can reuse this for per-turn hash verification.

## 11. Security / Safety

- Hashing must never read outside the QA temp workspace.
- Scenario JSON cannot add arbitrary file paths to hash in D1.
- Reports must not include absolute local file paths except temp workspace paths already used by QA debugging. Prefer workspace-relative paths.
- Hashes are not privacy boundaries. Do not expose D1 reports through Webview/Remote by default.
- Do not hash user active workspace unless a future manual command explicitly asks for read-only diagnosis.

## 12. Test Requirements

Minimum tests for D1:

1. Stable serializer sorts object keys.
2. Same object with different key insertion order hashes the same.
3. Array order changes hash.
4. Missing optional file is represented deterministically.
5. JSON parse error contributes deterministic sentinel.
6. Aggregate hash changes when one canonical file changes.
7. Volatile path exclusion is narrow and tested.
8. Two identical snapshot streams compare OK.
9. Different snapshot streams report first differing snapshot and file diff.
10. QA scenario parser accepts valid determinism config and rejects unsupported values.

## 13. Implementation Phases

### D1a — Pure core

Files:

- `src/determinismSpineCore.ts`
- `scripts/test_determinism_spine_core.js`

Implement:

- stable JSON serializer;
- canonical file record model;
- aggregate snapshot hash builder with injected `hashText`;
- comparison helper;
- determinism config parser helpers.

No fs, no vscode, no runner mutation.

### D1b — QA runner integration

Files:

- `scripts/run_game_qa.js`
- `src/gameQaRunnerCore.ts`
- one scenario under `scripts/game_qa_scenarios/`

Implement:

- snapshot capture from temp workspace;
- report extension;
- optional `compareRuns:2`;
- `determinism_drift` failure class.

### D1c — Documentation and operator command

Files:

- `docs/GAME_QA_RUNNER_DESIGN.md` update;
- `docs/DETERMINISM_SPINE_D1_DESIGN.md` status update;
- package script optional: `qa:game:determinism`.

Recommended script:

```json
"qa:game:determinism": "node scripts/run_game_qa.js --scenario qa_determinism_world_sim"
```

## 14. Acceptance Criteria

D1 is complete when:

- `npm run compile` passes.
- `npm test` passes.
- `npm run qa:game:quick` still passes.
- A dedicated determinism QA scenario runs the same world sim twice and reports matching hashes.
- A test fixture can intentionally perturb one canonical file and produce `determinism_drift`.
- Reports remain bounded and do not include active workspace data.

## 15. Grok Implementation Prompt

```markdown
LoreRelay Determinism Spine D1 を実装してください。

推奨モデル: Grok / Codex
推奨推論: Medium

必読:
1. docs/DETERMINISM_SPINE_D1_DESIGN.md
2. src/gameQaRunnerCore.ts
3. scripts/run_game_qa.js
4. scripts/test_game_qa_runner_core.js
5. docs/GAME_QA_RUNNER_DESIGN.md

目的:
Game QA Runner に deterministic state hash / drift detection を追加します。
最初は QA temp workspace 専用で、LLM/Webview/ComfyUI/active workspace には触りません。

実装:
- src/determinismSpineCore.ts
- scripts/test_determinism_spine_core.js
- src/gameQaRunnerCore.ts の scenario/report 型拡張
- scripts/run_game_qa.js の snapshot capture + optional compareRuns:2
- scripts/game_qa_scenarios/qa_determinism_world_sim.json
- 必要なら package.json に qa:game:determinism

禁止:
- active user workspace の読み書き
- 任意ファイルパスを scenario JSON からhash対象にする
- Debug Trace / Replay への接続
- statePatch / ledger write order の変更
- broad volatile regex

必須テスト:
- stable serializer key order
- aggregate hash changes on canonical file change
- missing optional file deterministic
- parse error sentinel deterministic
- snapshot stream compare OK/drift
- determinism config parser

検証:
- npm run compile
- npm test
- npm run qa:game:determinism
```

## 16. Open Questions for D2+

1. Should named seed streams be declared in scenario JSON or game rules?
2. Should Debug Trace entries include aggregate hashes when debug console is enabled?
3. Should replay export include D1 snapshot hashes?
4. Which ledgers need semantic hash normalization beyond stable JSON?
5. Should `state_journal.ndjson` get its own append-only deterministic digest later?

