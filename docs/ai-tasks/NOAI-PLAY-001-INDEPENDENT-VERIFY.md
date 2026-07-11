# NOAI-PLAY-001 Independent Adversarial Product Verify

- **AI:** Grok  
- **Model:** Grok 4.5 (High)  
- **Role:** Independent adversarial **product** verification (no implementation changes, no merge, no production edits)  
- **Date:** 2026-07-12 (JST)  
- **Worktree:** `C:\AI\wt-noai-play-001-verify` @ tip `3fdb26b`  
- **Not run:** Antigravity, ComfyUI, LLM gameplay, live user workspaces  

## Final verdict

```text
NOAI_PLAY_001_VERIFY_PASS
```

---

## Candidate identity (from origin)

| Item | Value |
| --- | --- |
| `origin/main` | `6d97673dd7f48baf48eb1cf0859fac06b33217da` (**MATCH**; tip subject `docs: record NOAI-SOAK-001 integration`) |
| Branch | `origin/ux/NOAI-PLAY-001-deterministic-action-shell-prototype` |
| **Prototype commit** | `5741c47` — `ux(noai-play): 「暮らす」deterministic action shell high-fidelity prototype` |
| **Report commit** | `3fdb26b7ff917c06a2bbf7e4233cbc50b7a8f070` — `docs(noai-play): NOAI-PLAY-001 report — audit, source map, and production slices` |
| Shape `main...candidate` | `0 2` |
| Main moved? | **NO** (still `6d97673` at end of verify) |

Branch **was pushed** (not `NOAI_PLAY_001_CANDIDATE_NOT_PUSHED`).

---

## 1. Integrity

| Check | Result |
| --- | --- |
| Candidate based on expected main | **PASS** (`5741c47^` = `6d97673`) |
| Exactly **7** docs/prototype assets | **PASS** (see list) |
| No `src/**`, production webview, package, version, generated registry, Skill | **PASS** (diff name-only empty for those) |
| Screenshots from actual prototype | **PASS** (desktop = 薬師 layout; narrow = 語りの後で / ガレン・第10月30日・300刻 — matches `sample-data.json` + rendered chrome) |
| Report matches files/behavior | **PASS** with residuals in §Residuals |

### Complete file list (`main...HEAD`)

```text
docs/ai-tasks/NOAI-PLAY-001-DETERMINISTIC-ACTION-SHELL-PROTOTYPE.md
docs/assets/noai-play-shell-desktop.jpg
docs/assets/noai-play-shell-narrow.jpg
docs/prototypes/noai-play-shell/index.html
docs/prototypes/noai-play-shell/prototype.js
docs/prototypes/noai-play-shell/sample-data.json
docs/prototypes/noai-play-shell/styles.css
```

Prototype header/footer and `prototype.js` banner state explicitly: **no production engine wiring**; numbers replay from `sample-data.json`.

---

## 2. Repository reality audit (independent — not trust the report)

Verified against `origin/main` sources (same base as candidate). Classification uses the candidate’s own three-way lens: **AVAILABLE NOW** (logic + applyer on main) / **SMALL ADAPTER** (parts exist; player host command missing) / **FUTURE**.

