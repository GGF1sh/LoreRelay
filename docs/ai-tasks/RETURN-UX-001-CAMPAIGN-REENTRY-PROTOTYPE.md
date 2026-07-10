# RETURN-UX-001 — 世界へ戻る (Return to Your World): High-Fidelity Campaign Re-entry Prototype

- **Branch:** `ux/RETURN-UX-001-campaign-reentry-prototype` (from `origin/main` @ `521373cb154f76f89544e1d023586a6061a7d8fc`)
- **Prototype:** [`docs/prototypes/campaign-reentry/`](../prototypes/campaign-reentry/)
- **Screenshots:** [`docs/assets/campaign-reentry-desktop.jpg`](../assets/campaign-reentry-desktop.jpg), [`docs/assets/campaign-reentry-narrow.jpg`](../assets/campaign-reentry-narrow.jpg)
- **Scope:** UX vision + interactive prototype only. No production code, no `src/**` or webview changes, no protocol changes, no version bump. All referenced branches inspected read-only.

**Product language decision.** Surface name: **世界へ戻る (Return to Your World)**. The recap band
is titled **前回まで** — the phrase every Japanese player knows from 「前回までのあらすじ」, carrying
exactly the right warmth without inventing new vocabulary. The threshold's emotional line is chosen
because it is *literally true* in this engine (see §2): 「世界は、あなたが置いていった場所でそのまま
待っていました。」 The screen does not say "here is what you missed" — it says *the world kept your
place.* That single honest sentence is the product.

---

## 1. Repo Reality Audit

Audited at `origin/main` = `521373c` (MEDIA-COMFY-001 now merged). Read-only inspection of
EXPERIENCE-ARCH-001 (`9cc4637`), PLAY-UX-001 (`644c1ae`), WORLD-PULSE-001 (`7e9a8ae`),
PORTRAIT-STUDIO-001 (`d800505`) — actual files and screenshots, not reports.

| Surface | Where | What exists for re-entry today |
|---|---|---|
| Start Hub | `webview/index.html` `#start-hub`, `05-quickstart` | A **resume row** (`start-hub-resume-btn`): "現在のセッションに戻る — 進行状況を失わず、今のチャットに戻ります。" One button, no context. This is the entire current re-entry experience. |
| Adventure Log | `#chat-log`, `game_state.entries` | The raw answer to "what was I doing" is *scroll up and reread* — exactly the infinite-list failure this task exists to prevent. |
| Status | `worldView.status` | location / time / funds — current values, no history. |
| Story summary | `game_state.summary` + `summarizeHistory` command | A whole-story synopsis, generated on demand (LLM) and **player-editable** in the Status pane. It is not per-session, not cited, and can be stale. |
| Chronicle | `chronicleCore.ts` (journal + events → ≤50 chapters / ≤500 events) | Deterministic chapter-grouped history with `worldTurn` per event. The archive, not the doorstep. |
| Checkpoints | `checkpoint.ts` | `createdAt` ISO timestamps per manual checkpoint — a sparse real-time trace. |
| Turn journal | `chronicleJournalCore.ts` / `statePatch.ts:848` | **Every accepted turn is journaled with `appliedAt = new Date().toISOString()`** plus `playerAction` and turn id. This is the load-bearing discovery — see §2. |
| Quests | `worldStateCore.QuestHook` | `status: available/active/completed/failed` + `turnGenerated` — unfinished threads are enumerable with age. |
| World events | `worldEventLogCore.WorldChangeEvent` | ≤20 FIFO events with severity/category/entity refs. |
| NPC layer | npc registry, `npcRelationships`, `playerNpcMilestones`, `npcPositions` (agenda/reason), whereabouts trust precision (exact/approximate/unknown) | Everything "people waiting" needs, including principled uncertainty. |
| Staleness | `lastVisitTurnByLocation` | Per-location "N turns since you looked" — world-turn staleness, not calendar staleness. |
| Roles | `game_rules.playerRole` + Domain/Guild/Commerce/Caravan modes | Non-adventurer roles exist in data; re-entry must respect them (§7). |
| WORLD-PULSE-001 | `docs/prototypes/world-pulse/` | Provenance vocabulary (事実/兆候/不確か), band caps, evidence drawer — the grammar this screen borrows and lightens. |
| EXPERIENCE-ARCH-001 | `docs/ai-tasks/EXPERIENCE-ARCH-001-*.md` | Five-surface IA (PLAY/WORLD/PEOPLE/CHRONICLE/TOOLS), back-stack navigation, "遊びに戻る" guarantee. Re-entry is designed as this architecture's front door (§12). |

