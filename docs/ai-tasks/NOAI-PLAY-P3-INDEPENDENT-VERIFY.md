# NOAI-PLAY-P3 Independent Adversarial Verify

- **AI:** Grok  
- **Model:** Grok 4.5 (High)  
- **Role:** Independent adversarial verification (no implementation changes, no merge)  
- **Date:** 2026-07-12 (JST)  
- **Worktree:** `C:\AI\wt-noai-play-p3-verify` @ tip `aab29b8`  
- **Not run:** Antigravity, ComfyUI, installer, live workspace, Relay/LLM gameplay  

## Final verdict

```text
NOAI_PLAY_P3_REPAIR_REQUIRED
```

**Primary blocker:** P2 shopkeeper and P3 end-day use **separate** workspace request gates with **no shared same-workspace mutation lock**. Concurrent host protocol execution in one workspace can interleave writes to the same canonical `game_state` / `world_state` files (last-writer-wins / split persistence risk). Webview modal exclusivity is not a host guarantee.

---

## 1. Integrity

| Item | Expected | Observed | Result |
| --- | --- | --- | --- |
| `origin/main` | `b7fccbeab75e2c86fe0a5b780069f6b9bbd66880` | exact (end of verify still this tip) | MATCH |
| Main moved? | no | no | NO |
| Implementation | `5a4853170f746dccaa9a95630d485272070b3d28` | parent = main | MATCH |
| Publish revalidation | `aab29b8ebeb600127638db1bcbd61dd4501fc3ab` | parent = implementation; **docs-only** | MATCH |
| Shape | main + 2 | `0 2` | MATCH |
| Version | `1.79.0` | package / lock / badges / CHANGELOG / VERSION_TRUTH | MATCH |

### Complete implementation touch set (`5a48531`)

```text
docs/ai-tasks/NOAI-PLAY-P3-END-DAY-WORLD-PROGRESSION.md
docs/generated/SYMBOL_REGISTRY.md
docs/generated/symbol_registry.json
scripts/run_all_tests.js
scripts/run_noai_play_p3_fixtures.js
scripts/test_end_day_world_progression.js
src/endDayRequestGate.ts
src/endDayWorldProgression.ts
src/extension.ts
src/webviewHandlers.ts
webview/modules/85-world.js
webview/script.js
```

Publish-revalidation adds only `docs/ai-tasks/NOAI-PLAY-P3-PUBLISH-REVALIDATION.md`.

No live state / package archives / unrelated runtime files. Committed `webview/script.js` matches `npm run build:webview` after EOL normalization (`post-build match true`). Extension loads `script.js`.

---

## 2. Document accuracy (installer failure narrative)

| Source | Claim |
| --- | --- |
| `NOAI-PLAY-P3-END-DAY-WORLD-PROGRESSION.md` | 242/244 failures due to **GitHub network** (`git fetch origin` blocked) |
| `NOAI-PLAY-P3-PUBLISH-REVALIDATION.md` | Same two tests fail at **`git branch --show-current`** with **`fatal: detected dubious ownership`**, **before** network |

**Independent classification:** **report-only correction required** (implementation not blocked).

This verifier reproduced a **Git-safe** full suite with process-scoped:

```text
GIT_CONFIG_COUNT=1
GIT_CONFIG_KEY_0=safe.directory
GIT_CONFIG_VALUE_0=C:/AI/wt-noai-play-p3-verify
```

(no global git config mutation). Under that environment:

- child `git branch --show-current` succeeds  
- `npm test` → **244/244**  

So the later revalidation’s ownership diagnosis is the accurate failure mode on isolated worktrees; the first report’s “network blocked” framing is **incorrect for the observed stack** and should not be preserved as truth. This is **not** an implementation blocker for P3 logic, but contradictory durable docs need the revalidation record as authority.

---

## 3. Exact one-turn authority — PASS (within P3 alone)

Call chain:

