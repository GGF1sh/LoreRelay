# NOAI-PLAY-P2 Repair Verify (narrow)

- **AI:** Grok  
- **Model:** Grok 4.5 (High)  
- **Role:** Narrow repair re-verification (no implementation changes, no merge)  
- **Date:** 2026-07-12 (JST)  
- **Worktree:** `C:\AI\wt-noai-play-p2-repair-verify` @ `69cf1d9`  
- **Prior independent review:** `dae7666` (`NOAI_PLAY_P2_REPAIR_REQUIRED`)  

## Final verdict

```text
NOAI_PLAY_P2_REPAIR_VERIFY_PASS
```

---

## 1. Integrity

| Item | Expected | Observed | Result |
| --- | --- | --- | --- |
| `origin/main` | `6d97673dd7f48baf48eb1cf0859fac06b33217da` | exact match end-to-end | MATCH |
| Main moved? | no | tip still `6d97673` | NO |
| Original implementation | `a24af35` | parent of report `fc7b496` | MATCH |
| Original report | `fc7b496` | parent of repair `3a0b410` | MATCH |
| Repair implementation | `3a0b410` | `fix: make shopkeeper trades idempotent and persistence-honest`; parent = `fc7b496` | MATCH |
| Repair report | `69cf1d9` | docs-only `NOAI-PLAY-P2-REPAIR.md`; parent = `3a0b410` | MATCH |
| Shape `main...repair` | main + 4 | `0 4` (`a24`→`fc7`→`3a0b`→`69cf`) | MATCH |
| Version | `1.78.2` | unchanged | MATCH |

### Repair implementation touch set (`3a0b410`)

```text
docs/ai-tasks/NOAI-PLAY-P2-SHOPKEEPER-DIRECT-TRADE.md   (copy/docs fix in same repair)
docs/generated/SYMBOL_REGISTRY.md / symbol_registry.json
scripts/run_all_tests.js
scripts/test_shopkeeper_repair.js
src/extension.ts
src/livingWorldCommercePersist.ts
src/shopkeeperDirectTradeCore.ts
src/shopkeeperRequestGate.ts   (NEW)
webview/modules/85-world.js
webview/script.js              (shipped bundle regenerated)
```

No live workspace / runtime artifacts. `webview/script.js` content matches `npm run build:webview` after CRLF normalization (`post-build match true`). Extension loads `webviewAssetUri('script.js')`.

Prior independent review commit `dae7666` lives on the verify branch only (not an ancestor of the repair stack) — expected.

---

## Prior blockers → repair mapping

| Prior blocker | Repair | Status |
| --- | --- | --- |
| Host double-apply / webview-only guard | `createShopkeeperRequestGate` + host `shopkeeperRequestGate.run(workspaceKey, requestId, …)` | **Closed** |
| Success without observed persist | `flushScheduledCommercePersist()` returns dual-write outcome; host requires `ok && gameAttempted && gameOk && worldAttempted && worldOk` before success | **Closed** |
| Committed `script.js` missing shopkeeper | bundle committed with 暮らす / requestId / correlation | **Closed** |
| 証らす copy | UI + report + bundle use **暮らす**; 証らす absent | **Closed** |
| Snapshot `floor(buy*0.8)` | `quoteMarketPrice` single `unitPrice` | **Closed** |

---

## 2. Host idempotency

`src/shopkeeperRequestGate.ts` is pure host-side (not webview). Behavioral proof via `scripts/test_shopkeeper_repair.js` + multi-workspace probe:

| Case | Result |
| --- | --- |
| **A** same `requestId` twice while pending | **one** `execute`; both awaiters share promise | PASS |
| **B** both callers get same completed result | `deepStrictEqual` | PASS |
| **C** completed `requestId` replay | no second execute; returns cached result | PASS |
| **D** different id while pending | `TRADE_IN_PROGRESS`, no execute | PASS |
| **E** different id after completion | executes normally | PASS |
| **F** cache bounded | `maxCompletedPerWorkspace` (default 32, test uses 2; oldest eviction) | PASS |
| **G** dispose / clear | `dispose()` on panel dispose; `clearWorkspace` removes state so same id can re-exec | PASS |
| **H** cross-workspace | workspace B runs while A pending (isolated maps) | PASS |

Webview `_shopkeeperInFlight` remains a UX guard only; **host enforces** single-flight + replay.

---

## 3. Response correlation

| Claim | Evidence | Result |
| --- | --- | --- |
| `requestId` on request + result | postMessage includes `requestId`; result objects always carry it | PASS |
| Malformed / missing id cannot trade | host regex `^[A-Za-z0-9_-]{8,128}$`; empty → reject, no gate execute | PASS |
| Stale/late result ignored | `finishShopkeeperTrade`: `msg.requestId !== _shopkeeperPendingRequestId` → return | PASS |
| BUSY tied to request | gate returns `requestId` + `TRADE_IN_PROGRESS` for that id | PASS |
| Replay preserves identity | completed map returns original result object | PASS |

