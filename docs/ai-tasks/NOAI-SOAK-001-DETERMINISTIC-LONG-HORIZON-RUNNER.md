# NOAI-SOAK-001 — Deterministic Long-Horizon Gameplay Runner

Status: Implemented (opt-in developer/test facility)
Branch: `task/NOAI-SOAK-001-deterministic-long-horizon-runner`
Base: `origin/main` @ `521373cb154f76f89544e1d023586a6061a7d8fc` (version 1.78.2)
Verdict: **NOAI_SOAK_001_READY_FOR_VERIFY**

This runner implements **Phase B — Small NOAI soak** from
`docs/ideas/NOAI-LONG-HORIZON-PLAYTEST-AND-AI-ANALYST.md` and the **opt-in soak
harness** called for by `docs/DEBUG_SIMULATION_TEST_ARCHITECTURE.md` §11 / §13-P4.

> Scope guard: this task does **not** create a complete playable NOAI narrative
> mode. It measures engine behavior over long deterministic horizons. It does not
> prove the game is enjoyable, and it does not add a user-facing Game Rules
> selector, free-text interpretation, narration, or an AI analyst.

---

## 1. Repository audit

Facts confirmed before implementation (all present on the base commit):

- `src/gameRulesCore.ts` — `aiParticipationPolicy` is `'always' | 'onDemand' |
  'simulationOnly'`, defaulting to `'always'`. It is core-only/inert: there is no
  Game Rules selector consuming it and no deterministic narrative-turn shell.
- `src/worldSimBulkCore.ts` — deterministic bounded world simulation with a hard
  `ABSOLUTE_MAX_BULK_WORLD_STEPS = 100` cap and an `afterStep` hook.
- `src/emergentSimulator.ts` — `runSimulationStep(forge, state)` is deterministic
  (no `Math.random`); it advances `worldTurn` by 1 and emits `stepEvents`. The
  only volatile field it writes is `lastUpdated` (a wall-clock timestamp), which
  the determinism spine redacts before hashing.
- `src/commerceCore.ts` — pure, fully-validating direct-trade production logic
  (`applyTradeOp` rejects `INSUFFICIENT_CREDITS`, `INSUFFICIENT_CARGO`,
  `INSUFFICIENT_STOCK`, `CARGO_CAPACITY`, …). Player-sourced events are possible
  without AI.
- `src/worldSimCommerceCore.ts` — `tickMarketRecovery` is the deterministic
  Tier-1 market cadence (stock recovery + price-index drift + world-event
  application), with `MIN_PRICE_INDEX = 0.25` / `MAX_PRICE_INDEX = 4`.
- `src/worldEventLogCore.ts` — `makeWorldChangeEvent` / `makeEventId` /
  `mergeRecentChanges` give stable event identities, `source: 'player'`, and
  dedup-by-id with a `MAX_RECENT_CHANGES = 20` cap.
- `scripts/run_game_qa.js` + `src/gameQaRunnerCore.ts` + `src/determinismSpineCore.ts`
  — isolated temp workspaces, quick/full/benchmark modes, canonical file hashing,
  two-run determinism comparison, JSON+Markdown reports, safe temp deletion.
- `scripts/run_simulation_tests.js` intentionally excludes soak/scale tests;
  `scripts/run_all_tests.js` drives `npm test` from an explicit manifest.

Conclusion: a separate opt-in runner should reuse these cores rather than widen
the interactive 100-step cap or create a parallel simulation-truth system.

---

## 2. Reused production components (no parallel truth system)

