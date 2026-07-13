# HUMAN-SMOKE-RELAY-BANNER-RECOVERY-001

Candidate-only UI repair. **Not integrated to `main`.**

| Field | Value |
|---|---|
| Prompt timestamp | 2026-07-14 02:53:51 JST (Asia/Tokyo) |
| Repository | `C:\AI\text-adventure-vsce` / GitHub `GGF1sh/LoreRelay` |
| Exact base SHA (required, verified) | `08807d98234cada6d10ee194779d56202afa2fbd` |
| Base version (required, verified) | `1.82.4` |
| Candidate version | `1.82.5` |
| Branch | `task/HUMAN-SMOKE-RELAY-BANNER-RECOVERY-001` |
| Worktree | `C:\AI\wt-human-smoke-relay-banner-recovery-001` |
| Implemented by | Claude Sonnet 5, High reasoning |

## 1. Original defect and reproduction

The Antigravity Relay explanation banner (`#relay-mode-banner`) could be
dragged, via its 6px resize sash (`#relay-banner-sash`), below a 20px
height threshold, at which point it snapped to `display: none` / `0px` and
persisted that height to `localStorage['lorerelay.relayBannerHeight']`. On
the next Relay-on render, the persisted `0` restored the banner to the same
fully-collapsed state — a blank region with no visible content. The *only*
way to recover it was to double-click the now-invisible 6px sash, a gesture
with no visual affordance and no accessible name.

Reproduction (pre-fix): drag the sash until the banner height reaches 0 →
reload / toggle Relay off and on → the banner area shows nothing; nothing
on screen indicates how to bring it back.

## 2. Source-level root cause

`webview/modules/90-bootstrap.js` (pre-fix):
- Banner creation (`relayModeStatus` handler) built only `#relay-mode-banner-content`
  (the explanation text) and `#relay-banner-sash` — no persistent, always-visible
  control.
- The persisted-height restore logic was inlined at three call sites (initial
  load, drag `mousemove`, drag `mouseup`) using bare `parseFloat` / `window.innerHeight * 0.5`
  with no handling for `NaN`, `Infinity`, negative values, or malformed text —
  an invalid stored value fell through without resetting to a safe state.
- The `dblclick` reset on the sash was the only path back to a usable banner,
  and it was undiscoverable (no label, no title, 6px hit target).

## 3. Selected UX contract

- **Explicit collapsed state**: collapsed banners now render an
  always-visible header row (`#relay-banner-header`) containing an active-Relay
  label (`#relay-banner-header-label`, reuses `webview.relay.toggle.on`) and an
  explicit toggle control (`#relay-banner-toggle-btn`). This header is present
  in **both** collapsed and expanded states — collapsed banners are therefore
  never a blank region, and the same control both expands and collapses
  (single source of truth for the state, not two separate controls).
- **Recovery controls**: click, `Enter`, and `Space` on the toggle button all
  expand a collapsed banner (native `<button>` semantics plus an explicit
  `keydown` handler for the synthetic-DOM test harness and defense-in-depth).
  Dragging the sash open still works. Sash double-click is retained as a
  secondary shortcut that resets to the natural default height.
- **Accessibility**: the toggle is a real `<button type="button">` with
  `aria-expanded` (reflects current state) and `aria-controls="relay-mode-banner-content"`.
  Its accessible name is its own localized, visible text — not an icon or a
  tooltip alone. Keyboard focus uses the project's existing global
  `button:focus-visible` rule (`webview/styles/15-ux-polish.css`); no new
  focus-ring CSS was needed.

## 4. Persisted-state migration table (implemented exactly as specified)

`normalizeRelayBannerHeight(raw, viewportMax)` in `webview/modules/90-bootstrap.js`
(pure, DOM-free, directly unit-tested):

