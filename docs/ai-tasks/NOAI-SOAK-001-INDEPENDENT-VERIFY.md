# NOAI-SOAK-001 Independent Adversarial Verify

- **AI:** Grok  
- **Model:** Grok 4.5 (High)  
- **Role:** Independent adversarial verification (no implementation changes, no merge)  
- **Date:** 2026-07-11 (JST)  
- **Worktree:** `C:\AI\wt-noai-soak-001-verify` @ tip `f9e4fd6`  
- **Not run:** Antigravity, ComfyUI, LLM, network gameplay, live Fantasy workspace, live installer  

## Final verdict

```text
NOAI_SOAK_001_VERIFY_PASS
```

---

## Candidate identity (from origin)

| Item | SHA / value |
| --- | --- |
| `origin/main` | `521373cb154f76f89544e1d023586a6061a7d8fc` |
| Branch | `origin/task/NOAI-SOAK-001-deterministic-long-horizon-runner` |
| **Implementation commit** | `bd774810b2b53102794cc4ce4d82c27f7f2fb107` — `feat(noai-soak): deterministic long-horizon gameplay/engine runner (NOAI-SOAK-001)` |
| **Report commit** | `f9e4fd6861f661936c657ef7ceed82e5c97f017b` — `docs(noai-soak): durable report for NOAI-SOAK-001 runner` |
| Shape `main...candidate` | `0 2` (implementation + report) |
| Ancestry | `bd77481^` = main; `f9e4fd6^` = `bd77481` |

Branch **was present on origin** (not `NOAI_SOAK_001_CANDIDATE_NOT_PUSHED`).

### Prior implementer claim challenged

Implementer reported initial `240/241` due to Symbol Registry staleness, regenerated registry, **did not re-run full `npm test`** on the final tree. This verify **ran `npm test` once** on the final committed candidate tip `f9e4fd6` (includes registry regeneration inside `bd77481`):

```text
Passed: 241/241
```

“All gates green” is **not** accepted from the report alone; suite proof is independent.

---

## 1. Integrity

| Check | Result |
| --- | --- |
| `origin/main` exact expected SHA | **MATCH** (end of verify still `521373c`) |
| Candidate based directly on that main | **PASS** (`bd77481` parent = main) |
| Implementation vs report separate commits | **PASS** |
| Version remains **1.78.2** | **PASS** (`package.json` / lock / badges / CHANGELOG / VERSION_TRUTH; `check_version_consistency.js` OK) |
| No merge performed by this verify | **PASS** |
| No live/user Fantasy workspace files in commit | **PASS** (only `scripts/noai_soak_scenarios/fixtures/**`) |
| No `node_modules`, `.tmp` run output, generated soak reports committed | **PASS** (`git ls-tree`; `.tmp/` gitignored) |
| Production webview bundles: no EOL-only churn | **PASS** (no `webview/**` in diff) |
| `.gitignore` exceptions narrowly scoped | **PASS** — `.tmp/` ignored; `!scripts/noai_soak_scenarios/**/game_state.json` only under soak fixtures (does not un-ignore live root `game_state.json`) |

### Complete production touch set (`main...HEAD`)

```text
.gitignore
docs/ai-tasks/NOAI-SOAK-001-DETERMINISTIC-LONG-HORIZON-RUNNER.md   (report commit only)
docs/generated/SYMBOL_REGISTRY.md
docs/generated/symbol_registry.json
package.json   (+ qa:noai:* scripts only; version unchanged)
scripts/noai_soak_scenarios/**   (5 scenarios + 2 fixtures)
scripts/run_all_tests.js   (+1 unit entry)
scripts/run_noai_soak.js
scripts/test_noai_soak_runner_core.js
src/noaiSoakRunnerCore.ts   (NEW only)
```

**No** edits to existing production commerce/world/sim cores — only a new pure module that **imports** them. PASS.

---

## 2. Architecture / authority

| Claim | Evidence | Result |
| --- | --- | --- |
| Opt-in; normal `npm test` only runs fast unit proofs | `test_noai_soak_runner_core.js` registered; soak scenarios **not** in `run_all_tests.js` | PASS |
| Does not claim full playable NOAI narrative mode | Module/docs: engine/gameplay soak harness; policies are merchant/observe only | PASS |
| Does not consume `aiParticipationPolicy` as UX mode | Grep: no `aiParticipationPolicy` in soak sources | PASS |
| Reuses production Commerce + world sim | Host uses `applyTradeOp`, `runBulkWorldSimulation`, `tickMarketRecovery`, `mergeRecentChanges`, `parseWorldForge`, etc. from compiled `out/*` | PASS |
| No parallel test-only truth fork of business rules | Policies size intents; **only** `applyTradeOp` mutates commerce | PASS |
| No AI / network / Antigravity / ComfyUI / Skill | Static guard in unit test + source inspection; no http/https/child_process/comfy | PASS |
| Does not mutate source fixtures | Fixture SHA256 identical after all soak runs | PASS |
| Dedicated safe temp root | `DEFAULT_NOAI_SOAK_TEMP_ROOT = '.tmp/noai_soak'`; `isSafeQaTempDeletionTarget` gate | PASS |
| Production cores changed only for runner? | **None** changed | PASS |

