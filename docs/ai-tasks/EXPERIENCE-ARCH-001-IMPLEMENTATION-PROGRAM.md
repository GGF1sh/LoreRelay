# EXPERIENCE-ARCH-001 — Implementation Program

- **Branch:** `architecture/EXPERIENCE-ARCH-001-unified-player-experience` (from `origin/main` @ `c0418a8`)
- **Companion:** [`EXPERIENCE-ARCH-001-UNIFIED-PLAYER-EXPERIENCE.md`](./EXPERIENCE-ARCH-001-UNIFIED-PLAYER-EXPERIENCE.md)
- **Scope:** planning only. No production code in this branch. Each slice below is a *separate*
  future AI task with its own worktree, gate, and human smoke.

This program sequences the unified UX so that **usable player value ships early** (Cinematic in
week one), read-only surfaces land before anything that writes, and the media job-lifecycle work is
correctly ordered behind MEDIA-COMFY-001. It reconciles the two prototypes' own slice plans
(World Pulse §10, Portrait Studio §10) into one dependency-ordered backlog with an explicit
conflict map.

---

## 1. Dependency Graph

```
              origin/main c0418a8
                     │
   ┌─────────────────┼───────────────────────────────────────────┐
   │                 │                                             │
[C1 Cinematic]   [P1 pulseCore]                              [S1 studioCore]
 slice (as-is)   (pure derive)                               (pure derive)
   │                 │                                             │
   │            [P2 Pulse shell+NOW] ── depends P1            [S2 Studio panel RO] ── depends S1
   │                 │                                             │
   │            [P3 RISING+PLACES]   [P4 PEOPLE threads]      [S4 adopt command] (write)
   │                 │                     │                       │
   │            [P5 CHRONICLE lanes] ──────┘                  [S5 candidate ledger]
   │                 │                                             │
   │            [P6 majorArcs store] (new data, design-gate)  [S6 intent picker]
   │                                                               │
   ▼                                                               │
[IA1 five-surface tab regrouping] ◀── soft-depends nothing;   [S3 job status strip]
   │   re-homes Pulse/Studio/Chronicle under surfaces          ▲   depends: MEDIA-COMFY-001 merge
   │                                                           │           + host stdout parser (M-FWD)
[G1 global state layer] ── soft-depends IA1, C1               │
   │                                                           │
[N1 cross-surface nav back-stack] ── depends IA1, P2, S2 ─────┘

   ── MEDIA lane (separate, upstream of S3) ──
   [MEDIA-COMFY-001 merge] → [M-FWD host TA_MEDIA_STATUS→webview forward] → S3
   [MEDIA-ARCHITECTURE M2–M7]  (MediaIntent/compiler/visualIdentity) → informs S6 (soft)
```

**Hard dependencies**
- P2..P6 → P1 (view model). S2 → S1. S3 → **MEDIA-COMFY-001 merged** + **M-FWD** (host forward).
- S4 (adopt write) → S1/S2 (needs the candidate view to adopt from).
- N1 → IA1 + at least P2 + S2 (needs real surfaces to link between).
- P6 and S5 → their own design gate (new persisted store).

**Soft dependencies**
- IA1 ← nothing structural, but landing it *before* P2/S2 gives them a home tab (else they ship as
  temporary sub-panels). Recommended order: C1 → P1/P2 → IA1 → the rest.
- G1 ← C1 (reuses the cinematic top strip) + IA1.
- S6 (intent picker) ← MEDIA-ARCHITECTURE M2 (MediaIntent) is *soft*: ship the interim 3-intent
  mapping now, upgrade when the compiler lands.

**Independent slices (parallelisable from day one):** C1, P1, S1 touch disjoint files and can run
in parallel by three different implementers.

---

## 2. Exact Implementation Order

Ordered for earliest player value, read-before-write, and dependency safety.

