# LoreRelay Game QA Runner / Autoplay Benchmark Design

> Status: Design only  
> Date: 2026-07-05 JST  
> Scope: deterministic game QA runner first; AI-GM autoplay is deferred  
> Related: Debug Trace, Debug Scenario, Simulation regression batch, World Intent sanity, State Orchestrator SO2

## 0. Summary

LoreRelay has enough subsystems that manual "open the Webview and click around" checks no longer scale.

The Game QA Runner is a scripted, deterministic harness that creates temporary workspaces, runs many game-like operations, and reports whether canonical state stayed valid. It is not a replacement for `npm test`; it is a heavier operator tool for:

- state corruption detection;
- cross-ledger consistency checks;
- split-brain / partial-write detection;
- long-run file growth and performance checks;
- regression reproduction from JSON scenarios.

The first implementation must not call an LLM. It should use existing deterministic systems: sample scenarios, Debug Scenario commands, world simulation ticks, existing pure validators, World Intent sanity, and State Orchestrator planning.

## 1. Responsibilities

### QA runner owns

1. Load a scenario definition from `scripts/game_qa_scenarios/*.json`.
2. Create an isolated temporary workspace from a bundled sample or fixture.
3. Execute deterministic steps in sequence.
4. Run assertions after selected steps, not after every micro-step by default.
5. Capture metrics:
   - duration per step;
   - file sizes;
   - world turn / entry count deltas;
   - warnings and diagnostic counts;
   - failed assertions;
   - optional debug trace summary.
6. Emit a machine-readable report and a short console summary.

### QA runner does not own

- VS Code Webview automation.
- LLM / Grok / vscode-lm calls in QA1.
- New game rules or simulation rules.
- Canonical ledger writes outside the temp workspace.
- Replacing `npm test` or `run_simulation_tests.js`.
- UI screenshot testing.

## 2. Scenario JSON Format

Recommended directory:

```text
scripts/game_qa_scenarios/
  qa_smoke_beginner_adventure.json
  qa_world_sim_living_world.json
  qa_vehicle_wasteland.json
  qa_settlement_growth.json
  qa_mobile_base_trade.json
```

Top-level schema:

```json
{
  "id": "qa_vehicle_wasteland",
  "version": 1,
  "description": "Vehicle ledger smoke test in a temporary wasteland workspace.",
  "mode": "quick",
  "workspace": {
    "source": "sample",
    "sampleId": "scrapbound-settlement"
  },
  "limits": {
    "timeoutMs": 60000,
    "maxSteps": 50,
    "maxFileBytes": 1000000,
    "maxReportEvents": 200
  },
  "steps": [
    {
      "id": "sanity_before",
      "type": "assert",
      "checks": ["game_state_valid", "world_state_valid", "workspace_sanity_ok"]
    },
    {
      "id": "advance_world",
      "type": "world_sim",
      "steps": 5,
      "assertAfter": ["world_state_valid", "no_unhandled_exception"]
    },
    {
      "id": "transaction_plan_preview",
      "type": "state_orchestrator_plan",
      "turnResultFixture": "fixtures/qa/noop_turn_result.json",
      "assertAfter": ["transaction_plan_valid"]
    }
  ]
}
```

### `workspace`

```ts
type QaWorkspaceSource =
  | { source: 'empty' }
  | { source: 'sample'; sampleId: string }
  | { source: 'fixture'; fixturePath: string };
```

Rules:

- `source:'sample'` copies from bundled sample scenarios.
- `source:'fixture'` copies from a repo-owned fixture directory only.
- Never use the user's active workspace as a mutation target.
- Temp workspace paths must be created under OS temp or `./.tmp/game_qa/`, then deleted unless `--keep-temp` is passed.

### `steps`

Allowed QA1 step types:

```ts
type QaStep =
  | { id: string; type: 'assert'; checks: QaCheckId[] }
  | { id: string; type: 'debug_command'; command: string; assertAfter?: QaCheckId[] }
  | { id: string; type: 'world_sim'; steps: number; assertAfter?: QaCheckId[] }
  | { id: string; type: 'workspace_sanity'; assertAfter?: QaCheckId[] }
  | { id: string; type: 'state_orchestrator_plan'; turnResultFixture: string; assertAfter?: QaCheckId[] }
  | { id: string; type: 'snapshot'; label?: string };
```

