# COMBAT-BATTLE-VIEW-FOUNDATION-V1-001 — Design & Task Packet

Date: 2026-07-23 JST
Base: `origin/main` @ `3daf96368c20f2b704e1946bf494c290a0b61ac9`
Branch: `task/COMBAT-BATTLE-VIEW-FOUNDATION-V1-001`
Risk: Medium
Author: Claude Sonnet 5 (High) — design/task-packet only, no production code in this pass
Next AI / role: Fable 5 — implementation

## 1. Purpose

The RTS command playtest is functionally wired to the real `CombatState`/`stepCombat` pipeline, but the
screen it lives on today is a bare dev-sandbox strip inside Combat Lab: unstyled buttons, a small fixed
battlefield `<div>`, plain-text status/feedback lines. The goal of this task is **not** "build a second
webview panel" — that is only the minimal technical vehicle. The actual goal is:

> Turn the lonely RTS screen into something that looks and feels like a game screen Fable 5 would want to
> keep playing with, in a space large enough (an independently resizable panel) to actually design that
> experience.

Battle View succeeds only if a human opening it feels "this is a battlefield I'm commanding," not "this is
a debug console with markers on it."

## 2. Current authority boundary (read this before touching anything)

- `CombatCommandPlaytestHost` (`src/combatCommandPlaytestHost.ts`) is the **sole** session + scheduler
  authority. It owns: one `CombatCommandPlaytestSession`, one playback timer, `startId` lifecycle,
  `subscribe(subscriberId, postMessage)` / `unsubscribe(subscriberId)`, and broadcast fan-out
  (`combatCommandPlaytestState` / `combatCommandPlaytestError`) to every subscriber.
- The existing (only) subscriber today is the main panel: `extension.ts` creates it with subscriber id
  `COMBAT_COMMAND_PLAYTEST_MAIN_SUBSCRIBER = 'main-webview'` at panel creation
  (`combatCommandPlaytestHost.subscribe(...)` right after `panel.webview.html = html`) and unsubscribes it
  in `panel.onDidDispose` — **it does not call `.clear()`**, so closing the main panel does not end the
  battle. Battle View must follow the exact same subscribe-on-open / unsubscribe-on-dispose /
  never-clear-on-dispose shape, with its own distinct subscriber id.
