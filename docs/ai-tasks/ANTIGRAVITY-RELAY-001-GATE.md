# Antigravity Relay 001 — Minimal UX Gate

- AI: Claude
- Model: Claude Sonnet
- Reasoning: High
- Role: UX Gate Designer
- Repository: `C:\AI\text-adventure-vsce` (`https://github.com/GGF1sh/LoreRelay`)
- Source of Truth: `origin/main` at fetch time (`00422b8`)
- Read: `origin/main:docs/ai-tasks/ANTIGRAVITY-RELAY-UX-BUG-INTAKE.md`, `origin/main:docs/AI_REVIEW_BACKLOG.md`
- Backlog ID: `ANTIGRAVITY-RELAY-001`

## Gate verdict

`ANTIGRAVITY_RELAY_GATE_READY`

Every mechanism this gate requires already exists in the codebase in read-only or near-identical form. This is a presentation-layer gate: it reuses an existing centralized input-lock, an existing full-mode-swap overlay pattern, an existing per-turn context payload, an existing canonical result file, and existing copy-button precedent. No gameplay mechanic, schema, or persisted rule is introduced.

---

## Product purpose

Today, two surfaces can appear to offer action affordances at once: LoreRelay's own chat input/options/GM-processing UI, and Antigravity operating on the workspace externally. This gate defines **External Agent Relay Mode**, a display state in which LoreRelay's own action affordances go quiet and a compact **Payload Panel** becomes the visible surface, so that at any instant exactly one surface looks actionable.

```text
Relay Mode OFF → LoreRelay UI is the active surface (unchanged today)
Relay Mode ON  → LoreRelay UI displays/exports context only
               → Antigravity acts externally
               → LoreRelay imports/observes the result via the existing turn_result.json path
```

This is successful only if turning Relay Mode on changes nothing about gameplay, game state, or the Slice 1 Decision Surface — it only changes what the webview chrome looks like and which affordances are clickable.

---

## Critical baseline truths

### B1 — A single centralized input-lock hook already exists, but does not cover every control

`webview/modules/10-game-state.js:568-577`:

```text
function isInputLocked() { return gameOverActive; }
function setInputLocked(locked) {
  [freeInput, sendBtn, imgBtn, micBtn, undoBtn, #regen-btn].forEach(disable)
  .option-btn, .qr-btn -> disable
}
```

`renderOptions()` (`10-game-state.js:604+`) already checks `isInputLocked()` before rendering option buttons at all. Extending the boolean expression inside `isInputLocked()` is sufficient to suppress `freeInput`, `sendBtn`, `imgBtn`, `micBtn`, `undoBtn`, `#regen-btn`, all `.option-btn`, and all `.qr-btn` with no per-feature-module change.

Four additional controls are toggled ad hoc, outside `setInputLocked`, inside `showGmLoading()` / `hideGmLoading()` (`webview/modules/20-input-audio-prep.js:368-396`): `#qr-undo`, `#qr-retry`, `#experience-profile-btn`, `#parlor-settings-btn`. Any suppression contract must cover these four explicitly; they will not be caught by extending `isInputLocked()` alone.

### B2 — A full-mode-swap banner pattern already exists

`setGameOverOverlay(gameOver)` (`10-game-state.js:579-601`) is the existing template for "flip a global mode, show a full banner, call `setInputLocked`, driven by a state field pushed from host." Relay Mode's banner must follow the same shape: a boolean flag drives a dedicated overlay element and calls the same lock function Game Over already calls.

### B3 — The GM-processing indicator is two centrally dispatched message types, decoupled from its wording

`webview/modules/90-bootstrap.js:326-329`: `gmStart`/`grokStart` → `showGmLoading()`; `gmEnd`/`grokEnd` → `hideGmLoading(msg.success)` (`20-input-audio-prep.js:336-400`). The element (`#gm-loading`, `.gm-typing-dots`, label text `T('webview.gm.loading')`) is separate from the trigger. Relay Mode can swap only the rendered label/element, not the trigger — but see B8: a Relay-Mode turn does not necessarily route through `gmStart`/`gmEnd` at all, since no LoreRelay-side GM provider is invoked.

### B4 — The turn-request-equivalent payload already exists and is already computed per turn

`src/gmPromptBuilder.ts:2354` `postPromptContextToWebview(playerAction)` posts `{type: 'promptContext', breakdown: buildGmPromptBreakdown(playerAction)}`. It already fires from four call sites in `src/gmBridgeRunner.ts` plus `src/agenticGmRunner.ts:296`, and is already consumed read-only by `webview/modules/80-inspector.js:renderPromptContext()` (sections, memory matches, lore matches, token estimate). **The Payload Panel's "current turn prompt/request" must be built from this exact existing structure — not a new prompt-assembly function.**