Deferred step types:

- `player_input`: requires GM bridge or deterministic fake GM.
- `turn_result_apply`: useful, but should wait for an apply-gate review because it can touch many ledgers.
- `ai_autoplay`: QA3 only.
- `webview_click`: UI automation belongs to a later Playwright-style track, not QA1.

## 3. Assert / Check Catalog

Checks should be deterministic and cheap enough to run at key points.

### Core validity

| Check | Meaning | Source |
|---|---|---|
| `game_state_valid` | `game_state.json` parses and validates | existing state validator |
| `world_state_valid` | `world_state.json` parses with bounded warnings | `parseWorldStateWithWarnings` |
| `game_rules_valid` | `game_rules.json` normalizes without unsupported runtime assumptions | `normalizeGameRules` |
| `known_ledgers_parse` | known optional ledgers parse or are absent | existing per-ledger parsers |

### Cross-ledger / sanity

| Check | Meaning |
|---|---|
| `workspace_sanity_ok` | run World Intent WI5b style workspace sanity; fail on critical |
| `transaction_plan_valid` | State Orchestrator SO2 plan can be built for the fixture |
| `no_split_brain` | no known partial-write marker / failedTargets in recent report |
| `no_orphan_vehicle_refs` | mobile_base vehicle refs resolve or are reported as placeholder-safe |
| `no_orphan_settlement_layers` | effective settlement layers contain zone/marker layers |

### Growth / benchmark

| Check | Meaning |
|---|---|
| `file_sizes_below_limit` | configured files stay below `limits.maxFileBytes` |
| `history_growth_below_limit` | `game_history.json` / `state_journal.ndjson` growth remains bounded for the run |
| `trace_buffer_below_limit` | Debug Trace does not exceed configured projection count |
| `duration_below_limit` | step duration and total duration stay under limits |

### Error handling

| Check | Meaning |
|---|---|
| `no_unhandled_exception` | no uncaught exception in step execution |
| `no_json_parse_error` | no canonical JSON file became invalid |
| `no_absolute_webview_media_leak` | sanitized outputs do not expose absolute local media paths |

## 4. Temp Workspace Operation

QA runner must default to isolated temp workspaces:

```text
.tmp/game_qa/
  qa_vehicle_wasteland/
    run_20260705_010203_abc123/
      workspace/
      report.json
      report.md
```

Rules:

1. Copy source data into `workspace/`.
2. Set all host functions to resolve against this temp workspace, not the user's open workspace.
3. Delete temp by default after successful runs.
4. Keep temp on failure by default, unless `--no-keep-failed` is passed.
5. Support `--keep-temp` for debugging.
6. Never write under `C:\AITest`, `G:\AI\LoreRelayWorlds`, or the active VS Code workspace unless the user explicitly passes a target path in a future manual command.

QA1 can avoid VS Code API by calling pure/fs host modules directly where available. If a module currently depends on VS Code workspace APIs, QA1 should wrap only the minimum needed dependency or skip that step until a host-core exists.

## 5. Side Effect Policy

### Allowed in QA1

- Read repository fixtures.
- Copy files into temp workspaces.
- Write reports under `.tmp/game_qa` or a user-specified report directory.
- Mutate only the temp workspace copy.
- Run existing deterministic simulation / sanity / planning code.

### Forbidden in QA1

- Mutating the active user workspace.
- Calling Grok, OpenRouter, vscode-lm, Ollama, KoboldCPP, or clipboard GM.
- Running ComfyUI or image generation.
- Opening VS Code Webviews.
- Committing, pushing, or changing git branches.
- Applying migrations/write-back to real workspace files.
- Treating World Intent output as canonical writes.

### QA3+ opt-in only

These may be introduced later behind explicit flags:

- AI-GM autoplay.
- Webview automation.
- long soak runs above 1000 steps.
- real extension-host command execution.