| Concern | Reused component |
| --- | --- |
| Bounded world simulation | `worldSimBulkCore.runBulkWorldSimulation` (called in ≤ `maxStepsPerChunk` chunks; production clamps to 100) |
| Deterministic world tick | `emergentSimulator.runSimulationStep` (via bulk core) |
| Market cadence | `worldSimCommerceCore.tickMarketRecovery` (wired through the bulk `afterStep` hook) |
| Commerce forge adapter | `livingWorldBridge.resolveCommerceForge` → `livingWorldForgeCore.parseCommerceForge` |
| Direct trade (sole mutator) | `commerceCore.applyTradeOp`; sizing via `quoteMarketPrice` / `cargoWeight` / `transportCapacity` |
| Market seeding | `commerceCore.initializeMarketState` |
| Event identity | `worldEventLogCore.makeWorldChangeEvent` / `mergeRecentChanges` (`source: 'player'`) |
| Canonical hashing & drift | `determinismSpineCore.buildDeterminismSnapshot` / `compareDeterminismSnapshotStreams` / `stableSerialize` (volatile fields redacted) |
| Safe temp paths | `gameQaRunnerCore.isSafeQaTempDeletionTarget` / `resolveRepoFixturePath` (re-exported by the soak core) |
| Validators | `validateGameState`, `worldStateCore.parseWorldStateWithWarnings`, `worldForgeCore.parseWorldForge`, `gameRulesCore.normalizeGameRules` |

Markets are managed in a script-level holder (not inside the sim state), because
`emergentSimulator` never references `markets`; this keeps player trades and the
market cadence authoritative and decoupled from the emergent tick.

---

## 3. New contracts and files

### New source / scripts
- `src/noaiSoakRunnerCore.ts` — pure core (no fs/vscode/network/LLM/ComfyUI):
  scenario contract + allowlist parser, seeded PRNG, deterministic policies,
  telemetry accumulator, machine invariants, player-trade event identity, report
  model + Markdown.
- `scripts/run_noai_soak.js` — opt-in host runner (fs + compiled cores, vscode
  shimmed exactly like `run_game_qa.js`). CLI: `--list`, `--mode
  quick|full|benchmark`, `--scenario <id>`, `--keep-temp`, `--no-keep-failed`.
  Test-only override: `NOAI_SOAK_SCENARIO_DIR`.
- `scripts/test_noai_soak_runner_core.js` — fast focused tests (registered in
  `npm test`, unit category).
- `scripts/noai_soak_scenarios/*.json` — 5 versioned scenarios.
- `scripts/noai_soak_scenarios/fixtures/{merchant_three_market,market_shock}/` —
  dedicated fixtures (`observe` reuses the `debug-sandbox` sample).

### Package commands
`qa:noai:list`, `qa:noai:quick`, `qa:noai:full`, `qa:noai:benchmark`.
Normal `npm test` does **not** execute the soak scenarios.

### Scenario contract (v1)
Data-only; no shell/code fields are accepted. A recursive scan rejects any
forbidden key (`command`, `cmd`, `shell`, `exec`, `eval`, `script`, `spawn`,
`code`, `run`, `require`, `import`, …). Fixture paths are rejected if absolute or
containing `..`. Required fields:
`id`, `version`, `description`, `mode` (+ optional `modes`), `seed`,
`workspace` (`empty` | `sample` | `fixture`), `policyId` (allowlisted),
`horizon.turns`, `worldSim` (`cadenceTurns`, `stepsPerCadence`,
`enableNpcRegistry`, optional `recoveryPerTick`), `limits`
(`maxTurns`, `maxStepsPerChunk`, `maxOpsPerTurn`, `maxFileBytes`,
`maxRecentChanges`, optional `timeoutMs` / `performanceBudgetMs`),
`invariants[]` (allowlisted), `telemetry`
(`sampleEveryTurns`, `maxSamples`, `recentWindow`, `maxAnomalyWindows`),
optional `determinism` (`enabled`, `compareRuns` 1|2, `failOnDrift`,
`snapshotEveryTurns`).

---

## 4. Deterministic player policies

All actions come from a fixed allowlisted vocabulary (`observe` / `buy` / `sell`).
Policies **propose** ops; production `applyTradeOp` is the sole authority that
mutates state and rejects infeasible ops. No state mutation bypasses production
rules to make the bot move.

- **`observe_only`** — no economic action; advances the deterministic world
  simulation; establishes a stable baseline.
