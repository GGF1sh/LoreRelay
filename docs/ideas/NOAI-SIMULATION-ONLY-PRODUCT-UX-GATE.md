# NOAI Mode / Simulation Only / Narration on Demand — Product + UX Gate

Status: IDEA NOTE / PRODUCT+UX GATE (design only — no runtime, Webview, or Board changes)
Date: 2026-07-07 JST
Reviewer: Claude (Sonnet 5, high reasoning)
Role: AI-Optional Gameplay UX Architect
Parent documents:

- `docs/ideas/NARRATION-ON-DEMAND-AI-OPTIONAL-LIVING-WORLD.md`
- `docs/ideas/NARRATION-ON-DEMAND-NARRATIVE-SAMPLING-ADDENDUM.md`
- `docs/ideas/NOTEBOOKLM-CAMPAIGN-BRAIN-POC.md`

This document does not implement anything, does not modify runtime or Webview source, does not create a formal Board task, and does not touch `docs/ai-tasks/RUNTIME-003A*` (an active P1 gate for durable Accepted-TurnResult identity across restart — unrelated to this note except as background context in §7).

---

## 1. Repository audit

Audited at `origin/main` (commit `2e4f701`) via a detached worktree, since the local `main` checkout was 427 commits behind and had unrelated uncommitted Webview edits that were not touched.