---

## 3. Scenario contract safety

Parser: `parseNoaiSoakScenarioDocument` + `scanForbiddenScenarioKeys` + `isUnsafeFixturePath` + host `resolveRepoFixturePath`.

| Attack | Rejected? |
| --- | --- |
| Absolute POSIX `/…` | yes |
| Drive-qualified `C:/…`, `D:/…` | yes |
| Parent traversal `../…` | yes |
| UNC `//server/share`, `\\server\share` (after `\`→`/`) | yes (leading `/`) |
| Forbidden keys: `command`, `eval`, nested `script`, `require`, … | yes (recursive) |
| Unsupported `policyId` / invariant / mode | yes |
| Horizon ≤0 or `horizon.turns > maxTurns` | yes |
| Unsafe telemetry/limits (0/`maxFileBytes` non-positive) | yes |
| Empty seed / empty id | yes |
| Scenario field → shell / eval / require path | no code path does this; vocabulary is allowlisted policies/actions only | 

**Residual:** batch load with **duplicate scenario ids** is not rejected (`--list` shows the same id twice). Not exploitable for execution, but weak inventory hygiene.

**Symlink escape of fixtures:** resolution requires path under repo root; host copies directories as real files (does not follow into copy as alternate roots beyond Node `copyFileSync` semantics). Acceptable for this harness.

---

## 4. Deterministic policies

| Policy | Behavior |
| --- | --- |
| `observe_only` | `decideTradeIntents` → `[]`; host records `observe` only; **no** `applyTradeOp` |
| `merchant_balanced` | Deterministic cheapest buy / highest sell; fixed steps; no probe |
| `merchant_stress` | Larger steps + periodic oversized buy **probe** expected to reject via production validation |

Proofs:

- Same seed → identical mulberry32/fnv1a stream (unit).  
- Same seed/state → identical stress ops (unit).  
- Buy never proposed when credits cannot afford one unit (unit).  
- Sell qty ≤ held cargo (unit); production rejects oversell (unit).  
- Rejected trades leave credits/stock unchanged (unit + production).  
- Pair ordering: `commodityId` then `marketLocationId` sort — stable vs insertion order.  
- No `Date.now` / `Math.random` / random UUID in **policy** decisions (only run-id suffix / wall timeout outside canonical stream).  
- Seeded RNG uses integer mulberry32 — platform-independent for JS Number.  

Adversarial empties: zero credits / empty cargo / missing pairs → no unsafe buy/sell; stress probe still production-validated.

---

## 5. Long-horizon execution

**Not** a single bulk raise of the interactive 100-step world-sim cap.

- Gameplay loop: `for (t = 1; t <= horizon.turns; t++)`.  
- Each cadence: `runBulkWorldSimulation({ steps: stepsPerCadence, maxSteps: min(stepsPerCadence, maxStepsPerChunk) })`.  
- Shipped scenarios use `stepsPerCadence: 1`, `maxStepsPerChunk: 5` → each world advance is a **1-step** bulk, repeated per turn.  
- Exactly N turns requested → N completed (see scenario table + boundary suite).  
- `world_turn_monotonic` checks delta = `stepsPerCadence` at cadence boundaries.  
- `tickMarketRecovery` runs in `afterStep` once per world step.  
- First failing invariant records exact turn + id.

**Boundary suite (synthetic fixtures, independent of shipped scenarios):**  
99, 100, 101, 199, 200, 201, 300, 1000 → all `N/N` PASS.

---

## 6. Event and receipt identity

| Claim | Evidence | Result |
| --- | --- | --- |
| Distinct accepted trades → distinct event ids | `makeWorldChangeEvent` id from `worldTurn + category + trade_${actionSeq}`; unit + 300-loop probe | PASS |
| Same receipt retry dedups | identical `receiptId`/`event.id`; `mergeRecentChanges` length stays 1 | PASS |
| Rejected trades create no accepted event id | `recordAction` only tracks `eventId` when accepted; unit | PASS |
| Cap does not hide duplicate detection | `emittedEventIds` Set accumulates **before** merge; 300 distinct with `maxRecentChanges=20`, `duplicateEventIdCount=0` | PASS |
| worldTurn at materialization | `buildPlayerTradeEvent(worldState.worldTurn, acceptedSeq, …)` | PASS |
| Player trade ≠ NPC food-crisis rule | events `source: 'player'`; no NPC registry tick in shipped scenarios | PASS |

Merchant 300 report: `playerEventsEmitted=300`, `duplicateEventIdCount=0` — **not** inferred only from cap-20 recentChanges.

---

## 7. Telemetry correctness

Reports include action counts, accept/reject, entropy, streaks, event category/severity/source, duplicate ids, money/cargo/market min-max-final, zero-event streaks, worldTurn, file sizes, turns/s, determinism block.

Edge handling (code + unit): sample/anomaly/recent caps enforced; rejected-only actions counted; entropy over accepted+rejected labels; first failure keeps recent window.

Shipped reports (independent keep-temp runs) — see §11.

---

## 8. Invariants

Allowlist detectors exercised:

| Family | Synthetic / live | Result |
| --- | --- | --- |
| NaN/Infinity recursive | unit corrupt doc | FAIL correctly |
| Negative resources field-allowlist | flags `credits`/`stock`; **not** signed affinity/delta | PASS |
| Market ranges | production `MIN/MAX_PRICE_INDEX`; stock ≥ 0 only (no upper stock) | PASS (by design) |
| JSON parseable | wired in context | PASS |
| worldTurn monotonic | cadence delta | PASS on all soaks |
| caps_bounded | recentChanges ≤ max | PASS |
| duplicate event ids | telemetry + recent id scan | PASS |
| output_files_bounded | unit fail retains workspace when maxFileBytes=1 | PASS |
| Stall | world-sim failure class `crash_or_stall` + `timeoutMs` wall budget | meaningful process-level, not deep semantic stall |
| Performance budget | `performanceBudgetMs` vs `Date.now()` elapsed (benchmark 180s budget; actual ~2.6s) | PASS |

---

## 9. Determinism proof

- Canonical snapshots via production `buildDeterminismSnapshot` / `stableSerialize` over fixed file set.  
- Action stream: ordered semantic fields hashed (not mere counts).  
- Determinism scenario: two independent workspace copies; `canonical=true`, `actionStream=true`.  
- Intentional qty drift → different `serializeActionStream` (probe).  
- Receipts: deterministic `rcpt_${worldTurn}_${actionSeq}` + production event id scheme — **no** random receipt generator.  
- Volatile: `runId` uses time + `crypto.randomBytes` for **directory uniqueness only**, excluded from action/canonical commerce identity.

---

## 10. Workspace safety / cleanup

| Claim | Result |
| --- | --- |
| Source fixtures byte-identical after runs | PASS |
| Success deletes run dir under `.tmp/noai_soak` | unit PASS |
| Failure retains workspace + `report.json` | unit PASS |
| `--keep-temp` honored | benchmark + keep-temp runs PASS |
| Delete refuses outside / refuses temp root itself | PASS |
| Same-ms collision avoided | `runId` includes random 3-byte hex suffix | PASS |
| Cleanup failure does not erase original failure | writeReports before delete; delete errors only WARN | PASS |

**Windows junction residual:** `isSafeQaTempDeletionTarget` is **path-prefix only**; it does not scan nested junctions/reparse points inside a safe path. Host `fs.rmSync(..., { recursive: true })` could theoretically follow a planted junction. Creating a test junction failed on this host (`mklink /J` status 1). Threat is real in general Windows QA harnesses; **not** exercised as an open RCE in scenario JSON (scenarios cannot plant junctions). Track as defense-in-depth residual, not incident-class FAIL for this opt-in dev tool.

---

## 11. Actual scenario results

Commands run (in order):

1. `npm run compile` → PASS  
2. `node scripts/test_noai_soak_runner_core.js` → PASS (all focused proofs)  
3. `npm run qa:noai:list` → 5 scenarios  
4. `npm run qa:noai:quick` → **2/2** PASS  
5. `npm run qa:noai:full` → **4/4** PASS (determinism dual-run OK)  
6. `npm run qa:noai:benchmark` → **1/1** PASS, temp kept  
7. `npm test` **once** → **241/241** PASS  

### Per-scenario (keep-temp re-runs for durable metrics)

| Scenario | Turns | Runtime | Actions (accepted/rejected) | Counts | Dup events | Final hash (prefix) | Warnings | Cleanup |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `noai_observe_300` | 300/300 | **666 ms** | 300 / 0 | observe=300 | 0 | `4d873d087144eb45…` | none | kept (request) |
| `noai_merchant_300` | 300/300 | **889 ms** | 300 / 0 | buy=152 sell=148 | 0 | `d1174593e5d7f34e…` | none | kept |
| `noai_market_shock_recovery` | 250/250 | **767 ms** | 250 / **83** | buy=212 sell=121; reject `INSUFFICIENT_STOCK=83` | 0 | `4b2b790e6f259e18…` | none | kept |
| `noai_determinism_100` | 100/100 | **263–286 ms** (×2) | 100 / 0 | buy=52 sell=48 | 0 | `624b9c95920be3da…` (match) | none; **canon=true stream=true** | kept |
| `noai_benchmark_1000` | 1000/1000 | **2562 ms** (~390 t/s) | 1000 / 0 | buy=502 sell=498 | 0 | `d0831a80286ac997…` | none | kept (`--keep-temp`) |

Quick-mode first pass (no keep-temp): merchant 788 ms, observe 706 ms — cleaned.

Reports under:  
`.tmp/noai_soak/<scenarioId>/soak_* /report.json` (gitignored; not committed).

---

## 12. Specific challenges

### A. `observe_only` / `noai_observe_300` — calm baseline or no-op?

**Observed:** 300 `observe` actions; **0** player trades; **0** sim events emitted; money/stock telemetry stay zero (commerce inactive under observe; sample markets empty/untracked for extents default).  

**Still not a pure empty loop:** each turn runs production world load path + `runBulkWorldSimulation` (1 step) + canonical snapshot hashing + full invariant set + bounded recentChanges caps. worldTurn advances monotonically.

**Verdict on challenge:** Name is **justified as a no-player-economy stability soak**, not as an emergent-event stress test. It is intentionally calm. Residual: weak “event ecology” signal (`simEventsEmitted=0` with NPC registry off). Not REPAIR_REQUIRED.

### B. Merchant sell-side stock ~461 (benchmark max 1511)

**Observed:** `noai_merchant_300` marketStock min/max/final = **12 / 461 / 461**.  

Production has **no upper stock cap**; sells add stock; recovery tops up toward targets. Policy is a deterministic buy/sell loop, not a balance claim.

**Verdict:** Acceptable **evidence of production truth** + telemetry max. Not a missing critical invariant for this harness (upper stock is not a production rule). Optional future **warning** if maxStock grows without bound across longer horizons — not a FAIL for SOAK-001.

### C. Market shock “recovery” 2.55 → 1.05 with 83 rejects

**Observed from report:**  
- `marketPriceIndex`: min≈1.0, **max=2.55**, **final=1.05**  
- `rejectCounts.INSUFFICIENT_STOCK=83`  

There is **no** named machine invariant “recovered”. “Recovery” is an **observational** reading of min/max/final priceIndex + continued successful actions under `merchant_stress` + `recoveryPerTick: 2`. Scenario description correctly disclaims balance quality.

**Verdict:** Numbers **machine-verified** from telemetry; narrative “recovery” is interpretation of those fields — acceptable if not oversold. PASS for honesty of metrics.

### D. 1000 turns ~2.8s — empty loop?

**Observed:** **2562 ms**, 1000 accepted trades (502 buy / 498 sell), money span 392→1994, stock max **1511**, playerEvents=1000, invariants all green.

Each turn: policy + `applyTradeOp` + world bulk step + recovery tick + JSON persist + determinism hash inputs. Throughput ~390 t/s is consistent with pure in-process JS cores, **not** a no-op for-loop.

**Verdict:** Real production-core work. PASS. 180s budget is only an upper fail-safe; actual runtime reported separately above.

---

## Residuals (non-blocking)

1. Duplicate scenario ids not rejected at load.  
2. Nested Windows junction under temp not scanned before `rmSync` (path-prefix safety only).  
3. `observe_300` emits no sim events (calm fixture + NPC registry off).  
4. No upper market-stock invariant (production has none).  
5. “Recovery” is telemetry observation, not a dedicated invariant id.  
6. Wall-clock `Date.now` for runtime/timeout (not `hrtime`); adequate for this budget scale.

---

## Verdict rationale

Integrity, opt-in architecture, scenario sandboxing, deterministic policies, long-horizon chunked execution (including 99–1000 boundaries), event identity under recentChanges caps, telemetry/invariants, determinism dual-run, workspace cleanup, full soak modes, and **independently proven 241/241** all hold. Challenges A–D are answered with report numbers and production-truth caveats without reopening a critical defect class.

```text
NOAI_SOAK_001_VERIFY_PASS
```
)