## 6. npm Scripts

Recommended scripts:

```json
{
  "qa:game": "node scripts/run_game_qa.js",
  "qa:game:quick": "node scripts/run_game_qa.js --mode quick",
  "qa:game:full": "node scripts/run_game_qa.js --mode full",
  "qa:game:benchmark": "node scripts/run_game_qa.js --mode benchmark --keep-temp",
  "qa:game:list": "node scripts/run_game_qa.js --list"
}
```

Do not add `qa:game` to `npm test` in QA1.

Rationale: these runs are heavier and closer to operator QA. Daily `npm test` should remain fast and deterministic. A future CI job can run `qa:game:quick`; full/benchmark should remain manual or scheduled.

## 7. Execution Modes

| Mode | Purpose | Default scenarios | Expected runtime | Run frequency |
|---|---|---:|---:|---|
| `quick` | smoke QA for core game ledgers | 2-4 | < 30s | before larger merges |
| `full` | broad deterministic gameplay coverage | 8-15 | 1-5min | release prep |
| `benchmark` | long-run growth/perf | 1-3 | 5min+ | manual / overnight |
| `autoplay` | LLM-driven behavior exploration | 1+ | unpredictable | QA3+ only |

## 8. Phase Plan QA1-QA5

### QA1: Deterministic Runner

Goal: scriptable temp workspace runner without LLM or Webview.

Deliverables:

- `scripts/run_game_qa.js`
- `scripts/game_qa_scenarios/*.json`
- `src/gameQaRunnerCore.ts` for pure parsing/report helpers
- `scripts/test_game_qa_runner_core.js`
- `qa:game:*` npm scripts
- docs update

Acceptance:

- `--list` prints scenario IDs.
- `--mode quick` runs deterministic sample scenarios.
- reports are produced.
- temp workspace is cleaned on success and kept on failure.
- no active workspace mutation.

### QA2: Scripted Ledger Exercise

Goal: exercise more real ledgers without LLM.

Add deterministic steps for:

- vehicle ops fixtures;
- settlement tick / expansion fixtures;
- mobile base state checks;
- campaign resources;
- discovery appraisal;
- State Orchestrator SO2 fixture planning.

Acceptance:

- fixture turn_result previews can be planned, not blindly applied.
- critical WI5 sanity issue fails the QA scenario.
- report includes ledger summary.

### QA3: AI Autoplay Pilot

Goal: opt-in AI action generation in a sandbox workspace.

Rules:

- disabled by default;
- provider must be explicit;
- max turns hard-capped;
- no user workspace writes;
- output labeled non-deterministic.

Acceptance:

- AI output is captured as exploratory QA, not regression truth.
- run can be replayed only if prompts and responses are saved.

### QA4: Report UI / Inspector

Goal: make QA reports readable in the Webview Inspector.

Likely Claude task:

- report viewer section;
- failed step timeline;
- check summary table;
- links to debug trace IDs where available;
- file growth charts.

No mutation buttons.

### QA5: Overnight Benchmark / Soak

Goal: long-run stability and growth checks.

Features:

- 100-1000 deterministic world ticks;
- repeated settlement/commerce/vehicle checks;
- file growth and duration trend report;
- optional memory/context budget estimates.

Acceptance:

- benchmark report identifies top growing files and slowest steps.
- failures preserve temp workspace and report.

## 9. Report Format

`report.json`:

```json
{
  "schemaVersion": 1,
  "runId": "qa_20260705_010203_abc123",
  "scenarioId": "qa_vehicle_wasteland",
  "mode": "quick",
  "startedAt": "2026-07-05T01:02:03.000Z",
  "finishedAt": "2026-07-05T01:02:05.000Z",
  "ok": true,
  "summary": {
    "steps": 3,
    "passedChecks": 8,
    "failedChecks": 0,
    "warnings": 1
  },
  "steps": [
    {
      "id": "advance_world",
      "type": "world_sim",
      "ok": true,
      "durationMs": 120,
      "checks": [
        { "id": "world_state_valid", "ok": true }
      ]
    }
  ],
  "metrics": {
    "fileBytes": {
      "game_state.json": 12345,
      "world_state.json": 6789
    }
  }
}
```