- Host message handlers already exist and are subscriber-agnostic — they mutate the one host session and
  broadcast to whoever is subscribed: `handleStartCombatCommandPlaytest`, `handleIssueCombatCommand`,
  `handleStepCombatCommandPlaytest`, `handleSetCombatCommandPlaytestRunning` (all in `extension.ts`,
  dispatched from `webviewHandlers.ts`'s `case 'startCombatCommandPlaytest'` etc.). **Reuse these
  verbatim** — do not write a parallel command-handling path for Battle View.
- Two functions currently push state only to the single main `panel` and must become "post to every open
  Combat-related panel": `sendCombatLab()` (posts `combatLabState`, i.e. the scenario catalog) and
  `sendCombatCommandPlaytest()` (posts `combatCommandPlaytestState`) — both in `extension.ts`. The
  straightforward fix is one small helper (e.g. `postToCombatPanels(message)`) used at both call sites;
  when Battle View is not open this must be behaviorally identical to today (i.e. posting to `undefined`
  is a no-op, same as the existing `panel?.webview.postMessage`).
- `stepCombat`, `BattleSpec`, tick rate, and the command/order contract in
  `docs/COMBAT_RTS_COMMAND_SPINE_DESIGN.md` are out of reach for this task. Nothing here should ever call
  a combat-core function directly — only through the Host's existing public methods.

## 3. Scope for Fable 5 (implementation)

1. A dedicated, independently resizable, singleton `vscode.WebviewPanel` ("Battle View") opens from:
   - the Command Palette (new command, see §9), and
   - a button inside Combat Lab's existing Command Playtest section
     (`webview/modules/89f-combat-lab.js`, inside `renderCombatCommandPlaytest`/`bindCombatCommandPlaytest`).
2. Battle View subscribes to the same `CombatCommandPlaytestHost` with its own subscriber id and, on open,
   adopts whatever session already exists (or shows the empty/pre-start state) — it must never call
   `start()` automatically just because it opened, and closing it must never end the session.
3. Full visual redesign of the RTS play surface *for this panel*: layout, hierarchy, HP/selection/order/
   outcome legibility, control grouping, Fit/Zoom. This is where nearly all of Fable 5's actual design
   effort should go — see §4–§7.
4. Command Lab itself is not redesigned in this task; only the one small "Open Battle View" affordance is
   added to it.

## 4. Visual direction & information hierarchy

Rough priority order for screen real estate and visual weight, highest first:

1. **Battlefield** — the single largest element on the panel, filling essentially all remaining space
   after the toolbar/status chrome. Everything else is a frame around it, not a competitor for space.
2. **Unit state on the battlefield itself** — HP, selection, dead/alive, current order — read directly off
   each unit marker without looking away. (HP bar per unit, distinct selected-ring, dead units rendered as
   unmistakably dead but still visible at their last position, a compact order indicator per unit.)
3. **A thin, persistent status strip** — selection summary, tick, mode, terminal outcome — always visible,
   never covering the battlefield.
4. **A grouped command toolbar** — see §5 — visually secondary to the battlefield, but easy to scan by
   function (lifecycle vs. movement/attack vs. mode).
5. **Transient feedback** (last issued command, accept/reject) — brief, non-modal, must not block or shift
   the battlefield layout when it appears/disappears.

Reuse LoreRelay's existing VS Code theme variables (`--vscode-*`) for color/border/background so Battle
View feels like part of the same application rather than a separate tool bolted on — do not invent a new
color language. Fable 5 has room to make specific choices (marker shapes, HP bar styling, toolbar iconography
vs. text, exact status-strip layout); this packet intentionally does not pin those down further.

## 5. Controls / status / selection / HP / outcome / error placement policy

- **Toolbar**: group by function, not by historical add-order — e.g. (a) lifecycle: Start/Restart, Run/
  Pause, 1 tick; (b) orders: Attack-move, Stop, Resume Gambit; (c) mode: Command/Spectator selector. Every
  control must reflect actual availability (e.g. Run/Pause/1‑tick disabled with no active session; order
  buttons disabled with no selection) rather than silently no-op'ing — mirrors the existing
  `updateCombatCommandPlaytestView` disabled-state pattern in `89f-combat-lab.js`.
- **Status strip**: selection (count + short ids), tick, mode, terminal outcome — one compact always-on
  strip, not scattered `<p>` tags.
- **Selection**: click / Shift-click / drag-box-select on the battlefield, exactly as Combat Lab already
  implements it — same semantics, distinct (better) visual treatment.
- **HP**: a small bar + numeric value on every unit marker, always visible (not hover-only), since HP is
  the single most important continuous readout during a fight.
- **Outcome**: once `playtest.outcome` is non-empty, it must be impossible to miss — a clear terminal
  banner/state, not just one more line in the status strip.
- **Errors** (`combatCommandPlaytestError`): transient, near the toolbar or status strip, must not block
  battlefield interaction.

## 6. Minimal Battle View panel/subscriber foundation

Keep the *infrastructure* minimal — it exists to enable §4/§5, not to be the deliverable:

- One new singleton panel var in `extension.ts` (parallel to the existing `panel` var), created via
  `vscode.window.createWebviewPanel(...)`, `enableScripts: true`, a `localResourceRoots` scoped to its own
  asset folder (does not need the full game's `resourceRoots` list).
- One new subscriber id constant distinct from `'main-webview'`, subscribed on panel creation and
  unsubscribed in `onDidDispose` — never `.clear()` on dispose.
- Reuse the existing `handleWebviewMessage(message, createWebviewHandlerDeps())` dispatcher for messages
  coming from this panel — do not fork a second message-handling path. Battle View only ever needs to send
  the small existing set (`startCombatCommandPlaytest`, `issueCombatCommand`, `stepCombatCommandPlaytest`,
  `setCombatCommandPlaytestRunning`, `requestCombatLab` for the scenario catalog) plus whatever `openGame`-
  style focus command is used from the Combat Lab button.
- Its own dedicated webview bundle (new HTML + JS, not the full `index.html`/`script.js`/`style.css`
  application bundle) — see §8 for what should still be shared rather than re-derived.
- A `nonce` + CSP meta tag exactly like the main panel's `renderWebviewHtml` does today (reuse `getNonce()`
  from `extension.ts`); no need to reuse the rest of the main HTML's templating machinery.

## 7. Responsive sizing, Fit, Zoom

- The battlefield container must track the panel's actual size (VS Code panel resize, split-editor resize,
  moving it to a different column) — a `ResizeObserver` on the battlefield's container is the natural fit.