| # | Area | Verdict | Evidence |
|---|------|---------|----------|
| 1 | Commerce | **Already deterministic-direct** | `src/livingWorldCommerceUi.ts:53-121` `executeLivingWorldDirectTrade()` reads state, calls pure `executeDirectTrade()` (`livingWorldCommerceUiCore.ts`), and persists via `scheduleCommercePersist()` — no GM/LLM call in this path at all. Gated by `enableCommerce` + `enableCommerceUi` (both required true). |
| 2 | World / travel | **Pure core exists, no direct UI action yet** | `src/travelEncounterCore.ts` computes paths and encounters deterministically (`deterministicUnitFloat()`, closed hazard table). But travel is still only invoked as part of an AI-produced `TurnResult` today — there is no "Travel" button that bypasses the GM bridge the way Commerce does. |
| 3 | Domain | **Pure mutation, AI-gated invocation** | `src/domainTurnOpsCore.ts:25-71` `applyDomainOpsToGameState()` is pure. But `domainOps` only ever arrives as a field on an AI-produced `TurnResult` (`src/types/TurnResult.ts:124-137`) — no direct path. |
| 4 | Guild | **Pure mutation, AI-gated invocation** | `src/guildTurnOpsCore.ts:18-63` `applyGuildOpsToGameState()` mirrors Domain. Same gap: `guildOps` (`TurnResult.ts:188-198`) only populated via AI turn. |
| 5 | Settlement | **Pure mutation + read-only preview, AI-gated commit** | `src/settlementLayoutTurnOpsCore.ts:24-46` applies `expand_layer` purely; the M4c gate (`docs/SETTLEMENT_MODE_M4C_CHATGPT_GATE.md`) explicitly confirms the ghost preview is in-memory only and real persistence happens only via `turn_result.settlementOps` after a GM turn. |
| 6 | Vehicle | **Pure mutation, AI-gated invocation** | `src/vehicleTurnOpsCore.ts` applies `vehicleOps` deterministically once received, but `vehicleOps` itself is a `TurnResult` field (`TurnResult.ts:168-177`) — populated by AI turns only. |
| 7 | World simulation / time advance | **Pure tick, AI-gated invocation** | `src/worldKitTickCore.ts` runs market recovery, faction drift, and NPC agency purely. But `elapsedWorldTurns` (`TurnResult.ts:112`, comment: *"GM narration accompanies"*) is only ever set via an AI-produced `TurnResult` — there is no direct "Advance Time" action today. |
| 8 | Chronicle | **Durable, but lossy for later narration** | `src/chronicleCore.ts:22-32` — `ChronicleEvent` has `worldTurn`, `gmTurn`, `kind`, one optional `npcId`/`regionId`/`factionId`, and `text` hard-capped at `MAX_CHRONICLE_EVENT_TEXT = 120` chars. Capped at 500 events / 50 chapters. Good for a readable in-game timeline; too lossy (single participant, 120-char text) to be the sole source for rich later narration. |
| 9 | Event / history receipts | **Partial — short-lived, not a durable receipt store** | `src/worldEventLogCore.ts:12-37` `WorldChangeEvent` already has a real stable ID (`makeEventId()`, e.g. `wce_12_region_dark_moor`), `source: 'simulation'\|'player'\|'gm'`, multi-`npcIds[]`, `message` + `gmHint`. But it is FIFO-capped at `MAX_RECENT_CHANGES=20` and TTL-expires (`expiresAfterTurns`) — designed for "since last visit" GM prompt injection, not for a 100-turn narrative-sampling archive. |
| 10 | Start Hub | **No AI-participation toggle yet, but the mechanism exists** | `rulesProfileCore.ts` already runs a "goddess interview" that writes feature flags (incl. `enableCommerceUi`) into `game_rules.json` at campaign start (`docs/RULES_PROFILE_ONBOARDING_DESIGN.md`). No `aiParticipationPolicy`-equivalent field exists yet. |
| 11 | Input / send flow | **Two paths already coexist** | Path A: `freeInput`/`selectOption` → `handlePlayerInput()` → GM bridge → `TurnResult` (narration + ops together, one AI call). Path B: `handleLivingWorldDirectTrade` → `executeLivingWorldDirectTrade()` → deterministic-only, no AI call. Path B is the existing proof that an AI-free mutation path is viable in this codebase today. |
| 12 | GM provider flow / mutation vs. narration | **Already separated at the schema level, not just aspirational** | `src/types/TurnResult.ts:87-199`: `statePatch`, `tradeOps`, `domainOps`, `guildOps`, `vehicleOps`, `settlementOps` are distinct fields from `narration: string`. `src/statePatch.ts:311-327` merges `narration` into `game_state.entries` as a step separate from `applyStatePatch()` (`statePatch.ts:444-445`) — a failed/absent narration does not block the mutation. Phase 9's Agentic GM (`src/agenticGmCore.ts`) formalizes this further into a Referee stage (ops only, no prose) and a Narrator stage (prose only, no mutation), writing to separate result files. |
| — | RUNTIME-003A | **Exists, active, out of scope** | `docs/ai-tasks/RUNTIME-003A*.md` — P1 gate for durable Accepted-TurnResult identity across extension-host restart, currently mid-review (adversarial recheck loop as of this audit). Directly relevant prior art for "stable event/turn identity" (§7) but must not be modified or assumed-complete by this document. |

**Headline finding:** the deterministic *mutation logic* already exists for every system in scope (commerce, travel, domain, guild, settlement, vehicle, world tick). The gap is narrower than "needs a new backend architecture" — it is (a) only Commerce has a UI action that actually *invokes* that logic without an AI call, and (b) even that one direct path writes no event-history record at all, so it is currently invisible to any future narration. NOAI Mode is much closer than the idea docs assumed; it is not a from-scratch system.

---

## 2. Product modes — are the four distinct?

The four are **two real endpoints and two different *triggers* for the same narration act**, not four independent behaviors:

| Mode | What actually happens | AI called | Status today |
|------|------------------------|-----------|---------------|
| **Always** | Every input → GM bridge → one `TurnResult` (ops + narration together) | Every action | **This is the current default behavior of the whole extension.** Not new. |
| **Important Events** | System *automatically* decides an action was significant enough to narrate | Sometimes, system-triggered | **Does not exist.** Requires a new significance classifier (event semantics, player relevance) — real judgment-call engineering, not plumbing. |
| **On Demand** | Deterministic path commits silently; player *manually* presses "narrate" to flush the accumulated buffer | Only when player asks | **Does not exist as a UI flow, but is the cheapest to build** — it needs no classifier, only a buffer + one button + one narration-only AI call. |
| **Simulation Only** | No AI call is ever made for gameplay actions; dialogue-only actions are queued (see §3) | Never | **Partially exists** (Commerce direct-trade proves the pattern) but not generalized or user-facing. |