| Step | Slice | Why here | Player value |
|---|---|---|---|
| 1 | **C1** Cinematic slice | Fastest, most visible, zero host risk | Immersive play *now* |
| 2 | **P1** pulseCore (pure) | Unblocks all Pulse UI; no UI risk | — (foundation) |
| 3 | **S1** studioCore (pure) | Unblocks Studio; parallel to P1/C1 | — (foundation) |
| 4 | **P2** Pulse shell + NOW + evidence drawer | First "what's happening" answer | High |
| 5 | **IA1** five-surface tab regrouping | Homes Pulse/Studio/Chronicle; de-clutters | High (coherence) |
| 6 | **S2** Studio panel (read-only: ACTIVE + CANDIDATES) | Makes portrait authority visible | High |
| 7 | **P3** RISING + PLACES | Completes the world snapshot | Medium |
| 8 | **P4** PEOPLE threads | Relationships legible | Medium |
| 9 | **P5** CHRONICLE lanes | Story shape; 100-turn readability | Medium |
| 10 | **G1** global state layer | Ambient signals, role-weighting | Medium |
| 11 | **N1** cross-surface back-stack + entity links | Turns panels into one place | High (coherence) |
| — | **MEDIA-COMFY-001 merge** (media lane) | Prereq for S3 | — |
| 12 | **M-FWD** host stdout→webview forward | Prereq for S3 | — |
| 13 | **S3** Studio job status strip | Live job lifecycle; anti-duplicate | High |
| 14 | **S4** explicit adopt command (write) | Safe adoption from Studio | High |
| 15 | **S5** candidate ledger (new store, design-gate) | Intent/job metadata, batch folds | Medium |
| 16 | **S6** intent picker (interim) | Directed generation | Medium |
| 17 | **P6** majorArcs store (new data, design-gate) | Campaign spine pins | Medium |
| 18 | **S7 / P7** heuristics & polish gates | Composition tags, a11y, screenshots | Low–Medium |

---

## 3. Parallel-Safe Lanes

Three lanes can run concurrently with near-zero cross-talk because their touch sets are disjoint:

- **Lane A — PLAY/shell:** C1 → IA1 → G1 → N1. Touches header/topbar, bundle order, tab strip,
  global strip. (N1 waits for B & C to have surfaces.)
- **Lane B — WORLD:** P1 → P2 → P3 → P4 → P5 → P6. Touches `worldPulseCore.ts`,
  `89e-world-pulse.js`, `98-world-pulse.css`, i18n.
- **Lane C — PEOPLE/media:** S1 → S2 → (MEDIA-COMFY-001 → M-FWD →) S3 → S4 → S5 → S6. Touches
  `portraitStudioCore.ts`, `89f-portrait-studio.js` + CSS, `characterManager.ts` (S3/S4), i18n.

Serialisation points (must not run truly concurrently): **IA1** edits the tab strip that P2/S2 mount
into — land IA1's skeleton, then B and C mount into named slots. **Bundle-order files**
(`scripts/build-webview.js`, `docs/generated/symbol_registry.*`) are order-sensitive and shared —
see §4.

---

## 4. Touch-Set Conflict Map

Files multiple slices touch; the discipline that keeps merges trivial.

| Shared file | Slices | Conflict risk | Discipline |
|---|---|---|---|
| `webview/index.html` | C1, IA1, P2, S2, G1 | **High** (many insert markup) | Each slice inserts a *named region* with a unique id; use Node line-splice (preserve CRLF) as PLAY-UX-001 did; never reflow neighbours. IA1 lands the container skeleton first. |
| `scripts/build-webview.js` | C1, P2, S2, P3–P6, S3+ | **High** (module/CSS registration order) | Append-only registration; each slice adds its module in a fixed documented slot; the genre-chrome-last contract test is the guard. Pick distinct numeric prefixes (9a taken by cinematic; use 89e/98 pulse, 89f/… studio). |
| `docs/generated/symbol_registry.json` / `.md` | every slice adding symbols | **Med** (regenerated) | Regenerate (`npm run generate:symbol-registry`) as the *last* commit of each slice; treat conflicts as "rerun the generator," never hand-merge. |
| `locales/{ja,en,zh-CN,zh-TW}.json` | every UI slice | **Med** | Namespaced keys per surface (`webview.pulse.*`, `webview.portrait.*`, `webview.cinematic.*`); `check_i18n_keys.js` gate = 0 missing. Additive only. |
| `webview/script.js` | C1 (+102), IA1, G1, N1 | **Med** | Prefer new modules over editing the 15k-line monolith; when unavoidable, append handlers, don't reflow. |
| `webview/style.css` | C1 (+330) | Low | Cinematic already scoped; new surfaces use their own `styles/*.css`. |
| `src/characterManager.ts` | S3 (stdout parse), S4 (adopt) | **Med** | S3 adds incremental line parsing in the existing `child.stdout.on('data')` handler; S4 adds the `adoptPortraitCandidate` command path. Land S3 before S4; both add, don't rewrite, the existing `parseMediaArtifactResult` flow. |
| `src/worldView.ts` | P6 only | Low | Only P6 adds `majorArcs` to the broadcast; P1–P5 consume existing fields. |
| CHANGELOG.md / AI_SHARED_LOG.md | all | Low | Append to `[Unreleased]`; conflicts are trivial. |

