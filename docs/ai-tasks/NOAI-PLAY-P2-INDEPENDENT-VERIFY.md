# NOAI-PLAY-P2 Independent Adversarial Verify

- **AI:** Grok  
- **Model:** Grok 4.5 (High)  
- **Role:** Independent adversarial verification (no implementation changes, no merge)  
- **Date:** 2026-07-12 (JST)  
- **Worktree:** `C:\AI\wt-noai-play-p2-verify` @ tip `fc7b496`  
- **Not run:** Antigravity, ComfyUI, installer, network services, LLM gameplay, live workspaces  

## Final verdict

```text
NOAI_PLAY_P2_REPAIR_REQUIRED
```

---

## Candidate identity

| Item | Expected / observed | Result |
| --- | --- | --- |
| `origin/main` | `6d97673dd7f48baf48eb1cf0859fac06b33217da` | **MATCH** (end of verify still this tip) |
| Implementation | `a24af35f84601d6b01f0a1f61f7fdbabd1f17dd6` | **MATCH** — parent = main |
| Report | `fc7b496a0ac5f0f05e71b1bf78a8d9d26f3e79d6` | **MATCH** — parent = implementation |
| Shape | main + 2 | **MATCH** (`0 2`) |
| Version | `1.78.2` | **MATCH** (no package bump) |
| Main moved? | no | **NO** |

### Implementation touch set (`a24af35`)

```text
docs/generated/SYMBOL_REGISTRY.md
docs/generated/symbol_registry.json
scripts/run_all_tests.js
scripts/test_shopkeeper_direct_trade_core.js
src/extension.ts
src/shopkeeperDirectTradeCore.ts
src/webviewHandlers.ts
webview/modules/85-world.js
```

Report commit is docs-only (`NOAI-PLAY-P2-SHOPKEEPER-DIRECT-TRADE.md`).

**Not** in the implementation commit: `webview/script.js` (extension loads this via `webviewAssetUri('script.js')`). After local `npm run compile`, the **built** bundle contains shopkeeper; **committed** `HEAD:webview/script.js` does **not**. That is a ship-path integrity defect (see §Blockers).

No live workspace / `.tmp` / `node_modules` committed. Symbol Registry check: up to date (4012 entries). No accidental package/version/Skill changes.

---

## 1–2. Report accuracy (report-only vs implementation)

| Report claim | Reality | Class |
| --- | --- | --- |
| Product name **「証らす」** | UI button, dialog `aria-label`, report title use **証らす**; product intent from NOAI-PLAY-001 is **暮らす** | **Report + UI copy defect** (not production logic) |
| `commerceCore.applyTradeOps` authority | Runtime chain: `executeLivingWorldDirectTrade` → `executeDirectTrade` → `parseTradeOps` + **`applyTradeOps`** | Accurate |
| `executeDirectTrade` / `executeLivingWorldDirectTrade` | Host shopkeeper path uses **`executeLivingWorldDirectTrade` only**; pure core helper `executeShopkeeperTrade` also calls `executeDirectTrade` | Accurate with nuance |
| Snapshot “does not own price math” | `buildShopkeeperSnapshot` **does** recompute `buyPrice` / invents `sellPrice = floor(buy*0.8)` (production sell uses **same** `unitPrice` as buy via `quoteMarketPrice`) | **Report overclaim** / residual duplicated quote math (not on host commit path) |
| Persistence failure cannot show success | Pure-core test with `persistenceOk=false` yes; **host always posts `ok: true` + `persisted: true` after flush without inspecting flush outcome** | **Implementation blocker** |
| Concurrency: confirm disabled + ignore repeat | Webview `_shopkeeperInFlight` only; **host has no mutex / request id** | **Implementation blocker** |
| Success copy 「確定 — 世界に書き込まれました」 | Actual UI: `確定・状態に書き込まれました: …` | Report wording mismatch (minor) |
| `npm test` 242/242 | This verify’s **single** full run: **241/242** (`test_runtime_accepted_replay_guard.js` flaked once; re-run alone PASS; outside shopkeeper touch-set) | **Do not accept “all green” uncritically** |