### B5 — The turn-result-equivalent payload and its canonical file already exist

`gameStateUpdate.turnResult` is already pushed to the webview and rendered read-only by `80-inspector.js:renderTurnResult()`. Independently and more importantly: **`turn_result.json` at the workspace root is already the canonical file every GM path writes** (`vscodeLmWriteTurnResult()`, `gmBridgeRunner.ts:876-914`: *"Write turn_result.json for the extension pipeline"*), and `src/gameStateSync.ts:584-599` already runs a `vscode.FileSystemWatcher` on that exact path, deduping and applying it (`statePatch.ts:425`) regardless of what process wrote it. **Any external tool that saves a conforming `turn_result.json` (shape: `src/types/TurnResult.ts`) is already picked up automatically — no new ingestion code is required.** The Payload Panel's "target output file" is this existing path and schema, verbatim.

### B6 — Existing copy-to-clipboard precedent

Two precedents already exist and must be reused verbatim for the Payload Panel's copy actions: the per-message copy button (`10-game-state.js:207-217`, `navigator.clipboard.writeText` + temporary checkmark) and the Genesis Guide "copy prompt" button (`06-genesis-guide.js:586-603`, `navigator.clipboard.writeText` + toast + `<textarea>.select()` fallback for environments without clipboard API access).

### B7 — This is a tooling/workflow concern, not a game rule

`src/gameRulesCore.ts`'s `GameRules` interface/`DEFAULT_GAME_RULES`/`game_rules.json` is where story-facing toggles like `enableCommerce` live, surfaced through the Game Rules tab (`webview/index.html:1082`, `webview/modules/70-game-rules.js`, `updateGameRules`/`getGameRules` in `src/webviewHandlers.ts:255-260`). Which GM bridge/workflow is active is a **separate, already-established concern**, configured today via `vscode.workspace.getConfiguration('textAdventure')` (e.g. `gmBridge.command`, `gmBridge.commandArgs`, `grokBridge.fallbackToClipboard` in `gmBridgeRunner.ts`). Relay Mode belongs with the latter, not the former — it must never touch `GameRules`, `game_rules.json`, or any code path that reads/writes it. This is also what guarantees B8/B9 below for free: Relay Mode has zero surface overlap with anything Slice 1's `enableCommerce`/`enableCommerceUi` logic touches.

### B8 — A Relay-Mode turn plausibly does not invoke `gmStart`/`gmEnd` at all

If Antigravity (or the user, copying by hand) is the one writing `turn_result.json`, no LoreRelay-side provider function ever runs, so `gmStart`/`gmEnd` never fire. Relay Mode's own "waiting" indicator must therefore be driven locally: start when the user copies/exports a payload, end on the next `gameStateUpdate` (already the universal "state changed" broadcast that fires whenever `turn_result.json` is processed, per B5) — not on `gmStart`/`gmEnd`. This keeps the indicator correct regardless of whether any LoreRelay-side provider happens to also be configured.

### B9 — Slice 1's hybrid Decision Surface must be left completely untouched when Relay Mode is off, and explicitly out of scope when it is on

Per `GAMEPLAY-SLICE1-IMPLEMENTATION-GATE.md`, `Run the spike` reuses the plain chat-insertion path (`postWorldInsertChatText` → normal `freeInput` → normal send). The backlog (`docs/AI_REVIEW_BACKLOG.md`) already records the Slice 1 hybrid 30-minute playtest as blocked in part by this exact relay-mode noise problem. This gate does not attempt to make Relay Mode and the Slice 1 hybrid playtest run simultaneously — see the Non-goals below. Because Relay Mode has zero code overlap with `livingWorldCommerceUiCore.ts`/`worldView.ts`/the World tab's rendering (B7), simply leaving Relay Mode **off** during the Slice 1 playtest reproduces today's already-verified behavior exactly.

---

## V0 contract

### Relay Mode source of truth

A new VS Code workspace setting, following the exact existing `gmBridge.*` pattern: `textAdventure.antigravityRelay.enabled` (boolean, default `false`), read via `vscode.workspace.getConfiguration('textAdventure')`. This is a workflow setting, not a `GameRules` field (B7).

The host pushes the current value to the webview as a small, dedicated message — reusing the same kind of ambient push already used for other host-known values — e.g. `{ type: 'antigravityRelayStatus', active: boolean }`, sent once when the panel is created/revealed and again whenever the setting changes. (Confirm at implementation time whether an existing `onDidChangeConfiguration` listener can be reused, or whether this is simplest read at the same points other ambient settings are already read; this is the one wiring detail this gate leaves open, analogous to how the Slice 1 gate left its exact `plan.days` wiring for implementation to confirm against real call sites.)

