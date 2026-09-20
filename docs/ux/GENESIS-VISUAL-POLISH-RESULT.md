# Genesis Mode & README Visual Polish — Result

Role: UX Engineer / Visual Polish
Model: Claude Sonnet 5
Date: 2026-07-06

## 1. Origin `main` SHA

`2c55c294893aca47693535382a0e1d56ff52dae6` (`docs: move PROMPT-001C to re-verifying`)

Local `main` was fast-forwarded to this commit before branching (previous local HEAD was `9753f67`).

## 2. Branch

`ux/genesis-mode-visual-polish`, based on the SHA above. `PROMPT-001C` implementation work was not touched — nothing under `docs/ai-tasks/PROMPT-001C-*`, `src/stateOrchestrator*`, or provider-identity/TurnResult/receipt code was read for editing purposes (only briefly observed in `git log`/`grep` while orienting).

## 3. Commits

One commit on top of the branch point (see `git log ux/genesis-mode-visual-polish` after this lands). Summary of the change set below; the branch is pushed but not merged.

## 4. UX problems found

1. **README screenshot section was the actual "unfinished project" cause.** Of the 7 images in the showcase, 5 (Remote Play, Party Director, Lorebook, ComfyUI, World Map) were identical wireframe placeholder templates — a title, a subtitle, five gray bars, and a fake "LoreRelay" sidebar with colored bars — recolored per feature, not real UI. `DEMO.md` already documented this honestly ("Placeholder wireframe (not yet refreshed)").
2. **The real Inspector screenshot (portrait, 324×800) was table-paired with two wireframes (640×360 landscape) in the same row.** GitHub renders table rows at the height of the tallest cell, so that row had ~450px of dead space under the two short wireframe cells — this, not general "layout," was the concrete mechanism behind "very large empty table cells."
3. **Stale, incorrect claim about Genesis Mode maturity.** `README.md`'s Genesis Guide bullet and the "How to Play" section both stated the host-side apply step was "not yet implemented" (`未実装（次バージョンで対応予定）`). It is implemented (`genesisApplyProfile` → `buildRulesProfileApplication` → `saveGameRules`, confirmed in `src/extension.ts` / `src/rulesProfileApplyCore.ts`, shipped in a prior session). This undersold a completed feature to first-time readers evaluating the project.
4. **Genesis Mode's "what happens next" gap.** After a successful apply, the wizard told the user in a toast to "create a protagonist or start from a demo" but only offered a generic "Close" button — no direct path to the action matching the `protagonistMode` they had just picked two steps earlier.
5. **Dead backdrop element behind the Remote Play panel.** `#remote-play-backdrop` existed in `index.html` with the same styling as the (correctly wired) image-gen backdrop, but nothing ever toggled it. Opening Remote Play left the Start Hub/chat fully visible and clickable behind the panel — noticed while composing the Remote Play screenshot, confirmed as a real, safe, small Webview fix in scope.
6. **English/Chinese READMEs were missing the Genesis Guide feature entirely** (present only in the Japanese `README.md`), an inconsistency for non-Japanese first-time readers.
7. **Genesis Guide wizard/backdrop/atmosphere itself** (portrait art, per-genre background, step dots, summary edit rows, ComfyUI fallback copy) was already polished in a prior session (see `AI_SHARED_LOG.md` 2026-07-05 entries) — re-inspected fresh this session and found in good shape; see "remaining ideas" for what's still open.

## 5. Webview improvements

- **`webview/modules/06-genesis-guide.js`** — protagonist-mode-aware "what happens next" step. `protagonistMode` was already a pure UI/preview value (confirmed: not read by `rulesProfileCore.ts`/`rulesProfileApplyCore.ts` beyond the summary text), so this is a Webview-only navigation shortcut, not new backend behavior:
  - `manual` → after apply, the primary button becomes "🧑 Close and create your protagonist" and clicking it closes the guide then calls the existing `window.openCharacterCreator?.(null)`.
  - `sillytavern` → "📥 Close and import your card" → closes then posts the existing `importTavernCard` message.
  - `generate` / `skip` → unchanged behavior (closes to the Start Hub; no extra action implied).
  - Verified via DOM-state assertions (button label, postMessage payloads, modal open/close) for all four modes, at both desktop and 375px mobile width.