---

## 3. Trust boundary — PASS (protocol inputs)

`parseShopkeeperIntent` keeps only:

`op | marketLocationId | commodityId | qty`

Adversarial injection of `price`, `total`, `creditsBefore/After`, `cargo*`, `stock*`, `success`, `receiptId`, `eventId`, extra keys → stripped. Host passes only that intent into `executeLivingWorldDirectTrade`, which re-reads forge/game_state/world_state and injects **host** `currentLocationId`.

**PASS** for untrusted field isolation.

---

## 4. Production authority — mostly PASS

**Runtime chain (host):**

```text
webview shopkeeperDirectTrade
  → webviewHandlers case
  → handleShopkeeperDirectTrade
  → parseShopkeeperIntent
  → executeLivingWorldDirectTrade(intent)
       → load rules/forge/gameState/worldState
       → executeDirectTrade(..., { ...intent, currentLocationId })
            → applyTradeOps / applyTradeOp production validation
       → scheduleCommercePersist(...)
  → flushScheduledCommercePersist()
  → pushWorldViewToWebview
  → shopkeeperDirectTradeResult
```

Price, stock, credits, cargo, capacity, location: production path.  
Receipt totals on host use `result.trade.totalCost / totalRevenue` from production.

**Residual:** `buildShopkeeperSnapshot` duplicates unit-price formula and a **non-production** sell discount (`* 0.8`). Not used by host commit, but contradicts report “does not own price math” and can mislead future callers.

---

## 5. Snapshot safety — PASS for local-only

`buildShopkeeperSnapshot` only enumerates `forge.markets` entry matching `currentLocationId` and that market’s `commodityIds`. No remote market list. Undiscovered remotes not included.

UI dialog builds from `_worldViewMsg.livingWorldMarkets` filtered to `currentLocationId` only — same locality contract as existing Commerce panel quotes.

---

## 6. Review vs commit — PASS (UI model) + revalidation PASS

- First interaction: **確認** fills review text with **「確認（未確定）」** and enables 確定; no host message.  
- 確定 posts intent only; host revalidates.  
- Counterexample: after “preview” snapshot, set stock→0 then commit → **INSUFFICIENT_STOCK** (current state wins). Credits→0 similarly.

---

## 7. Success and persistence — **REPAIR REQUIRED**

What works:

- Successful trades go through production execution and schedule dual-file commerce persist.  
- Host calls `flushScheduledCommercePersist()` before posting success (flush is synchronous scheduler flush).  
- Pure-core `persistenceOk=false` path correctly returns non-success (test-only parameter).

What fails the gate:

1. **Host never reads flush/write outcome.** `flushScheduledCommercePersist` voids; dual-write failures only `console.error` + split-brain risk record. Handler still posts:

   ```ts
   ok: true, receipt: { ..., persisted: true }
   ```

2. Therefore a failed disk write can still present authoritative success copy — **memory/schedule success is treated as world-written success**.

3. Success string is not the report’s exact 「確定 — 世界に書き込まれました」, but more importantly it asserts write completion without proof.

**Blocker.**

---

## 8. Rejections — mostly PASS

| Code | Evidence | Result |
| --- | --- | --- |
| INSUFFICIENT_CREDITS | core + production | PASS |
| INSUFFICIENT_CARGO | core + production | PASS |
| INSUFFICIENT_STOCK | stale stock→0 counterexample | PASS |
| CARGO_CAPACITY | capacity-full cargo probe | PASS |
| NOT_TRADED_HERE | spice @ north_farm | PASS |
| INVALID_QTY | qty 0 / parse edges → production floor/range | PASS |
| WRONG_LOCATION | market ≠ host location | PASS |

Japanese map present with nextStep. Rejected path does not set `ok: true`.

**Notes:** qty `9999` hits production `qty > 999` → INVALID_QTY before stock. Fractional qty accepted by parse (`1.5`) then floored by production. Empty/null qty becomes `0` via `Number`.

Existing row-level Commerce UI (non-shopkeeper) still present and untouched in behavior.