**MEDIA-M1.1 crossing check:** the Cinematic slice (C1) touches only `webview/` + build/i18n and
has **zero** intersection with MEDIA-M1.1 (`portraitArtifact.ts`, `mediaArtifactCore.ts`,
`characterManager.ts` adoption). S3/S4 *do* touch `characterManager.ts` — sequence them after any
in-flight MEDIA-M1.1 repair merges to avoid churn on that file.

---

## 5. Small Task Packets

Each packet is sized for one AI task: explicit ID, goal, deps, touch set, out-of-scope, gate.

### C1 — Cinematic Play Mode (integrate the slice)
- **Goal:** land cinematic presentation mode on current main as a Console⇄Cinematic toggle.
- **Depends on:** none.
- **Touch set:** cherry-pick/re-apply `webview/modules/89d-cinematic-mode.js`,
  `webview/styles/9a-cinematic-mode.css`; splice `webview/index.html` header 🎬 + `#cinematic-topbar`;
  register in `scripts/build-webview.js`; `webview/script.js`/`style.css` additions;
  `webview/cinematic.*` i18n ×4; smoke `scripts/test_webview_cinematic_mode.js`.
- **Out of scope:** merging branch `644c1ae` (reverts MEDIA-M1.1); any host/`src` change; global
  layer (that is G1).
- **Gate:** `npm run compile` PASS; `npm test` PASS (incl. cinematic smoke + genre-chrome-last);
  `check_i18n_keys.js` 0 missing; Console layout byte-identical (regression screenshot).

### P1 — worldPulseCore.ts (pure)
- **Goal:** deterministic `deriveWorldPulse(worldView) → viewModel` (tension, NOW ranking, RISING
  rules, PEOPLE thread selection, PLACES ranking, aging) mirroring Pulse doc §2.
- **Depends on:** none. **Touch set:** `src/worldPulseCore.ts` + unit tests. **Out of scope:** UI,
  any new host message. **Gate:** unit tests cover every threshold rule; compile + suite PASS.

### P2 — Pulse shell + NOW + evidence drawer
- **Goal:** render NOW band + 根拠 drawer + read-only banner + provenance legend from the existing
  `worldView` message, behind `enableWorldPulse`.
- **Depends on:** P1 (mount slot from IA1 if landed). **Touch set:** `webview/modules/89e-world-pulse.js`,
  `webview/styles/98-world-pulse.css`, `index.html` region, build registration, `webview.pulse.*`
  i18n ×4, game-rule flag. **Out of scope:** RISING/PLACES/PEOPLE/CHRONICLE (P3–P5); writes.
  **Gate:** compile+suite; no host change; 400px no-overflow; drawer Esc/focus-return.

### P3 — RISING + PLACES · P4 — PEOPLE threads · P5 — CHRONICLE lanes
- **Goal (each):** add the named band from existing payloads (sparklines reuse Observatory series
  math; threads from `npcBonds`/`playerBonds` + whereabouts precision; chronicle recent lane +
  chapter folds + aging). **Depends on:** P2. **Touch set:** the Pulse module/CSS + i18n. **Out of
  scope:** `majorArcs` pins (P6). **Gate:** compile+suite; 400px; reduced-motion.

### P6 — majorArcs store (new data · design-gate)
- **Goal:** capped `world_state.majorArcs` (≤8; id/title/fromTurn/toTurn/summary/eventCount) written
  by explicit action or deterministic chapter-boundary heuristic — **never LLM fiat** — + pinned
  strip. **Depends on:** P5 + a schema design gate. **Touch set:** `src/worldStateCore.ts`,
  `src/worldView.ts`, chronicle heuristic, Pulse module. **Gate:** design gate approved; determinism
  test; compile+suite.

### IA1 — five-surface tab regrouping
- **Goal:** relabel the 9-tab strip into PLAY-context · WORLD · PEOPLE · CHRONICLE · TOOLS; re-home
  existing panes as sections/sub-routes; no behaviour change to the panes themselves.
- **Depends on:** none (land skeleton early). **Touch set:** `index.html` tab strip + pane grouping,
  `webview/script.js` tab logic, i18n. **Out of scope:** deleting any pane; new surfaces. **Gate:**
  every existing pane still reachable; compile+suite; a11y tab order.

### G1 — global state layer
- **Goal:** ambient strip (character·place·time·funds·tension·relay·media-job pips), role-weighted,
  collapsible; reuse the cinematic top strip. **Depends on:** C1 + IA1. **Touch set:** new module +
  CSS, `index.html` strip region, i18n; reads existing `worldView`/relay; media-job pip listens to
  `portraitJobStatus` (present after M-FWD; degrade gracefully before). **Gate:** no permanent
  clutter (design review); reduced-motion; 400px.