- **Fit**: compute a scale that fits the full battle rect (from `playtest.bounds`) inside the current
  container without cropping, then apply it as a transform/scale — purely a presentation transform, must
  not alter `playtest.bounds` or any coordinate reaching the Host.
- **Zoom In / Out / 100%**: adjust the same presentation scale; box-selection and right-click move/attack
  targeting must convert screen→world coordinates through the *current* scale (i.e. selection/targeting
  correctness must hold at every zoom level and after every resize, not just at the default).
- None of this changes `combatBattlefieldPoint`'s world-coordinate math contract, only where/how it reads
  the container's current geometry.

## 8. What to share with existing Combat Lab (vs. what to leave alone)

`webview/modules/89f-combat-lab.js` already implements every piece of pointer/selection/marker/message
logic Battle View needs, as small pure(ish) functions: `combatUnitMarkerModel`, `applyCombatUnitMarkerElement`
/`createCombatUnitMarkerElement`, `combatBattlefieldPoint`, `combatCommandMessageForPointer`,
`combatPlaytestStatusText`, `combatPlaytestFeedbackText`, `labEsc`/`labClamp`, and the webview-side start-id
helpers `createWebviewStartNamespace`/`nextCombatPlaytestStartId`.

Recommended approach: **extract** this set into a small shared module consumed by both Combat Lab and
Battle View, rather than hand-copying it a second time. If the extraction touches `89f-combat-lab.js`
itself, keep the change to thin delegation (same function names/signatures, bodies now call the shared
module) so `src/combatCommandWebviewAdapter.test.ts` (1812 lines, exercises exactly these functions through
a minimal custom DOM/vm harness — see its `createMinimalDom()` near the top of the file) keeps passing
unchanged. If budget is tight, a same-shape *new* module used only by Battle View (with a one-line note
that unifying the two call sites is a follow-up) is an acceptable fallback — but do not silently
re-diverge the two implementations without saying so in the PR description.

Do **not** share: the JSON scenario editor, run/repeat/swap/compare/timeline/export/import/save — none of
that belongs in Battle View's scope.

## 9. Localization targets (ja / en)

