# EXPERIENCE-ARCH-001 — Unified Player Experience Architecture

- **Branch:** `architecture/EXPERIENCE-ARCH-001-unified-player-experience` (isolated worktree from `origin/main` @ `c0418a8552b8ab2d6247eff238e004d3ee944388`)
- **Scope:** Product architecture and integration planning **only**. No production code, no `src/**`, no webview production files, no version bump, no generated-bundle or installed-Skill changes. All three UX branches and the MEDIA lane were inspected **read-only**.
- **Companion:** [`EXPERIENCE-ARCH-001-IMPLEMENTATION-PROGRAM.md`](./EXPERIENCE-ARCH-001-IMPLEMENTATION-PROGRAM.md)
- **Core product vision:** 好きな世界で、好きな立場で、生きる — *live in a world you love, in a role you choose.* The player may be a poor villager, traveller, merchant, adventurer, mercenary, commander, guild master, shopkeeper, caravan owner, lord, king, or emperor. **The UI must never assume the player is an adventurer.**

---

## 1. Executive Recommendation

LoreRelay is not short of good surfaces. It is short of **one coherent place to live in a world**.
Today the extension is a two-pane console: a chat "Adventure Log" on the left, and a **nine-tab
management panel** on the right (Adventure Status, Character Profile, Inspector, World, Lorebook,
Memory, Director, Party, Vehicles, OOC), plus seven modal drawers. Every tab is individually
defensible; together they read as *"a collection of excellent panels,"* exactly the failure the
brief names.

The three Fable directions are the cure, but only if they are integrated as **one navigation model
around a small number of top-level surfaces** rather than as three more panels. My recommendation:

1. **Adopt a five-surface information architecture — PLAY · WORLD · PEOPLE · CHRONICLE · TOOLS —**
   and demote the nine flat tabs into these groupings. This is not a rewrite: it is a re-labelling
   of an existing tab strip plus two new player-facing views, and it can be delivered incrementally
   behind the existing game-rule flags.
2. **Cinematic Play Mode is the default *presentation* of PLAY, not a new surface.** It is already
   a clean, presentation-only CSS toggle (`body[data-play-mode="cinematic"]`) with a ~5-file touch
   set and **zero host changes**. Integrate the *slice*, not the branch (the branch tip predates
   MEDIA-M1.1 and would revert it). Ship it early — it is the fastest, most visible player win.
3. **World Pulse is the player-facing *default view* of WORLD; World Observatory becomes its
   "instruments / advance" management sub-view.** Pulse answers "what is happening / what did I
   miss"; the Observatory's watch/advance tick *mutates* the world and therefore belongs behind a
   management affordance, never on the read-only pulse. Pulse needs **almost no new plumbing** — the
   existing `worldView` broadcast already carries its data.
4. **Portrait Studio replaces the portrait block inside Character Profile and becomes a focused
   sub-route of PEOPLE.** It makes the already-real MEDIA-M1.1 adoption authority *visible*, and it
   is the natural home for the MEDIA-COMFY-001 job lifecycle once the host forwards
   `TA_MEDIA_STATUS`. Adoption stays a host-validated write; the UI never becomes authority.
5. **Add one thin global state layer** — a compact ambient status (character · location · time ·
   funds · tension · relay · media-job) that renders as the cinematic top-strip in PLAY and a slim
   bar elsewhere, and collapses to near-nothing in cinematic mode. No permanent dashboard.
6. **Navigation is a context back-stack, not a maze of "open panel" buttons.** Every entity — NPC,
   faction, location, event, portrait — is a linkable target; a persistent "▸ 遊びに戻る / Return
   to play" affordance guarantees the player never feels stranded in an admin tool.

The three works share a visual bloodline (dark glass, RGB-variable accent, Noto Serif JP reading
column) but each earns a distinct *authority grammar*. They should feel like **rooms in one house,
not the same room copied three times.** §11 defines the shared system that makes that true.

**Verdict:** the design is ready. Sequencing and conflict surfaces are the real risk, and they are
addressed in the companion program.

---

## 2. Current Product Reality Map