## 2. Session / Return-Boundary Findings

The questions the brief ordered investigated, answered from code:

1. **Does the repo know when the player last played? YES — precisely.** `statePatch.ts:848`
   stamps every accepted turn with `appliedAt` (real ISO time) into the NDJSON journal;
   `chronicleJournalCore.ts` parses it back (`JournalTurnLike.appliedAt`). The last journal line
   *is* the last moment of play. Checkpoints add sparse `createdAt` stamps. **AVAILABLE NOW.**
2. **Does it know which events the player has already seen? NO.** There are no read markers, no
   seen-event ids, no acknowledged-turn pointer anywhere in `src/` or the webview. "Seen" is not
   knowable. **NOT AVAILABLE.**
3. **Is "while you were away" actually knowable? It is better than knowable — it is empty.**
   The extension has no daemon, no timer, no offline simulation (verified: no `setInterval`/
   `setTimeout` world-advance path; the world moves only through GM turns and the in-session
   observer tick). Calendar-time absence produces **zero world change**. The honest and *superior*
   framing: the world is frozen at your bookmark. What the player actually needs is not a diff
   feed but **memory restoration** — and late-session developments they may never have absorbed
   (a burst of simulation events in the final turns of a session is genuinely "unread").
4. **Is only "since last accepted turn" / "recent changes" available? Yes** — plus everything
   derivable from it. `recentChanges` (FIFO 20), chronicle, quest ages, staleness are all keyed to
   **world turns**, not calendar time. The two absences are different dimensions and the prototype
   never conflates them: calendar absence appears once (threshold, from `appliedAt`); every other
   age in the UI is expressed in ターン.
5. **What requires a future explicit return checkpoint?** Distinguishing "shown on a previous
   re-entry screen" from "new since then" (an ack pointer: `lastReentryAckTurn` + timestamp), and
   per-event read state. Until then, the honest fallback ships: **sessions derived by clustering
   `appliedAt` gaps** (> 4h ⇒ new session — the prototype implements exactly this and labels the
   result 事実 with its rule visible: 「前回のセッション: 6月20日 · 4ターン (T131–T134)」).

## 3. Data Source Map

`existing source → available data → re-entry presentation`

### AVAILABLE NOW
| Source | Data | Presentation |
|---|---|---|
| journal `appliedAt` (statePatch.ts) | real last-played time; gap-clustered sessions | threshold absence line 「2週間ぶりの帰還」+ 事実 footnote naming `appliedAt` |
| journal `playerAction` + turn ids | what you were literally doing, per turn | recap **sources** rows; resume context |
| `game_state.entries` tail + `options` | the exact interrupted moment; preserved choices | RESUME context 「選択肢はそのまま残っています」 |
| `QuestHook.status/turnGenerated` | active goals + age in turns | やり残したこと rows (事実) with ターン age |
| `recentChanges` (≤20) | last session's world developments | 世界のいま rows (severity bar + 事実) |
| chronicle chapters/events |長い道のり + archive depth counts | arc strip event counts; 「年代記で読む」overflow |
| `npcRelationships` + milestones + `npcPositions.agenda/reason` | standing, movement, *recorded* motive | 待つ人々 cards — "why now" quoting agenda records |
| whereabouts trust precision | exact / approximate / unknown | 不確か chips on person location |
| `lastVisitTurnByLocation` | per-location staleness | 不確か staleness rows 「最後の観測から41ターン」 |
| `game_rules.playerRole`, domain/guild/commerce state | role + role pressures | role-shaped threads (§7) |