`report.md` should be a readable summary for humans and AI handoff.

## 10. Failure Semantics

The runner should classify failures:

| Class | Meaning | Example |
|---|---|---|
| `scenario_invalid` | QA JSON itself is invalid | unknown step type |
| `setup_failed` | temp workspace could not be prepared | sample missing |
| `step_failed` | step executor failed | world sim threw |
| `assert_failed` | state survived but check failed | invalid JSON |
| `timeout` | scenario exceeded configured timeout | benchmark runaway |
| `internal_error` | runner bug | unexpected exception outside step wrapper |

Any failure should:

- stop the scenario by default;
- keep the temp workspace;
- write partial report;
- exit non-zero.

Optional future flag: `--continue-on-failure`.

## 11. Security / Safety Gate

Critical rules for Grok/Codex implementation:

1. Resolve fixture paths under repo root only.
2. Resolve temp workspace under `.tmp/game_qa` or OS temp only.
3. Before deleting temp paths, verify the resolved absolute path contains the expected run directory.
4. Never execute shell commands from scenario JSON.
5. Never import arbitrary JS from scenario JSON.
6. Treat scenario JSON as data, not code.
7. Keep all LLM/provider steps unsupported in QA1.
8. Keep QA runner out of `npm test` until quick mode proves stable.

## 12. Grok Implementation Prompt

```markdown
LoreRelay Game QA Runner QA1 を実装してください。

推奨モデル: Grok / Codex
推奨推論: Medium

必読:
1. AI_SHARED_LOG.md Current Snapshot
2. CHANGELOG.md [Unreleased]
3. docs/GAME_QA_RUNNER_DESIGN.md
4. scripts/run_simulation_tests.js
5. scripts/simulation_test_manifest.js
6. docs/DEBUG_SIMULATION_TEST_ARCHITECTURE.md
7. src/worldIntentSanityHostCore.ts / src/worldIntentSanityLoader.ts
8. src/stateOrchestratorPlanHostCore.ts

目的:
ゲーム本編の挙動を自動で大量に動かすための deterministic QA runner を追加する。
最初のQA1ではAI GM、Webview、ComfyUI、実ユーザーworkspaceは使わない。

実装範囲:
- src/gameQaRunnerCore.ts
  - scenario JSON parser
  - mode filtering
  - check result/report shape helpers
  - safe temp path planning helpers
- scripts/run_game_qa.js
  - --list
  - --mode quick/full/benchmark
  - --scenario <id>
  - --keep-temp
  - temp workspace copy
  - step execution skeleton
  - report.json + report.md
- scripts/game_qa_scenarios/qa_smoke_beginner_adventure.json
- scripts/game_qa_scenarios/qa_world_sim_smoke.json
- scripts/test_game_qa_runner_core.js
- package.json scripts:
  - qa:game
  - qa:game:quick
  - qa:game:full
  - qa:game:benchmark
  - qa:game:list

QA1 step types:
- assert
- world_sim
- workspace_sanity
- state_orchestrator_plan
- snapshot

QA1 checks:
- game_state_valid
- world_state_valid
- game_rules_valid
- workspace_sanity_ok
- transaction_plan_valid
- file_sizes_below_limit
- no_unhandled_exception
- no_json_parse_error

Non-goals:
- Do not call Grok/OpenRouter/vscode-lm/Ollama/KoboldCPP.
- Do not automate the Webview.
- Do not mutate the active workspace.
- Do not add qa:game to npm test.
- Do not run image generation.
- Do not add new canonical game mechanics.

Safety:
- Scenario JSON is data only.
- No shell commands from JSON.
- Temp deletion must verify resolved path is under the QA temp root.
- Keep failed temp workspaces for inspection.

Verification:
- npm run compile
- node scripts/test_game_qa_runner_core.js
- npm run qa:game:list
- npm run qa:game:quick
- npm test

Commit after green:
feat(qa): add deterministic game QA runner
```