| Stored value | Behavior |
|---|---|
| absent (`null`/`undefined`/empty/whitespace) | natural/default expanded height |
| `'0'` | explicit collapsed strip |
| legacy small positive (e.g. `'1'`, `'19'`, below the 20px threshold) | migrates to explicit collapsed strip |
| valid positive height | expanded, clamped to the safe viewport maximum |
| `NaN`, malformed text, empty/whitespace, negative, `Infinity`/`-Infinity` | invalid → reset to safe default expanded state |
| extremely large finite value | clamped to `relayBannerViewportMax()` (`max(20, innerHeight * 0.5)`, floored at the collapse threshold so a tiny viewport can never invert the clamp range) |

The `lorerelay.relayBannerHeight` key is unchanged (no migration to a second
key was needed). A session-only in-memory variable
(`relayBannerLastExpandedHeight`) remembers the last valid expanded height
across a collapse (and across a Relay OFF/ON cycle within the same page
session) so the explicit expand control restores that height rather than
jumping to the natural default when one is available — this is not persisted
under a second `localStorage` key by design (see the "Design notes" section
of the committed code comment above `relayBannerLastExpandedHeight`).

## 5. Accessibility behavior (verified)

- `aria-expanded` is `"true"` while expanded, `"false"` while collapsed, and
  updates synchronously on click, `Enter`, `Space`, drag-crossing-the-threshold,
  sash double-click, and Relay OFF→ON banner recreation.
- `aria-controls="relay-mode-banner-content"` is set once at creation and
  never changes.
- The button's visible text (not an icon) is its accessible name, and is
  itself localized (`webview.relay.banner.expand` / `.collapse`) — see
  §7 for the "no raw i18n key" behavior when locale data has not arrived yet.
- Keyboard focus: inherited from the existing global `button:focus-visible`
  rule; no new CSS needed since the control is a real `<button>`.

## 6. Changed files and classification

| Path | Classification |
|---|---|
| `webview/modules/90-bootstrap.js` | production source (fix) |
| `webview/styles/10-layout-chat.css` | production source (fix) |
| `webview/script.js` | generated production artifact (rebuilt from modules) |
| `webview/style.css` | generated production artifact (rebuilt from styles) |
| `locales/en.json`, `locales/ja.json`, `locales/zh-CN.json`, `locales/zh-TW.json` | locale (new keys: `webview.relay.banner.collapse`, `.expand`, `.resetTitle`) |
| `docs/generated/symbol_registry.json`, `docs/generated/SYMBOL_REGISTRY.md` | generated production artifact (registry, regenerated for new webview symbols) |
| `scripts/test_relay_banner_recovery.js` | new test (DOM/localStorage harness, full matrix) |
| `scripts/test_relay_banner_resizer.js` | existing test, updated (see §9) |
| `scripts/run_all_tests.js` | test manifest (registers the new test) |
| `package.json`, `package-lock.json`, `README.md`, `README_en.md`, `README_zh-CN.md`, `README_zh-TW.md`, `CHANGELOG.md`, `docs/VERSION_TRUTH.md` | release truth (1.82.4 → 1.82.5) |
| `docs/ai-tasks/HUMAN-SMOKE-RELAY-BANNER-RECOVERY-001.md` | this durable report |

No files outside this list were touched. `webview/vendor/mermaid.min.js`
transiently drifted from a fresh `npm ci` in this worktree (a known,
pre-documented worktree artifact unrelated to this task) and was restored to
`HEAD` before committing.

## 7. Generated-artifact handling

- `npm run build:webview` regenerates `webview/script.js` / `webview/style.css`
  from the `webview/modules/*.js` and `webview/styles/*.css` sources; both were
  rebuilt and are committed as usual for this repository's convention (built
  artifacts are committed, not gitignored).
- `npm run generate:symbol-registry` was run after the source changes (new
  webview functions/constants); `npm run check:symbol-registry` passes.
- `scripts/test_relay_viewport_theme_layout.js` and
  `scripts/test_playable_v0_player_action_hub.js`-style bundle-equivalence
  checks (EOL-normalized module-in-bundle inclusion) pass, confirming the
  bundle is a faithful, reproducible build of the module sources.