### DERIVABLE READ-ONLY (labeled 兆候, rule named in evidence)
| Derivation | Rule as prototyped |
|---|---|
| Session boundaries | `appliedAt` gap > 4h ⇒ new session |
| Absence phrase | now − last `appliedAt`, floored to weeks/days/hours |
| Thread ranking | active status × recency × role weight, cap 4 |
| "Waiting" people | recorded agenda/need + affinity threshold, cap 3; never invented motive |
| Open questions ("who tore the page?") | unresolved-implication heuristic over journal — always 兆候, never fact |
| Aging | ≥20 turns renders dim + 「〜前から」 phrasing |

### FUTURE / NOT AVAILABLE (absent or explicitly gated in the prototype)
- **Seen-event markers / return-ack pointer** — required for a true "since your last return" lane;
  design-gate slice R6.
- **LLM narrative recap** — `summarizeHistory` exists but is uncited whole-story prose. The
  prototype's recap is authored sample data standing in for a **deterministic template composer**
  (slice R2); LLM polish is a later, gated option that must cite per-sentence sources (§6).
- **Explicit promises/debts store** — partial today (npc needs, milestones, quest hooks); a true
  obligation ledger is future.
- **majorArcs store** — pinned arcs reuse WORLD-PULSE-001 slice 6's proposed store; hand-authored
  in sample data until it exists.

## 4. Information Architecture

Six bands, strictly ordered by *what the returning mind needs first*, each with its own cap. The
long-campaign hierarchy (chosen over the brief's suggested NOW/UNFINISHED/SINCE-LAST-RETURN/
LONG-ARC/ARCHIVED after inspection — "since last return" is not honestly knowable yet, §2):

```
A. 敷居 THRESHOLD      identity: world name (serif hero) · role/character/place/
   (いま NOW)           turn/time chips · absence line + appliedAt provenance
B. 前回まで PREVIOUSLY  2–4 serif sentences, 語り chip, 出典 disclosure → per-
                        paragraph journal sources (事実)
   長い道のり LONG ARC   (long campaigns only) ≤4 arc pins + archived-count line
C. やり残したこと        ≤4 ranked thread rows (kind glyph · why · provenance ·
   UNFINISHED           turn-age) + "他N件 → 年代記"
D. 世界のいま            ≤3 development rows (light Pulse language) + staleness
   AS YOU LEFT IT       admissions + one link to World Pulse
E. 待つ人々 PEOPLE      ≤3 person cards: standing thread, recorded why-now,
                        whereabouts precision
F. 続きへ RESUME        one hero action 「物語を続ける」 with context line +
                        quiet links: 世界 · 人々 · 年代記 · 姿
   ARCHIVED             never rendered inline — always a link into CHRONICLE
```

Every card is a button opening the **根拠 (evidence) bottom sheet**: the underlying records tagged
事実/兆候/不確か with raw field names (`npcPositions.npc_erila.agenda = trade`). One gesture,
inherited from World Pulse, lightened to a single sheet.

## 5. Visual & Emotional Direction