| Capability | Independent finding | Report claim | Agreement |
| --- | --- | --- | --- |
| Direct trade buy/sell | `commerceCore.applyTradeOp` + `livingWorldCommerceUiCore.executeDirectTrade` + host `livingWorldCommerceUi.ts` | AVAILABLE NOW | **Agree** |
| Rejection codes | `INSUFFICIENT_CREDITS/CARGO/STOCK`, `CARGO_CAPACITY`, `NOT_TRADED_HERE`, `INVALID_QTY`, plus `WRONG_LOCATION` on execute path | Listed | **Agree** |
| Market opportunity surface | `buildCommerceDecisionSurface` + `travelPreview` + evidence + FoW gating | AVAILABLE NOW (read) | **Agree** |
| Travel **plan** | `transportCore.planTravel` (days/foodCost) | AVAILABLE NOW (compute) | **Agree** |
| Travel **commit** | location patch + food + elapsed turns + sim — no single player host command | ADAPTER | **Agree** |
| Time passage | `narrativeTimePassageCore.clampElapsedWorldTurns` + travel food helpers | ADAPTER | **Agree** |
| World simulation | `worldSimBulkCore` + market recovery; SOAK 1000-turn proven | AVAILABLE NOW (engine) | **Agree** |
| Guild ops | `guildCore` weekly_commit / resolve_request / assign_party parsers+applyers | AVAILABLE NOW (core) | **Agree with caveat**† |
| Domain ops | `domainCore` monthly_commit / audience_ruling / dispatch_officer + catalog | AVAILABLE NOW (core) | **Agree with caveat**† |
| Vehicle ops | `vehicleOpsCore.applyVehicleOps` | AVAILABLE NOW | **Agree** (gated by system flag; **no scenario uses vehicles**) |
| Discoveries | `validateSellDiscoveryTrade` | AVAILABLE NOW | **Agree** (**no scenario uses discoveries**) |
| Campaign resources | `applyCampaignResourceOps` | ADAPTER (need allowlist recipes for gather/craft) | **Agree** |
| NPC bonds | `detectPlayerBondEvents` + `batchPlayerBondTradeAdjustments` | bond adj NOW / talk ADAPTER | **Agree** |
| Receipts / effect IDs | `promptReceiptCore` / world event ids / accounting cores exist | foundation NOW | **Agree** |
| `aiParticipationPolicy` | Enum in `gameRulesCore` only; **no player shell consumes it** | Correctly stated | **Agree** |
| User-facing NOAI play mode | **Does not exist** on main | Correctly stated | **Agree** |

† **Caveat (not a misclassification under their definition):** “AVAILABLE NOW” means **domain/guild engines exist**, not “player can already open 暮らす and issue ops.” Production path today is still primarily GM / turn_result style. Report’s P5 honestly schedules player UI. Prototype tags guild/domain as `now` for **core**, which is accurate if the lens is on.

**No capability is sold as production-player-ready while missing cores.** Adapter/future items are correctly split in data (`availability` totals: now=15, adapter=9, future=1 on action cards).

---

## 3. Core product model — 暮らす / 物語る

| Claim | Prototype evidence | Result |
| --- | --- | --- |
| Deterministic actions create authoritative facts | Commit path writes ledger `kind: receipt` with deltas/facts/`wce_`-style event ids; fact chips | PASS |
| Optional AI narration cannot rewrite facts | Narration is separate `kind: narration` entry; foot: 「記録は変わっていません」; delete narration leaves receipt | PASS |
| AI not silently called in direct play | No network/LLM calls; narration is opt-in sheet + canned text | PASS |
| Can continue without narration | Narrate CTA optional; threshold hides CTA when no deltas/events | PASS |
| “NOAI” not a degraded player mode | Player chrome is **暮らす**; banner frames agency; “NOAI-PLAY-001” is prototype catalog title only | PASS |

**Narration vs receipt authority:** Narration uses hatch/serif styling (`.narration-entry` / `.prov-narration`); receipts use solid **確定** chips. Adversarial read of screenshots: ledger pins show 確定; mode banner prioritizes engine authority. **No place found where narration visually outranks the receipt as canonical.**

---

## 4. Action loop

Documented loop is implemented in `prototype.js`:

```text
situation → action card → review sheet (costs/requires/known/estimated/unknown)
  → explicit 「行う」 → result sheet (receipt) → optional 物語にする → continue
```

