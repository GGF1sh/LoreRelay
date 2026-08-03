# NOAI-PLAYTEST-001 — 100-turn deterministic soak, implementation gate

Status: **IMPLEMENTED — PR #70 draft**
Base investigated: `fdca78ecfc1d7735f31833e5d462fc8ad3278a3d` (`1.84.30`)
Design lane only. No production code, no version bump, no Current Lane change in this document's commit.
Source idea: [`docs/ideas/NOAI-LONG-HORIZON-PLAYTEST-AND-AI-ANALYST.md`](../ideas/NOAI-LONG-HORIZON-PLAYTEST-AND-AI-ANALYST.md) (Phase B)

---

## Verdict up front

The gate as originally briefed — *"build a NOAI deterministic runner, minimal telemetry, deterministic
aggregate checks, machine-readable PASS/FAIL"* — **is already built and shipped on `main`.**

```text
scripts/run_noai_soak.js                              (847 lines, runner CLI)
src/noaiSoakRunnerCore.ts                             (1635 lines, pure core)
src/determinismSpineCore.ts                           (325 lines, canonical hashing)
scripts/noai_soak_scenarios/noai_determinism_100.json (100 turns, 1 seed, 1 policy, 2-run compare)
```

`noai_determinism_100` is literally *"same seed + same scenario + same policy, 100 turns, twice, fail on
any drift."* Building a second runner would be a duplicate truth system — exactly the failure mode this
idea note warns against.

So this gate is **not** "write a soak runner." It is the narrow delta that turns an existing opt-in
developer facility into an enforceable 100-turn gate, and closes the three evidence gaps the existing
runner genuinely does not cover.