## 8. Executable test matrix (`scripts/test_relay_banner_recovery.js`)

A dedicated DOM + `localStorage` harness (real `getBoundingClientRect`,
mousedown/mousemove/mouseup, click, dblclick, keyboard `keydown`, dynamic
element insertion/removal, class lists, attributes, and a settable
`window.innerHeight`) loads and exercises the real
`webview/modules/90-bootstrap.js` logic — this is source-behavior
verification, not text matching (`webview/modules/10-game-state.js` and
`20-input-audio-prep.js` are also loaded, matching the pattern in the
pre-existing `test_antigravity_relay_webview.js`).

All 20 required cases pass, plus two extras (a symmetric collapse-via-toggle
check, and direct pure-function coverage of the full normalization table for
defense in depth):

1. No stored value → expanded default — PASS
2. Stored `0` → compact collapsed strip visible — PASS
3. Stored `1` and `19` → legacy collapsed migration — PASS (2 cases)
4. Malformed, whitespace, negative, `NaN`, `Infinity`/`-Infinity` → safe expanded reset — PASS (6 cases)
5. Huge finite value → safe maximum clamp — PASS
6. Drag expanded banner below threshold → explicit collapsed state — PASS
7. Collapsed state persists through banner recreation (Relay OFF/ON) — PASS
8. Explicit control click expands (+ symmetric collapse) — PASS
9. Enter expands — PASS
10. Space expands — PASS
11. Toggle control's `aria-expanded` updates on every transition — PASS (covered across cases 1/2/8/9/10/12)
12. Sash double-click resets to expanded default — PASS
13. Relay OFF removes all banner space — PASS
14. Relay ON restores the persisted collapsed state — PASS
15. Expanded persistence survives Relay OFF/ON — PASS
16. Locale switch updates collapsed and expanded dynamic labels — PASS
17. Locale arrival after banner creation leaves no raw i18n keys — PASS
18. Very short viewport produces finite safe dimensions — PASS
19. Collapse/expand does not change pending/input-lock state — PASS
20. Source module and generated bundle remain equivalent — PASS

A notable implementation bug was found and fixed *during* test authoring
(not a product bug): the test harness's initial `T()` function was an
outer-Node.js-realm closure over a `const i18nStrings`, which does not see
later in-`vm` reassignments (`i18nStrings = msg.strings`) performed by the
real `localeBundle` handler — `vm.createContext` contextifies the sandbox
object for global *property* access, but functions authored outside the vm
keep their original closure scope. Fixed by defining `T` via
`vm.runInContext` so it is a native function of the vm's own global scope.
This is a test-harness-only issue; the product code's own `T`/`i18nStrings`
(normally defined in `00-core.js`, not loaded by this focused harness) does
not have this problem since both live in the same execution realm at
runtime.

## 9. Pre-existing test updated (`scripts/test_relay_banner_resizer.js`)

This pre-existing test does literal substring matching against
`webview/modules/90-bootstrap.js`'s source text. The refactor into named
helpers (§10) intentionally changed the source shape it was matching
against (e.g. `parseFloat(savedHeight)` → `parseFloat(raw)` inside
`normalizeRelayBannerHeight`; `window.innerHeight * 0.5` → the
`relayBannerViewportMax()` helper; the literal storage key inlined at three
call sites → the single `RELAY_BANNER_STORAGE_KEY` constant). The four
assertions were updated to check for the new helper/constant names instead
of the old inline literals; the *behavior* each assertion protects
(double-click clears the persisted preference, a viewport-percentage max
exists, hiding targets the content element via `display:none`, the saved
value is parsed) is unchanged and is now also covered at the DOM-behavior
level by `test_relay_banner_recovery.js`.

## 10. Implementation shape

Centralized into small, independently testable helpers in
`webview/modules/90-bootstrap.js` (in addition to the existing
`updateRelayToggleButton`):