```text
endDayPreview → previewEndDay (read-only)
endDayCommit → endDayRequestGate.run → executeEndDay(confirmed)
  → re-read rules/forge/world/game
  → runBulkWorldSimulation(steps:1, maxSteps:1)
       afterStep → applyLivingWorldAfterSimulationStep
         (Living World cadence / market recovery when commerce on)
  → dual-write game_state (worldTurnAtLastSync) + world_state (+ NPC registry when enabled)
  → receipt only if persistence ok
```

Focused harness (`test_end_day_world_progression.js`) + fixture runner prove for turns **0, 99, 100, 999999**:

- preview: zero bulk/market/game/world calls  
- unconfirmed: `CONFIRMATION_REQUIRED`, zero sim  
- commit: `bulk===1`, market after-step `===1`, `worldTurn after = before + 1`  
- not +0 success; not +2 from single request  

Production authority is `runBulkWorldSimulation`, not a parallel fake tick.

---

## 4. Request idempotency (P3 gate) — PASS

`createEndDayRequestGate` mirrors P2 gate semantics:

| Case | Result |
| --- | --- |
| same id while pending | one execute; shared promise | PASS |
| replay completed | no second advance | PASS |
| different id while pending | `BUSY` | PASS |
| new id after complete | next day executes | PASS |
| missing/malformed requestId | host rejects before gate (no trade) | PASS |
| workspace isolation | separate maps | PASS |
| cache cap 32 | present | PASS |
| panel dispose | `endDayRequestGate.dispose()` | PASS |
| stale UI result | `_endDayPendingRequestId` correlation | PASS |

---

## 5. Critical cross-action concurrency — **BLOCKER**

### Architecture fact

```text
shopkeeperRequestGate = createShopkeeperRequestGate(32)  // P2 only
endDayRequestGate     = createEndDayRequestGate(32)      // P3 only
```

No shared workspace mutation lock, no cross-protocol serialization in `extension.ts`.

### Behavioral proof (host-level gates, not webview)

```text
A. P2 buy pending on ws1 → P3 end-day on ws1 → P3 executes (ok=true, p3Exec=1)
B. P3 end-day pending on ws → P2 sell on ws → P2 executes (ok=true, p2n=1 while p3n=1)
```

Therefore same-workspace concurrent protocol execution **can** run P2 trade mutation (`executeLivingWorldDirectTrade` → schedule/flush commerce dual-write) **and** P3 end-day mutation (`executeEndDay` → dual-write game+world, market recovery) without host serialization.

Both touch **game_state** and **world_state** (and markets). Risks:

- last-writer-wins overwrites of credits/cargo vs worldTurn  
- market stock recovery vs trade stock deltas lost/reordered  
- mismatched game/world pair on disk  
- contradictory dual receipts both `ok: true`  
- split-brain dual-write under interleaving  

**Webview cannot close this:** separate dialogs / z-index do not serialize host handlers.

**Required class:** `NOAI_PLAY_P3_REPAIR_REQUIRED`  
**Not implemented in this verify.**

Separate workspaces remain independent (per-gate maps) — PASS for F.

---

## 6. Persistence honesty (P3 alone) — PASS

`executeEndDay` uses `executeCrossFileDualWrite` with try/catch writers; failures → `PERSIST_FAILED` / `PARTIAL_PERSIST_FAILED`; no success/`persisted:true` on failure. Fixture `persistence_failure_day` passes. NPC registry failure when required fails the receipt path (`npcOk`). No automatic retry. Replay of same failed requestId returns cached failure without second advance. Explicit non-claim of rollback matches dual-write diagnostics.

Empty no-op: if dual-write never runs due to earlier failure, no success receipt.

---

## 7. Refresh-after-persistence — PASS (with residual copy risk)

Counterexample path is implemented:

1. `executeEndDay` succeeds (disk written)  
2. gate caches success  
3. `pushWorldViewToWebview` in try/catch; on throw sets `response.refreshFailed = true`  
4. still posts `ok: true` with receipt  

