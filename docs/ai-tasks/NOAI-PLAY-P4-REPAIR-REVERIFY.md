# NOAI-PLAY-P4 Repair — Independent Re-verification

**Verdict:** `NOAI_PLAY_P4_REPAIR_REVERIFY_REQUIRED`

**Date:** 2026-07-12  
**Verifier worktree:** `C:\AI\wt-noai-play-p4-repair-reverify`  
**Verifier branch:** `task/NOAI-PLAY-P4-repair-reverify`  
**Method:** source/fixture inspection + focused execution + canonical gates + one independent full suite run. No subagents. No merge. No implementation edits. No live installer / Antigravity / Relay-LLM / ComfyUI / image generation / live player workspace.

---

## 1. Lineage and scope

| Item | Expected | Observed |
|------|----------|----------|
| `origin/main` | `b5a5789e3e96991cd298eed7024589acfccbebcd` | **Match** |
| Repair tip / candidate base | `0ee1fc260837ca07ae08bd231563ed8a707089ea` | **Match** |
| Version | `1.80.0` | **Match** (`package.json` + version consistency gate) |
| Worktree start | clean | **Clean** |

### Repair commits (scope checked via `git show --name-only`)

| SHA | Subject | Files | Scope check |
|-----|---------|-------|-------------|
| `645f044a90fb462f4b0648cc417aa1268e49da9a` | fix: repair P4 travel UI and executable fixtures | `scripts/run_noai_play_p4_fixtures.js`, `scripts/test_market_travel_core.js`, `webview/modules/85-world.js`, `webview/script.js` | **Only those four** |
| `c9c9fcf4eb21b975fc2106718faaaf6bd3dafcc2` | docs: record NOAI-PLAY-P4 repair | `docs/ai-tasks/NOAI-PLAY-P4-REPAIR.md` | **Report-only** |
| `a2d348337cb1e692c2f1bc2bd32c427dc0d804ae` | fix: strengthen P4 executable fixture proofs | `scripts/run_noai_play_p4_fixtures.js` | **Fixture runner only** |
| `0ee1fc260837ca07ae08bd231563ed8a707089ea` | docs: update P4 repair evidence | `docs/ai-tasks/NOAI-PLAY-P4-REPAIR.md` | **Report-only** |

### Published P4 chain relationship

- Repair parent of `645f044` is `94690406e81813c31419355b5eb9b2840528b35f` (P4 chain tip before independent-verify docs).
- Original independent verification `097499ae73c638185e3d1954d7ac3ebee6cd56d8` is a **sibling docs commit** on the same P4 parent, **not** an ancestor of the repair tip.
- Candidate **is** based on the published P4 product chain: `b5a5789` → `b020614` (deterministic market travel) → `6f39f3b` / `9469040` → repair commits.
- `origin/main` is an ancestor of the candidate (`merge-base --is-ancestor` succeeds). Main has **not** moved.

---

## 2. UI blocker recheck — **PASS (closed)**

Verified in committed `webview/modules/85-world.js` and committed `webview/script.js` (UTF-8 read; not comments/reports):

| Check | Module | Bundle |
|-------|--------|--------|
| Button `textContent = '旅に出る'` | present | present |
| Button `aria-label = '旅に出る'` | present | present |
| Dialog `aria-label = '旅に出る'` | present | present |
| Dialog title `<h2>…旅に出る</h2>` | present | present |
| Mojibake markers `譌` / `蜃` / `繧` / `證` | **absent** | **absent** |

`scripts/test_market_travel_core.js` asserts:

- `ui.includes('旅に出る')` and bundle includes `旅に出る`
- negative regex `/譌|蜃|繧|證/` on both module and bundle

After EOL normalization (`\r\n` → `\n`), the market-travel open-button and dialog slices in module vs shipped bundle are **byte-equal**.

**Conclusion:** UI mojibake blocker is closed from source/bundle evidence alone.

---

## 3. Duplicate request fixture — **PASS (ceremonial blocker closed)**

`duplicate_request_travel` in `scripts/run_noai_play_p4_fixtures.js` (source inspection + execution):

| Required proof | Evidence |
|----------------|----------|
| Temporary workspace | `createHarness()` → `fs.mkdtempSync` under OS temp |
| Request gate | `createMarketTravelRequestGate(2)` |
| Production travel | `executeMarketTravel(...)` inside gate callbacks |
| Canonical write path | harness `commitGameState` → `game_state.json` |
| Commit counting | harness `commitCount` increments only on successful write |
| Exactly one write | `assert.equal(h.commitCount, 1)` |
| Disk reread | `readLocation(h.gamePath) === 'south_port'` |
| Replay no second write | same `requestId`; `r1` deep-equal `r2`; commit stays 1 |
| Second destination not claimed | duplicate callback targets `elda_shop` but `r2.destination.id === 'south_port'` |
| Cleanup | `finally { h.cleanup() }` |