Recommendation: **build On Demand first, Important Events last.** On Demand reuses 100% of what already works (silent deterministic commit) and adds only a read-only batch-narration call. Important Events requires inventing a "what matters" heuristic — exactly the kind of fragile, hard-to-test judgment layer the project's own guiding principle (§12) warns against building early.

**Naming.** The idea doc that originated this concept explicitly warns against leading with "NOAI Mode," since the point is not that AI disappears but that it stays silent until asked. Recommended **user-facing** names (internal code/field names may differ):

| Mode | 日本語 | English | Notes |
|------|--------|---------|-------|
| Always | 常時ナレーション | Always Narrate | current default, keep as-is |
| Important Events | 重要な場面だけ | Key Moments | **defer implementation**, name reserved |
| On Demand | 呼んだ時だけ / ナレーション・オンデマンド | Narrate on Demand | **build first** |
| Simulation Only | シミュレーションのみ | Simulation Mode | no AI call ever |

Internal jargon (`AI Participation Policy`, `TurnResult`, `statePatch`, `NarrationPolicy`) must never surface in UI copy.

**When AI is unavailable:** regardless of mode, an action with a deterministic path always succeeds mechanically; only the *narration* for it is deferred/queued (see §6). An action with no deterministic path (dialogue) is queued, never silently dropped and never force-called against the player's chosen mode.

**What the user sees after a deterministic action:** a short, templated system-log line derived from the same `message` field already produced by `WorldChangeEvent`/Chronicle (e.g. "🪙 小麦 20個を購入した (-120G)") — visually distinct from AI prose, not AI-generated text.

---

## 3. Defining "NOAI Mode" precisely

Mapping the candidate interpretations from the brief onto the current architecture:

| Interpretation | In-contract for Simulation Only? |
|---|---|
| A. no provider dispatch | Yes, for the specific action taken. |
| B. no narration | Yes — no prose generated at commit time. |
| C. no AI canonical mutation | Yes — mutation must originate from a deterministic core (`applyTradeOp`, `applyDomainOpsToGameState`, etc.), never an AI-authored `statePatch`. |
| D. deterministic systems continue | Yes — this is the entire point; world tick, market drift, NPC agency keep running regardless of policy mode. |
| E. dialogue unavailable | **Only for actions LoreRelay has no deterministic generator for** — today that means NPC dialogue specifically. This must be explicit and named, not implied. |
| F. dialogue queued for later | **Recommended resolution for E** — a "talk to NPC" request while AI-silent becomes a queued card, resolved the next time the player allows AI (mode switch or "narrate now"), rather than silently failing. |
| G. events stored for later narration | Yes — this is the one genuinely new requirement (§7); every deterministic mutation, direct or AI-produced, should also write an event-history record. |

Explicit separation the contract must preserve:

- **Deterministic gameplay** (trade, travel, settlement/domain/guild/vehicle ops, world tick) — always available, mode-independent.
- **Dialogue** — requires interpretation; always AI-gated regardless of mode; queued rather than blocked in Simulation Only.
- **Narrative prose** — always AI-gated, always optional, always decoupled in *timing* from the mutation it describes (this is already true at the schema level per §1 item 12).
- **World simulation** — deterministic tick, mode-independent, identical to "deterministic gameplay."
- **State mutation** — synonym for deterministic gameplay above.
- **Later retelling (Narrative Sampling)** — explicitly AI, explicitly read-only, and must never become a new mutating turn unless the player explicitly starts one (already stated as a hard rule in the parent idea docs; this document does not relax it).

---

## 4. Player experience

