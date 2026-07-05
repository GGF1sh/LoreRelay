# Playable Milestone UX Review

Branch: `ux/playable-milestone-pass`
Scope: presentation only (HTML structure, CSS). No backend state contracts, prompt semantics,
save/restore architecture, or provider APIs were touched.

## 1. Biggest UX problems found (audit)

Audited via a static harness that loads the real `webview/script.js` + `style.css` bundle
outside VS Code (see [Verification](#verification) for how to reproduce), with a synthetic
mid-play state (location/time/funds/HP/MP/condition/inventory/skills, 3 log entries, 3 options).

1. **The "Submit" step competed with a wall of secondary buttons.** Between the chat log and
   the input box sat an 11-button quick-reply row (Undo / Retry / Checkpoint / Summary /
   Gen Image / Load Pack / Archive / Export HTML / Speak as / Quest Flow / Relations), styled
   with the same visual weight as everything else. The input row directly below it *also* has
   its own Undo and Regenerate buttons, so the two most common actions appear twice, in two
   different visual styles, right above the Send button. At normal panel widths several
   quick-reply buttons scroll off-screen with no obvious affordance beyond a faint edge fade.
2. **The default "Adventure Status" tab buried Checkpoints and the Story Summary under four
   always-open utility panels.** The vertical order was: status/condition/inventory/skills →
   Checkpoints → **Dice Roller** → **Calculator** → **BGM & SE** → **Scene Gallery** →
   **World Theme** → archive banner → Story Summary. A player had to scroll past dice, a
   calculator, an audio mixer, and a theme switcher — none of which change turn to turn — just
   to re-read the running summary or see saved checkpoints. This is the single biggest
   "information not organized by how often it's needed" problem in the app.
3. **No visual line between gameplay tabs and developer tooling.** The tab bar mixes
   `Adventure Status / Character / World / Lorebook / Memory / Director / Party / OOC` with an
   `Inspector` tab (Debug Console, State Orchestrator mermaid graph, Debug Trace, Chronicle,
   Replay Export, Git Timeline) using identical styling and the same row. First-time players
   have no visual cue that Inspector is a different kind of screen.
4. **The header row and quick-reply row give every button equal visual priority**, whether it's
   used constantly (Send, options) or almost never during play (Game Rules config, Parlor
   Settings, Remote Play QR codes, Quickstart wizard). Nothing recedes, so nothing stands out.

Areas checked and found already in reasonable shape (no changes made): GM/player message
bubbles (readable line-height/padding from the existing `97-visual-refresh.css` polish pass),
options-bar choice buttons, focus-visible outlines, reduced-motion handling, and the World tab's
existing use of collapsible `<details>` sections for Domain/Guild/Campaign/Commerce/Markets/etc.
(that pattern already matches the direction this pass pushes the rest of the UI toward).

## 2. Changes implemented

All changes are additive/reorganizing; every element id, class, and event handler referenced by
`webview/modules/*.js` is unchanged, so no JS behavior was touched.

- **`webview/index.html` — Adventure Status pane reordered.**
  - Story Summary (and its Archive-now banner) moved up to sit directly after
    Checkpoints & Rewind, so the two most narratively relevant sections are visible without
    scrolling.
  - Dice Roller, Calculator, BGM & SE, Scene Gallery, and World Theme are now wrapped in
    `<details class="status-tool-section">` (collapsed by default), reusing the exact same
    header markup/ids as `<summary>` content — same pattern the World tab already uses for its
    own collapsible sections. Opening/closing them is native `<details>` behavior; no new JS.
- **`webview/styles/9c-ux-playable-pass.css` (new module, loaded last except for
  `9b-genre-chrome.css` which must stay final per its own contract test) —**
  - Styles `.status-tool-section` summaries with a muted state + rotating chevron, brightening
    on hover/open, so collapsed utility panels read as "optional" rather than competing with
    status/checkpoints/summary.
  - De-emphasizes `#quick-reply-bar` (slightly reduced opacity/size, brightens on
    hover/focus-within) and adds a top divider + spacing above `#input-area`, so Send and the
    free-input box read as the primary action and the quick-reply row reads as secondary.
  - Groups the header's config-related icon buttons (Quickstart, Image Gen Settings, Game
    Rules, Remote Play, Parlor, Parlor Settings) into a visually muted cluster (opacity 0.65,
    full opacity on hover/focus) with a divider before the cluster and before the Voice
    Narration button, so the header reads as "title — occasional settings — voice" instead of
    seven equal-weight icons.
  - Adds a left divider and muted/gray active-state color specifically to the `Inspector` tab
    button (targeted by `[data-target="pane-inspector"]`, no markup change) so it reads visually
    as a different category from the gameplay tabs next to it.
- **`scripts/build-webview.js`** — registers the new CSS module in `CSS_MODULE_ORDER`.

None of this changes tab order, removes a button, renames a label, or touches
`enableXxx` game-rule flags, i18n keys, or any `*Core.ts` file.

## 3. Changes intentionally deferred

- **Removing the Undo/Retry duplication** between the quick-reply bar and the input row. Fixing
  the duplication for real (rather than just de-emphasizing the quick-reply bar) means deciding
  which copy to delete, which changes click affordances some workflow might depend on — that's
  a product call, not a presentation call, so it's left for a follow-up with explicit sign-off.
- **Collapsing/overflowing the header icon buttons into a "⋯" menu.** CSS-only de-emphasis was
  judged sufficient for this pass and carries zero behavioral risk; an actual overflow menu
  needs new interactive JS (open/close, outside-click handling, focus trap) which is more than
  a pure "reorganize existing markup" change.
- **Reordering the tab bar** (e.g. moving Inspector to the far right, or grouping World/Party/
  Lorebook/Memory/Director under a secondary row). The tab click-handler logic in
  `40-dice-calc-tabs.js` doesn't care about DOM order, so this is safe to do later, but it's a
  bigger visual change than this pass's "make the existing arrangement legible" scope and
  deserves its own before/after review.
- **Typography pass (base font-size / line-height increase for long sessions).** The existing
  `97-visual-refresh.css` message bubble styling already reads comfortably at normal zoom; no
  concrete complaint surfaced during this audit, so it wasn't touched to avoid an unscoped
  global change.
- **World tab section audit.** It already uses the collapsible-`<details>` pattern this pass
  applies elsewhere, but most sections default to `open`. Whether they should default-collapse
  too is a separate, more feature-specific call (some, like Quest Board, are probably meant to
  stay open) and wasn't in scope for a "make the main play screen legible" pass.

## 4. Screenshots

Captured live during this session against a static harness that serves the real
`webview/index.html` + built `script.js`/`style.css` outside VS Code, fed a synthetic mid-play
state via `postMessage` (see [Verification](#verification)). The before/after pair for the main
play screen (chat header → log → options → quick-reply row → input row, with the default
Adventure Status tab on the right) is in the session transcript. Key visual deltas observed:

- **Before:** header row shows 7 same-weight icon buttons; the status pane's visible area
  (before any scrolling) ends at "Dice Roller" with all d4–d100 preset buttons and a custom
  roll row, and the quick-reply row is a bright, full-opacity 11-button strip directly above
  the input controls, several of which read as duplicates of the input row (Undo/Retry vs.
  1-Turn-Back/Regenerate).
- **After:** header config icons visibly recede (dimmer) behind a divider, leaving the title and
  Voice Narration at normal weight; the status pane's visible area (before scrolling) now ends
  at the populated Story Summary textarea, with Dice/Calculator/BGM/Gallery/Theme collapsed to
  five single-line, chevron-marked rows below it; the quick-reply row is visibly quieter than
  the Send/input row beneath it.

This repo doesn't currently have a mechanism in this environment to save the live preview tool's
screenshots as committed image files, so no PNGs were added under `docs/ux/`. Reproduce with the
harness steps below to regenerate them.

## 5. Remaining recommendations

1. Decide whether to actually remove the Undo/Retry duplication (quick-reply bar vs. input row)
   rather than just de-emphasizing it visually.
2. If the header keeps growing (new icon buttons get added over time), promote the muted config
   cluster into a real "⋯ More" popover instead of a static dim group — CSS de-emphasis doesn't
   scale forever.
3. Revisit which World-tab `<details>` sections should default-collapsed vs. open, now that the
   status pane has an established "collapse anything not needed every turn" convention to match.
4. Consider a lightweight onboarding hint (shown once) pointing at the collapsed status-pane
   tool sections, since existing players' muscle memory expects Dice/BGM to be immediately
   visible on the Adventure Status tab.

## Verification

- `npm run compile` (build:webview → sync_cartography_theme_styles → tsc) — clean.
- `npm run test:smoke` — 11/11 passed, including the bundle-structure balance check for
  `pane-status` and the CSS-module-order contract test for `9b-genre-chrome.css`.
- `npm run test:validate` — 7/7 passed.
- `npm run test:unit` — 202/202 passed.
- Manual click-through in the static harness: tab switching, `<details>` expand/collapse for
  Dice/Calculator/BGM/Gallery/Theme, options rendering, and message rendering all behave
  identically to before the change.

To reproduce the harness locally: copy `webview/index.html`, the built `webview/script.js` /
`webview/style.css`, `webview/vendor/*`, and `locales/ja.json` into one folder; strip the CSP
`<meta>` tag and replace the `{{styleUri}}` / `{{scriptUri}}` / `{{mermaidUri}}` / `{{threeUri}}`
/ `{{genesisAssetBaseUri}}` / `nonce="{{nonce}}"` placeholders; stub
`window.acquireVsCodeApi`; serve over `http://` (not `file://`); then `postMessage` a
`{ type: 'localeBundle', ... }` followed by a `{ type: 'gameStateUpdate', fullHistory: true,
state: {...} }` message to populate a realistic mid-play screen.
