# Start Hub / Genesis Guide — Visual Polish Result

AI: Claude (Sonnet 5, High reasoning)
Role: Onboarding UX Director
Branch: `ux/start-hub-genesis-visual-polish`
Scope: Webview onboarding UX only. No backend/state/gameplay changes.

## 1. Baseline

- Base: `origin/main` @ `b7cb43c` (fetched fresh; work done in an isolated `git worktree` at
  `../text-adventure-vsce-starthub` so it wouldn't collide with in-progress WIP on
  `ux/genesis-mode-visual-polish` in the primary worktree).
- `package.json` version at baseline: `1.77.15`.

## 2. Branch

`ux/start-hub-genesis-visual-polish`, created from `origin/main` via
`git worktree add ../text-adventure-vsce-starthub -b ux/start-hub-genesis-visual-polish origin/main`.
Not merged to main; left for user/other-process review per the project's current
feature-branch workflow.

## 3. Implementation commit(s)

Single commit (see `git log` on the branch) covering all changes described below.

## 4. Changed files

- `webview/index.html` — restructured `#start-hub` markup only (all button/link element IDs
  preserved, only container/grouping changed).
- `webview/styles/10-layout-chat.css` — new rules for the readiness hint, the primary tile
  row, and the collapsible "more" section.
- `webview/script.js`, `webview/style.css` — regenerated build artifacts (`npm run build:webview`).
  No `webview/modules/*.js` source file was touched; `script.js` has **zero** diff vs. baseline,
  confirming no JS behavior changed.
- `locales/ja.json`, `locales/en.json`, `locales/zh-CN.json`, `locales/zh-TW.json` — 3 new keys
  each (`webview.startHub.readinessHint`, `webview.startHub.moreSummary`,
  `webview.startHub.moreDemosLabel`); plus one bug fix (see §11).
- `README.md`, `README_en.md`, `README_zh-CN.md`, `README_zh-TW.md` — new "Start Hub & Genesis
  Guide" showcase subsection with 2 screenshots, inserted right after the World Map showcase.
- `docs/assets/screenshot-start-hub.png`, `docs/assets/screenshot-genesis-summary.png` — new,
  real Webview captures (see §9).
- `docs/ai-tasks/START-HUB-GENESIS-VISUAL-POLISH-RESULT.md` — this file.

## 5. Current UX problems found (audit)

Audited `webview/index.html` (`#start-hub` block), `webview/modules/06-genesis-guide.js`,
`webview/modules/90-bootstrap.js`, `webview/styles/10-layout-chat.css` /
`11-genesis-guide.css`, `docs/FIRST_SESSION.md`, `docs/USER_GUIDE.md`,
`docs/RULES_PROFILE_ONBOARDING_DESIGN.md`, and `docs/ux/GENESIS-VISUAL-POLISH-RESULT.md`
(the prior visual-polish pass).

- **The Start Hub had 15 clickable items at equal visual weight** on the very first screen:
  a hero CTA, then 5 buttons under "はじめての方" (first-timers), 2 under "世界を作る", 5 preset
  chips, and 2 under "主人公". A first-time user sees no clear single next action.
- **Advanced/dev-only options were mislabeled as beginner-friendly.** "地図デモ（上級）"
  (advanced) and "デバッグサンドボックス（開発者向け）" (developer-only) both lived under the
  "はじめての方:" (for first-timers) label group — the opposite of what that label promises.
- **No setup-readiness signal anywhere.** Nothing on the first screen tells a new user that
  GM provider / ComfyUI / TTS are all optional and the app is playable with zero config —
  a reasonable person could assume they need to configure something first.
- **Genesis Guide itself was already in good shape.** It already implements a 6-step wizard
  (genre → playstyle → pressure → bookkeeping → protagonist mode → image generation) with a
  live summary screen showing which systems get enabled as system chips, plus a matching
  ComfyUI prompt — i.e. the "campaign being assembled" experience this task asked for already
  existed from the prior polish pass. No redesign was needed there; verified by driving it
  end-to-end in a live harness (§8) rather than assuming from the code.
- **Found in passing, fixed as a small polish item**: `locales/ja.json` had literal **English**
  text for `webview.startHub.debugTitle` / `webview.startHub.debugDesc` (the Japanese HTML
  fallback text masked this, since `applyI18n()` only overwrites text once a locale bundle is
  applied). A real Japanese user would have seen "Debug sandbox" in English. See §11.
- `docs/USER_GUIDE.md` describes only 3 Start Hub options; the actual UI has 4 groups /
  15 items and doesn't mention Genesis Guide at all — flagged here, left unedited (out of
  scope for a visual-polish pass; a docs-content task, not a UI task).

