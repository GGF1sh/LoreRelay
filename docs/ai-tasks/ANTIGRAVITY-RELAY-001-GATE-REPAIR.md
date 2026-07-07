# Antigravity Relay 001 — Gate Repair

- AI: Claude
- Model: Claude Sonnet
- Reasoning: High
- Role: UX Gate Designer
- Repository: `C:\AI\text-adventure-vsce` (`https://github.com/GGF1sh/LoreRelay`)
- Repaired artifact: `docs/ai-tasks/ANTIGRAVITY-RELAY-001-GATE.md` (branch `docs/antigravity-relay-001-gate`)
- Integrator review: `93133e32bee1e65102a68a4f55e990046c2f2c33` / `main:docs/ai-tasks/ANTIGRAVITY-RELAY-001-GATE-INTEGRATOR-REVIEW.md` — `ANTIGRAVITY_RELAY_GATE_NOT_READY`
- Board: `369fa5c0ff7fa1bfe544748f257e96b5291f3ee4`

## Scope statement

This document repairs only **G1**, **G2**, and **R1–R5** from the integrator review. No exploration agent and no repository scan were used; this repair is written from the review and the existing gate text alone, per the review's own instruction. It is a patch over the existing gate, not a rewrite: every baseline truth (B1–B9), the touch set, the no-new-foundation rule, and the non-goals not touched below stay exactly as already stated in `ANTIGRAVITY-RELAY-001-GATE.md`.

---

## G1 — resolved: one coherent Relay Mode interaction path

The contradiction was that the gate disabled `freeInput`/`sendBtn`/options while also requiring the compose box to be submitted so `buildGmPromptBreakdown(playerAction)` could run. Per R1, the fix is to stop conflating "suppress normal GM/provider dispatch" with "suppress every input." The repaired rule:

**Relay Mode disables GM-dispatching controls, but leaves the composer open, and repurposes exactly one action as the relay handoff.**

This replaces the gate's "Suppression contract" and "Payload Panel available-options" sections as follows.

### Suppression contract (replaces the existing section in full)

While `antigravityRelayActive` is true:

1. `imgBtn`, `micBtn`, `undoBtn`, `#regen-btn`, `#qr-undo`, `#qr-retry`, `#experience-profile-btn`, `#parlor-settings-btn` are disabled — these all either start a normal GM turn (undo/regen) or are unrelated to composing/handing off a relay request.
2. `freeInput` stays **enabled**. It is the composer for the text that goes into the outbound relay envelope (R2). This is the one deliberate, coherent input path R1 requires — it is not a contradiction of "suppress normal input," because it never reaches a GM provider while Relay Mode is on (see G2 below).
3. `sendBtn` stays enabled but is **repurposed**, not disabled: while Relay Mode is on, its label changes (existing i18n label-swap pattern, same mechanism the gate already uses for `showGmLoading`'s text swap) to a distinct, clearly-labeled relay action (e.g. `webview.antigravityRelay.prepareAction`, "Prepare for Antigravity"), and its click handler branches at the existing dispatch point instead of calling the normal send path. This satisfies R1's "one clearly labeled Relay composer / handoff action remains active" without adding a new DOM element.
4. `.option-btn` / `.qr-btn` stay enabled but are also **repurposed**, not disabled and not left inert (R3): while Relay Mode is on, clicking one populates `freeInput` with that option's text instead of dispatching a normal GM turn. The option becomes the pending composed action, exactly like typed text, and then goes through the same single relay-handoff action in point 3. This is R3's option 1 ("populate the Relay composer").
5. Restoring from Relay Mode re-enables/re-labels everything above back to normal, exactly as the existing gate's restore rule already states for `setGameOverOverlay`-style toggling.

This directly resolves G1: the composer (`freeInput`) is never disabled, so there is no contradiction with needing to submit it; only the GM-dispatching endpoint (`sendBtn`'s normal behavior, and options' normal behavior) is redirected.

---

## G2 — resolved: exact outbound handoff envelope

The existing gate reused `promptContext.breakdown` but never specified that it must be built from the **current, fresh** composed action, nor gave an exact envelope shape. Per R2:

### Handoff sequence (replaces "Building the payload without a new prompt-assembly path")

1. User composes text in `freeInput` (typed directly, or populated by clicking a repurposed option button per G1 point 4).
2. User clicks the repurposed `sendBtn` ("Prepare for Antigravity").
3. The existing dispatch point (`handleWebviewMessage`, `src/webviewHandlers.ts:135`) receives this click and, because Relay Mode is on, calls the existing `buildGmPromptBreakdown(playerAction)` (`src/gmPromptBuilder.ts:2354`) with the **current** `freeInput` value as `playerAction` — never a stale/previous breakdown. It does **not** proceed into `invokeGrokBridge`/`invokeVscodeLmBridge`/`invokeCustomGmBridge`/any provider dispatch.
4. The host assembles one v0 outbound envelope (tooling data, not canonical game state):

```json
{
  "kind": "antigravity_relay_request",
  "version": 1,
  "playerAction": "<the exact freeInput text used in step 3>",
  "promptContext": { "...": "buildGmPromptBreakdown(playerAction) output, unchanged shape" },
  "availableOptions": ["<label of each option button visible before this handoff, if any>"],
  "targetOutput": "turn_result.json"
}
```

5. This envelope is what "Copy prompt" (human-readable rendering) and "Copy JSON payload" (raw `JSON.stringify(envelope, null, 2)`) in the Payload Panel copy, per the existing gate's B6 reuse of the two established copy-button precedents. Both remain clipboard-only for v0 (R2: "a clipboard handoff is acceptable for v0 if it is explicit and complete"). No `turn_request.*` workspace file is proposed — clipboard is sufficient and avoids needing to define stale-request handling.
6. The Payload Panel's "Available options, read-only" wording from the existing gate is removed; options are no longer displayed as dead text (R3) — they are the live, repurposed buttons from G1 point 4, and their labels are simply also included in the envelope's `availableOptions` field for Antigravity's context.

This directly resolves G2: the fresh player action is proven to enter the payload (it is read from `freeInput` at the moment of the one relay action, not a previously cached breakdown), and the exact outbound envelope shape is now specified.

---

## R4 — reconfirmed, unchanged

The existing gate already specified that the "waiting for Antigravity" indicator starts on a Payload Panel copy/export action and clears on the next `gameStateUpdate`, not on `gmStart`/`gmEnd` or on Relay Mode merely being toggled on. Under the repaired flow, the single repurposed `sendBtn` click (G2 step 2) *is* the copy/export action, so this rule already holds with no further change: the indicator starts exactly when step 4–5 completes (envelope built and copied), never merely because Relay Mode is enabled.

## R5 — reconfirmed, unchanged

All previously-accepted constraints stand exactly as written in the existing gate: Relay Mode is a VS Code workflow setting (`textAdventure.antigravityRelay.enabled`), not a `GameRules`/`game_rules.json` field; no gameplay mechanic, Ledger, Ops, or subsystem is added; no Slice 1 file (`livingWorldCommerceUiCore.ts`, `worldView.ts`, `85-world.js`'s Decision Surface code, `transportCore.ts`, `worldSimCommerceCore.ts`, `commerceCore.ts`) is touched; Relay Mode OFF reproduces today's behavior exactly, byte-for-byte; `turn_result.json` and its existing `FileSystemWatcher` (`src/gameStateSync.ts:584-599`) remain the sole, unmodified return channel — no new ingestion path is introduced.

---

## Acceptance criteria — corrected

Replaces A2/A3 from the existing gate; A1, A4–A7 are unchanged.

- **A2 (corrected)** — With Relay Mode on: `imgBtn`, `micBtn`, `undoBtn`, `#regen-btn`, `#qr-undo`, `#qr-retry`, `#experience-profile-btn`, `#parlor-settings-btn` are disabled. `freeInput` remains enabled. `sendBtn` remains enabled but its label and click behavior are the repurposed relay action, not the normal send path. Every `.option-btn`/`.qr-btn` remains enabled but populates `freeInput` instead of dispatching a GM turn.
- **A3 (corrected)** — Clicking the repurposed `sendBtn` while Relay Mode is on builds the envelope in G2 step 4 using the **current** `freeInput` value, calls `buildGmPromptBreakdown` exactly once for that value, and never invokes any GM provider function. The "waiting for Antigravity" indicator starts at this click and only at this click.

---

## Touch set — no change from the existing gate's list

The same files apply (`10-game-state.js`, `20-input-audio-prep.js`, `webview/index.html`, `src/webviewHandlers.ts`, `package.json`, locale files, generated `script.js`). The only difference is what changes inside `10-game-state.js`/`webviewHandlers.ts`: relabeling/repurposing `sendBtn` and `.option-btn` handlers instead of disabling them, and assembling the G2 envelope instead of re-posting a bare `promptContext`. No new file is added to the touch set; no forbidden file is touched.

---

# Final Verdict

`ANTIGRAVITY_RELAY_GATE_REPAIR_READY`