No fabricated `marketTravelResult` authority: gate callback invokes production `executeMarketTravel` and returns that receipt.

**Conclusion:** duplicate-request fixture is genuinely executable, not ceremonial.

---

## 4. Cross-action fixture — adversarial analysis — **REPORT/FIXTURE CLAIM FAIL**

### What the repair report claims

`docs/ai-tasks/NOAI-PLAY-P4-REPAIR.md` states all four directions use **real** P2/P3/P4 active cores (shopkeeper direct-trade, end-day, market travel).

### What the source actually does

Helpers `runP2` / `runP3` / `runP4` **do** wrap production cores:

- `runP2` → `parseShopkeeperIntent` + `executeShopkeeperTrade(...)`
- `runP3` → `executeEndDay(reqId, false, harness.deps)`  (**confirmed = false**)
- `runP4` → `executeMarketTravel(reqId, 'south_port', true, harness.deps)`

But in directions A–D, the **active gate holder** is **not** those helpers. It is a deferred no-op:

```text
A active: actionKind 'shopkeeper_trade', callback = await hold; return { ok: true }
B active: actionKind 'end_day',          callback = await hold; return { ok: true }
C active: actionKind 'market_travel',    callback = await hold; return { ok: true }
D active: actionKind 'market_travel',    callback = await hold; return { ok: true }
```

Production cores appear only on the **rejected** side (and for B’s rejected path, only via `runP4`; for C/D rejected paths via `runP2`/`runP3`).

### Required PASS evidence vs observed

| Direction | Required | Observed |
|-----------|----------|----------|
| A | Production **P2 mutation inside held gate** while P4 loses | **No.** Active P2 is labelled no-op. `executeShopkeeperTrade` never enters the held gate. |
| B | Production **P3 mutation inside held gate** while P4 loses | **No.** Active P3 is labelled no-op. |
| C | Production **P4 mutation inside held gate** while P2 loses | **No.** Active P4 is labelled no-op. |
| D | Production **P4 mutation inside held gate** while P3 loses | **No.** Active P4 is labelled no-op. |

### Production core side notes (rejected path quality)

- `executeShopkeeperTrade` is an **in-memory pure trade core**; it does **not** call `commitGameState` / persist canonical files. Even if moved to the active side as written, it would not prove a persisted P2 workspace mutation.
- `runP3` calls `executeEndDay(..., false, ...)`. Production `executeEndDay` returns `CONFIRMATION_REQUIRED` when `confirmed` is false — a **non-mutating** path. So even rejected-side “P3” is not an authoritative confirmed end-day mutation.
- `executeMarketTravel` on rejected sides is real production, but gate busy prevents entry — correct for loser proof, not for active-side mutation proof.

### Classification

This fixture proves **generic same-workspace shared-gate exclusion by `actionKind` label** (held slot blocks concurrent `shared.run` on the same workspace key), plus cross-workspace independence (workspace B can complete while A holds).

It does **not** prove contention while **production P2/P3/P4 authoritative mutations are actively executing**.

Given the shared gate identity is already covered by dedicated gate tests (`test_deterministic_workspace_mutation_gate.js`) and earlier P2/P3 work, generic exclusion is **narrowly useful** for serialization policy — **but it is not equivalent** to the repair report’s “real active mutation” claim.

**Material false claim:** repair report §5 / fixture comments (“real P2 active”, etc.) overstate what the code proves.  
**PASS criterion “no materially false fixture/report claim” is not met.**

---

## 5. Canonical state invariants

### `successful_market_travel` — **mostly proved; world_state is in-memory**

Proved against temporary `game_state.json` + harness counters:

| Invariant | Proof medium | Result |
|-----------|--------------|--------|
| Commit count exactly 1 | harness `commitCount` | asserted |
| Location persisted | disk `game_state.json` reread | `south_port` |
| `elapsedWorldTurns === 0` | receipt field | asserted |
| credits / cargo / food unchanged | disk commerce vs before | asserted |
| world turn unchanged | **in-memory** `h.world.worldTurn` | asserted `7` |
| market / world_state data unchanged | **in-memory** `JSON.stringify(h.world)` vs before | asserted |

**Precision:** harness `loadWorldState` returns an in-memory object. There is **no** temporary `world_state.json` on disk. Market/world-turn invariants are **not** checked against a world-state file.

**Classification:** **documented test limitation**, not an automatic product blocker for travel (P4 travel only writes `game_state` location via `commitGameState`). Still, reports must not imply multi-file world_state disk proof for markets/turns.

### `same_location_rejection` / `unknown_destination_rejection` — **PASS**

- zero commits
- byte-identical `game_state.json`
- location remains `north_farm`

---

## 6. Reload and failure fixtures

### `travel_persistence_failure` — **PASS**