- **`merchant_balanced`** — uses actual Commerce production logic; buys the
  cheapest in-stock/affordable/cargo-fitting pair when cargo is light and sells
  held cargo at the highest-priced market when cargo is heavy. Buy/sell sizes are
  computed with production read-helpers, so it cannot spend unavailable money or
  sell unavailable cargo. No randomness outside the seeded policy.
- **`merchant_stress`** — larger steps / more ops per turn, plus a periodic
  deliberately-oversized probe that production validation rejects
  (`INSUFFICIENT_STOCK`) — exercising rejection paths, event identity and market
  stress while remaining bounded by production validation.

---

## 5. Machine invariants (allowlisted; no AI prose decides these)

`no_nan_or_infinity`, `json_parseable`, `world_turn_monotonic` (advances by
exactly `stepsPerCadence` per cadence), `nonnegative_resources` (allowlisted
non-negative fields: credits/stock/qty/food/power/morale/targetStock/capacity),
`market_ranges_valid` (stock ≥ 0; priceIndex in `[0.25, 4]`), `caps_bounded`
(`recentChanges ≤ maxRecentChanges`), `no_duplicate_event_ids` (distinct accepted
actions never collide), `no_duplicate_one_shot_events` (recentChanges deduped),
`output_files_bounded` (each canonical file ≤ `maxFileBytes`). Every failure links
to the exact turn / invariant / refs.

---

## 6. Telemetry schema (bounded)

Per run: `runId`, `scenarioId`, `seed`, `policyId`, `startedAt`/`finishedAt`,
turns requested/completed, initial & final canonical hashes, action counts by
type, accepted/rejected counts + reject-reason counts, action entropy (Shannon
bits) and longest identical-action streak, event counts by
category/severity/source, player vs sim event counts, distinct & duplicate event
ids, min/max/final money, cargo units, market stock and price index, worldTurn
progression (start → final, Δ), longest zero-event / zero-change streaks,
canonical file sizes, runtime and turns/second, determinism comparison, failed
invariants, warnings.

Only **bounded** windows are retained: periodic samples (capped), a ring-buffer
recent-turn window for first-failure diagnosis, and capped anomaly windows — never
a full per-turn state dump.

---

## 7. Actual results

Environment: Node v24 on Windows. Fresh isolated worktree; offline build
(`node_modules` junctioned from the sibling checkout — identical dev-dep versions;
never shipped).

### Focused unit tests — `node scripts/test_noai_soak_runner_core.js`
All 14 required proofs pass (22 checks): parser rejects commands/unsafe paths;
seed→same actions; no overspend; no oversell; rejected action recorded without
state corruption; distinct event ids; retry dedup; bounded telemetry; NaN/Infinity
and negative-resource detectors fire on synthetic corruption; drift first-difference
report; failure workspace retained; success workspace cleaned; runner/core contain
no network/AI/ComfyUI/spawn calls.

### `qa:noai:quick` — 2/2 PASS
| Scenario | Turns | Runtime |
| --- | --- | --- |
| noai_merchant_300 | 300/300 | ~833 ms (~360 t/s) |
| noai_observe_300 | 300/300 | ~696 ms (~431 t/s) |

### `qa:noai:full` — 4/4 PASS
| Scenario | Turns | Notes |
| --- | --- | --- |
| noai_determinism_100 | 100/100 | canonical=**true**, actionStream=**true** |
| noai_market_shock_recovery | 250/250 | recovery observed (see §8) |
| noai_merchant_300 | 300/300 | 152 buy / 148 sell, 0 rejected; money 392→917 (min 392, max 944) |
| noai_observe_300 | 300/300 | stable baseline; worldTurn 0→300 |

`noai_merchant_300` invariant snapshot: all 9 pass; player events = 300, distinct
ids = 300, duplicate ids = 0; recentChanges held at the cap.

### `qa:noai:benchmark` — 1/1 PASS
| Scenario | Turns | Runtime | Budget |
| --- | --- | --- | --- |
| noai_benchmark_1000 | 1000/1000 | ~2835 ms (~353 t/s) | 180000 ms (terminated well within) |