## 6. Start Hub improvements

Restructured (not rewritten) `#start-hub` into 3 tiers, all via container/class changes —
every original `id` (and therefore every click handler in `90-bootstrap.js`) is untouched:

- **Primary** (`.start-hub-options-primary`, larger tiles, `start-hub-btn-primary` accent):
  🎮 お試しデモを始める (`start-hub-demo-btn`), 🎭 キャラと話す (`start-hub-parlor-btn`),
  🧑 主人公を新規作成 (`start-hub-char-new-btn`) — plus the pre-existing Genesis hero CTA above
  them. That's the "world / demo / talk to a character / create a protagonist" 4-choice
  front door the user asked for. ("Continue an existing campaign" was intentionally *not*
  added as a 5th tile — it isn't a distinct feature here: `updateStartHubVisibility()` in
  `90-bootstrap.js` already hides the Start Hub the moment `messageHistory.length > 0`, so an
  existing campaign resumes automatically without any button. Adding a fake "continue" button
  would have been UI theater.)
- **Secondary**, inside a native `<details class="start-hub-more">` (closed by default, plain
  disclosure triangle, no JS needed): 世界内チャット, 地図デモ（上級）, デバッグサンドボックス,
  スカベンジャーデモ, ざっと作る, 質問しながら作る, プリセット chips, カードを読み込む.
- **Readiness hint** (`.start-hub-readiness`, one line, static): "✅ 追加設定なしで今すぐ遊べます。
  GMプロバイダ・ComfyUI・TTSは任意です（⚙️ Settings タブでいつでも設定可）。" This is intentionally
  *not* a live diagnostics panel — there's no existing host→webview message that reports
  whether a GM provider/ComfyUI/TTS is actually configured, and wiring one up would be backend
  work outside this task's scope. The honest, zero-backend-risk version of "can I play now?"
  is: yes, always, because every advanced integration is optional by design. That claim is
  true today and doesn't need live detection to stay true.

## 7. Genesis improvements

None needed beyond what already shipped in the prior `ux/genesis-mode-visual-polish` pass.
Verified live (not just read) that the wizard already produces exactly the "campaign being
assembled" effect requested: picking post-apocalypse + settlement playstyle + survival +
detailed bookkeeping live-populates a summary with enabled system chips (WorldForge,
CampaignKit, NpcRegistry baseline + Settlement, Commerce, World Observatory) and a matching
ComfyUI prompt. No source changes made to `06-genesis-guide.js` or `11-genesis-guide.css`.

## 8. Route preservation

All Start Hub buttons were moved in the DOM (grouped into primary tiles vs. a `<details>`)
but never had their `id` changed, so `90-bootstrap.js`'s `getElementById`-based wiring needed
no changes. Verified live in a static Webview harness (real `script.js`/`style.css`, stubbed
`acquireVsCodeApi`, injected `localeBundle`) by clicking each relevant button and asserting
the resulting `postMessage`/global-call:

| Button | Result observed |
|---|---|
| `start-hub-demo-btn` (primary) | `{"type":"loadBundledScenario","sampleId":"harbor-mist"}` |
| `start-hub-char-new-btn` (primary) | `window.openCharacterCreator(null)` called |
| `start-hub-map-demo-btn` (moved into `<details>`) | `{"type":"loadBundledScenario","sampleId":"lost-catacombs"}` |
| `start-hub-quick-btn` (moved into `<details>`) | Quickstart modal (`#quickstart-modal`) opens |
| `genesis-hero-cta` | Genesis Guide modal opens |
| Genesis Guide 6-step flow → apply | Live summary renders system chips + ComfyUI prompt correctly |

Demo route, Genesis apply, Character Creator route, and SillyTavern import route (same
handler as `start-hub-parlor-btn` / `start-hub-char-import-btn`, unmoved logic) all confirmed
working from the new layout.

## 9. Screenshots

Both captured from the **actual production build** (`npm run build:webview` output —
`webview/script.js` + `webview/style.css`, unmodified), not a simplified mockup, per the
project's established real-webview-capture method (`DEMO.md`): copy the real `index.html`,
resolve `{{styleUri}}`/`{{scriptUri}}`/`{{nonce}}`/`{{cspSource}}` placeholders, drop the CSP
meta tag, stub `acquireVsCodeApi`, inject a real `locales/ja.json` via `localeBundle`
postMessage, then capture with headless Chrome (`--headless=new --screenshot`, **no**
`--disable-gpu` — see the documented gotcha about `backdrop-filter` breaking under it).