- Production `executeMarketTravel` under shared gate
- Writer fail → `PERSIST_FAILED`, `ok: false`
- Disk location remains `north_farm`
- Later shared-gate request completes → gate released
- Success not reported

### `travel_reload_persistence` — **PASS**

- Travel via `createMarketTravelRequestGate`
- Gate object discarded; **new** gate created
- Disk reread shows `south_port`
- In-memory world loader cleared; result does **not** depend on completed-result cache of the old gate

---

## 7. Focused execution — **ALL PASS**

```text
npm run build:webview
npm run compile
node scripts/test_market_travel_core.js
node scripts/run_noai_play_p4_fixtures.js
node scripts/test_deterministic_workspace_mutation_gate.js
node scripts/test_shopkeeper_direct_trade_core.js
node scripts/test_shopkeeper_repair.js
node scripts/test_end_day_world_progression.js
node scripts/run_noai_play_p3_fixtures.js
node scripts/test_webview_bundle.js
node scripts/test_webview_world_modules.js
```

Result: **all exit 0**. Build dirt from compile/webview restored before report commit.

---

## 8. Canonical gates — **ALL PASS (1.80.0)**

```text
npm run build:webview
npm run compile
node scripts/check_i18n_keys.js
npm run check:symbol-registry
node scripts/check_version_consistency.js
```

Version remains exactly **1.80.0**. Build dirt restored (`webview/script.js`, `webview/style.css`, `webview/vendor/mermaid.min.js`).

---

## 9. Independent full suite

### Environment probe

```text
powershell -NoProfile -Command "Get-Command Get-FileHash"
```

Interactive shell: **available** (`Microsoft.PowerShell.Utility` Function v3.1.0.0).

### Single run

- Command: `npm test` once
- Log: `C:\AI\logs\noai-play-p4-repair-reverify-full-suite.log`
- Manifest: **246** scripts
- Result: **Passed: 244/246**, exit code **1**

### Failed scripts (exact)

1. `[unit] test_antigravity_installer.js`
2. `[unit] test_antigravity_skill_installer.js`

### Diagnostic (each once only; full suite not re-run)

Both fail inside `scripts/install_common.ps1` → `Get-FileSha256` → **`Get-FileHash` not found** when `powershell.exe` is spawned from Node with the inherited environment.

Root cause confirmed:

- Node-spawned Windows PowerShell 5.1 inherits a **PowerShell 7-oriented `PSModulePath`** (includes `...\PowerShell\7-preview\Modules`, etc.).
- Under that path, `Get-Command Get-FileHash` → **NOT_FOUND**.
- With `PSModulePath` restricted to Windows PowerShell module locations, `Get-FileHash` → **FOUND** and `test_antigravity_installer.ps1` **passes**.

This is an **environment interaction** with installer hermetic tests, **not** a P4 travel product regression. Per protocol, full suite was **not** re-run after diagnosis.

**Therefore independent full suite did not achieve 246/246 under the prescribed one-shot `npm test`.**

---

## 10. Limitations

- No live installer, human smoke, live player workspace, or `C:\AI\wt-lorerelay-installer-current`.
- No Antigravity live install, Relay/LLM gameplay, ComfyUI, or image generation.
- Main not modified; no merge.
- World/market turn invariants in P4 fixture harness are in-memory only (no `world_state.json` file).
- Full-suite Get-FileHash failure under Node→`powershell.exe` with PS7-polluted `PSModulePath` (environment).
- Cross-action fixture proves generic shared-gate exclusion only; not production active-mutation contention as claimed by the repair report.

---

## 11. Final verdict rationale

| PASS requirement | Status |
|------------------|--------|
| UI blocker closed | **Yes** |
| Ceremonial duplicate-request fixture closed | **Yes** |
| No materially false fixture/report claim | **No** — “real active P2/P3/P4 mutation” overstated |
| Focused tests pass | **Yes** |
| Canonical gates pass | **Yes** |
| Independent full suite 246/246 | **No** (244/246; env-diagnosed installer hash path) |

**Primary product/documentation defect for this re-verify:** cross-action “real active mutation” claim is not source-true. Fixture labels and repair report must be corrected (and/or active holders must actually enter production authoritative paths) before PASS.

**Secondary:** one-shot `npm test` did not clear 246 under this shell inheritance; installer failures are environmental and reproducible with polluted `PSModulePath`.

---

## Identity block

| Field | Value |
|-------|-------|
| `origin/main` | `b5a5789e3e96991cd298eed7024589acfccbebcd` |
| Candidate / repair tip | `0ee1fc260837ca07ae08bd231563ed8a707089ea` |
| Repair lineage | `645f044` → `c9c9fcf` → `a2d3483` → `0ee1fc2` on P4 parent `9469040` |
| Version | `1.80.0` |
| Full suite | 244/246 (log path above) |
| Verdict | **`NOAI_PLAY_P4_REPAIR_REVERIFY_REQUIRED`** |