Benchmark ledger growth: `recentChanges` bounded at 20; canonical file sizes
bounded; money 392→1967 (max 1994). Sell-side market stock climbed to ~1511 (see
§9, limitation).

### `npm test` (run once) — 241/241 PASS
The full suite was run once. It initially reported 240/241 because the newly added
production exports made the committed Symbol Registry index stale; running
`npm run generate:symbol-registry` regenerated `docs/generated/symbol_registry.*`
(new `noai-soak-runner` category) and the focused
`scripts/test_symbol_registry.js` check then passes. The new NOAI soak unit test
passed within the suite. No soak scenario runs inside `npm test`.

---

## 8. Determinism evidence

`noai_determinism_100` runs the same seed and `merchant_balanced` policy twice in
isolated workspaces and compares both the canonical file-hash snapshot stream and
the accepted action/event stream hash:

- initial canonical hash: `03fe9886…a281e`
- final canonical hash: `624b9c95…5d117b`
- **canonical match: true**, **action-stream match: true**, `failOnDrift: true`

The drift path is exercised by the unit test (`compareDeterminismSnapshotStreams`
yields a first-different-snapshot + file diff; `serializeActionStream` differs for
differing streams), so a real regression would produce a useful first-difference
report and fail the scenario.

Market-shock recovery evidence (`noai_market_shock_recovery`, bounded samples):
at turn 25 `maxPriceIndex ≈ 2.55` with stock recovering from the seeded shortage
(1–3); by turn 250 `maxPriceIndex ≈ 1.05` and `minStock ≈ 28`, with `recentChanges`
held at 20 throughout and 83 `INSUFFICIENT_STOCK` rejections recorded without state
corruption. The system recovers rather than staying permanently dead or runaway.
No balance-quality claim is made from this single scenario.

---

## 9. Limitations

- **Not a complete NOAI mode.** No Game Rules selector, free-text interpretation,
  narration, or AI analyst. This measures engine behavior only.
- **Event-light pure sim.** With the NPC-registry/agency layer off,
  `runSimulationStep` emits no emergent events for these fixtures (consistent with
  the repo's existing `debug-sandbox` behavior). `worldTurn` still advances and the
  substantive dynamics come from commerce recovery + trades. `observe_only` is a
  deliberately calm baseline, not a claim of rich emergent activity.
- **Sell-side market stock is unbounded in production.** `tickMarketRecovery` only
  raises stock toward `targetStock`; it never lowers an over-supplied market, so
  repeated sells inflate one market's stock (observed max ~1511 over 1000 turns).
  This is bounded within a run and does not threaten file size or determinism, but
  it is real engine behavior worth a future production cap.
- **Single seed per scenario.** No multi-seed statistical/balance conclusions.
- **Enjoyment is out of scope.** Machine metrics do not prove the game is fun.
- **Offline build note.** `node_modules` was junctioned from the sibling checkout
  (identical dev-dep versions) to build without network access; this is an
  environment detail, not a shipped artifact.

---

## 10. Next recommended phase (kept separate)

- **A. NOAI-PHASE1 — user-facing deterministic action shell.** Promote the
  allowlisted policy/action vocabulary into a real deterministic narrative-turn
  shell driven by a Game Rules selector consuming `aiParticipationPolicy =
  simulationOnly`, with deterministic (non-AI) result text. Depends on this
  runner's action/event identities and invariants.
- **B. Multi-seed balance batch.** Run many seeds/policies and compare
  distributions (strategy concentration, recovery time, dominance) instead of
  single-run anecdotes. Add a production upper cap for over-supplied market stock
  before drawing balance conclusions.
- **C. Read-only AI log analyst.** Only after A/B, let an AI review the immutable,
  bounded evidence packets this runner already emits (pathology / balance /
  boredom roles), with every claim linked back to exact turn/action/event ids. The
  AI may interpret the simulation; it may not become the simulation.

---

Verdict: **NOAI_SOAK_001_READY_FOR_VERIFY**