Audited directly against `origin/main` @ `c0418a8` (not the branches' self-reports). Layout: a left
`#chat-area` (the play surface) and a right `#status-area` (tabbed management), separated by a
draggable `#resizer`. Header carries 10 icon buttons; 7 `<aside>` drawers overlay on demand.

### 2.1 Reality matrix

Legend for verdict — **KEEP** (stays roughly as-is), **MERGE** (folds into a top-level surface),
**REPLACE** (superseded by a Fable direction), **DEFER** (management/debug; keep but move out of
the player's primary path).

| Surface | Current role | Authoritative data | User value | Overlap / problem | Verdict |
|---|---|---|---|---|---|
| **Start Hub** (`#start-hub`, `05-quickstart`, `06-genesis-guide`) | Launch: resume / Parlor / In-World / demos / create (quick+interview) / presets / character new+import | none (dispatches host commands) | High — the front door | Crowded (13+ buttons, 3 create paths); role-neutral vision under-served | **KEEP**, re-group as the LAUNCH state of PLAY |
| **Adventure Log** (`#chat-area`, `chat-log`, options, quick-reply, input) | The actual play loop | chat entries + `worldView` status | Highest — this *is* the game | Buried beside a 9-tab panel; chrome competes with narrative | **KEEP** → becomes **PLAY**; Cinematic is its default presentation |
| **Header** (10 buttons) | Global toggles: locale, quickstart, home, img-gen, rules, remote, relay, profile, parlor-settings, tts | mixed | Medium | Mixes global state, settings, and one-shot actions in one strip | **MERGE** into global layer + TOOLS |
| **Adventure Status** tab (`pane-status`) | Location/time/funds, resources, condition/inv/skills, checkpoints, dice, calc, BGM/SE, gallery, theme, summary | `worldView.status`, game_state | High but overloaded | Ten unrelated widgets in one tab; status ≠ dice ≠ BGM | **MERGE**/split: status → global layer; dice/calc/BGM/checkpoints → PLAY tools tray |
| **Character Profile** tab (`pane-character`) | Active character select + portrait block + form | `characters/<id>.json` | High | Portrait block is thin (one preview, no candidates/history/authority) | **REPLACE** portrait block with Portrait Studio; rest → **PEOPLE** |
| **Character Creator** modal | Full ST-compatible editor | `characters/<id>.json` | High (authoring) | Fine; large modal | **KEEP** under PEOPLE |
| **Inspector** tab (Timeline/Debug/QA lanes) | Chronicle, replay export, git timeline; debug console, state orchestrator, debug trace; QA (placeholder) | journal, chronicle, git | Timeline=player; Debug/QA=dev | Player-facing Chronicle is trapped next to developer tooling | **SPLIT**: Timeline → **CHRONICLE**; Debug/QA → **TOOLS** |
| **World** tab (`pane-world`) | Map (mermaid/parchment/tile/settlement/diorama), domain, guild, campaign kit, caravan, markets, NPC whereabouts, NPC bonds, factions, quests, **+ World Observatory subtree** | `worldView.*`, world_forge | High but dense | "everything about the world" in one scroll; no ranking of *what matters now* | **MERGE** into **WORLD**; World Pulse becomes its default view |
| **World Observatory** (`88-…`, gated) | Market sparklines + chronicle + NPC bonds + **watch/advance observer tick** | `worldView`, `worldObservatoryCore` | Medium | Overlaps Pulse; the *tick advances the world* (a write) | **DEFER** to WORLD's "Instruments / Advance" management sub-view |
| **Lorebook** tab | Entry editor | `lorebook.json` | Medium (authoring) | Reference authoring, not play | **MERGE** into TOOLS (or CHRONICLE reference) |
| **Memory** tab | Backend select + search + rebuild | memory index | Low (debug/tuning) | Developer/tuning surface | **DEFER** to TOOLS |
| **Director** tab | Scenario act/scene/objective/endings | scenario.json.director + game_state | Medium | Read-mostly progression; overlaps Chronicle spine | **MERGE** into CHRONICLE (as "campaign spine") |
| **Party** tab | Party roster, banter/quiet flags, relationships | party_director.json, game_state | High | Overlaps PEOPLE/NPC bonds | **MERGE** into **PEOPLE** |
| **Vehicles** tab (gated) | Read-only fleet garage | vehicle_state.json | Niche | Fine; already gated/hidden | **KEEP** under WORLD (gated) |
| **OOC** tab | GM out-of-character commentary | gm output | Low–medium | Fine; small | **KEEP** as a PLAY side-channel |
| Drawers: Image Gen, Game Rules, Parlor Settings, Remote Play, Quickstart | Settings & one-shot flows | various json | Medium | Correctly modal | **KEEP** under TOOLS / global |
| **Experience Profile** (Parlor ⇄ Campaign) | Mode switch; `profile-parlor-only` gating | connection/persona/game_state | High | The real top-level axis, hidden in a header button | **PROMOTE** to an explicit mode selector |

### 2.2 Three findings that shape everything

1. **The right pane is a filing cabinet, not a journey.** Nine sibling tabs of equal weight force
   the player to *know which drawer* their question lives in. The Fable works succeed precisely
   because each answers *one question* ("what's happening?", "who is this?", "what's official?").
2. **Role-neutrality is already half-built and under-surfaced.** Game rules already carry
   `playerRole` (merchant/adventurer/retainer/smith/ruler) plus Domain, Guild, Commerce, and
   Caravan modes. The vision's non-adventurer roles exist in *data* but the *chrome* still leads
   with ⚔️ and "Adventure Log." The IA must let role reshape emphasis (see §3, §9).
3. **Media has no lifecycle in the UI.** Host→webview media messages are binary
   (`imageGenStart/End`, `locationImageGenStart/End`, `worldMapGenStart/End`, `expressionGenerated`,
   `genesisImageGenerated`). There is no QUEUED/RUNNING/ORPHANED/TIMED_OUT. That vocabulary exists
   **only** in MEDIA-COMFY-001's Python skill as `TA_MEDIA_STATUS` stdout records — and the host
   does not forward them yet. This single seam gates both Portrait Studio's job strip and any
   global media-job indicator (§13.3).

---

## 3. Unified Information Architecture

Five top-level surfaces, chosen from repo reality (not the sample `PLAY/WORLD/PEOPLE/HISTORY/TOOLS`
applied blindly — though it landed close). The nine tabs collapse into these; nothing is deleted,
much is *re-homed*.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  GLOBAL STATE LAYER  (§9) — character · place · time · funds · tension ·  │
│                              relay · media-job   [ambient, collapsible]    │
├──────────────────────────────────────────────────────────────────────────┤
│  PLAY      the world happening to you now — narrative, choices, scene art │
│            · presentation modes: Console (management-visible) ⇄ Cinematic  │
│            · LAUNCH state = today's Start Hub / Genesis                    │
│            · play tools tray: dice · calc · checkpoints · BGM · OOC · undo │
├──────────────────────────────────────────────────────────────────────────┤
│  WORLD     what is happening in my world right now  → World Pulse (default)│
│            · map (diagram/parchment/tile/settlement/diorama)               │
│            · role dossiers (domain/guild/caravan/markets) — role-gated     │
│            · Instruments/Advance = old Observatory tick (management)        │
├──────────────────────────────────────────────────────────────────────────┤
│  PEOPLE    who is in my world and where do I stand with them               │
│            · character roster + party + NPC bonds/whereabouts              │
│            · Character Profile / Creator                                   │
│            · Portrait Studio (per-character sub-route)                     │
├──────────────────────────────────────────────────────────────────────────┤
│  CHRONICLE what has happened / what is my story's shape                    │
│            · Chronicle timeline (Inspector Timeline lane, promoted)        │
│            · campaign spine (Director) · arcs · archive/replay export      │
├──────────────────────────────────────────────────────────────────────────┤
│  TOOLS     author & inspect (not the player's primary path)               │
│            · Game Rules · Image Gen config · Lorebook · Memory             │
│            · Inspector Debug/QA · Remote Play · Relay · locale/theme       │
└──────────────────────────────────────────────────────────────────────────┘
```

**Why these five.** They map 1:1 to the four questions a player actually asks — *"what's happening
to me?" (PLAY), "what's happening out there?" (WORLD), "who are these people?" (PEOPLE), "what's the
story so far?" (CHRONICLE)* — plus a clearly-separated authoring bucket (TOOLS). Crucially this is
the grain the three Fable directions were *already* cut along, so integration is convergent, not
forced.

**Desktop realisation.** Keep the two-column shell. The right pane's tab strip is relabelled from
nine peers to **five** (PLAY-context · WORLD · PEOPLE · CHRONICLE · TOOLS), with the old tabs
demoted to *sections/sub-routes within* a surface. Cinematic mode hides the right pane entirely.

**Narrow realisation.** Production webview is desktop-first (fixed side pane + resizer, only
720/640/420 breakpoints, mostly for reduced-motion). Genuine narrow use has two homes: (a) a
narrowed VSCode panel, and (b) the separate `remote-player/` client served over Remote Play. Both
Fable prototypes are already verified to 400px single-column with bottom-sheet drawers; that
responsive grammar (§11.7) becomes the standard for every new surface, so the same view model can
render in a narrowed pane and inform the remote client.

---

## 4. Complete Player Journey

The brief's required flow, mapped to surfaces with explicit entry/return so the player never feels
they "left the game."

```
launch ─────────────▶  PLAY · LAUNCH (Start Hub / Genesis)
  │                     choose or create world & role (role-neutral: villager…emperor)
  ▼
enter campaign ─────▶  PLAY · Console (management visible) — first turns, learn the surfaces
  │                     ─ one tap ⟶ PLAY · Cinematic (focused actual-play)
  ▼
play ───────────────▶  PLAY · Cinematic — scene art · narrative · choices · minimal status
  │                     the world simulates; changes accrue into worldView/recentChanges
  ▼
notice a change ────▶  ambient WORLD pip lights (global layer) OR a choice references it
  │                     tap the pip / "世界の脈" ⟶
  ▼
inspect the world ─▶   WORLD · World Pulse — NOW / RISING / PEOPLE / PLACES / CHRONICLE
  │                     each card → 根拠 (evidence) drawer (事実/兆候/不確か)
  ▼
inspect a person ──▶   from a Pulse PEOPLE card or NPC ref ⟶ PEOPLE · dossier
  │                     standing, whereabouts (uncertainty), party status, milestones
  ▼
change a portrait ─▶   PEOPLE · dossier ⟶ Portrait Studio (sub-route)
  │                     ACTIVE(正史) · GENERATION STATUS(job) · CANDIDATES · adopt-compare
  │                     adopt ⟶ host validates ⟶ JSON watcher re-broadcasts
  ▼
return to play ────▶   persistent "▸ 遊びに戻る" ⟶ PLAY · Cinematic
                        the newly adopted portrait is already reflected (no reload)
```

Two guarantees make this a loop rather than a maze: **(1)** a single, always-present return
affordance to PLAY, and **(2)** a back-stack so "inspect world → inspect person → studio → back →
back" retraces the exact path. No surface is ever a dead end (§14 checks this adversarially).

---

## 5. Top-Level Surface Definitions

For each surface: **primary question · authoritative data · read/write boundary · entry points ·
exit/return · desktop · narrow.**

### 5.1 PLAY
- **Question:** *"What is happening to me right now, and what do I do next?"*
- **Authoritative data:** chat entries (host), `worldView.status` (location/time/funds/resources),
  options/choices, scene background/sprite layers. Writes: `freeInput`, `undoLastTurn`,
  `regenerateLastTurn`, dice→GM, checkpoints — all existing commands.
- **R/W boundary:** the *only* surface that drives GM turns. Cinematic mode is **read-through**
  presentation — zero new writes.
- **Entry:** app launch (→ LAUNCH), "遊びに戻る" from any surface, resume.
- **Exit/return:** tap any top-level surface; Esc leaves Cinematic to Console.
- **Desktop:** left pane primary; Console shows the right pane, Cinematic hides it.
- **Narrow:** full-width chat; tools tray becomes a bottom sheet; Cinematic is the default.

### 5.2 WORLD
- **Question:** *"What is happening in my world right now — and what did I miss?"*
- **Authoritative data:** `worldView` (factions, regions, globalEvents, recentChanges, markets,
  marketPriceHistory, npcBonds, playerBonds, chronicle, campaign-kit/domain/guild/caravan payloads),
  `fogOfWar`, `lastVisitTurnByLocation`. **Default view = World Pulse.**
- **R/W boundary:** **read-only** for the player. The world only changes through GM turns (PLAY)
  or the explicit **Instruments/Advance** tick (management, confirmed, rate-limited per
  `OBSERVER_TICK_CONTRACT`). Pulse never writes.
- **Entry:** WORLD tab; ambient WORLD pip; NPC/faction/location deep-links from anywhere.
- **Exit/return:** evidence drawer → the referenced place/person; "遊びに戻る" → PLAY.
- **Desktop:** Pulse bands hero + 3 columns + chronicle lanes; map & role dossiers below/aside.
- **Narrow:** single-column band stack; evidence drawer as bottom sheet.

### 5.3 PEOPLE
- **Question:** *"Who is in my world, and where do I stand with them?"*
- **Authoritative data:** `characters/<id>.json`, `npc_registry`, `npcRelationships`/milestones,
  `party_director.json`, whereabouts trust precision.
- **R/W boundary:** Character Profile/Creator write character JSON (existing). Party flags write
  `party_director.json`. **Portrait adoption is a host-validated write** (§8). NPC bonds/positions
  are read-only (simulation-owned).
- **Entry:** PEOPLE tab; Pulse PEOPLE card; party context; "generate portrait" from Creator.
- **Exit/return:** dossier → Portrait Studio → back; "遊びに戻る" → PLAY.
- **Desktop:** roster list + selected dossier; Studio as a focused sub-route (not a separate app).
- **Narrow:** roster → dossier → studio as stacked routes; compare modal is a bottom sheet.

### 5.4 CHRONICLE
- **Question:** *"What has happened, and what is my story's shape?"*
- **Authoritative data:** `chronicleCore` (journal + world events, 500 events / 50 chapters),
  `scenario.director` + `game_state.director` (campaign spine), archive/replay export, `majorArcs`
  (new, capped — §12).
- **R/W boundary:** **read-only** except replay/archive export (writes to `exports/`, explicit) and
  archive-chapter (existing). Arcs are written by deterministic heuristic or explicit action —
  **never by LLM fiat** (§13).
- **Entry:** CHRONICLE tab; a Pulse CHRONICLE row; "related development" links from events.
- **Exit/return:** chapter → the turn/place it references; "遊びに戻る" → PLAY.
- **Desktop:** recent lane + chapter folds + arc pins + Director spine.
- **Narrow:** single lane; folds stay one level deep.

### 5.5 TOOLS
- **Question:** *"How do I author and inspect the machinery?"* (explicitly **not** the player path)
- **Authoritative data:** game_rules.json, image_gen_config.json, lorebook.json, memory index,
  debug trace/state orchestrator, remote-play/relay config.
- **R/W boundary:** writes config and authoring files; the Inspector Debug/QA and Observatory tick
  can mutate simulation state and are clearly labelled management/debug.
- **Entry:** TOOLS tab; header gear/paint/relay buttons.
- **Exit/return:** modal close; "遊びに戻る" → PLAY.
- **Desktop:** grouped settings drawers + inspector lanes.
- **Narrow:** full-screen modals.

---

## 6. Cinematic Integration Decision

**Decision: Cinematic is a presentation *mode* of PLAY (Console ⇄ Cinematic), not a separate
surface, and the existing implementation integrates largely as-is.**

Evidence from `webview/modules/89d-cinematic-mode.js` + `webview/styles/9a-cinematic-mode.css`
(read-only, commit `644c1ae`):
- Toggling `body[data-play-mode="cinematic"]` swaps the console into scene-art → narrative reading
  column (Noto Serif JP, 720px) → large choice cards → minimal floating status strip.
- **No `postMessage`, no state writes.** The status strip *mirrors* `#status-location/-time/-funds`
  via `MutationObserver`, so it never needs to understand game_state — schema-independent and
  forward-compatible with HP/resources.
- Persisted in `localStorage['lorerelay.cinematicMode']`; Esc exits (guards IME composition and the
  confirm modal); reduced-motion disabled; verified no horizontal scroll at 375px.

Answers to the required questions:
- **Mode / presentation / surface?** → *Default presentation of PLAY.* New players start in Console
  (surfaces discoverable); one tap enters Cinematic; the choice persists.
- **Enter/exit?** 🎬 header button, Esc, and the in-strip ⛶「管理画面」. Add "遊びに戻る" semantics so
  Cinematic is where deep-links return to.
- **Management chrome accessible?** The header is fully hidden in Cinematic (intentional); the "⋯"
  tools toggle exposes quick-reply/author's-note. **Recommendation (§14):** promote a *minimal* set
  to the top strip — WORLD pip, media-job pip, Relay state, TTS — so ambient signals survive without
  breaking immersion. The Relay banner already renders outside `#chat-header`, so it survives today.
- **Relay Mode coexistence?** Relay banner is outside the hidden header → visible in Cinematic.
  Keep it; add the compact Relay state to the global strip (§9).
- **Scene art + portraits + choices coexistence?** Already composed: `#bg-layer` becomes the hero
  with a vignette; sprites raised; choices are stacked cards. Portrait adoption from Studio reflects
  here live (sprite/portrait layers read the same character JSON).
- **Integrate as-is?** **Yes — the slice, not the branch.** The touch set is `89d-…js`,
  `9a-…css`, a header/topbar splice in `index.html`, `scripts/build-webview.js` registration, and 4
  i18n keys ×4 locales. The branch *tip* lacks MEDIA-M1.1 files that main has (it was cut from an
  earlier main), so **do not merge the branch** — cherry-pick/re-apply the slice onto current main.
  The CSS is scoped entirely under `body[data-play-mode="cinematic"]`, so Console is untouched.

---

## 7. World Pulse / Observatory Decision

**Decision: World Pulse *becomes* the player-facing default view of WORLD; World Observatory is
*absorbed* as WORLD's "Instruments / Advance" management sub-view. Pulse complements the map and
role dossiers; it replaces the Observatory's dashboard role but not its tick machinery.**

Rationale, grounded in the audit:
- Pulse and Observatory read the *same* `worldView` data, but ask different questions. Observatory
  shows *instruments* (sparklines, a node graph, a tick button); Pulse shows *what matters now*,
  ranked, with provenance. For a player, ranked-with-provenance wins.
- **The Observatory tick advances the world** (per `OBSERVER_TICK_CONTRACT`, capped at 200/session).
  That is a **write**. It must not sit on a read-only pulse. It moves behind an explicit
  "Instruments / Advance" affordance inside WORLD, clearly management-tinted.
- **Player-facing world surface = World Pulse + the map.** Everything ranked/interpreted is Pulse;
  the spatial view stays the map; role-specific ledgers (domain/guild/caravan/markets) stay as
  role-gated dossiers below Pulse.
- **What stays management/debug:** the Observatory tick, market-multiplier debug, bulk-advance sim,
  state orchestrator, debug trace → TOOLS / Instruments.
- **Evidence drawer lives *in Pulse*** as a right panel (desktop) / bottom sheet (narrow). Every
  card is a button → 根拠 drawer listing underlying records tagged 事実/兆候/不確か with raw ids
  (`npcFactionRelationships["a|b"] = -72`). The drawer footer restates read-only.
- **Return from a world event to context:** each NOW/PLACES/PEOPLE card deep-links to the relevant
  **place** (map focus), **person** (PEOPLE dossier), or **chronicle** entry; from there "遊びに戻る"
  returns to PLAY. This is the anti-maze rule (§10) made concrete.

Data reality that de-risks this: the `worldView` broadcast **already** carries factionStates,
regionStates, globalEvents, recentChanges, questHooks, markets, npcBonds, playerBonds, chronicle,
and marketPriceHistory. Pulse is a pure `deriveWorldPulse(worldView) → viewModel` with **zero new
host plumbing** for bands NOW/RISING/PEOPLE/PLACES/CHRONICLE. The *only* new data is a capped
`majorArcs` store for the pinned campaign spine (§12), which is deferrable to a late slice.

---

## 8. Portrait Studio / Character Profile Decision

**Decision: Portrait Studio *replaces* the thin portrait block inside Character Profile and becomes
a focused *sub-route* of PEOPLE (a full view on desktop, a route/bottom-sheet on narrow) — not a
permanent modal. Adoption remains a host-validated write; the UI renders authority, it never
becomes authority.**

Answers to the required questions:
- **Replace the Character Profile portrait block?** **Yes.** Today it is a single preview + three
  buttons (import/upload/generate) with *no* job state, *no* candidate concept, *no* history, *no*
  adoption UI. Studio supplies all four. Character Profile keeps identity/personality/equipment
  fields and gains a "Portraits ▸" entry into Studio.
- **Modal / drawer / full surface / sub-route?** **Sub-route of PEOPLE.** It needs full width for a
  2:3 candidate rail and a job strip; a modal would trap the player (violates the no-dead-end rule).
  The adopt **compare** step *is* a modal (a deliberate, focused confirmation), but the studio
  itself is a route with a return affordance.
- **How active portrait authority shows everywhere else:** the adopted `characters/<id>.json`
  `portrait` path is the single source of truth; Cinematic sprites, PEOPLE dossiers, party lists,
  and Pulse PEOPLE cards all read it. Studio is the *only* place that renders the *provenance of the
  adoption* (正式採用 versioned / 手動アップロード fixed / 手動編集 verification-bypassed) and warns
  when the JSON points outside the versioned convention — honest, not alarmist.
- **How MEDIA-COMFY lifecycle enters the UI:** the host must **parse `TA_MEDIA_STATUS` lines from
  the subprocess stdout** (the seam already exists — `characterManager.ts` accumulates `stdout` and
  calls `parseMediaArtifactResult` at process end; add incremental line parsing in the
  `child.stdout.on('data')` handler) and forward a new `portraitJobStatus{promptId,state,
  elapsedSeconds}` message. Studio renders it as a **stage rail** (QUEUED→RUNNING→COMPLETED discrete
  dots), a live elapsed clock, `最終観測: N秒前`, the timeout budget (`06:48 / 上限 20:00`), and
  state-specific boxes. **The Generate button is the retry policy** (disabled while alive with the
  duplicate-job explanation; `✓ 再試行は安全` after QUEUE_REJECTED; warns after ORPHANED/TIMED_OUT).
- **External Antigravity jobs vs native jobs coherently:** native jobs surface via the stdout
  parser; **external/Antigravity adoptions surface via the existing `characters/*.json`
  FileSystemWatcher** (75ms debounce → re-broadcast). Studio treats both as inputs to the same
  view: a watcher-driven change updates the **ACTIVE** slot; a `portraitGenerated` event updates the
  **candidate** rail, never the active slot (no hidden auto-adoption).
- **New backend data vs existing:** *existing* — active identity, adoption-kind classification,
  candidate states (GENERATED/SUPERSEDED/MISSING_FILE derivable from filesystem+JSON), the M1.1
  verification chain. *New* — (a) the `portraitJobStatus` forward (host, small; depends on
  MEDIA-COMFY-001 merge), (b) an explicit `adoptPortraitCandidate` host command that re-runs
  validation and writes JSON atomically, (c) a capped per-character candidate ledger
  (`characters/<id>.portraits.json`, ≤50) for intent/job metadata — design-gated, deferrable.

---

## 9. Global State Layer

**Principle: one thin, mostly-ambient layer — never a permanent dashboard.** What is *global*
(persists across surfaces), what is *contextual* (lives in a surface), what is *hidden in
cinematic*, what becomes a *compact ambient pip*.

| Signal | Source | Global? | In Cinematic | Form |
|---|---|---|---|---|
| Current **character** | active character JSON | Global | mini-portrait in strip | avatar chip |
| **Location** | `worldView.status.location` | Global | top strip pill | 📍 pill |
| **Time** | `worldView.status.time` | Global | top strip pill | 🕐 pill |
| **Funds / resources** | `worldView.status.funds`, dynamic resources | Global (role-weighted) | top strip pill | 💰 pill |
| **Tension / danger** | derived (recentChanges+globalEvents severities) | Global | subtle border/pulse tint | tension word 静穏/ざわめき/緊迫 |
| **Relay state** | `setAntigravityRelayMode` / relay banner | Global | **visible** (banner is outside header) | compact Relay pip + existing banner |
| **Media-job state** | `portraitJobStatus` (new) / imageGen*/location* | Global | **pip only** | spinner/queue pip → tap opens the owning job (Studio / gallery) |
| WORLD "something changed" | new high-severity `recentChanges` since last WORLD view | Global | **pip** | 🔭/脈 pip with count |
| Condition/inventory/skills | game_state | Contextual (PLAY status / PEOPLE) | hidden | — |
| Dice/calc/BGM/checkpoints | local | Contextual (PLAY tools tray) | behind "⋯" | — |

Rules:
- **Role-weighting.** The strip emphasises what the player's role cares about: a *merchant/caravan
  owner* sees funds/cargo/market-alert prominently; a *lord/commander* sees domain pressure/danger;
  an *adventurer* sees danger/quest. Same layer, role-ordered — this is where "not everyone is an
  adventurer" becomes visible chrome, driven by the existing `playerRole`/mode flags.
- **Ambient, not loud.** The media-job and WORLD-change signals are *pips* (a dot with an optional
  count), not banners. A long-running generation is visible **without trapping the player on one
  screen** — the whole point of the MEDIA-COMFY lifecycle work.
- **Cinematic minimalism.** Only location/time/funds pills + tension tint + the two pips survive;
  everything else collapses. This matches the shipped cinematic top strip, extended by two pips.

---

## 10. Cross-Surface Navigation

**Model: a typed entity-link graph over a single back-stack — not a wall of "open panel" buttons.**

- **Everything is a linkable entity.** NPC, faction, location, event, quest, portrait, chapter,
  arc. Each render of an entity anywhere (a Pulse card, a chat mention chip, a party row) is a link
  to that entity's *home surface*.
- **Canonical home per entity type:**

  | Entity | Home | Example hop |
  |---|---|---|
  | World event / development | WORLD · Pulse NOW + evidence drawer | Pulse event → faction / NPC / location |
  | Faction | WORLD · faction dossier | event → faction standing |
  | Location | WORLD · map focus | Pulse PLACES → map pin |
  | NPC / relationship change | PEOPLE · dossier | Pulse PEOPLE thread → NPC dossier |
  | Character portrait | PEOPLE · Portrait Studio | dossier → Studio → adopt |
  | Chronicle entry / arc | CHRONICLE | Pulse CHRONICLE row → chapter → related development |
  | Media job | its owner (Studio / scene gallery) | media-job pip → Studio job strip |

- **One back-stack.** "PLAY → WORLD(event) → PEOPLE(npc) → Studio → back → back" retraces exactly.
  A persistent **▸ 遊びに戻る / Return to play** always jumps to PLAY (clearing to the root), so the
  player is never more than one tap from the game.
- **Reflected effects, not re-navigation.** Portrait Studio adoption → the JSON watcher
  re-broadcasts → **Cinematic Play Mode reflects the new portrait immediately** (no reload, no
  "go back and refresh"). A relationship change in the sim → the PEOPLE dossier and Pulse PEOPLE
  card update on the next `worldView`. A long job → the pip updates in place.
- **Anti-pattern banned.** No surface may present a grid of "Open X / Open Y / Open Z" buttons as
  its primary content. Links are *contextual and typed* (attached to the entity they concern), not a
  launcher menu. This is the single rule that turns "a collection of panels" into "one place."

---

## 11. Shared Design System

Three rooms, one house. Shared bones (already partly in `webview/styles/97-visual-refresh.css` and
`9a-cinematic-mode.css`), distinct authority grammar per room.

### 11.1 Semantic colours
- **Base surfaces:** dark glass; hairlines `rgba(255,255,255,0.07)`; layered translucency for depth.
- **Accent:** the existing RGB-variable system (default blue `79,142,247`, per-theme palettes) — one
  accent, themable.
- **Authority palette (the load-bearing decision):**
  - **Gold** = *canonical / 正史* — reserved for the **adopted** portrait and pinned major arcs.
    Nothing else may be gold. A finished job never looks adopted.
  - **Blue** = *observed fact / 事実* — records the sim/GM/player produced.
  - **Gold-dashed** = *derived signal / 兆候* — this-screen computations (rankings, trends).
  - **Dotted / hatched** = *uncertain / 不確か* — missing observation, low trust, staleness.
  - **Red** = *failure* — QUEUE_REJECTED / ORPHANED / TIMED_OUT / ADOPTION_FAILED, differentiated by
    border style + icon + wording, never hue alone.
- **Tension tints:** 静穏 (calm, cool) → ざわめき (stirring, amber) → 緊迫 (crisis, red-orange),
  always paired with the tension *word* (not colour-only).

### 11.2 Typography roles
- **Narrative / authority = Noto Serif JP reading column** (system serif stack, no external font →
  CSP unchanged): GM prose in Cinematic, Pulse NOW statements, Studio active-portrait identity.
- **Chrome / data = sans:** labels, pills, meters, tables, filenames (monospace for ids/paths).
- Serif signals "story/authority"; sans signals "instrument/control." The split is a *semantic*
  cue, not decoration.

### 11.3 Surface hierarchy
Hero (Cinematic scene / Pulse NOW / Studio active) → compact rows (RISING / candidates) → folds
(chronicle chapters / candidate batches) → drawers (evidence / compare). Weight decreases as
recency/importance decreases — the anti-"wall of cards" rule.

### 11.4 Authority states vocabulary
`正史 (canonical)` · `採用 (adopt)` · `事実 (fact)` · `兆候 (derived)` · `不確か (uncertain)` ·
`規約外 (outside naming convention)` · `検証OK (verified exists)`. Rendered as chips with distinct
border styles so they survive greyscale and low vision.

### 11.5 Active / candidate / failure vocabulary (media)
`採用中(active)` · `生成済み(未採用) (generated, not adopted)` · `旧版 (superseded)` ·
`ジョブ迷子 (orphaned job)` · `ファイル欠落 (missing file)` · `採用失敗 (adoption failed)` ·
job stages `QUEUED → RUNNING → COMPLETED` + failures. One vocabulary, used identically in Studio,
the media-job pip, and any future gallery.

### 11.6 Motion principles
**Selective motion only** — a page meant to be lived in for hours. Exactly the animated things that
carry information: the header/tension **pulse** (period/colour = tension), **meter fills** on first
paint, **drawer/sheet slide**, **message fade-in** (0.6s), and the job stage **breathe**. Everything
else is static. `@media (prefers-reduced-motion: reduce)` stops all of it; textual clocks and the
tension word remain.

### 11.7 Responsive rules
Every new surface must verify `scrollWidth === clientWidth` at 400px (both prototypes already do).
Desktop = multi-column with a side drawer; ≤~1100 = 2 columns; ≤~760 = single column, drawer →
bottom sheet; ≤~420 = compact single column. `overflow-wrap:anywhere` on all Japanese message
surfaces and filenames. This is the contract that lets the same view model serve a narrowed VSCode
pane and inform the remote-player client.

### 11.8 What we deliberately do NOT do
We do **not** flatten the three into one identical skin. Cinematic keeps its dark-glass serif
narrative theatre; Pulse keeps its tension/pulse instrumentation; Studio keeps its gold-authority
atelier. They share tokens, type roles, motion budget, and the authority palette — enough to be one
house, not so much that each room loses its purpose.

---

## 12. 100-Turn Survival Model

The highest product priority is *survive 100 turns.* The unified UX analysed at four horizons.

| Horizon | State of the world | What the player sees | Mechanism |
|---|---|---|---|
| **Turn 1** | empty/partial | LAUNCH → first Console turns; Pulse shows deliberate 不確か empty states ("世界は静かです / 静けさも情報です") | empty-as-uncertainty, never blanks |
| **Turn 20** | a few events, a handful of NPCs, one arc forming | Cinematic play; occasional WORLD pip; Pulse NOW 1–3 cards; PEOPLE 3–5 threads | band caps + recency ranking |
| **Turn 100** | hundreds of events, many NPCs, many portraits, stale locations | Constant on-screen item count: Pulse bands stay capped; CHRONICLE = 10-row recent lane + 4 chapter folds + arc pins; Studio candidate rail ≤6 + per-batch folds | caps + folds + aging |
| **Turn 300** | very long campaign, multiple arcs, returning after days away | Lands on PLAY/Cinematic; Pulse + staleness badges + arc pins answer "what did I miss" without replaying rows | arc spine + staleness + NOW recency |

Anti-failure mechanisms, each tied to a real production cap:
- **Infinite-scroll sludge → banded caps + folds.** Pulse: NOW ≤3, RISING ≤6, PEOPLE ≤6, PLACES ≤6.
  CHRONICLE: strict 10-row recent window; history behind explicit folds (never infinite scroll).
  Studio: ≤6 candidate cards; older behind per-batch `<details>`. Inherited caps keep the math
  honest: **20 live events (FIFO), 500 chronicle events, 50 chapters, 24 price points**, ≤10
  named-NPC materialization.
- **Notification overload → ambient pips + ranking.** No banners for routine change; the WORLD pip
  carries a count, and NOW's `severity × recencyDecay × relevanceBoost` ranking means only genuinely
  important things reach hero scale. Old drama is *structurally unable* to outrank fresh events.
- **Panel explosion → five surfaces, entity links.** New capability lands as a *section/sub-route*
  of an existing surface, not a new top-level tab. The entity-link model (§10) means growth adds
  *links*, not *launchers*.
- **Unreadable history → 4-level summarization hierarchy.** raw event → chapter (`chronicleCore`
  grouping) → arc (pinned strip, capped `majorArcs` ≤8) → present bands. Reading is top-down; each
  level capped; total on-screen ~constant regardless of campaign length. Aging: events >12 turns
  render dimmed; PLACES staleness badges from `lastVisitTurnByLocation`.
- **Returning after absence → NOW + staleness + arcs.** A returning player lands on PLAY, taps the
  WORLD pip once, and reads three NOW cards + arc pins + staleness — not a backlog.
- **Portrait archaeology → adoption lineage + batch folds.** v1→v2→current stays readable through
  the 旧版 chain; a campaign's hundreds of generations stay one fold deep.

---

## 13. Authority Boundaries

The rules that keep AI, generation jobs, and stale paths from silently becoming authority.

1. **The world only changes through PLAY (GM turns) or the explicit Instruments/Advance tick.**
   Pulse, PEOPLE dossiers, CHRONICLE, and the global layer are **read-only**. Pure
   `derive*(worldView) → viewModel` functions, unit-testable, no `postMessage` except UI navigation.
2. **AI is never a second narrator on a read-only surface.** Every Pulse derivation is a
   deterministic threshold rule over persisted state — no LLM summarization anywhere in Pulse or the
   global layer. If LLM recaps are ever added they require a *fourth* provenance value and must cite
   event ids; out of scope here.
3. **Media generation state comes from records, not narration.** The job strip renders
   `TA_MEDIA_STATUS`/`TA_MEDIA_RESULT`; "the job is alive" is only ever asserted from a heartbeat,
   never inferred. Raw records are viewable in a fold.
4. **Hidden duplicate jobs are prevented by making the Generate button the retry policy.** While a
   confirmed prompt is QUEUED/RUNNING the button is disabled with the duplicate-job explanation;
   only after a terminal state does it re-enable (green ✓ after QUEUE_REJECTED where no job exists;
   a duplicate-risk warning after ORPHANED/TIMED_OUT). This directly closes the "retry creates a
   second image" hole MEDIA-COMFY-001 exists to fix. Native duplicate-guard is the single in-flight
   `portraitProcess`; cross-process (Skill/Antigravity) jobs are surfaced via stdout + the JSON
   watcher so the player *sees* them rather than racing them.
5. **正史 is the workspace artifact + validated JSON reference — nothing else.** Adoption is a
   host command that re-runs `verifyAdoptedPortraitArtifact` (success → path inside `characters/` →
   versioned name `<id>_portrait_<16hex>` → freshness → JSON resolves to exactly that artifact) and
   writes JSON atomically. The UI *shows* this chain; it cannot bypass it. `portraitGenerated` from
   the host updates the **candidate** rail, not the active slot — no hidden auto-adoption.
6. **Stale image paths cannot silently reappear.** Studio renders file validity (`検証OK` / missing)
   and naming-convention conformance (`規約外`) as first-class facts; a `MISSING_FILE` candidate
   shows a ghost block with adoption disabled; a JSON pointing outside the versioned convention keeps
   its authority note even on the happy path. The manual-upload fixed-name path is unified to
   versioned names at the adoption command, closing the third informal path.
7. **Arcs are not written by LLM fiat.** The capped `majorArcs` store is populated by explicit
   GM/player action or a deterministic chapter-boundary heuristic — design-gated before build.

---

## 14. Adversarial Findings

Attacking the three prototypes without politeness; only what survives is carried forward.

**Cinematic Play Mode**
- **F1 (kept-with-fix): the hidden header strands global actions.** In Cinematic the whole
  `#chat-header` is `display:none`, so TTS, locale, image-gen settings, and the WORLD/media pips
  vanish. *Fix:* promote a minimal ambient set (WORLD pip, media-job pip, Relay, TTS) into the
  top strip (§9); everything else stays behind "⋯" or a Console trip. Do **not** re-expose the full
  header — that would undo the immersion.
- **F2 (risk): branch baggage.** Integrating branch `644c1ae` wholesale reverts MEDIA-M1.1
  (`portraitArtifact.ts`, `mediaArtifactCore.ts`). *Fix:* cherry-pick the ~5-file slice onto current
  main; never merge the branch. (Program slice C1.)
- **F3 (minor): sprite/立ち絵 tuning is unverified** with real multi-sprite scenes; the author flags
  it. Non-blocking; revisit with real data.
- **F4 (minor): Parlor interaction unverified.** Parlor already hides `status-area`, so the mirror
  has nothing to read; verify the strip degrades to `---` gracefully.

**World Pulse**
- **F5 (accepted, must stay honest): no faction/relationship time series exists.** Only
  `marketPriceHistory` is a real series. Every "rising/falling" about factions or people is a
  *derived reading of current state*, and the UI must say 兆候 and never draw a fake trend line. The
  prototype already enforces this; the production slice must not "improve" it into invented history.
- **F6 (real, mitigated): `recentChanges` forgets after 20 events.** The live present is a small
  window; long memory is only in the chronicle/milestones. Mitigation is the 4-level hierarchy
  (§12) — but if a critical event ages out of the FIFO before the player returns, only the chronicle
  holds it. *Action:* NOW ranking must pull from chronicle recent lane too, not only `recentChanges`.
- **F7 (cost): major arcs are hand-authored sample data.** The pinned spine needs a new capped
  `majorArcs` store and a *deterministic* population rule. Until slice 6 lands, the arc pins are
  empty-state honest, not faked.
- **F8 (guard): the Observatory tick must not leak onto Pulse.** Ticking advances the world; keeping
  it visually adjacent risks a player mutating the world thinking they are "refreshing." *Fix:*
  Instruments/Advance is a separate, management-tinted affordance with its own confirm.

**Portrait Studio**
- **F9 (dependency): the job strip is inert until MEDIA-COMFY-001 forwards status.** Without the
  host stdout parser there is no QUEUED/RUNNING. *Fix:* ship Studio read-only (ACTIVE + CANDIDATES)
  first; add the job strip as a dependent slice after MEDIA-COMFY-001 merges.
- **F10 (safety): adoption in the prototype mutates in-memory only.** Production must route through
  the host validation + atomic JSON write, or a UI-only adoption could desync JSON from disk. Non-
  negotiable (§13.5).
- **F11 (cost/future): composition heuristics (multi-subject / subject-too-small)** need a VLM pass
  that does not exist and has a real cost. Keep the UI slots, tag 自動判定, gate behind design+cost.
- **F12 (scale): candidate ledger is a new store.** Per-candidate intent/job metadata needs
  `characters/<id>.portraits.json` (≤50). Derive as much as possible from filesystem+JSON first;
  add the ledger only when intent metadata is actually needed.

**Cross-cutting**
- **F13 (accessibility): motion budget must be enforced globally,** not per-surface. Three animated
  things per surface, reduced-motion honoured, tension in an `aria-live=polite` region.
- **F14 (navigation dead ends): the compare modal and any full-screen job view must have Esc +
  focus-return + a visible return path.** Verified in prototypes; must not regress in production.
- **F15 (role neutrality): the global strip and Pulse ranking must be role-weighted** or the vision
  regresses to "adventurer-first." Drive from existing `playerRole`/mode flags.

---

## 15. Rejected Alternatives

- **R1 — Merge all nine tabs into World Pulse.** Rejected: Pulse answers "what's happening"; it is
  not an authoring or people surface. Overloading it recreates the filing-cabinet problem inside one
  view.
- **R2 — Cinematic as a separate top-level surface.** Rejected: it shares PLAY's data and writes;
  making it a sibling would duplicate the play loop and fork state. It is a *presentation mode*.
- **R3 — Keep World Observatory as the player world view.** Rejected: instrument-dense, unranked,
  and its tick mutates the world — wrong authority posture for a player-facing default.
- **R4 — Portrait Studio as an always-full-screen app / permanent modal.** Rejected: full-screen
  breaks the return-to-play loop; a permanent modal traps the player. Sub-route with a return
  affordance is the fit.
- **R5 — A permanent HUD dashboard of all global state.** Rejected: clutter; violates "live in a
  world," not "monitor a world." Ambient pips + role-weighted strip instead (§9).
- **R6 — Node-graph relationships in the player view.** Rejected (the Observatory already has one):
  a radial graph answers "who exists," not "what changed / why it matters," and scales
  quadratically. Relationship *threads* (line = relationship, milestone on the thread) scale
  linearly and rank by significance.
- **R7 — LLM-written world/portrait recaps as authority.** Rejected: would make AI a silent second
  narrator on read-only surfaces and could invent history. All derivations stay deterministic;
  arcs are heuristic/explicit, never LLM fiat.
- **R8 — One unified visual skin for all three works.** Rejected: it would erase the purpose-built
  authority grammars (cinematic serif theatre / pulse instrumentation / gold atelier). Shared tokens,
  distinct rooms.
- **R9 — Merge the three UX branches directly.** Rejected: only Cinematic has production code, and
  its branch tip predates MEDIA-M1.1; the other two are prototype-only. Integrate slices onto current
  main; never merge the branches.

---

## Appendix A — Evidence Inspected (read-only)

- **origin/main** `c0418a8`: `webview/index.html` (1507 lines), `webview/modules/*` (00-core,
  10-game-state, 52-character-creator, 80-inspector, 85-world, 88-world-observatory, 90-bootstrap,
  …), `webview/script.js` (15,097 lines), 293 `src/**.ts` (extension 2010, gmPromptBuilder 2480,
  characterManager, worldView, chronicleCore, npcRelationshipCore, …). Protocol: 81 webview→host
  commands; ~35 host→webview push types (central: `worldView`; media binary only).
- **PLAY-UX-001** `644c1ae`: `webview/modules/89d-cinematic-mode.js`, `webview/styles/9a-cinematic-mode.css`,
  `index.html`/`script.js`/`style.css` additions, `PLAY-UX-001-CINEMATIC-PLAY-MODE-RESULT.md`,
  `docs/assets/screenshot-cinematic-mode.jpg`. Branch tip lacks MEDIA-M1.1 files present on main.
- **WORLD-PULSE-001** `7e9a8ae`: `docs/prototypes/world-pulse/{index.html,styles.css,prototype.js,
  sample-data.json}`, desktop+narrow screenshots, `WORLD-PULSE-001-HIGH-FIDELITY-PROTOTYPE.md`.
  Prototype-only; no `src/**`.
- **PORTRAIT-STUDIO-001** `d800505`: `docs/prototypes/portrait-studio/{…}`, desktop+narrow
  screenshots, `PORTRAIT-STUDIO-001-HIGH-FIDELITY-PROTOTYPE.md`. Prototype-only; no `src/**`.
- **MEDIA-COMFY-001** `0173cb9` (independent verify `6d34dfd`):
  `antigravity-skill/text-adventure-gm/scripts/comfyui_generate.py` — `TA_MEDIA_STATUS` /
  `TA_MEDIA_RESULT`, states QUEUED/RUNNING/COMPLETED/ORPHANED/TIMED_OUT/QUEUE_REJECTED,
  `COMFYUI_JOB_TIMEOUT`=1200s, orphan grace, no 300s cutoff.
  `MEDIA-COMFY-001-LONG-LOAD-JOB-LIFECYCLE.md` — VERIFYING, unmerged, host forwarding absent.

---

**Final verdict:**

```text
EXPERIENCE_ARCH_001_READY_FOR_IMPLEMENTATION
```