**"Opening a beloved book at the ribbon."** The room is a **dusk library**: warm ink ground
(#191410), paper text (#e9dfcf), hairlines from the shared system — and one signature object, a
**crimson silk bookmark ribbon** hanging from the top edge into the scene, notched like a real
栞. It is deliberately *not* World Pulse's alarm red: still, silk, calm. The threshold composes
like a bookplate: eyebrow (前回まで — あなたの世界), serif world name at hero scale, epithet,
identity chips over a CSS-gradient scene (six per-scenario moods; **no images ship — the missing-
art path is the default path**), all under a vignette that settles into the page.

- **Serif = story and authority** (world name, recap, absence line, resume context, arc titles);
  **sans = instrument** (chips, meters, meta). Same semantic split as Cinematic/Pulse/Studio.
- **Candlelight amber** is reserved for the one primary action; the ribbon crimson for identity;
  provenance chips keep the shared blue/gold/dotted grammar. Gold-as-canonical (Studio's law) is
  not violated — nothing here is 正史 except the records the sheet quotes.
- **Motion budget: three things.** The page-open fade, the ribbon draw, the sheet slide. A
  returning player should feel a page turn, then stillness. `prefers-reduced-motion` stops all
  three (verified: animations neutralized, content identical).
- What it must not feel like — notification center, task manager, dashboard, launcher ad, wall of
  cards, news feed — is enforced structurally: no badges, no counts-in-red, no equal-weight card
  grid, band caps everywhere, one CTA.

## 6. Recap Authority Model

The recap is the most dangerous element on the screen — beautiful prose that could quietly become
a second canon. The rules, all implemented in the prototype:

1. **Four-value provenance**, extending the shared vocabulary with one member: 事実 (observed
   record) · 兆候 (derived relevance — every ranking/aging decision) · **語り (narrative
   condensation — serif chip with a quote glyph)** · 不確か (stale/missing observation).
2. **語り always discloses.** The band header carries the 語り chip; 「出典を見る」expands
   per-paragraph source rows — each paragraph lists the journal turns it condenses
   (`T131: playerAction → gmNote`, tagged 事実). The disclosure footer states: 「この要約は記録の
   語り直しであり、それ自体は正史ではありません。」
3. **The recap can only condense, never add.** Sample paragraphs contain no fact absent from
   their cited turns. Production slice R2 makes this structural: a deterministic template composer
   over the journal tail (`playerAction`/`gmNote`/chapter title). An LLM-polished variant is a
   *later* gated slice and must (a) cite per-sentence turn ids, (b) render under the same 語り
   chip, (c) be regenerable, never stored as history.
4. **No invented motive.** People cards quote *recorded* agendas (`npcPositions.reason`) as 事実;
   anything inferred ("値は張るでしょう") is 兆候 with its heuristic named in the sheet.
   Where data is absent the screen says so (スケリ: 所在不明, precision=unknown quoted from the
   trust rule) instead of narrating around it.
5. **A beautiful recap never hides uncertainty:** staleness rows sit unhidden in 世界のいま; the
   stale scenario's recap ends at the recorded facts and its quiet note says 「確かなことは多く
   ありません」.

## 7. Quiet-Life & Non-Adventurer Support

The screen assumes a *life*, not a quest log. Thread **kinds** are role-plural by design —
調べ/気がかり/商い/約束/講和/兵站/危険/統治/外交/国庫/追悼/手配/空白 — and the ranking weights
them by `playerRole`, so:

- the **healer** (静かな暮らし) returns to a patient's fever, a herb shortage, and a festival
  promise — no crisis, and the world band says so honestly: 「大きな危機はありません。静けさも、
  記録のうちです。」 The screen is still worth opening because *someone is waiting* (Hanna, at the
  mill) and *something is possible today* (the rain ended — 事実);
- the **caravan owner** returns to prices, a blockade, a guard contract, and a colleague acting on
  his instructions;
- the **commander** returns to a truce draft, a supply clock, and a hundredth name in the muster
  roll;
- the **margrave** (辺境伯) returns to a held tax verdict, an envoy with a deadline, silent scouts,
  and a treasury line — strategic priorities, zero quests.

Six scenarios prove the same six bands carry villager-scale warmth and ruler-scale weight without
layout changes: **初めての帰還 · 静かな暮らし · 迫る隊商路 · 長い戦役 · 霧の中の帰還 · 辺境伯の帰還**.

## 8. 100 / 300-Turn Scaling

Exercised live by 長い戦役 (T134, 4 arcs, 193 archived events) and 霧の中の帰還 (42-turn stale gaps).

| Horizon | What renders |
|---|---|
| Turn 1–9 (初めての帰還) | 2 recap sentences, 2 threads, 1 development, 2 people. No arc strip. |
| Turn ~34 (quiet) | Same skeleton; quiet note instead of alarm. |
| Turn ~100 | Arc strip appears (≤4 pins); threads cap at 4 + counted overflow link; recap **stays 2–4 sentences** because it condenses the last session, not the campaign. |
| Turn 300 | Identical on-screen item count. Only numbers grow: archived-chapter count, event counts on pins, staleness turn counts. |

Mechanisms, each visible in the prototype:
- **Recap length is O(last session), not O(history)** — the single most important scaling rule.
- **Threads cap at 4**; overflow is a *counted sentence* (「ほかに7件の古い糸があります…年代記で
  読む」), never more cards. Old threads (≥20 turns) render dimmed with 「〜前から」phrasing —
  reminders age visibly instead of repeating forever.
- **Arcs compress completed history** to one pin each; archived chapters collapse to one line with
  a count. ARCHIVED is a link, never a list — infinite scroll is structurally impossible.
- **Staleness converts absence into information** (不確か rows quoting `lastVisitTurnByLocation`)
  rather than letting old data masquerade as current.
- **People cap at 3** ranked by recorded-waiting evidence + bond, so recurring NPCs compete
  instead of accumulating.
- Changing roles are absorbed by the role-label chip + role-weighted threads (長い戦役's
  ヴェスナ: 元・一介の傭兵 → 団長 — the label itself tells the arc).

## 9. Cross-Surface Handoff

Aligned with EXPERIENCE-ARCH-001's typed-entity navigation and back-stack. The prototype
demonstrates each contract with an explicit handoff toast (production navigates):

| From | To | Contract |
|---|---|---|
| 「物語を続ける」 | **PLAY / Cinematic** | Restore the exact interrupted scene: `game_state.entries` tail + preserved `options`. The resume context line names it before the click (「T134 の野営の場面から再開」). Context is preserved, not reset. |
| 世界のいま row / 世界の脈を見る | **WORLD / World Pulse** | Event id → the corresponding Pulse card + evidence drawer. |
| 待つ人々 card | **PEOPLE / dossier** | npcId → person view; the evidence sheet already shows the records the dossier will expand. |
| 姿を整える | **Portrait Studio** | Active character → studio sub-route. |
| 年代記で読む (arcs / overflow) | **CHRONICLE** | Anchored at the referenced chapter/arc, not the top. |
| Unfinished thread | **PLAY with context** | Resume carries the thread's subject as the visible context line — play resumes *about* the thing. |

One rule keeps it from becoming a launcher maze: **every navigation is attached to the entity it
concerns** (a row, a card, a counted overflow), and the only free-standing buttons are the single
hero CTA and four quiet text links under it. From any destination, EXPERIENCE-ARCH-001's
persistent 「遊びに戻る」 completes the loop.

## 10. Accessibility & Responsive Decisions

- **Keyboard:** skip-link → threshold; scenario tablist with roving tabindex + ←/→ (verified:
  focus and selection move together); every thread/development/person is a native `<button>` with
  `aria-haspopup="dialog"`; sheet: focus moves to close on open, **Esc closes, focus returns to the
  triggering card** (verified in-browser); disclosure toggles use `aria-expanded`.
- **Reduced motion:** page-open fade, ribbon draw, and sheet slide all stop under
  `prefers-reduced-motion: reduce`; nothing informational is motion-only.
- **Not color-only:** provenance chips differ by border style (solid/dashed/dotted) and label;
  severity is a left bar *plus* chip; negative bonds change bar color *and* the standing text.
- **Long Japanese text:** `overflow-wrap: anywhere` on every message surface; verified
  programmatically at 400px: `scrollWidth === clientWidth` and zero elements past the right edge.
- **Missing scene art:** scene layers are CSS gradients keyed by `sceneClass`; the prototype ships
  no images at all, so the no-art path is the *only* path — `sceneImage` in sample data is
  deliberately ignored.
- **Responsive:** ~1560px reads as a centered 880px book column with full-bleed threshold; ≤760px
  single column, threshold text padded clear of the ribbon, sheet full-width; ≤420px compact type.
  Empty/quiet states render as designed content (white-page line for no threads; quiet note for no
  developments), never blanks.

## 11. Recommended Production Implementation Slices

Small, independently landable; read-only first. Naming continues the EXPERIENCE-ARCH-001 program
(this surface is the LAUNCH/return state of PLAY).

| # | Slice | Contents | Size |
|---|---|---|---|
| R1 | `reentryCore.ts` (pure) | Derive the re-entry view-model: absence + session clustering from journal `appliedAt` (gap rule), thread ranking from questHooks/milestones/role, people ranking from agenda+affinity, staleness rows, aging. Unit tests per rule. No UI. | S |
| R2 | Deterministic recap composer | Template condensation of the last session's journal turns (+ chapter title) with per-paragraph source refs — the 語り contract, zero LLM. Pure, tested. | S–M |
| R3 | Re-entry webview surface | `89g-reentry.js` + `9c`-series CSS (bundle-order contract as PLAY-UX-001), rendered from existing `worldView` + a small `reentryView` host message (journal tail + quest/people payloads already loaded by the host). Replaces the Start Hub resume *row*; Start Hub creation flows untouched. i18n ×4. | M |
| R4 | Resume handoff | 「物語を続ける」 restores the live session view (existing behavior) with the context line; quiet links wire to WORLD/PEOPLE/CHRONICLE per EXPERIENCE-ARCH-001 N1 back-stack. | S |
| R5 | Evidence sheet | Shared 根拠 sheet component (thread/person/development), reusing Pulse's provenance chips; grep-gate: no `postMessage` writes. | S |
| R6 | Return-ack pointer (new data, design-gate) | `lastReentryAck {turnId, atIso}` written when the player *dismisses/resumes* — enables a true 「あなたがこの画面を見てから」 lane and per-event newness. Schema gate first. | M |
| R7 | LLM recap polish (optional, gated) | Rewrites R2's template output only; per-sentence citation preserved; regenerable; never persisted as history. Cost + design gate. | M |

Dependencies: R3 → R1+R2; R4/R5 → R3; R6/R7 independent gates. R1/R2 are parallel-safe today and
touch nothing shared with the EXPERIENCE-ARCH lanes except i18n (namespaced `webview.reentry.*`).

## 12. Relationship to Start Hub and EXPERIENCE-ARCH-001

EXPERIENCE-ARCH-001 defines PLAY's **LAUNCH state** as today's Start Hub and guarantees a
persistent return path to PLAY. This screen slots in precisely there, as **the LAUNCH state for an
existing campaign**:

- **Start Hub keeps creation** (Genesis, quickstart, presets, character import) — the front door
  for *new* worlds. Its current one-line resume row is replaced by 世界へ戻る, shown when a
  campaign exists (the hub's 「Start Hub」 home button and creation flows are unchanged).
- **世界へ戻る is a room off PLAY, not a seventh surface.** It renders once per return, hands off
  to PLAY/WORLD/PEOPLE/CHRONICLE via the N1 typed-entity links, and is never a place the player
  lives — the hero CTA exists to leave it.
- It **borrows deliberately**: Cinematic's serif narrative column (recap), Pulse's provenance and
  staleness honesty (world band), Studio's authority clarity (nothing un-recorded ever looks
  official) — while owning the one emotion none of them carry: *homecoming*.
- The global-layer signals (WORLD pip, media-job pip) defined in EXPERIENCE-ARCH-001 §9 do not
  appear here; the threshold is intentionally quieter than ambient chrome. They resume with PLAY.

---

## Prototype Run Instructions

```bash
cd docs/prototypes/campaign-reentry
python -m http.server 8931      # any static server (fetch() needs http://)
# open http://localhost:8931        — scenario tabs top right, or deep-link:
# http://localhost:8931/#quiet-life  #building-crisis  #long-campaign  #stale-data  #ruler
```

Click any thread / development / person card for the 根拠 sheet (Esc closes, focus returns);
「出典を見る」 under the recap reveals per-paragraph journal sources; 「物語を続ける」 and the quiet
links show their handoff contracts as toasts.

**Verification performed:** served locally and driven in-browser — all 6 scenarios render
(tablist ←/→ verified moving focus + selection); evidence sheet open/Esc/focus-return verified;
recap source rows verified (4 rows, per-paragraph refs); resume + handoff toasts verified;
`scrollWidth === clientWidth` at 400px with zero elements past the right edge; console clean;
reduced-motion path renders identical content; screenshots captured from the real prototype at
1560px and 400px (長い戦役 scenario).

## Final Verdict

**RETURN_UX_001_PROTOTYPE_READY_FOR_IMPLEMENTATION**