---

## 9. Concurrency — **REPAIR REQUIRED (critical)**

| Layer | Defense |
| --- | --- |
| Webview | `_shopkeeperInFlight` + disable confirm/review during wait |
| Host | **None** — every accepted `shopkeeperDirectTrade` message runs a full trade |

Proved: two sequential `executeDirectTrade` buys from a warm state both succeed (stock/credits both change twice). Duplicate protocol messages (double-click after in-flight reset, Enter spam after result, automated double post) **can apply two accepted trades**.

No receipt idempotency key / host-side single-flight / request correlation id.

Webview-only guard is **not** sufficient. **Blocker.**

---

## 10. Protocol pairing — PASS (structure)

| Direction | Message | Locations |
| --- | --- | --- |
| webview→host | `shopkeeperDirectTrade` | `85-world.js` send; `webviewHandlers` receive |
| host→webview | `shopkeeperDirectTradeResult` | `extension.ts` send; `85-world.js` receive |

Symbol Registry regenerated with both sides + pure-core symbols. Wrong-side pairing pattern follows existing host-webview conventions (send site + receive site registered).

**Residual:** result handler does not correlate request ids; any `shopkeeperDirectTradeResult` updates the open dialog (stale late response could decorate a newer review). Secondary to host double-apply.

---

## 11. No-AI guarantee — PASS for this slice

Shopkeeper block has no Relay/ComfyUI/LLM/narration/GM turn invocation. Scope limited to local market direct trade. Copy overstates product name (**証らす** vs 暮らす) but correctly claims AI is not called.

---

## 12. UI / accessibility — partial PASS (static)

Dialog: `role=dialog`, `aria-modal`, Esc close, focus restore to initiator, `width:min(100%,460px)`, number input, radio buy/sell, confirm disabled until review.

Gaps: no reduced-motion-specific styles in inline dialog CSS; limited Enter-to-commit wiring; success/reject styling is plain text in review line (no strong success/fail visual system). Existing Commerce buy/sell row buttons remain.

---

## 13. Tests

| Command | Result |
| --- | --- |
| `node scripts/test_shopkeeper_direct_trade_core.js` | PASS |
| `node scripts/test_living_world_commerce_ui_core.js` | PASS |
| `node scripts/test_gameplay_slice1_decision_surface.js` | PASS |
| `npm run compile` | PASS |
| `node scripts/check_i18n_keys.js` | PASS |
| `npm run check:symbol-registry` | PASS |
| `npm test` (**once**) | **241/242** — only `test_runtime_accepted_replay_guard.js` (re-run alone PASS; flake / out of touch-set) |

Focused tests **do not** cover host double-message concurrency or host flush-failure UX (only pure-core `persistenceOk` flag). Static UI contracts do not substitute for those gates.

---

## Blockers (must repair)

1. **Host concurrency:** accept at most one in-flight shopkeeper trade (or idempotent receipt key); do not trust webview guard alone.  
2. **Persistence honesty:** only emit authoritative success after flush/write outcome is known success; never hard-code `persisted: true` on failed dual-write.  
3. **Committed webview bundle:** regenerate and commit `webview/script.js` (or document/enforce package-time build so extension never ships modules-only shopkeeper). Current `HEAD` script lacks `shopkeeperDirectTrade`.  
4. **Copy:** replace **証らす** → **暮らす** in UI + report (report-only ok for docs follow-up if UI fixed in same repair).

## Non-blocking residuals

- `buildShopkeeperSnapshot` sellPrice `* 0.8` vs production same-unitPrice.  
- Report success string wording.  
- qty parse accepts floats/negatives (production later rejects).  
- Full suite single-run flake on replay guard.  
- No host request/response correlation id.

---

## Verdict rationale

Integrity of branch topology and version is fine. Trust-boundary stripping and production `applyTradeOps` path are largely sound. **Critical product gates fail:** host can double-apply trades, and success can be shown without verified persistence. Bundle/copy defects compound ship risk. Therefore:

```text
NOAI_PLAY_P2_REPAIR_REQUIRED
```
)