- `relayBannerViewportMax()` — safe expanded maximum for the current viewport.
- `normalizeRelayBannerHeight(raw, viewportMax)` — pure; the full migration table in one function.
- `readRelayBannerPreference()` — `localStorage` read + normalize.
- `relayBannerCollapsedInDom(content)`, `setRelayBannerCollapsed(content)`, `setRelayBannerExpanded(content, height)`
- `rememberRelayBannerHeightIfValid(content)` — session-only last-valid-height memory (§4).
- `persistRelayBannerHeight(content)` — the write side of the single storage key.
- `applyRelayBannerPreference(content)` — orchestrates read + apply on banner creation.
- `relayBannerText(key, fallback)`, `updateRelayBannerI18n()` — locale-safe label refresh (§7 in the CHANGELOG entry / §3 above), with a hardcoded English fallback for the header/toggle/sash text (dynamically created, no static HTML fallback exists for them, unlike `#relay-toggle-btn`).
- `toggleRelayBannerCollapsed()` — the click/keyboard handler.

## 11. Focused validation

Command list run exactly as specified, plus `npm ci` and the symbol-registry
regenerate/check pair (all exit 0):

```
npm ci
npm run build:webview
npm run compile
node scripts/test_relay_banner_recovery.js
node scripts/test_antigravity_relay_webview.js
node scripts/test_relay_viewport_theme_layout.js
node scripts/test_webview_bundle.js
node scripts/test_playtest_unblock_001.js
node scripts/test_gameplay_input_fastpath.js
node scripts/check_i18n_keys.js
npm run generate:symbol-registry
npm run check:symbol-registry
node scripts/check_version_consistency.js   (pre-bump, at 1.82.4 — passed)
node scripts/validate_utf8_docs.js
```

**Result: all commands exit 0.** Full output:
`C:\AI\logs\human-smoke-relay-banner-recovery-001-focused.log`

Additional directly-dependent tests were not run beyond this list (Test
Impact rationale below); `test_relay_banner_resizer.js` was identified as
directly dependent (it inspects the exact source region this task changed)
and was updated + verified separately (§9), then re-verified again as part
of the full-suite gate (§12).

## 12. Full-suite gate

Run **twice**, honestly reported: the first `npm test` run (at 1.82.5, after
the version bump) surfaced `test_relay_banner_resizer.js` as the one
manifest test whose literal-text assertions had gone stale from the
refactor (§9) — a real, unrelated-in-scope-but-directly-dependent failure,
not a flaky rerun. It was diagnosed, fixed as a small, scoped update to that
one test file, and the full suite was run a second time to confirm the fix
and obtain the actual gate result:

```
npm test
```

- Run 1: `250/251` — 1 failed (`test_relay_banner_resizer.js`, diagnosed in §9)
- Run 2 (after the §9 fix): **`251/251` — PASS**

Full output (second/gating run): `C:\AI\logs\human-smoke-relay-banner-recovery-001-full-suite.log`

## 13. Static visual inspection (static harness — not real VS Code human smoke)

Isolated static webview harness (`webview/` built output served locally,
`postMessage`-driven, `acquireVsCodeApi` stubbed) — the same technique used
elsewhere in this repository's AI-driven UI verification, **not** a
substitute for real extension-host human smoke.

| Scenario | Measurement | Result |
|---|---|---|
| Expanded, desktop (1280×800) | banner 188px total (header 36px + content 146px + sash 6px); `aria-expanded="true"` | no overflow, well under the 400px safe max |
| Collapsed, desktop (1280×800) | banner **42px** total (header 36px + sash 6px); `aria-expanded="false"` | compact strip, no blank region |
| Collapsed, narrow width (375px) | header full-width, toggle button right edge at 365px (< 375px) | no horizontal overflow |
| Expanded, short viewport (1280×300) | content clamped to 150px (`= 300 × 0.5`); banner 192px total | finite, positive, leaves ~108px for the app below — confirms the viewport-based clamp in a real browser, matching the unit-level "very short viewport" case |
| Japanese labels | header "Antigravity Relay ON" / toggle "詳細を隠す"↔"詳細を表示" / sash title "ダブルクリックでバナーの高さをリセット" | correct |
| zh-CN labels | toggle "隐藏详情" | correct (Simplified) |
| zh-TW labels | toggle "隱藏詳情" / sash title "雙擊可重設橫幅高度" | correct (Traditional) |