Combat Lab itself has no i18n today (it's an English-only workspace dev sandbox) — Battle View is
different in kind (meant to be opened and played, not just a dev tool), so it needs real localization:

- New command: `textadventure.openBattleView`, contributed in `package.json`'s `commands` array with
  `"title": "%command.openBattleView%"`, following the exact pattern of the existing
  `textadventure.openGame` entry immediately above it.
- New flat keys in `package.nls.json` (`"command.openBattleView": "LoreRelay: Open Battle View"`) and
  `package.nls.ja.json` (`"command.openBattleView": "LoreRelay: バトルビューを開く"`).
- New flat keys in `locales/en.json` / `locales/ja.json` (same flat-dotted-key convention as the existing
  `"webview.panel.title"`) for: the panel title and every static toolbar/status-strip label. Render these
  server-side via the existing `t(key)` (`src/i18n.ts`) into the panel's HTML at creation time — Battle
  View's own JS does not need a client-side locale-bundle runtime for this first pass. Dynamic data
  (unit ids, order/command names, receipt reasons) stays as-is; it is data, not UI chrome, and is not in
  scope for translation.

## 10. Focused tests (write these; do not run a full suite)

- A jsdom/vm-harness test for Battle View's own render/bind logic, mirroring the existing pattern in
  `src/combatCommandWebviewAdapter.test.ts` (its `createMinimalDom()` + direct function invocation style):
  HP bar reflects `hp`/`maxHp`; a selected unit gets a distinct visual state; a dead unit gets a distinct
  state while keeping its last `x`/`y`; selection (click/Shift-click/drag-box) and right-click move/attack/
  attack-move produce the same message shapes Combat Lab already produces.
- A focused host-side test (or extension of an existing one) confirming: opening Battle View subscribes
  with a new distinct subscriber id and immediately receives the current snapshot if a session exists;
  closing Battle View unsubscribes but does not call `.clear()` / does not end the session; a command
  issued from either panel is reflected in the other (shared-session fan-out).
- If Fit/Zoom coordinate conversion is implemented as an extractable pure function, unit-test the
  screen→world conversion at a couple of scale factors directly (cheap, deterministic, no DOM needed).
- Do not re-run the full `npm test` suite for this — per `docs/DEVELOPMENT_VERIFICATION_POLICY.md`,
  Medium risk needs focused tests + compile + a short human smoke, not a full-suite rerun.

## 11. User GUI smoke (human, manual — do not attempt via automation)

1. Open Combat Lab, start a Command Playtest, then click the new "Open Battle View" button — the same
   battle appears in the new panel without restarting.
2. Resize/move the Battle View panel (including to a second column) — battlefield keeps proportion; try
   Fit, Zoom In/Out, 100%.
3. Issue orders from Battle View (select, move, attack, attack-move, stop, resume gambit) and confirm
   Combat Lab's own view (if still open) reflects the same state; then do the reverse.
4. Close Battle View — Combat Lab keeps running uninterrupted. Reopen Battle View — it reattaches to the
   same in-progress battle without restarting it.
5. Switch Command ⇄ Spectator mode and confirm command controls disable/reject appropriately in Spectator.
6. Switch the VS Code display language (or `textAdventure.locale` setting) between `en`/`ja` and confirm
   the panel title and toolbar/status labels localize; confirm the Command Palette entry localizes too.

## 12. Out of scope (explicit)

Combat mechanics, `BattleSpec`, `stepCombat`, tick rate, scheduler redesign (`CombatCommandPlaytestHost`'s
existing session/scheduler contract, `startId`/peer-adoption/clear/replacement semantics are unchanged);
pathfinding; formations; Direct Action; Remote Play; a minimap or camera system; redesigning Combat Lab's
non-playtest sections (JSON editor, run/repeat/compare/timeline/export/import/save); final large-scale HUD
polish, portraits, or animation beyond what's needed for HP/selection/order/outcome legibility; merging this
PR; cleanup of the old, already-superseded `task/COMBAT-RTS-COMMAND-ENTRYPOINT-V1-001` branch/worktree.

## 13. Likely touch set

- `src/extension.ts` — new panel var + subscriber id, `openBattleView()` creation function, command
  registration, `postToCombatPanels` helper at the two identified call sites.
- `webview/modules/89f-combat-lab.js` — one small addition: an "Open Battle View" button/handler inside
  the existing Command Playtest section; optionally, thin delegation to a newly-extracted shared module
  (see §8).
- New: a shared pointer/marker/message logic module (extracted per §8) plus Battle View's own small
  HTML + JS/CSS asset set (a new, independent bundle — not the full `webview/script.js`/`style.css`).
- `scripts/build-webview.js` — extend to also produce Battle View's own small bundle (its existing
  `buildBundle()` helper already supports an arbitrary module list/output path).
- `package.json`, `package.nls.json`, `package.nls.ja.json` — one new command contribution + two nls keys.
- `locales/en.json`, `locales/ja.json` — new flat keys for Battle View's static UI text.
- New or extended test file(s) under `src/` for the items in §10.
- `docs/generated/SYMBOL_REGISTRY.md` / `symbol_registry.json` — regenerate only if the change adds a
  shared/reusable export, per `docs/AI_WORKFLOW.md`'s "before changing shared vocabulary" rule; not needed
  just for webview-internal DOM glue.

## 14. Verification (for the implementation task)

Follow `docs/DEVELOPMENT_VERIFICATION_POLICY.md` — this is Medium risk. Do not escalate beyond its tier
without a concrete reason.

- `npm run test:plan -- --base origin/main --head HEAD --mode verify`, inspect the plan before running it.
- `npm run compile`.
- The focused tests from §10 (via the plan, plus anything the plan misses).
- `node scripts/test_webview_bundle.js`.
- `npm run generate:symbol-registry` / `node scripts/test_symbol_registry.js` only if the touch set adds a
  shared/reusable export (see §13's last bullet).
- A full `npm test` / full suite is deferred to final integration, not required here.