| Requirement | Evidence | Result |
| --- | --- | --- |
| No commit without confirmation | Cards open `openReview`; only `review-commit` applies | PASS |
| Disabled actions explain blocker | `disabledReason` + code chip + constructive `hint`; time-out → `NO_TIME_LEFT` | PASS |
| Estimates ≠ guarantees | Separate 見立て (estimate) vs 確かなこと (fact) sections; bond +10% is estimate while known price is fact | PASS |
| FoW / stale stays uncertain | `stale-panel` + unknown chips; blocked travel hint can mark uncertain prices | PASS |
| Failed/disabled ≠ false authority | Disabled cards are non-buttons; no result applied | PASS |
| Receipt identity | `r.id`, `events[].id` (`wce_…`) on receipts | PASS |
| Narration leaves receipt unchanged | Confirm/delete narration mutates only narration entries / `narrated` flag | PASS |

**Prebaked engine disclosure:** Commit applies `action.result` from JSON — honest for UX prototype; not live `applyTradeOp`. Footer + report §15 state this.

---

## 5. Scenarios (all seven)

| Scenario | Production-backed | Adapter | Illustrative/future | Role distinctiveness |
| --- | --- | --- | --- | --- |
| **静かな薬師** | sell herbs (trade) | gather, treat, visit, rest | — | Calm day-loop; quiet empty state; WORK+PEOPLE heavy |
| **宿場の店主** | buy/sell direct trade + bond-adj estimate | talk, rest | **reprice = future** (explicit 構想) | Merchant purse; ally bonus demo |
| **隊商主** | decision-surface opportunity, buy | **depart** travel commit | cargo inspect observe | Travel preview days/food; not pure shop |
| **組合長** | weekly plan chips, rulings, assign_party gate | — | — | **Board ledger** (金庫/物資…); week budget; not inventory |
| **領主** | monthly plan, petition, dispatch | — | — | **Domain board**; month cadence; policy diary tone |
| **立ち往生** | multiple reject codes; food buy; npc location miss | travel, rest | — | Recovery chain `unblocks` travel after food |
| **語りの後で** | trade observe; long ledger folds | — | canned narration sample | 300-turn history folding + repetition note |

**Degeneration check:** Not one generic card grid only — day roles use family groups; week/month roles use **plan chips + commit** and **board stats**; aftermath emphasizes ledger folds. Non-adventurer play is the primary framing (healer/shop/caravan/guild/ruler). PASS for prototype intent.

---

## 6. Long-horizon UX (100/300)

| Concern | Prototype treatment | Assessment |
| --- | --- | --- |
| Routine repetition | `repetitionNote` on aftermath | Structural warning, not balance fix |
| Dominant action boredom | Report defers to engine diversity; UI offers fold/upgrade path | Honest non-claim |
| History growth | folds (`details` + counts) + arcs (canon pins) | Survives demo scale |
| Meaningful-change threshold | No narrate CTA without deltas/events | Good |
| Stale actions | stale observation panel | Present |
| Role progression | day → week/month cadences as different rooms | Conceptual, not live progression system |
| Return after absence | situation strip + stale badges; RETURN-UX cross-link toasts only | Contractual, not implemented |
| “Advance time” slot-machine | End-day **preview** + quiet-day honesty copy; single day only | **Resists** mindless spam better than raw tick |

**Verdict:** Prototype **demonstrates** long-play survival patterns; it does not prove live 300-turn product balance. Acceptable for a UX prototype.

---

## 7. Authority / safety

| Rule | Result |
| --- | --- |
| No unrestricted free-text mutation path | **PASS** — no authoritative textarea; house links toast only |
| Authoritative path = allowlisted action + prebaked/ (future) validated intent | **PASS** for prototype model |
| Estimate / fact / unknown / narration visually distinct | **PASS** (chips + CSS) |
| Narration cannot become canon by eloquence | **PASS** |
| Predicted ≠ committed | Review sheet vs result sheet | **PASS** |
| No auto narration | **PASS** |

---

## 8. Responsive / accessibility