UI (`finishEndDay`): success copy **「一日が終わりました…」** + optional **「表示の更新を確認できなかったため、画面を再読込してください。」**

| Gate | Result |
| --- | --- |
| Does not imply day rolled back | PASS |
| Encourages **再読込** (display), not **再試行** of end-day | PASS (wording) |
| completed requestId cached for replay without second day | PASS |
| Distinguishes write-ok/display-fail from write-fail | PASS (success + refreshFailed vs failure message) |

**Residual:** a user who ignores the text and opens a **new** confirm still advances the next day (correct new request). Not a false rollback.

---

## 8. Receipt accuracy — PASS (focused)

Receipt fields: turn before→after, location, quiet flag, eventCount/categories from real `stepEvents`, marketChanges from before/after afterStep markets (recovery path), bounded resourceChanges (food only when changed), `requestId`, `persisted: true` only on success. Quiet day valid. No AI prose in host receipt.

---

## 9. Debug fixtures — PASS

`node scripts/run_noai_play_p3_fixtures.js` → all five scenarios passed:

`quiet_day`, `market_recovery_day`, `event_emission_day`, `duplicate_request_day`, `persistence_failure_day`

Isolated temp workspaces; compact JSON evidence; no live user path. Path-safety overclaim for Windows junctions **not** fully proven here — residual only.

---

## 10. P2 regression — partial PASS

P2 focused tests pass (`test_shopkeeper_direct_trade_core`, `test_shopkeeper_repair`). Combined live loop (buy → end-day → sell on real disk) not fully automated beyond fixtures; P3 fixtures cover end-day isolation. **Cross-action host concurrency remains the regression risk** (§5). No AI/Relay/GM path in P3 host imports (static guard).

---

## 11. UI / shipped bundle — PASS

Committed/built bundle contains: 一日を終える, preview/confirm/processing, quiet vs event success, requestId correlation, stale ignore, Esc/focus, `width:min(100%,400px)`, `overflow-wrap:anywhere`, `refreshFailed` append. 暮らす (P2) retained. 証らす absent.

---

## 12. Full suite (Git-safe environment)

**Method (process-scoped only, no global git config):**

```text
GIT_CONFIG_COUNT=1
GIT_CONFIG_KEY_0=safe.directory
GIT_CONFIG_VALUE_0=C:/AI/wt-noai-play-p3-verify
```

Child `git` inherits env → installer tests pass ownership probe.

| Gate | Result |
| --- | --- |
| focused P3 / fixtures / P2 | PASS |
| `npm run build:webview` | PASS; bundle matches HEAD |
| `npm run compile` | PASS |
| i18n / symbol-registry / version | PASS |
| `npm test` **once** | **244/244** |

---

## Blockers vs residuals

### Blocker (must repair)

1. **Shared same-workspace serialization between P2 and P3** (and any future NOAI mutation hosts): host-level lock or unified request gate so concurrent `shopkeeperDirectTrade` and `endDayCommit` cannot interleave dual-writes.

### Residuals (non-blocking alone)

1. First P3 durable report’s “network blocked” installer story — superseded by publish-revalidation ownership truth.  
2. NPC write nested inside world writer without independent dual-write leg — partials possible; no rollback (documented).  
3. Windows junction fixture path safety not deeply proven.  
4. Manual multi-step human UI a11y (reduced-motion CSS for inline dialog) not exhaustively re-audited beyond code presence.

---

## Verdict rationale

P3’s one-turn authority, idempotency, persistence honesty, refresh-after-persist semantics, fixtures, bundle, and full suite under a Git-safe env are solid. **However**, the explicit critical gate on **P2+P3 concurrent host mutation** fails: separate gates allow simultaneous canonical writes in one workspace. That is sufficient for:

```text
NOAI_PLAY_P3_REPAIR_REQUIRED
```
)