- `docs/assets/screenshot-start-hub.png` — fresh page load, default state (fixture: none
  needed, this is the true first-open state).
- `docs/assets/screenshot-genesis-summary.png` — Genesis Guide driven end-to-end via real
  button clicks (genre=post-apocalypse, playstyle=settlement, pressure=survival,
  bookkeeping=detailed, protagonist=manual, images=on) to the completed summary screen,
  cropped to the modal bounds.

(Note: the interactive preview tool's own screenshot capture was intermittently
unresponsive in this session for reasons unrelated to the page — page state was verified
healthy via `preview_inspect`/`preview_eval` throughout — so final screenshots were produced
via the documented headless-Chrome method instead, which is the same method the project
already uses for its other README screenshots.)

## 10. README changes

Added a "🌟 Start Hub & Genesis Guide" subsection with both screenshots + captions,
inserted immediately after the existing "🗺️ World Map" showcase and before the "How to
Play" section, in all 4 locales (`README.md` ja, `README_en.md`, `README_zh-CN.md`,
`README_zh-TW.md`). Existing screenshots/sections untouched.

## 11. Optional polish (1 of 2 allowed)

Fixed a real, previously-hidden localization bug found during the screenshot pass: the
"Debug sandbox" button rendered in English even in the Japanese locale, because
`locales/ja.json`'s `webview.startHub.debugTitle` / `webview.startHub.debugDesc` values were
literal English text (the Japanese-language HTML fallback had been masking this). Fixed both
values to proper Japanese. Did not use the second optional-polish slot — no other low-risk
opportunity stood out that wasn't already covered by the primary task.

## 12. Compile

`npm run compile` → clean (webview build + `tsc -p ./`, no errors). `webview/script.js` has
**zero** diff vs. baseline (no `.js` module source was touched), confirming the restructure
is HTML/CSS-only.

## 13. Full suite

`npm test` → **224/224 passed** (36.6s).

## 14. i18n

`node scripts/check_i18n_keys.js` → **0 missing** in all 4 locales (`ja`, `en`, `zh-CN`,
`zh-TW`), both before adding new keys (baseline sanity check) and after.

## 15. Blockers

None.

## 16. New findings (out of scope, not fixed here)

- `docs/USER_GUIDE.md`'s onboarding section describes 3 Start Hub options and doesn't mention
  Genesis Guide; the real UI has 4 groups. Content/docs task, not a UI task — left for a
  separate pass.
- Two Inspector Timeline-lane labels (`Chronicle`, `Replay Export`) and part of the Debug
  header remain untranslated in non-English locales — already flagged by the prior
  `GENESIS-VISUAL-POLISH-RESULT.md` session, still open, unrelated to Start Hub/Genesis.
- `webview/vendor/mermaid.min.js` showed as modified in `git status` purely from being
  re-copied by the build step in a fresh worktree (`node_modules` didn't exist there until a
  junction was created to the primary worktree's `node_modules`); `git diff` shows no actual
  content change, so it was **not** staged/committed.

## 17. Final verdict (initial pass)

START_HUB_GENESIS_VISUAL_POLISH_READY_FOR_REVIEW

---

# Final Polish Pass (2026-07-07)

AI: Claude (Sonnet 5, Medium reasoning) — Onboarding UX Finishing Reviewer
Scope: narrow finishing touches only. The visual hierarchy from the initial pass was approved
and **not** redesigned.

## 18. Rebase baseline

Branch was rebased onto `origin/main` at `07b04ae` (4 commits ahead of the original `b7cb43c`
baseline, all unrelated `docs:` RUNTIME-003A verification-repair entries). Clean rebase, no
conflicts — the branch's diff vs. `origin/main` is unchanged in scope after the rebase (same
14 files as the initial pass, now applied on top of current main). Branch tip after rebase +
this pass's commit is pushed to `origin/ux/start-hub-genesis-visual-polish`.

## 19. Readiness copy change

The original wording ("✅ 追加設定なしで今すぐ遊べます。GMプロバイダ・ComfyUI・TTSは任意です")
overclaimed: without any GM provider actually configured (or a manual copy/paste flow), there
is no real AI game-master response, so "you can play right now with zero setup" was misleading
about what "playing" means. Replaced in all 4 locales + the HTML fallback with copy that only
promises what's true — you can start exploring the demo now, and the AI/image/voice
integrations are things you add afterward, not prerequisites to opening the app:

- ja: "💡 まずはデモから試せます。AI連携・画像生成・音声は後から追加できます（⚙️ Settings タブでいつでも設定可）。"
- en: "💡 Start with the demo right away. AI connection, image generation, and voice can all be added later (⚙️ Settings tab, anytime)."
- zh-CN: "💡 可以先从演示开始体验。AI 连接、图像生成、语音都可以稍后再添加（⚙️ 随时可在 Settings 标签设置）。"
- zh-TW: "💡 可以先從展示開始體驗。AI 連接、圖像生成、語音都可以稍後再新增（⚙️ 隨時可在 Settings 分頁設定）。"

Also swapped the ✅ (implies "all good, ready to go") for 💡 (a neutral tip icon), since the
checkmark itself was part of the overclaim, independent of the wording. No diagnostics or
backend detection added — still a static, honest line.

## 20. Final visual review verdict

Re-ran the actual production build (`npm run build:webview`) in the same real-Webview static
harness used for the initial pass (real `script.js`/`style.css`, stubbed `acquireVsCodeApi`,
injected `localeBundle`), captured via headless Chrome (no `--disable-gpu`):

- Genesis hero card remains the visually dominant element (gradient background, larger than
  the primary tiles) — confirmed unchanged, still first in DOM and visually first.
- The 3 primary tiles (demo / Parlor / new character) remain balanced and equal-weight to each
  other, distinct from the hero by using a flat accent-bordered style instead of a gradient.
- The readiness line is a single small (11px) line of dim text between the title and the
  tiles — it does not compete with the tiles or the hero for attention.
- The collapsed "▸ その他の遊び方・詳細設定" disclosure is present and visible directly under
  the primary tiles, discoverable without scrolling on a normal desktop viewport.
- Narrow width (900×700 tested): the primary tile row wraps from 3-per-row to 2-per-row
  correctly; the 3rd tile flows below the fold, reachable via the pane's existing
  `overflow-y: auto` scroll (same intentional top-anchored/scrollable design already
  documented in `webview/styles/10-layout-chat.css`'s `.start-hub` comment — not a new
  regression, and not something introduced by this pass).
- No duplicated visual emphasis: exactly one gradient element (hero) and one accent-tile
  group (primary tiles); readiness hint and collapsed-section summary both use plain dim text.
- Japanese copy fits cleanly at both 1440px and 900px widths with no overflow or clipped text.

**Verdict: visual hierarchy holds up; no further Start Hub redesign needed.**

Refreshed `docs/assets/screenshot-start-hub.png` only, because the readiness line's literal
text is directly visible in that screenshot and had changed. Did **not** touch
`docs/assets/screenshot-genesis-summary.png` — nothing about Genesis Guide changed in this
pass.

## 21. Route regression (re-verified after rebase + copy change)

Re-clicked every route in the refreshed harness and asserted the resulting `postMessage`/
global call, same method as the initial pass:

| Route | Result |
|---|---|
| `start-hub-demo-btn` (harbor-mist demo) | `{"type":"loadBundledScenario","sampleId":"harbor-mist"}` |
| `start-hub-parlor-btn` (Parlor, no character yet) | `{"type":"importTavernCard"}` |
| `start-hub-char-new-btn` (Character Creator) | `window.openCharacterCreator(null)` called |
| `.start-hub-more-summary` (advanced details) | toggles `<details open>` true → false correctly both directions |
| `start-hub-map-demo-btn` (map demo) | `{"type":"loadBundledScenario","sampleId":"lost-catacombs"}` |
| `start-hub-quick-btn` (quickstart) | `#quickstart-modal` opens (visible, flex) |
| `start-hub-char-import-btn` (SillyTavern import) | `{"type":"importTavernCard"}` |
| `genesis-hero-cta` (Genesis Guide) | `#genesis-guide-modal` opens on step 1/6 |

All 8 routes intact. No route logic was changed in this pass (only copy + rebase).

## 22. Compile (final)

`npm run compile` → clean (webview build + `tsc -p ./`, no errors) after the rebase and the
readiness-copy edit.

## 23. Full suite (final)

`npm test` → **224/224 passed** (35.0s).

## 24. i18n (final)

`node scripts/check_i18n_keys.js` → **0 missing** in all 4 locales (`ja`, `en`, `zh-CN`,
`zh-TW`) after the readiness-copy edit.

## 25. Branch cleanliness

`git status` clean after rebase. `webview/vendor/mermaid.min.js` again showed as modified
purely from the build step re-copying it in this worktree (`git diff` shows 0 changed lines);
restored with `git checkout --` and excluded from the commit, same as the initial pass.

## 26. Blockers

None.

## 27. Final verdict

START_HUB_GENESIS_VISUAL_POLISH_FINAL_READY