The webview holds this in a module-level flag mirroring `gameOverActive` exactly (`10-game-state.js:568,584`): `antigravityRelayActive`.

### Suppression contract (must cover every element in B1)

While `antigravityRelayActive` is true:

1. `isInputLocked()` becomes `return gameOverActive || antigravityRelayActive;` — one boolean term added, nothing else in `setInputLocked()`/`renderOptions()` changes.
2. Additionally and explicitly, disable the four controls B1 identified as not covered by `setInputLocked`: `#qr-undo`, `#qr-retry`, `#experience-profile-btn`, `#parlor-settings-btn`.
3. `#options-bar` content is not rendered as clickable buttons (already implied by #1 via `renderOptions()`'s existing `isInputLocked()` guard); the same option labels are instead listed as plain read-only text inside the Payload Panel (see below), so Antigravity/the user still knows what choices the last turn offered without a clickable affordance implying LoreRelay itself will act on a click.
4. Restoring from Relay Mode (`antigravityRelayActive` flips back to false with `gameOverActive` also false) must call `setInputLocked(false)` and re-enable the four controls from #2, mirroring exactly what `setGameOverOverlay`'s existing `false` branch already does (`10-game-state.js:585-588`).

### Relay Mode banner

A new overlay element (e.g. `#antigravity-relay-overlay`), shown/hidden by a new function built on the exact shape of `setGameOverOverlay` (B2): sets `antigravityRelayActive`, toggles the overlay's hidden class, and calls `setInputLocked` per the suppression contract above. Banner copy states plainly that Antigravity is the active channel and LoreRelay's own input is intentionally inactive (new locale keys, `en.json`/`ja.json`/`zh-CN.json`/`zh-TW.json`, following the Slice 1 precedent of adding `webview.antigravityRelay.*` keys).

### GM-processing replacement (B3, B8)

- If a LoreRelay-side provider call still happens to run while Relay Mode is on (not the intended path, but not structurally prevented either), `showGmLoading()`'s rendered label swaps to a Relay-Mode-specific string (e.g. `webview.gm.relayWaiting`, "Waiting for Antigravity result") instead of `webview.gm.loading` — same element, same `gmStart`/`gmEnd` triggers, different text only.
- The primary, intended waiting indicator is local and independent of `gmStart`/`gmEnd` per B8: it starts when the user uses any Payload Panel copy/export action (below) and clears on the next `gameStateUpdate`.

### Payload Panel

A single compact panel, visible only while `antigravityRelayActive` is true, showing:

- **Current turn prompt/request** — rendered from the same `promptContext.breakdown` structure Inspector already renders (B4), in a compact subset (not the full Inspector detail view): summary line (backend/token estimate) plus the assembled section text.
- **Available options, read-only** — plain text list of the last turn's option labels, if any (see suppression contract #3).
- **Minimal world state** — whatever ambient, already-pushed read-only fields the webview already has available for display elsewhere (current location, recent changes); no new state is computed for this.
- **Target output path** — a fixed, literal line naming `turn_result.json` at the workspace root as the expected result file (B5), so the user/Antigravity knows exactly what to produce and where.

### Copy / export actions (B6)

- **Copy prompt** — copies the plain-text rendering of the current `promptContext.breakdown`, using the exact `navigator.clipboard.writeText` + toast/fallback pattern from `06-genesis-guide.js`.
- **Copy JSON payload** — copies `JSON.stringify(breakdown, null, 2)` (or the raw message payload already received), same copy mechanism.
- Both actions also flip the local "awaiting result" indicator per B8/GM-processing replacement above, since copying is the signal that the user is about to hand this to Antigravity.
- No new file-save/import button is required for V0. `turn_result.json` ingestion is already automatic (B5); a manual "open/save `turn_result.json`" convenience button is an optional future enhancement, not required for gate readiness, exactly as the Slice 1 gate deferred its own direct-travel seam.

### Building the payload without a new prompt-assembly path

The one new plumbing this gate requires: while Relay Mode is on, submitting the compose box must call the *existing* `buildGmPromptBreakdown(playerAction)` / `postPromptContextToWebview(playerAction)` (B4) to refresh the Payload Panel, and must **not** proceed into any provider dispatch (`invokeGrokBridge`/`invokeVscodeLmBridge`/`invokeCustomGmBridge`/etc.). This is a thin routing change at the existing dispatch point (`handleWebviewMessage` in `src/webviewHandlers.ts:135`), not new business logic: when Relay Mode is on, the existing `freeInput`/`selectOption` submission short-circuits to "build and display context" instead of "invoke a GM provider."

---

## Non-goals (restated from intake, binding)

- Do not add new gameplay mechanics, Ledgers, Ops, or simulation subsystems.
- Do not touch `GameRules`/`game_rules.json`/any Slice 1 file (`livingWorldCommerceUiCore.ts`, `worldView.ts`, `webview/modules/85-world.js`'s Decision Surface code, `transportCore.ts`, `worldSimCommerceCore.ts`, `commerceCore.ts`).
- Do not attempt to make Relay Mode and the Slice 1 hybrid 30-minute playtest active at the same time; the playtest must run with Relay Mode off, which (per B7/B9) reproduces today's already-verified behavior exactly.
- Do not invent a new `turn_result`-like schema or a new ingestion mechanism; reuse the existing file/watcher (B5).
- Do not add more normal-looking action buttons to compensate; the Payload Panel is explicitly read/copy-oriented, not a second control surface.

---

## Touch set (anticipated — for the implementation gate to confirm)

### Expected

- `webview/modules/10-game-state.js` — extend `isInputLocked()`; extend the restore branch of the new overlay function; disable/re-enable the four ad-hoc controls from B1.
- `webview/modules/20-input-audio-prep.js` — relay-mode label swap in `showGmLoading()`.
- `webview/modules/80-inspector.js` or a new small sibling module — compact Payload Panel rendering, reusing `renderPromptContext`'s data shape.
- `webview/index.html` — new overlay markup, new Payload Panel markup, following existing markup patterns (`#game-over-overlay`, existing Inspector panel markup).
- `src/webviewHandlers.ts` — the Relay-Mode short-circuit at the existing dispatch point; a small new case for pushing `antigravityRelayStatus`.
- `package.json` — new `contributes.configuration` entry for `textAdventure.antigravityRelay.enabled`, alongside the existing `gmBridge.*` entries.
- `locales/en.json`, `locales/ja.json`, `locales/zh-CN.json`, `locales/zh-TW.json` — new `webview.antigravityRelay.*` / `webview.gm.relayWaiting` strings only.
- `webview/script.js` — generated output only, via the existing build command; never hand-edited.

### Forbidden

Do not modify `src/gameRulesCore.ts`, `src/livingWorldCommerceUiCore.ts`, `src/worldView.ts`, `src/transportCore.ts`, `src/worldSimCommerceCore.ts`, `src/commerceCore.ts`, `src/gameStateSync.ts`'s watcher/apply logic, `src/statePatch.ts`, `src/types/TurnResult.ts`, or any action/intent/persistence schema. Any required change to these blocks implementation and returns to gate review.

## No-new-foundation rule

This gate must not create a new Ledger, Ops family, state variable in `game_state.json`/`world_state.json`, simulation subsystem, `*Core.ts` architecture layer, or any new `turn_result`-shaped file/schema. The only new persisted artifact is one VS Code configuration boolean.

---

## Acceptance criteria

- **A1** — With Relay Mode off, no rendered output, message flow, or test result changes anywhere (byte-identical webview build, identical `npm test` result) versus the current post-merge baseline.
- **A2** — With Relay Mode on, `freeInput`, `sendBtn`, `imgBtn`, `micBtn`, `undoBtn`, `#regen-btn`, every `.option-btn`, every `.qr-btn`, `#qr-undo`, `#qr-retry`, `#experience-profile-btn`, and `#parlor-settings-btn` are all disabled.
- **A3** — With Relay Mode on, submitting the compose box refreshes the Payload Panel via the existing `buildGmPromptBreakdown` data shape and does not invoke any GM provider function.
- **A4** — With Relay Mode on, the Payload Panel names `turn_result.json` as the target path; manually placing a conforming file at that path updates game state exactly as it does today for any other provider, with zero new ingestion code.
- **A5** — Toggling Relay Mode off restores every control from A2 to its pre-Relay-Mode enabled/disabled state (respecting `gameOverActive` if that is separately true).
- **A6** — No `GameRules`/`game_rules.json` read or write occurs anywhere in the Relay Mode code path.
- **A7** — With Relay Mode off, Slice 1's World tab, Decision Surface candidates, and `Run the spike` chat-insertion path are provably unchanged (existing Slice 1 focused test + full suite still pass unmodified).

## Verification (for the implementation gate)

```text
npm run compile
npm run build:webview
npm test
```

Also confirm: generated `webview/script.js` has zero drift; no unrelated file changes; `game_rules.json` schema/tests untouched; Slice 1's `scripts/test_gameplay_slice1_decision_surface.js` still passes unmodified.

---

# Final Verdict

`ANTIGRAVITY_RELAY_GATE_READY`