No console errors observed during any of the above. This is static-harness
evidence only — **the installed VS Code extension was not tested.**

## 14. Test Impact rationale

- `test_relay_banner_recovery.js` (new) is the primary coverage for this
  task's entire behavior contract (§8).
- `test_relay_banner_resizer.js` was directly dependent on the exact source
  region changed (literal-text assertions against `90-bootstrap.js`) and
  required a scoped update (§9) — not a broadening of the candidate, a
  direct consequence of the sanctioned refactor into named helpers.
- `test_antigravity_relay_webview.js` and `test_relay_viewport_theme_layout.js`
  cover adjacent Relay/webview-layout behavior this task must not regress
  (message-branch structure, CSS z-index/flex contracts, theme switching,
  bundle inclusion) and both still pass unmodified.
- `test_webview_bundle.js`, `test_playtest_unblock_001.js`,
  `test_gameplay_input_fastpath.js` were run because they are the existing
  manifest tests closest to the webview bundle / Start Hub / gameplay-input
  routing surfaces that a webview-wide bundle rebuild could plausibly affect;
  all pass unmodified.
- No other domain (installer, writer-lease, simulation/soak, persistence,
  campaign/commerce cores) was touched or is plausibly affected by a
  webview-module-only + locale-only + release-truth-only change set; the
  full `npm test` run (§12) is the final confirmation that nothing else broke.

## 15. Skipped domains

Explicitly not touched or exercised, matching the task's non-goals: Relay
authority/trigger commands, gameplay request routing, installer production
behavior, Start Hub behavior, debug-sandbox behavior, any animated-drawer or
new-dependency UI pattern, and moving the banner to a different layout
region. No genre/economy work was performed.

## 16. Version / release-truth decision

Repair-only, packaged production UI fix → patch bump per
`docs/VERSION_TRUTH.md`'s versioning rule: `1.82.4` → **`1.82.5`**. The
`1.82.4` CHANGELOG section is preserved unchanged; `1.82.5` was added above
it with a `### Production fixes` entry (not classified as test-infrastructure-only,
per the task's explicit instruction, since it changes shipped webview
behavior). `package.json`, `package-lock.json`, all four README badges,
`docs/VERSION_TRUTH.md`, and `CHANGELOG.md` agree (`check_version_consistency.js`
passes at 1.82.5).

## 17. Confirmations

- **`main` was not changed.** All work was done in the dedicated worktree
  `C:\AI\wt-human-smoke-relay-banner-recovery-001` on branch
  `task/HUMAN-SMOKE-RELAY-BANNER-RECOVERY-001`, created directly from the
  verified exact base SHA `08807d98234cada6d10ee194779d56202afa2fbd`. Only
  this task branch was pushed; `main` was not pushed to.
- **The live installer, installed extension, live world, and campaign data
  were not touched.** No installer script, packaging workflow, or
  `sample-scenarios/**` content was modified; nothing outside this worktree
  was written to.
- **Real human smoke remains pending.** Everything in §13 is static-harness
  evidence gathered by an AI session, not a real VS Code extension-host
  session. This candidate still requires an actual human (or a
  computer-use-driven session against a real, running VS Code Extension
  Development Host / installed VSIX) to click through Relay ON → collapse →
  reload/OFF/ON → expand in the genuine product before it can be considered
  human-smoke-complete.
- **Independent verification is required before integration to `main`**,
  consistent with this repository's established pattern for
  `HUMAN-SMOKE-*` and other candidate tasks (see e.g.
  `docs/ai-tasks/HUMAN-SMOKE-DEBUG-SANDBOX-FASTPATH-001-INDEPENDENT-VERIFY.md`
  for the precedent this task followed).