Grounded loop (not the aspirational one — what's real vs. what needs one new direct-action wrapper):

1. Buy supplies — **real today** via Commerce direct-trade, but currently produces no event-history entry (gap to close in Phase 0, §11).
2. Travel — **pure core exists, no direct UI action yet** (needs the same wrapper pattern Commerce already has).
3. Advance time — **pure core exists, no direct UI action yet** (`elapsedWorldTurns` is currently AI-turn-only).
4. Inspect market — already read-only, no AI, no change needed.
5. Manage settlement — preview is already read-only/local; committing an expansion still requires an AI turn today.
6. World changes occur automatically — already true (world tick is unconditional).
7. No AI call — **not true today**: every one of 1, 2, 3, 5 above still rides inside an AI-produced `TurnResult` in current wiring, even when nothing narratively meaningful happened.
8. Event receipts accumulate — **partially true**: `WorldChangeEvent` exists but is capped/expiring; Commerce's direct path doesn't feed it at all.

Then, optionally: ✨この出来事を描写 / 📖今日を物語にする / 👁️重要な出来事だけ / 🎭NPC視点で語る.

These four prompts are **UI framing over one primitive**, not four features: "package N selected/recent events + current state → one read-only narration call." Build the generic primitive once (a plain "narrate what happened since last time" button); add NPC-viewpoint, danger-only, and diary-tone as prompt-template variants layered on the same call in a later phase (§11, Phase 4). Do not build four separate pipelines.

---

## 5. Where the user controls it

- **Campaign default:** Start Hub, as one more question in the existing "goddess interview" (`rulesProfileCore.ts`) that already writes flags like `enableCommerceUi` into `game_rules.json` — add `aiParticipationPolicy` the same way, same file, same mechanism.
- **Persistent settings:** the same Game Rules settings surface as every other `enable*` flag, so it can be changed mid-campaign, not only at creation.
- **Per-action override / one-shot:** the "Narrate now" button set *is* the one-shot override for On Demand/Simulation Only — no separate override control is needed, since the whole point of those modes is "nothing happens until I press this."
- **Visible current mode:** a small persistent indicator (see §10) in Start Hub / World tab header — not buried in a settings submenu.
- **Avoid duplication:** single source of truth (`game_rules.json`), single settings entry point, read-only indicator everywhere else (Chronicle, World tab). Do not add a second live toggle in Chronicle or a third in World tab.

---

## 6. Zero-AI failure behavior

**Non-negotiable principle:** a narration failure must never undo, block, or retroactively question a deterministic commit that already happened. This already has real precedent in the codebase: `statePatch.ts:311-327` merges `narration` into `game_state.entries` as a step distinct from `applyStatePatch()` (`statePatch.ts:444-445`) — an absent/failed narration does not block or reverse the mutation. The same discipline must extend to the new batched "narrate later" call:

- **Provider unavailable / quota exhausted at "Narrate now" time:** the accumulated event queue is untouched (it's a pure read model); UI shows "描写を保留中（N件）— 後でもう一度試せます" with a Retry action.
- **User intentionally in Simulation Only:** this is not a failure state at all — no error framing, just normal operation.
- **NotebookLM unavailable specifically:** falls back to whichever narration provider is already configured as primary. Per the NotebookLM POC doc's own stated requirement ("fallback remains existing LoreRelay providers"), NOAI mode must never hard-depend on NotebookLM.
- **Narration fails after a deterministic commit already succeeded:** the commit stands; only the narration request is marked failed/retry-pending. Never roll back state to "fix" a narration failure.

The user should always be able to see, in one place: (a) what happened mechanically (already true — the system-log line from §2/§4), (b) whether narration is pending, and (c) whether a retry is available.

---

## 7. Event backbone requirements

**What already exists and is reusable:**

- Chronicle (`chronicleCore.ts`) — durable, chaptered, stable-ish identity via `worldTurn`+`kind`, but single-participant and 120-char-capped text.
- `WorldChangeEvent` (`worldEventLogCore.ts`) — real stable ID, multi-participant `npcIds[]`, `source` tag that already distinguishes player-caused events from simulation/GM ones, `message`+`gmHint`. This is the strongest existing building block.
- `TurnResult` narration/mutation separation, and Phase 9's Referee/Narrator split — proves "Mutation != Narration" is real, not aspirational.
- RUNTIME-003A's in-progress durable Accepted-TurnResult identity work is adjacent prior art for "stable identity across restart," but is out of scope here.

**What is missing for "simulate 30 actions now, narrate 5 meaningful events later":**

1. Direct (non-AI) UI action paths for travel, settlement-commit, domain/guild ops, vehicle ops, and time-advance. Today only Commerce has one.
2. A write from every direct action (current and future) into an event-history record. Today the one direct path that exists (`livingWorldCommercePersist.ts`) writes state but never touches `WorldChangeEvent` or Chronicle — direct trades are currently invisible to any future narration.
3. Retention long enough for narrative sampling. `WorldChangeEvent`'s FIFO-20/TTL-expiry design is correct for "since last visit" GM injection but wrong for "come back after 100 actions and ask for a recap" — needs either relaxed caps or a separate longer-lived bucket dedicated to pending-narration events.
4. A "since last narration" cursor per campaign, so repeated narrate-requests don't re-tell already-narrated events.
5. Richer participant indexing on Chronicle specifically (it only tracks one `npcId`; sampling "involving this NPC" per the Narrative Sampling addendum needs an array, which `WorldChangeEvent` already has).
6. Less lossy backing text (or a reference to structured source fields) than Chronicle's 120-char cap, so later AI narration has enough raw material to avoid inventing detail.

This is a bounded, concrete prerequisite list, not a new subsystem — most of the necessary shapes (stable IDs, source tagging, multi-participant arrays, severity) already exist in `WorldChangeEvent`. The work is retention policy and write-path coverage, not new architecture.

---

## 8. Narrative Sampling UX — smallest first version

V1 selector: **exactly one** — "since last narration" (an automatic per-campaign cursor), with an optional "last N events" cap. No raw event-ID picker (explicitly avoided per the brief). No NPC-viewpoint, danger-only, or guild-report framing in V1 — those are prompt-template variants added once the event store from §7 is proven (see Phase 4, §11). One button: **✨ 描写する** (or similarly plain wording), which expands into the four framed prompts only after the base primitive is validated.

---

## 9. NOAI mode vs. NotebookLM

NOAI Mode is provider-agnostic. NotebookLM is one optional narration backend among several, not a dependency of NOAI Mode. Composed pipeline:

```
deterministic LoreRelay history
  -> selected event receipts (since-cursor sample, §7/§8)
  -> [ NotebookLM (opt-in, cloud) | local model | Claude/ChatGPT | existing GM providers ]
  -> prose
```

NOAI Mode must work with **zero later AI ever** (a player can stay in Simulation Only permanently and never narrate) — this is already guaranteed by construction, since narration is fully decoupled and optional. The NotebookLM POC document independently requires the same non-mandatory posture ("fallback remains existing LoreRelay providers"), so the two ideas are naturally aligned rather than coupled; neither should be built to assume the other exists.

---

## 10. Visual concept (ASCII, no implementation)

**A. Current AI mode indicator** (Start Hub / World tab header):

```
┌─────────────────────────────────────┐
│  🔇 シミュレーションのみ          ▾ │   <- click opens mode picker
└─────────────────────────────────────┘
```

**B. Accumulated events waiting for narration:**

```
┌─────────────────────────────────────┐
│  📜 12件の出来事が描写待ち          │
└─────────────────────────────────────┘
```

**C. "Narrate now" row (appears only when B is non-zero):**

```
┌───────────────────────────────────────────┐
│ ✨ 描写する   📖 今日を物語に   👁 重要だけ │
└───────────────────────────────────────────┘
```

**D. Narration failure without gameplay failure** (inline banner, separate from the game log — the mechanical log entry from §2/§4 already rendered normally above it):

```
🪙 小麦 20個を購入した (-120G)          <- already committed, unaffected
─────────────────────────────────────────
⚠ 描写の生成に失敗しました。出来事は保持されています。 [再試行]
```

---

## 11. Recommended phasing

Derived from the audit in §1, not the illustrative phasing in the brief:

- **Phase 0 — Commerce-only pilot.** Reuse the existing `enableCommerce`+`enableCommerceUi` direct-trade path exactly as it is. Add `aiParticipationPolicy` to `game_rules.json` (UI copy only, no new engine behavior). Make direct trades also push a `WorldChangeEvent` — the single highest-value, smallest-blast-radius fix identified in §7, since it's the one system that's already deterministic-direct but currently invisible to history.
- **Phase 1 — Direct-action parity.** Add direct (non-AI) UI paths for travel and time-advance, reusing the same "silent commit + system-log line" pattern proven in Phase 0. Both already have pure cores (`travelEncounterCore`, `worldKitTickCore`).
- **Phase 2 — Event receipt durability.** Relax retention / add a dedicated longer-lived bucket, add the since-last-narration cursor.
- **Phase 3 — Narrate on Demand v1.** The one generic "narrate since cursor" button and a read-only, narration-only AI call, rendered in chat with a visual style distinct from GM turns (per §10).
- **Phase 4 — Narrative Sampling variants.** NPC-viewpoint / danger-only / diary-tone as prompt-template layers over Phase 3's primitive; extend direct-action parity to settlement/domain/guild/vehicle ops.
- **Phase 5 — Important Events (automatic).** Deferred until Phases 3–4 produce real data on what "significant" looks like in practice. Highest-risk, most judgment-dependent mode; do not build first.
- **Phase 6 (optional, opt-in only) — NotebookLM Campaign Brain** as one more narration backend behind Phase 3's primitive.

---

## 12. Central principle

> 今のLoreRelayで一番大事なのは、機能数を増やすことより、自分が100ターン遊んでも壊れないこと。

NOAI Mode must reduce unnecessary AI calls and *increase* robustness — it must not become another fragile subsystem. Phase 0 is deliberately scoped small enough (one `game_rules.json` field + one event-log write, reusing code that already works) that it cannot itself introduce a new failure mode. The riskiest part of this whole idea — an automatic "what matters" classifier for Important Events — is explicitly deferred to last, because heuristic judgment calls are exactly the kind of thing that is hard to test deterministically and easy to get subtly wrong across a long campaign.

---

## Biggest risks

1. **Scope creep into a "simulation control panel."** The brief explicitly warns against this; every phase above is a single toggle + one button, not a new dashboard.
2. **Event backbone silently diverging from Chronicle.** Two overlapping history systems (Chronicle, `WorldChangeEvent`) already exist for related-but-different purposes; adding a third "event receipt" concept risks a fourth. Recommend extending `WorldChangeEvent`'s shape (it already has the right fields) rather than inventing a new type.
3. **Building Important Events too early.** Explicitly sequenced last (§11 Phase 5) for the reason stated in §12.
4. **Dialogue-queueing (§3, item F) is new UX, not just new plumbing** — queued conversation requests need their own small UX treatment and are not covered by the direct-action pattern that works for trade/travel/time.

## Should implementation start now?

No. This document identifies that most of the *mutation* infrastructure already exists, but the concrete Phase 0 (event-log write from the direct-trade path, plus one new `game_rules.json` field) is small enough to be its own tightly-scoped follow-up gate — not something to fold into this product/UX note. Recommend a narrow Phase 0 implementation gate be drafted separately, following this repo's existing `*_CHATGPT_GATE.md` convention, once this note is reviewed.

---

**Final verdict: NOAI_PRODUCT_UX_GATE_READY**