| Item | Result |
| --- | --- |
| All 7 scenarios in data + tablist | PASS (HTTP 200 for assets; calendars: healer 2/28, shop 4/22, caravan 5/21, guild w23, ruler m2, blocked 7/23, aftermath 10/30) |
| Confirmation / commit / result / narrate / end-day sheets | Implemented with `role=dialog`, Esc, focus restore, Tab trap |
| Keyboard tab arrows on scenario tabs | Implemented |
| Reduced motion | `prefers-reduced-motion` kills sheet animation |
| Long Japanese / `overflow-wrap: anywhere` | Present |
| Disabled explanations | Present |
| Empty/quiet states | Healer situation + empty ledger copy + quiet end-day |
| Screenshots vs prototype | Desktop = healer shell; narrow = aftermath/gallen — **match** |
| 400px overflow | Report claims `scrollWidth === clientWidth`; narrow screenshot shows single column without horizontal chrome break — consistent |

Local static serve of `docs/prototypes/noai-play-shell` returned **200** for html/js/json. Full Browser-pane click path was not re-executed here; behavior was verified by reading implementation + data-driven simulation of recovery/commit/narration paths. Residual: no independent pixel re-capture in this session (relied on shipped screenshots + code).

---

## 9. Implementation slices — adversarial review

| Slice | Report claim | Independent take |
| --- | --- | --- |
| P1 participation mode + empty 暮らす shell | Small | Accurate; **low player value alone** |
| P2 commerce confirm/receipt around `executeDirectTrade` | Small, real value | **Accurate; best first value** |
| P3 end day (clamp + bulk 1 + recovery) | Small adapter | Accurate; SOAK reusable |
| P4 travel adapter | Small–medium host glue | Accurate; more moving parts than P2 |
| P5 guild/domain player ops UI | Medium | Realistic; cores exist |
| P6 narrate → Cinematic | Presentation bridge | Accurate |
| P7 life recipes | Design + allowlists | Not “tiny” until recipes exist |
| P8 ledger fold / arcs | Shared with EXPERIENCE-ARCH | OK later |

**No hidden giant shared action framework** in the prototype — families are UI grouping + per-action sample results, not a new engine.

### Recommended safest first production slice

**Prefer one role + one complete authoritative loop:**

> **P2 first (宿場の店主 / direct trade):** confirm sheet → `executeDirectTrade` / `applyTradeOp` → real receipt with rejection codes → ledger.  
> Optionally thin P1 only if a persistent “暮らす” mode flag is required to route the UI.

Do **not** start with guild/ruler breadth or gather/craft recipes. That matches “prefer depth over shallow multi-role coverage.”

---

## Residuals (non-blocking for prototype PASS)

1. **Developer lens default OFF** — `src-chip` availability (実装済/要接続/構想) only visible when “実装根拠を表示” is checked. Stakeholders can misread adapter actions as fully playable unless they open the lens or read the report. **Recommend demo default-on lens or always-visible compact tags in a follow-up polish** (not required to reject this docs prototype).  
2. **Static disabled strings** after purse changes (report §15 already owns shopkeeper steel “所持186” after other trades) — prototype limitation.  
3. **Vehicle / discovery** listed as NOW in audit but **unused** in scenarios — audit ok, coverage thin.  
4. Guild/domain “NOW” = core, not existing player host — taxonomy is defensible; wording can still confuse non-engineers without the lens.  
5. This verify did not re-run a headed browser pixel pass; code + screenshots + data simulation suffice for product-prototype gate.

---

## Verdict rationale

Integrity is clean (7 prototype assets only; main fixed). Repository audit largely **confirms** the candidate source map; no critical oversell of missing cores. Product model 暮らす/物語る, confirm→receipt loop, non-adventurer scenarios, long-horizon folds, and authority boundaries hold under adversarial reading. Slices are ordered sanely; **first production value = trade loop (P2)**. Residuals are polish/demo-honesty, not a failed product direction.

```text
NOAI_PLAY_001_VERIFY_PASS
```
)