### N1 — cross-surface back-stack + entity links
- **Goal:** typed entity links (npc/faction/location/event/portrait/chapter) + one back-stack + a
  persistent "遊びに戻る". **Depends on:** IA1 + P2 + S2. **Touch set:** a small nav controller module,
  link affordances in Pulse/PEOPLE/Chronicle, i18n. **Out of scope:** new data. **Gate:** no dead
  ends (every surface returns to PLAY in one tap); back-stack retrace test.

### S1 — portraitStudioCore.ts (pure)
- **Goal:** derive studio view-model from character JSON + `characters/` listing (active identity,
  adoption-kind classification, candidate states GENERATED/SUPERSEDED/MISSING_FILE, versioned-name
  check). **Depends on:** none. **Touch set:** `src/portraitStudioCore.ts` + tests. **Gate:** unit
  tests for each adoption-kind + candidate state; compile+suite.

### S2 — Studio panel (read-only)
- **Goal:** render ACTIVE (gold/正史 + provenance) + CANDIDATES rail from a new `portraitStudioView`
  host message built on existing loaders + the `characters/*.json` watcher; replace the Character
  Profile portrait block with a "Portraits ▸" entry. **Depends on:** S1. **Touch set:**
  `webview/modules/89f-portrait-studio.js` + CSS, `index.html`, build registration,
  `webview.portrait.*` i18n ×4, a read-only host `portraitStudioView` emitter. **Out of scope:** job
  strip (S3), adopt write (S4). **Gate:** compile+suite; watcher refresh works; 400px; no writes.

### S3 — Studio job status strip
- **Goal:** stage rail + alive box + timeout budget + Generate-as-retry-policy from forwarded job
  status. **Depends on:** **MEDIA-COMFY-001 merged** + **M-FWD**. **Touch set:** Studio module/CSS +
  i18n; consume `portraitJobStatus`. **Out of scope:** the host parser (that is M-FWD). **Gate:**
  compile+suite; stage transitions + failure faces render; duplicate-guard text correct.

### S4 — explicit adopt command (write)
- **Goal:** host `adoptPortraitCandidate(characterId, relativePath)` re-running
  `verifyAdoptedPortraitArtifact`, atomic JSON write, refresh; compare-modal UI; unify manual-upload
  to versioned names. **Depends on:** S2. **Touch set:** `src/characterManager.ts` (+ command wiring
  in `extension.ts`), Studio compare modal, i18n. **Gate:** adoption re-validates; JSON atomic;
  no auto-adoption; human smoke (below).

### S5 — candidate ledger (new store · design-gate) · S6 — intent picker (interim) · S7 — composition heuristics (future gate)
- **S5:** capped `characters/<id>.portraits.json` (≤50) for intent/job metadata + batch folds.
  Design-gate the schema. **S6:** 3 fixed intents (full-body/bust/expression) mapped to today's
  prompt builder + advanced read-only compiled-plan fold from `MediaProfile`. **S7:** optional VLM
  composition tags (自動判定), design+cost gate. Each: own gate + compile+suite.

### M-FWD — host: forward TA_MEDIA_STATUS → webview (MEDIA lane)
- **Goal:** parse `TA_MEDIA_STATUS`/failure `TA_MEDIA_RESULT` lines incrementally from the portrait
  subprocess stdout and forward `portraitJobStatus{promptId,state,elapsedSeconds}` to the webview.
- **Depends on:** MEDIA-COMFY-001 merged. **Touch set:** `src/characterManager.ts`
  `child.stdout.on('data')` handler + a small parser module + `extension.ts` message plumbing.
  **Out of scope:** any UI (that is S3). **Gate:** unit test parses real record fixtures; compile+suite.

---

## 6. AI / Model Routing

Recommended implementer/verifier per slice. "Fable" = high-taste UX/CSS work; "Sonnet/Opus-class" =
core logic + host protocol; verifier is always a *different* agent doing independent verification.