- **`webview/modules/55-remote-play.js`** — wired the previously-dead `#remote-play-backdrop` (`syncRemotePlayBackdrop()`), toggled from all three places the panel's own `hidden` class changes (host status update, the button's re-open toggle, and the close button), plus added a backdrop-click-to-close handler matching the existing image-gen panel pattern. Verified in a real (non-headless) Preview render: background now visibly dims/blurs; confirmed a `--disable-gpu` headless Chrome capture had silently suppressed the effect (a capture-tooling artifact, not a code bug — documented in `DEMO.md` so the next screenshot refresh doesn't get confused by it again).
- 4 new i18n keys (`webview.genesis.summary.closeAndCreateBtn` / `closeAndImportBtn`, plus the existing `closeAndStartBtn` reused for generate/skip) added to en/ja/zh-CN/zh-TW.

No canonical-state, State Orchestrator, PROMPT-001C, Accepted-boundary, receipt/ACK, provider-identity, or TurnResult code was touched.

## 6. README improvements

- Replaced the Inspector+Remote Play+Party Director / Lorebook+ComfyUI+World Map two-row-of-three layout (which mixed a tall real screenshot with short wireframes) with:
  - Inspector on its own centered row (matches its portrait aspect ratio, no more mismatched-row blank space).
  - Remote Play + ComfyUI as a 2-column row (aspect-ratio-matched display widths: 330px / 200px so both render at a similar height).
  - Party Director + Lorebook + World Map as a 3-column row — these three screenshots share identical native pixel dimensions (760×750), so the row renders perfectly even with plain Markdown table sizing.
  - Added a one-line caption under each image (plain bold/sub text in the same cell — no nested HTML beyond a single `<br/>`, stays simple/GitHub-safe).
- Applied the same table restructure to `README_en.md`, `README_zh-CN.md`, `README_zh-TW.md` (all four locale READMEs point at the same `docs/assets/*.png` files).
- Fixed the stale Genesis Guide claim in `README.md` (feature bullet + "How to Play" paragraph) to reflect the shipped host apply gate and the new protagonist-mode deep link.
- Added the previously-missing Genesis Guide feature bullet to `README_en.md` / `README_zh-CN.md` / `README_zh-TW.md`.
- Updated `DEMO.md`'s asset status table (all 5 previously-placeholder screenshots now "Real"), removed the now-stale "remaining placeholder wireframes" note, and documented the exact fixture/postMessage recipe + the ComfyUI generation steps + the `--disable-gpu` backdrop-filter gotcha for future refreshes.
- Deleted the 5 now-unused wireframe-generator SVGs (`screenshot-{remote-play,party-director,lorebook,comfyui,world-map}.svg}`) — they were the source for the placeholders being replaced and are referenced nowhere else.

## 7. Generated assets

One new ComfyUI-generated image: the scene shown inline in the `screenshot-comfyui.png` capture (a catacombs corridor illustration). Generated directly against the user's running ComfyUI instance (`http://127.0.0.1:8188`) using the repo's own bundled `comfyui/workflow_sdxl_1024.json` template, checkpoint `IL\waiIllustriousSDXL_v170.safetensors` (same checkpoint already used for the existing real `hero-ui.jpg`, per `DEMO.md`'s provenance note — kept the visual style coherent with the rest of the project), 768×768, seed `20260706`. No new files were added to the repo other than the 5 replaced `docs/assets/screenshot-*.png` — the generated image lives inside the ComfyUI screenshot capture itself, not as a separate committed asset. This matches the "prefer a very small curated set" instruction (one generated image, not several).

A second attempt (SDXL + Canny ControlNet parchment-map illustration for the World Map shot, via the repo's own `scripts/comfyui_generate_cartography.py` + `comfyui/workflow_cartography_sdxl_canny.json`, using the bundled `lost-catacombs` `world_forge.json`) was tried but hit the script's internal generation timeout before finishing. Given ComfyUI is explicitly optional and the World Map screenshot already looks authentic using the bundled, no-ComfyUI-required `world_map.layout.png`, this was not retried — see "remaining ideas."

## 8. ComfyUI usage

- Confirmed reachable (`GET /system_stats` → 200) before using it.
- Used directly via its HTTP API (`/prompt`, `/history/{id}`, `/view`) from a standalone script, independent of the extension host — no extension-host image-generation code was touched or added, per the constraint.
- Checkpoint: `IL\waiIllustriousSDXL_v170.safetensors` (matches the project's existing real hero image, keeping style coherent).

## 9. Fallback behavior without ComfyUI

Unaffected by this session's changes. The Genesis Guide's existing behavior stays intact: when `imageGenerationWanted` is false, the wizard hides the ComfyUI prompt block and shows a "continuing without images" hint; when true but ComfyUI isn't reachable, the "🎨 Generate Genesis Image" button still offers the copy-prompt fallback path added in a prior session. Nothing in this session made ComfyUI a requirement anywhere — the World Map screenshot intentionally uses the bundled, ComfyUI-free layout PNG to keep demonstrating the no-ComfyUI-required path documented in the README's "まず遊ぶなら" section.

## 10. Changed files

```
DEMO.md
README.md
README_en.md
README_zh-CN.md
README_zh-TW.md
docs/assets/screenshot-comfyui.png        (replaced: wireframe -> real)
docs/assets/screenshot-comfyui.svg        (deleted)
docs/assets/screenshot-lorebook.png       (replaced: wireframe -> real)
docs/assets/screenshot-lorebook.svg       (deleted)
docs/assets/screenshot-party-director.png (replaced: wireframe -> real)
docs/assets/screenshot-party-director.svg (deleted)
docs/assets/screenshot-remote-play.png    (replaced: wireframe -> real)
docs/assets/screenshot-remote-play.svg    (deleted)
docs/assets/screenshot-world-map.png      (replaced: wireframe -> real)
docs/assets/screenshot-world-map.svg      (deleted)
locales/en.json
locales/ja.json
locales/zh-CN.json
locales/zh-TW.json
webview/modules/06-genesis-guide.js
webview/modules/55-remote-play.js
webview/script.js   (build artifact, regenerated by scripts/build-webview.js)
docs/ux/GENESIS-VISUAL-POLISH-RESULT.md   (this file)
```

`webview/style.css` was rebuilt too but ended up byte-identical (no CSS source files were changed this session).

## 11. Compile

```
npm ci --include=dev   → added 202 packages, 0 vulnerabilities
npm run compile        → build:webview (33 modules → script.js, 25 → style.css) + tsc -p ./ clean, no errors
```

## 12. Full suite

```
npm test → 222/222 passed (35.6s), including the simulation regression batch (9/9)
node scripts/check_i18n_keys.js → ja/en/zh-CN/zh-TW: 0 missing keys (1023 referenced keys)
```

## 13. Screenshots / preview evidence

- All 5 replacement screenshots were captured from the real production bundle (`webview/index.html` + freshly-built `script.js`/`style.css`), driven with the same `postMessage` shapes the extension host sends (`characterList`/`partyDirector`, `lorebookList`, `renderCartographyMap`/parchment mode, `updateRemotePlayButton`, and a real `renderMessage()` chat entry with an `image` field), per the method already documented in `DEMO.md`.
- Final capture used headless Chrome (`chrome --headless=new --window-size=... --screenshot=out.png`) against a local static file server for lossless PNGs (the interactive preview tool's screenshot is JPEG-compressed and only suitable for my own inspection, not for the committed asset).
- Discovered and worked around a real capture-tooling gotcha: `--disable-gpu` silently breaks `backdrop-filter` alpha compositing in headless Chrome, making the (correctly-fixed) Remote Play backdrop invisible in the capture despite correct DOM/computed-style state. Re-captured without that flag; confirmed correct in both the headless PNG and the interactive Preview browser. Documented in `DEMO.md` for future refreshes.
- Genesis Guide protagonist deep-link verified functionally (button label per mode, `postMessage` payloads, modal transitions) at both desktop and 375px mobile viewport widths via DOM-state assertions.
- Inspector lane split (Timeline / Debug / QA) visually re-inspected: tab switching, active-state styling, and the QA placeholder message all render correctly; not modified (Priority 3 scope — no redesign, no changes made since no obvious visual breakage was found).

## 14. Remaining ideas

- Retry the SDXL+Canny ControlNet parchment-map illustration for the World Map screenshot (bonus visual upgrade over the plain layout PNG) with a longer timeout/patience, if desired — optional, not required.
- `README_en.md`'s "How to Play" section structurally lags `README.md` (no equivalent Start Hub walkthrough at all yet, in either language originally) — out of scope for this pass, which stuck to fixing the objectively broken/stale items.
- Start Hub itself (below the Genesis hero) is still a dense grid of near-identical demo/preset buttons — the task scoped Priority 1 to the Genesis Mode wizard specifically, so this was left alone, but it's the next candidate if further "developer-tool-like appearance" polish is wanted.
- Genesis Guide's per-genre background art could be preloaded on hover (per-genre backgrounds already implemented in a prior session) to remove a one-frame flash on first switch — very minor, deferred.

## 15. New findings (not fixed, out of scope this pass)

- Two Inspector Timeline-lane sections (`Chronicle`, `Replay Export` — labels, hints, checkbox text) and the Debug-lane header (`Debug Console`, `Steps`, `Advance`) render in un-translated English inside an otherwise-Japanese UI. This is a pre-existing i18n coverage gap (not introduced by the Timeline/Debug/QA lane split, and not a *visual* inconsistency — layout/spacing/styling are all correct), so it wasn't touched per the "only fix obvious visual inconsistencies" instruction for Priority 3. Flagging for a future i18n pass.

## 16. Final verdict

**UX_POLISH_COMPLETE_READY_FOR_REVIEW**