---

## 4. Persistence honesty

`flushScheduledCommercePersist()` now returns `CrossFileDualWriteOutcome` from the dual-write path (`lastCommerceFlushOutcome`), including exception paths in writeGame/writeWorld (`try/catch` → `false`).

Host success predicate:

```text
persistence.ok
  && gameAttempted && gameOk
  && worldAttempted && worldOk
```

| Case | Observed (repair tests + code) | Result |
| --- | --- | --- |
| **A** both writes OK | `ok: true` | PASS |
| **B** game fails | `ok: false`, partial when world ok | PASS |
| **C** world fails | `ok: false`, partial when game ok | PASS |
| **D** both fail | `ok: false`, not partial | PASS |
| **E** partial | `PARTIAL_PERSIST_FAILED` | PASS |
| **F** failure has no `persisted: true` | failure return is rejection-only (+ optional `persistence` diagnostics) | PASS |
| **G** no 確定 success copy on fail | UI only uses 確定 string when `msg.ok` | PASS |
| **H** outcome observed, not schedule-inferred | outcome set inside dual-write callback; empty flush cannot satisfy `gameAttempted && worldAttempted` | PASS |
| **I** other callers ignore return | return type additive; existing flush call sites remain compatible | PASS |

Empty flush default `ok: true` with `gameAttempted: false` **cannot** pass the host success predicate — no false “written” success.

---

## 5. Shipped bundle

Committed + built `webview/script.js` contains:

- **暮らす** entry button / titles  
- `requestId` submission  
- `_shopkeeperInFlight`  
- `_shopkeeperPendingRequestId` + stale ignore  
- `shopkeeperDirectTrade` / result handling  

`npm run build:webview` → content equal to `HEAD:webview/script.js` after newline normalize. Extension loads `script.js`.

---

## 6. Copy / quote / quantity

| Check | Result |
| --- | --- |
| 証らす absent (UI module, script.js, shopkeeper docs) | PASS |
| 暮らす present | PASS |
| `quoteMarketPrice` for snapshot unit price | PASS |
| no `floor(buy * 0.8)` | PASS |
| Preview uses World-view `unitPrice` (production surface); commit revalidates via `executeLivingWorldDirectTrade` | PASS |
| qty: integer 1..999 only at parse | PASS (strings/fractions/0/neg/NaN/Inf/1000 → undefined) |
| Production still revalidates | PASS |

---

## 7. Regression

Rejection codes still non-mutating failures (core path):

`INSUFFICIENT_CREDITS`, `INSUFFICIENT_CARGO`, `INSUFFICIENT_STOCK`, `CARGO_CAPACITY`, `NOT_TRADED_HERE`, `WRONG_LOCATION`; invalid qty blocked at parse and/or production.

Existing Commerce UI path (`livingWorldDirectTrade`) unchanged. No AI/Relay/GM/narration/ComfyUI in shopkeeper path. Local market filter (`currentLocationId` only) intact.

---

## 8. Tests

| Command | Result |
| --- | --- |
| `node scripts/test_shopkeeper_repair.js` | PASS (gate A–E + persist matrix + copy/bundle contracts) |
| `node scripts/test_shopkeeper_direct_trade_core.js` | PASS |
| `node scripts/test_living_world_commerce_ui_core.js` | PASS |
| `node scripts/test_gameplay_slice1_decision_surface.js` | PASS |
| `node scripts/test_commerce_persist_debounce.js` | PASS |
| `node scripts/test_commerce_flush_gm_timing.js` | PASS |
| `npm run build:webview` | PASS; bundle matches HEAD |
| `npm run compile` | PASS |
| `node scripts/check_i18n_keys.js` | PASS |
| `npm run check:symbol-registry` | PASS |
| `npm test` (**once**) | **242/243** |

### Full-suite residual (not a repair regression)

Single mandated `npm test` failed only:

```text
[unit] test_runtime_accepted_replay_guard.js: exit 1
```

Focused re-run afterward: **PASS** (same intermittent host flake class as prior NOAI-PLAY-P2 verify). Outside repair touch-set. Expected green count is 243/243 when that flake is absent; **repair-focused suite and all shopkeeper/commerce gates are green**.

---

## Residuals (non-blocking)

1. Suite count 242/243 on the one full run due to unrelated replay-guard flake.  
2. `clearWorkspace` is available; panel dispose calls full `dispose()` (clears all workspaces) rather than per-path clear on every workspace switch — acceptable.  
3. In-memory trade application before a failed dual-write remains a general commerce dual-write property; UI no longer claims success when disk outcome fails.

---

## Verdict rationale

All four prior blockers are closed with host-side evidence: request-id gate, observed flush outcome, shipped 暮らす bundle, production quotes and integer qty. Regression surface for commerce rejections and no-AI scope holds. Full suite has one unrelated flake on the mandated single run; repair itself is verified.

```text
NOAI_PLAY_P2_REPAIR_VERIFY_PASS
```
)