**Decision: GO, on the corrected scope in [Minimal Slice](#minimal-slice).**

---

## Problem

LoreRelay's stated top priority is *「機能追加より100ターン壊れないこと」*. The repository can already
prove a large part of that claim, but nothing forces it to, and three specific failure classes are
measured-but-not-enforced or not measured at all:

1. **Stall / lock is observed but never fails a run.** The telemetry accumulator tracks
   `longestIdenticalActionStreak`, `longestZeroEventStreak`, and `longestZeroChangeStreak`
   (`src/noaiSoakRunnerCore.ts:856-876`), but the invariant registry has **no** case that reads them.
   A world that freezes for 100 turns while remaining structurally valid reports `PASS`.
2. **Save→reload digest parity is not checked.** The runner persists canonical JSON and hashes the
   files, but never re-parses the persisted workspace through the production parsers and re-derives the
   digest. A serializer that silently drops a field passes today.
3. **Determinism compares hashes, not the aggregate summary.** `applyDeterminismComparison`
   (`scripts/run_noai_soak.js:690-728`) compares the canonical snapshot stream and the action-stream
   hash. It does **not** compare the telemetry aggregate between the two runs, so nondeterminism that
   lives only in counters/streaks is invisible.

Plus one operational gap: the soak is opt-in (`npm run qa:noai:full`), is referenced by nothing in
`.github/workflows/`, and emits no machine-readable summary at a stable path — so no other process can
consume its verdict.

---

## Existing Execution Seams

Verified against real code at the base SHA.

### The runner entrypoint

`scripts/run_noai_soak.js` → `runScenario(scenario, mode, options)` (line 305).

- **Input:** a validated scenario document (`parseNoaiSoakScenarioDocument`), a run mode, and
  `{ keepTemp, noKeepFailed }`.
- **Output:** `{ report, plan, keepTemp, snapshots, actionStreamHash }`.
- **Mutation boundary:** the temp workspace only, via `persistState()` (line 401) writing
  `game_state.json`, `world_state.json`, and optionally `npc_registry.json`.
- **Persistence boundary:** `planNoaiSoakRunDirectories(...)` under `DEFAULT_NOAI_SOAK_TEMP_ROOT`;
  deletion is guarded by `isSafeQaTempDeletionTarget` (line 231) which refuses any path outside the
  temp root.

### It calls real production code, not a mock

`loadExecutionModules()` (line 81) installs a `require` shim that returns a stub `vscode` object, then
loads compiled production cores from `out/`:

| Production module | Role in a turn |
| --- | --- |
| `worldSimBulkCore.runBulkWorldSimulation` | advances the world clock and emits sim events |
| `commerceCore.applyTradeOp` | resolves one player trade op against real market state |
| `worldSimCommerceCore.tickMarketRecovery` | per-step market recovery + shock/ceiling params |
| `worldStateCore.parseWorldStateWithWarnings` | structural validation of `world_state.json` |
| `worldForgeCore.parseWorldForge` | world definition parse |
| `gameRulesCore.normalizeGameRules` | rules normalization |
| `npcRegistry.parseNpcRegistry` | optional NPC registry |
| `livingWorldBridge.resolveCommerceForge`, `commerceCore.initializeMarketState` | commerce setup |

This answers the "don't just call the same function 100 times" requirement with code evidence: each
turn runs the real world-simulation bulk stepper and the real trade resolver against persisted state.

### Determinism spine

`src/determinismSpineCore.ts` supplies `DETERMINISM_CANONICAL_FILES` (line 6 — `game_state.json`,
`world_state.json`, `game_rules.json`, `game_history.json`, `vehicle_state.json`,
`mobile_base_state.json`, `settlement_state.json`, `settlement_layout.json`, …),
`buildDeterminismSnapshot`, and `compareDeterminismSnapshotStreams`. Volatile keys are excluded by an
explicit named list, `DETERMINISM_VOLATILE_ROOT_KEYS = ['debug', 'report']` (line 27) — no broad
regexes, no sorting that could mask nondeterminism.

### AI / network / provider are structurally absent

`runScenario` never touches `gmBridgeRunner`, `agenticGmRunner`, `gmPromptBuilder`, the image pipeline,
or any network module. The only `vscode` surface is the two no-op message stubs in the shim. Provider
isolation is therefore a property of the module graph, not a runtime flag that could be forgotten.

### What has *no* seam (important negative result)

There is **no headless seam for a player *session* turn.** The accepted-turn pipeline lives in
`src/gmBridgeRunner.ts`, `src/stateManager.ts`, `src/checkpointHandlers.ts`, and `src/extension.ts` —
all host/VS Code-coupled and GM-provider-coupled. `debugScenarioRunnerCore.executeDebugScenarioTurn`
(line 167) is a slash-command executor bound to workspace-global loaders (`loadGameRules()` with no
arguments), not an injectable step function.

**Consequence:** a 100-turn *story session* soak cannot be designed today without inventing a seam. This
gate does not attempt it. See [Out of Scope](#out-of-scope).

---

## Canonical Turn Definition

> **One soak turn = one iteration of the `runScenario` loop at `scripts/run_noai_soak.js:442`:
> a player-policy action phase, followed by a world-simulation cadence phase when
> `t % scenario.worldSim.cadenceTurns === 0`.**

`turnIndex` is `t ∈ [1, scenario.horizon.turns]`. It is *not* a GM turn and not a bare function call.

For the gate scenario the soak turn is pinned 1:1 to the world clock:

```json
"worldSim": { "cadenceTurns": 1, "stepsPerCadence": 1 }
```

so `100 soak turns` ⇒ `worldState.worldTurn` advances by exactly 100, and the
`world_turn_monotonic` invariant is evaluated at every single turn boundary rather than at sparse
cadence points. The gate must keep this pinning; a scenario with `cadenceTurns > 1` is a different
(weaker) claim and must not be used as the gate scenario.

`turnsCompleted` is derived from `observeTurnState` (`src/noaiSoakRunnerCore.ts:1026`), which runs at the
end of every iteration — so a mid-loop `break` reports the true completed count, not the requested one.

---

## Isolation Model

Already implemented; this gate inherits it and adds no new isolation code.

- **Temp directory:** every run gets `planNoaiSoakRunDirectories(ROOT, scenarioId, runId, DEFAULT_NOAI_SOAK_TEMP_ROOT, …)`.
  `runId` is `formatNoaiSoakRunId(startedAt, crypto.randomBytes(3))`, so two concurrent runs of the same
  scenario cannot collide.
- **Fixture copy:** `setupWorkspace` (line 202) copies
  `scripts/noai_soak_scenarios/fixtures/merchant_three_market` into the temp workspace via
  `copyDirectoryRecursive`. `resolveRepoFixturePath` rejects paths outside the repo.
- **User save safety:** the runner reads fixtures from the repo and writes **only** under the temp root.
  It has no code path that resolves a user workspace, and `removeDirectorySafe` throws rather than
  deleting anything `isSafeQaTempDeletionTarget` does not approve.
- **Cleanup:** success deletes the run dir; any failure sets `keepTemp = true` so the failing workspace
  survives for inspection (`persistAndMaybeClean`, line 661).

**Gate requirement:** the new save→reload parity check must operate on the temp workspace only and must
not introduce a second write root.

---

## Runner Input

The existing scenario schema already carries every required field. Mapping from the brief:

| Required input | Existing field | Note |
| --- | --- | --- |
| `schemaVersion` | `version` | present, validated |
| `scenarioId` | `id` | present |
| `seed` | `seed` | string seed → `createSoakRng` |
| `turnLimit` | `horizon.turns` + `limits.maxTurns` | present |
| `policyId` | `policyId` | `observe_only \| merchant_balanced \| merchant_stress` (`src/noaiSoakRunnerCore.ts:53`) |
| `initialStateDigest` | `report.initialCanonicalHash` | computed at run start (line 425), not authored |
| feature flags | `worldSim.*`, `limits.*`, `economyProfile` | present |
| repository/version identity | **MISSING** | see below |

**One schema addition is required:** the emitted report does not record repository identity. The gate
must add `report.identity = { commit, version, node }` (git HEAD short SHA, `package.json` version,
`process.version`) so a stored PASS can be attributed to an exact tree. Without it a JSON summary is not
usable as durable evidence.

New optional limit fields (consumed by the new invariants):

```jsonc
"limits": {
  "maxIdenticalActionStreak": 25,   // default: undefined ⇒ invariant not selectable
  "maxZeroChangeStreak": 20
}
```

Defaults must stay `undefined` so existing scenarios keep their current baselines unchanged.

---

## Deterministic Policy

Use the existing `merchant_balanced` policy via `decideTradeIntents(policyId, ctx)`. It is:

- **seeded**, not random: `rng = createSoakRng(scenario.seed)` (line 397), one RNG per run, advanced only
  by policy decisions;
- **AI-free**: it consumes `{ forge, markets, commerce, worldTurn, turnIndex, rng, maxOpsPerTurn }` — no
  GM text, no generated option list, no natural-language input;
- **bounded**: `limits.maxOpsPerTurn = 2` in the gate scenario;
- **recorded**: every op, accepted or rejected, is folded into `actionHasher` with a fixed field order
  (line 435), so the action stream is comparable across runs.

Do **not** add a new policy for this gate. A new policy changes the baseline and invalidates the
existing `merchant_300` / `market_shock` regression evidence for no gain.

**Policy-exhaustion is a distinct outcome, not a failure.** When `decideTradeIntents` returns `[]` the
runner records an `observe` action (line 467). That is *legitimate stable state*, and the new stall
invariants must be tuned so a few consecutive `observe` turns do not fail — only a run-length streak
beyond `maxIdenticalActionStreak` does.

---

## Telemetry Schema

`NoaiSoakTelemetry` (`src/noaiSoakRunnerCore.ts`) already satisfies the brief and correctly stays
**test evidence, not a source of truth**: it stores counts, min/max/final, bounded samples, a bounded
recent window, and capped anomaly windows — never a full per-turn state snapshot.

Already present:

```text
turnsCompleted · actionCounts · acceptedActions · rejectedActions · rejectCounts
eventCategoryCounts · eventSeverityCounts · eventSourceCounts · duplicateEventIdCount
money/cargoUnits/marketStock/marketPriceIndex (min,max,final)
startWorldTurn · finalWorldTurn
longestIdenticalActionStreak · longestZeroEventStreak · longestZeroChangeStreak
samples[] (sampleEveryTurns/maxSamples) · recentWindow[] · anomalyWindows[] (maxAnomalyWindows)
```

Snapshot storage is capped at `MAX_DETERMINISM_SNAPSHOTS = 25` (`scripts/run_noai_soak.js:74`) with the
final snapshot always overwriting the last slot — so the run keeps `start`, a bounded middle, and
`finish`. Raw-log growth is structurally bounded.

Back-reference path for any later analysis: `runId → scenarioId + seed → turnIndex → recentWindow /
anomalyWindows entry → snapshot label (`turn_N`) → canonical file hash`.

**Gate additions (small):**

- `report.identity` (see above);
- `report.aggregateDigest` — a stable SHA-256 over a *whitelisted, ordered* projection of telemetry
  (see next section);
- `report.saveReloadParity = { ok, digestBefore, digestAfter, firstMismatchPath? }`.

Nothing else. Do not widen telemetry in this gate.

---

## Machine Invariants

Nine invariants exist and are already selected by `noai_determinism_100`:

| Invariant | Status |
| --- | --- |
| `no_nan_or_infinity` | shipped (`src/noaiSoakRunnerCore.ts:1252`) |
| `json_parseable` | shipped (1264) |
| `world_turn_monotonic` | shipped (1272) |
| `nonnegative_resources` | shipped (1281) |
| `market_ranges_valid` | shipped (1296) |
| `caps_bounded` | shipped (1305) |
| `no_duplicate_event_ids` | shipped (1313) |
| `no_duplicate_one_shot_events` | shipped (1317) |
| `output_files_bounded` | shipped (1331) |

Crash, timeout, and setup failure are already distinct `failureClass` values: `setup_failed`,
`crash_or_stall`, `timeout`, `invariant_failed`, `determinism_drift`, `internal_error`,
`performance_budget_exceeded`.

**Three invariants to add**, all reading data the accumulator already computes:

| New invariant | Rule | Reads |
| --- | --- | --- |
| `no_action_lock` | `telemetry.longestIdenticalActionStreak <= limits.maxIdenticalActionStreak` | line 857 |
| `no_state_stall` | `telemetry.longestZeroChangeStreak <= limits.maxZeroChangeStreak` | line 876 |
| `save_reload_digest_parity` | re-parse the persisted temp workspace through the production parsers, re-persist to a sibling temp dir, and require an identical aggregate hash | new |

`save_reload_digest_parity` is the only one needing new runner code; the other two are ~6-line `case`
branches plus registry entries. All three must be **opt-in per scenario** (absent limit ⇒ scenario
validation rejects selecting the invariant), so existing scenarios are untouched.

### Failure-class disambiguation (required)

The report must let a reader distinguish, without prose:

| Situation | Signal |
| --- | --- |
| crash | `failureClass: 'internal_error'` or `'crash_or_stall'` |
| invariant failure | `failureClass: 'invariant_failed'` + `firstFailure.invariantId` |
| determinism mismatch | `failureClass: 'determinism_drift'` + `determinism.firstDifference.kind` |
| legitimate stable state | `ok: true`, streaks below their limits, `finalWorldTurn - startWorldTurn === 100` |
| policy could not choose | `actionCounts.observe > 0` with `acceptedActions` flat — **not** a failure |
| feature-gated system idle | `commerceActive === false` path (line 374) — must be recorded as a warning, not a pass-by-default |

The last row is a real gap worth one line of code: today, if `rules.enableCommerce !== true` the gate
scenario silently degrades to observe-only and still passes. The gate must emit a warning and set
`report.degradedToObserveOnly = true` when the requested policy is not `observe_only` but commerce is
inactive.

---

## Determinism Comparison

Existing mechanism (`applyDeterminismComparison`, `scripts/run_noai_soak.js:690`) runs the scenario
twice and compares:

1. the canonical snapshot **stream** via `compareDeterminismSnapshotStreams` — reporting
   `firstDifferentSnapshot.index`, its `label` (`turn_N`), both hashes, and the first differing file;
2. the **action-stream hash** (`actionHasher`), a fixed-field-order fold over every action record.

Excluded from hashing: wall-clock (`startedAt`/`finishedAt`/`runtimeMs` are report fields, never inside
a snapshot), absolute paths (snapshots key on canonical *file names*), `runId`, and the named volatile
root keys `debug` / `report`. No sort is applied to array data that could mask ordering
nondeterminism — `buildDeterminismSnapshot` hashes the canonical text as written.

**Gate addition:** compare `report.aggregateDigest` between the two runs. Its input must be an explicit
ordered whitelist:

```text
turnsCompleted, startWorldTurn, finalWorldTurn,
actionCounts (fixed key order), acceptedActions, rejectedActions, rejectCounts (sorted keys),
eventCategoryCounts / eventSeverityCounts / eventSourceCounts (sorted keys),
duplicateEventIdCount, playerEventsEmitted, simEventsEmitted,
money/cargoUnits/marketStock/marketPriceIndex (min,max,final),
longestIdenticalActionStreak, longestZeroEventStreak, longestZeroChangeStreak
```

Excluded: `runId`, timestamps, `runtimeMs`, `turnsPerSecond`, `fileBytes`, any path. Key sorting here is
sorting a *counter map for stable serialization*, not sorting a sequence — it cannot hide ordering drift,
because ordering drift is already caught by the action-stream hash.

Mismatch reporting priority stays: canonical snapshot → action stream → aggregate digest, so the first
reported divergence is always the earliest and most concrete.

---

## Failure Report

Already implemented and sufficient: `report.firstFailure = { turn, invariantId?, detail }` is set at the
break point, temp is retained on any failure, and `printScenarioSummary` prints failure class, first
failure turn, warnings, determinism result, first difference, and the kept temp path.

**Gate addition:** a single machine-readable summary at a stable path, written by the new gate mode:

```jsonc
{
  "schemaVersion": 1,
  "gate": "NOAI-PLAYTEST-001",
  "ok": false,
  "identity": { "commit": "fdca78e", "version": "1.84.30", "node": "v20.x" },
  "scenarioId": "noai_determinism_100",
  "seed": "noai-determinism-100-seed",
  "policyId": "merchant_balanced",
  "turnsRequested": 100,
  "turnsCompleted": 63,
  "failureClass": "invariant_failed",
  "firstFailure": { "turn": 63, "invariantId": "no_state_stall", "detail": "..." },
  "determinism": { "canonicalMatch": true, "actionStreamMatch": true, "aggregateMatch": true },
  "saveReloadParity": { "ok": true },
  "runDir": "<kept temp path>"
}
```

Exit code 0 on PASS, non-zero on FAIL — already the runner's behavior (line 843).

---

## Minimal Slice

**One scenario, one seed, one policy, 100 turns, two runs, temp-only, no AI — using the runner that
already exists.**

| # | Change | File |
| --- | --- | --- |
| 1 | Add `no_action_lock`, `no_state_stall`, `save_reload_digest_parity` to `NOAI_SOAK_INVARIANTS` + their `evaluateInvariants` cases; add `limits.maxIdenticalActionStreak` / `maxZeroChangeStreak` parsing; reject selecting a streak invariant without its limit; add `buildNoaiSoakAggregateDigest(telemetry)` | `src/noaiSoakRunnerCore.ts` |
| 2 | Implement save→reload parity capture; add `report.identity`, `report.aggregateDigest`, `report.degradedToObserveOnly`; compare aggregate digest in `applyDeterminismComparison`; add `--gate` + `--json-out <path>` | `scripts/run_noai_soak.js` |
| 3 | Select the three new invariants and set the two new limits | `scripts/noai_soak_scenarios/noai_determinism_100.json` |
| 4 | Unit coverage for the three invariant cases (pass + fail + missing-limit rejection) and for aggregate-digest stability/sensitivity | `scripts/test_noai_soak_runner_core.js` |
| 5 | `"qa:noai:gate": "node scripts/run_noai_soak.js --scenario noai_determinism_100 --gate"` | `package.json` |
| 6 | Flip Status to the implemented state and record the exact PASS evidence | `docs/ai-tasks/NOAI-PLAYTEST-001.md` |

**Implementation form: option 2 — extend the existing `scripts/` CLI.** Rejected alternatives:

- *test-only node runner* — duplicates a working runner;
- *new Test Console plan type* — the Console selects tests from a diff; a 100-turn soak is not
  diff-selected and would distort plan selection;
- *new scenario harness* — a second harness is the parallel-truth-system anti-pattern.

No dashboard, no webview, no CI wiring in this slice. `--json-out` is the seam a later CI job would use.

---

## Out of Scope

- AI analyst, LLM log analysis, any log upload — Layer 4 of the idea note, deliberately last.
- Automatic balance changes or tuning of any kind.
- Multi-seed batches, 1000-turn runs, `noai_benchmark_1000` changes. (`--mode benchmark` already exists;
  this gate does not touch it.)
- Session/GM-turn soak. **No seam exists** (see [Existing Execution Seams](#existing-execution-seams));
  designing one is its own lane and must start from whether a pure accepted-turn core is extractable
  from `gmBridgeRunner` / `stateManager`.
- Combat soak. `combatDirectHeadlessCore` exists but is a separate clock; mixing it into the world-sim
  turn definition would make the canonical turn ambiguous.
- Any claim that this replaces human playtest. The Human Play Gate in
  `docs/DEVELOPMENT_VERIFICATION_POLICY.md` is unaffected.
- CI wiring, webview dashboard, version bump, Current Lane change.
- Re-running or re-baselining `merchant_300`, `market_shock`, `famine_*`, `econprofile_*`.

---

## Risk Tier

**Low.**

Justification from real authority boundaries, not optimism:

- `src/noaiSoakRunnerCore.ts` is imported by exactly two files, both under `scripts/`
  (`run_noai_soak.js`, `test_noai_soak_runner_core.js`). It is **not** reachable from `extension.ts` or
  any webview. Editing it cannot change shipped runtime behavior.
- All new writes stay inside the existing temp root behind `isSafeQaTempDeletionTarget`.
- No save-data migration, no schema change to any canonical game file, no network, no shell execution,
  no installer/updater surface.
- The only backward-compatibility risk is scenario-schema drift; it is neutralized by making both new
  limits optional with `undefined` defaults and leaving all other scenario files untouched.

Not escalated to Medium: the change adds no production code path and no user-facing behavior. Per
`docs/DEVELOPMENT_VERIFICATION_POLICY.md`, required verification is focused tests plus compile —
`npm run compile` is genuinely required here because the runner loads from `out/`.

---

## Acceptance Criteria

All machine-testable.

1. `npm run compile` succeeds; `out/noaiSoakRunnerCore.js` exports the three new invariant ids and `buildNoaiSoakAggregateDigest`.
2. `node scripts/test_noai_soak_runner_core.js` passes, including new cases for each new invariant in both pass and fail configurations.
3. Scenario validation **rejects** a document that selects `no_action_lock` without `limits.maxIdenticalActionStreak`, with a non-empty error array.
4. Scenario validation **rejects** `no_state_stall` without `limits.maxZeroChangeStreak`.
5. `npm run qa:noai:gate` exits 0 on `fdca78e`+slice and prints `PASS noai_determinism_100 — 100/100 turns`.
6. The gate run reports `determinism.canonicalMatch === true`, `actionStreamMatch === true`, and the new `aggregateMatch === true`.
7. `report.saveReloadParity.ok === true` for the gate run.
8. `report.telemetry.finalWorldTurn - report.telemetry.startWorldTurn === 100` (proves the world clock actually advanced once per soak turn).
9. `report.turnsCompleted === 100` and `report.failureClass === undefined`.
10. `--json-out <path>` writes a file matching the [Failure Report](#failure-report) shape, containing a non-empty `identity.commit` and `identity.version`, and nothing else is written outside the temp root.
11. A deliberately mutated copy of the scenario with `maxZeroChangeStreak: 0` fails with `failureClass: 'invariant_failed'` and `firstFailure.invariantId === 'no_state_stall'` — proving the invariant can fail.
12. A deliberately corrupted post-run canonical file causes `save_reload_digest_parity` to fail with a populated `firstMismatchPath` — proving parity can fail.
13. `npm run qa:noai:quick` still passes unchanged (no baseline regression in existing scenarios).
14. `git diff --stat` touches at most the six files in [Minimal Slice](#minimal-slice); no file under `src/` other than `noaiSoakRunnerCore.ts`.
15. `grep -rn "noaiSoakRunnerCore" src/ webview/` returns no new consumers (the core stays test-facility-only).

---

## Suggested Touch Set

```text
src/noaiSoakRunnerCore.ts
scripts/run_noai_soak.js
scripts/noai_soak_scenarios/noai_determinism_100.json
scripts/test_noai_soak_runner_core.js
package.json
docs/ai-tasks/NOAI-PLAYTEST-001.md
```

Six files. No webview file, no `extension.ts`, no canonical game-data schema.

---

## Go / No-Go Decision

**GO — on the corrected scope only.**

Go, because: the runner, isolation, determinism spine, telemetry, invariant framework, and a 100-turn
scenario all exist and work; the remaining delta is three invariants, one parity check, one digest, and
one CLI flag, in a module the extension cannot reach.

**No-Go on the scope as originally briefed** — building a new NOAI deterministic runner would duplicate
`scripts/run_noai_soak.js` and create the parallel truth system that
`docs/ideas/NOAI-LONG-HORIZON-PLAYTEST-AND-AI-ANALYST.md` explicitly warns against. Anyone picking up
this gate must start from the existing runner.

### Unresolved blockers (2)

1. **Threshold values are unproven.** `maxIdenticalActionStreak` and `maxZeroChangeStreak` need one
   observation run against the current `merchant_balanced` baseline before being fixed, or the gate
   will either never fire or fire falsely on day one. Implementation must record the observed baseline
   streaks in the task doc before choosing limits.
2. **"100 turns don't break" is proven only for the world-sim + commerce spine.** The story/GM session
   spine has no headless seam, so this gate cannot speak to it. That limitation must be stated wherever
   the gate's PASS is cited — it is not a project-wide 100-turn guarantee.

---

## Final Verdict

## Implementation evidence — 2026-08-03 JST

- Implementation code HEAD: `d39faf04684d1ea7f4e1cd13a1ffd644b1df9413`.
- Baseline observation on merged `origin/main` (`e6ec3dfe05a479984004b0af2506f0e46791017e`):
  `longestIdenticalActionStreak=4`, `longestZeroChangeStreak=0`, and no observe-only degradation.
- Chosen finite limits: `maxIdenticalActionStreak=8` (four-turn margin) and
  `maxZeroChangeStreak=4` (four-turn margin).
- PASS evidence: `npm run compile`; `node scripts/test_noai_soak_runner_core.js`;
  `npm run qa:noai:quick`; and `npm run qa:noai:gate -- --json-out C:\tmp\noai-playtest-001-gate-summary.json`.
  The gate completed `100/100` turns with world-turn delta `100`, canonical/action/aggregate
  determinism all true, save/reload parity true, and a non-empty identity.
- The focused tests prove zero `maxZeroChangeStreak` fails `no_state_stall`, and that a deliberately
  corrupted post-run `world_state.json` fails save/reload parity with `firstMismatchPath` populated.
- `npm run check:symbol-registry` passed after the required generated registry refresh.

```text
NOAI_PLAYTEST_001_IMPLEMENTED_DRAFT_READY_FOR_INTEGRATOR
```

with the mandatory correction that the runner is not to be written — it is to be extended.