| Slice | Recommended implementer | Recommended verifier |
|---|---|---|
| C1 Cinematic | Fable (CSS/UX; it authored the original) | Opus-class independent smoke |
| P1 pulseCore | Opus/Sonnet-class (pure logic + tests) | Independent unit-test audit |
| P2 Pulse shell+NOW | Fable (band layout, drawer, provenance) | Opus-class (a11y + no-write audit) |
| P3–P5 bands | Fable | Opus-class |
| P6 majorArcs | Opus-class (determinism, schema) | Independent + design-gate reviewer |
| IA1 tab regroup | Opus-class (careful DOM surgery) | Independent reachability audit |
| G1 global layer | Fable (restraint-critical) | Opus-class (clutter/role-weight review) |
| N1 nav back-stack | Opus-class (controller) + Fable (affordances) | Independent dead-end hunt |
| S1 studioCore | Opus/Sonnet-class | Independent unit-test audit |
| S2 Studio RO | Fable (atelier/authority grammar) | Opus-class (no-write, watcher) |
| S3 job strip | Fable + Opus-class (state machine) | Independent lifecycle audit |
| S4 adopt command | Opus-class (host write, validation) | Independent + **human** smoke |
| S5/S6/S7 | mixed per gate | Independent |
| M-FWD host forward | Opus/Sonnet-class (protocol) | Independent record-fixture audit |

---

## 7. Verification Strategy

- **Every slice:** `npm run compile` + full `npm test` + `check_i18n_keys.js` (0 missing) + the
  genre-chrome-last bundle contract. New pure cores ship with unit tests covering each rule/state.
- **UI slices:** static harness (real `index.html` + real bundle + `acquireVsCodeApi` stub + fixture
  `worldView`/`portraitStudioView` messages, per `DEMO.md`), driven in-browser: mode/route toggles,
  drawer Esc + focus-return, tablist arrow keys, `scrollWidth === clientWidth` at 400px,
  reduced-motion honoured, console clean.
- **Read-only surfaces (P*, S2):** assert **no `postMessage`** except UI navigation — a grep gate in
  the smoke.
- **Host slices (M-FWD, S4):** unit tests over real `TA_MEDIA_STATUS`/`TA_MEDIA_RESULT` fixtures and
  the M1.1 verification chain; atomic-write assertions.
- **Regression:** Console (non-cinematic) layout diff on C1; every existing pane reachable after IA1.
- **Independent verify:** each slice gets a second agent reproducing gates from a clean worktree
  before human smoke — the repo's established `*-independent-verify` pattern.

---

## 8. Human-Smoke Sequence

Gated, real-app, in order. Each is a short scripted session the human runs in a real VSCode + real
workspace (and, where noted, real ComfyUI).

1. **After C1:** open a session → 🎬 → confirm scene/narrative/choices/minimal status; Esc + ⛶
   return to Console; reload persists mode; Relay banner visible in Cinematic.
2. **After P2 (+IA1):** tap WORLD → Pulse NOW renders from a live campaign; open a card → evidence
   drawer shows 事実/兆候/不確か with real ids; confirm no world mutation occurred.
3. **After S2:** open a character → Portraits ▸ → ACTIVE shows correct file + adoption kind;
   externally edit `characters/<id>.json` → active slot refreshes via watcher.
4. **After N1:** Pulse PEOPLE card → NPC dossier → Studio → 遊びに戻る lands in PLAY/Cinematic;
   back-stack retraces.
5. **After MEDIA-COMFY-001 + M-FWD + S3:** trigger a **real** long ComfyUI portrait load → job strip
   shows QUEUED→RUNNING, live clock, 最終観測, budget; Generate is disabled with the duplicate-job
   text; force a QUEUE_REJECTED and an ORPHANED to see the two failure faces + retry guidance.
6. **After S4:** adopt a candidate → compare modal → confirm → active moves to gold, old becomes
   旧版, JSON on disk points to the versioned artifact; adopting an out-of-convention file keeps the
   authority note. (This is the smoke the original human pass *could not* answer — it is the gate.)

---

## 9. Recommended Next Three Tasks

1. **C1 — Cinematic slice onto current main.** Highest value/lowest risk; ~5-file webview touch set;
   no host change; cherry-pick, do **not** merge branch `644c1ae`. Ships immersive play immediately.
2. **P1 + P2 — worldPulseCore + Pulse shell/NOW/evidence.** Delivers the first "what's happening in
   my world" answer with zero new host plumbing (rides the existing `worldView`), read-only, and
   establishes the provenance vocabulary the whole system reuses.
3. **S1 + S2 — portraitStudioCore + read-only Studio panel.** Makes the already-real MEDIA-M1.1
   adoption authority *visible* (ACTIVE 正史 + CANDIDATES) without waiting on MEDIA-COMFY-001, and
   sets up the seam for the job strip (S3) once the media lane merges and M-FWD forwards status.

Run these as three parallel lanes (disjoint touch sets); land **IA1's tab skeleton** as soon as P2
and S2 need a home so they mount into named surfaces rather than temporary panels.

---

**Final verdict:**

```text
EXPERIENCE_ARCH_001_READY_FOR_IMPLEMENTATION
```
