# HUMAN-SMOKE-UI-REPAIR-001 Independent Verification

**Date**: 2026-07-13  
**Auditor**: independent worktree verification (no subagents)  
**Final status**: `HUMAN_SMOKE_UI_REPAIR_001_VERIFY_PASS`

## Identity

| Item | Value |
|------|--------|
| Canonical repository | `C:\AI\text-adventure-vsce` |
| GitHub | `GGF1sh/LoreRelay` |
| Verification worktree | `C:\AI\wt-human-smoke-ui-repair-001-independent-verify` |
| Verification branch | `task/HUMAN-SMOKE-UI-REPAIR-001-independent-verify` |
| `origin/main` | `a7f444441baf8002e61071202c65a88a13b4933d` |
| Candidate branch | `task/HUMAN-SMOKE-UI-REPAIR-001` |
| Candidate tip | `1226a4dc1bb8dbb4e908c003ac67548682d65cf3` |
| Version | `1.82.1` |

### Lineage (exactly 5 ahead, 0 behind, no merge commits)

```
a7f444441baf8002e61071202c65a88a13b4933d  origin/main
 -> c87780771248cba89f0e5a021685690707e5ae52  fix: repair Relay viewport and theme layout
 -> d98b2b05b41deaed226e0cf092bc98d077031bb3  chore: bump release truth to 1.82.1
 -> faf2a70c5eebf130596b5541a2d4fc8c042e9184  docs: record human-smoke UI repair
 -> c8f65edaae763cd5775e19e62d2f3dba2a5efaf7  test: strengthen Relay viewport layout evidence
 -> 1226a4dc1bb8dbb4e908c003ac67548682d65cf3  docs: strengthen human-smoke UI repair evidence
```

### Commit scopes

| Commit | Scope |
|--------|--------|
| `c8778077` | UI/CSS sources, generated `webview/script.js` + `webview/style.css`, `scripts/test_relay_viewport_theme_layout.js`, `scripts/run_all_tests.js` manifest entry, mechanical symbol-registry line shifts |
| `d98b2b05` | Canonical 1.82.1 release-truth only (`package.json`, `package-lock.json`, CHANGELOG, READMEs, `docs/VERSION_TRUTH.md`) |
| `faf2a70c` | Only `docs/ai-tasks/HUMAN-SMOKE-UI-REPAIR-001.md` |
| `c8f65eda` | Only `scripts/test_relay_viewport_theme_layout.js` |
| `1226a4dc` | Only `docs/ai-tasks/HUMAN-SMOKE-UI-REPAIR-001.md` |

Fresh worktree started clean at candidate tip with version `1.82.1`.

## Inspected files

- `webview/modules/90-bootstrap.js`
- `webview/modules/10-game-state.js`
- `webview/styles/00-base.css`
- `webview/styles/10-layout-chat.css`
- `webview/styles/30-status-gallery.css`
- `webview/index.html`
- `webview/script.js`
- `webview/style.css`
- `scripts/test_relay_viewport_theme_layout.js`
- `docs/ai-tasks/HUMAN-SMOKE-UI-REPAIR-001.md`
- `CHANGELOG.md`, `README.md`, `README_en.md`, `README_zh-CN.md`, `README_zh-TW.md`
- `docs/VERSION_TRUTH.md`, `package.json`, `package-lock.json`

## Production source findings

### A. Relay layout state

- Relay ON: `document.body.classList.add('relay-mode-active')` then duplicate-safe banner create (`if (!relayBanner)`).
- Relay OFF: class removed and existing banner `remove()`d.
- No JS-assigned pixel banner height; styling moved to CSS (`#relay-mode-banner`).
- Host `relayModeStatus` protocol path remains the same branch with prior send-button / controls / `setRelayUiState` behavior after the layout block.

### B. Viewport contract

- `body`: `height: 100vh; overflow: hidden` retained.
- `body.relay-mode-active`: column flex.
- Normal `#app`: `height: 100vh; z-index: 2`.
- `body.relay-mode-active #app`: `flex: 1 1 auto; height: auto; min-height: 0` (no `height: 100vh`).
- `#relay-mode-banner`: `flex: 0 0 auto; position: relative; z-index: 10` (normal-flow, non-shrinking).
- Banner z-index (10) is numerically above `#bg-overlay` (1) and `#app` (2).
- Banner is not a fixed full-viewport overlay covering the app header.

### C. Scroll ownership

- `#status-area`: `overflow: hidden` shell (was `overflow-y: auto`).
- `.tab-pane`: sole vertical scroll owner (`overflow-y: auto`, `min-height: 0`, bottom padding `32px`).
- `.tab-pane.active`: `flex: 1 1 auto`.
- Story Summary (`summary-container` / `story-summary`) remains inside `#pane-status` after `#theme-header`, before `#pane-character`.
- No new status-pane scroll hack in the repair. Existing chat/`scrollToBottom` and tab-switch `scrollTop = 0` paths are unrelated and pre-existing.

### D. Theme layout

- `#theme-header`: column layout + `align-items: flex-start`.
- `#theme-header span`: `flex-shrink: 0; white-space: nowrap`.
- `.theme-selector`: `width: 100%`, flex wrap, no horizontal overflow rules.
- `.theme-btn.active` styling retained.
- `setTheme` only updates theme state, `data-ui-theme`, active class toggles, and `saveState()` — no title/selector HTML/text mutation.

### E. Generated truth

- Candidate `webview/script.js` / `webview/style.css` contain the repaired source modules/CSS.
- Symbol-registry deltas in `c8778077` are line-number shifts from bootstrap edits only.

### Residual notes (not repair blockers)

- Primary banner label text is set only at banner creation; locale re-apply does not rewrite that text while Relay stays ON (status line under `data-relay-status` is updated separately). Not one of the four human-observed failures.
- Static verification cannot replace post-integration visual human smoke.

No invented production blockers: the four human-observed layout failures are addressed by the source contracts above.

## Adversarial audit of strengthened test

File: `scripts/test_relay_viewport_theme_layout.js` (commit `c8f65edaae763cd5775e19e62d2f3dba2a5efaf7`).

| Claim area | Verdict |
|------------|---------|
| Relay branch extraction | **Acceptable for claimed asserts, residual incomplete capture.** Regex uses non-greedy stop at first `}\s*else if`, so the branch is truncated at the nested `} else if (typeof setRelayUiState ...)`. All required layout/banner statements still sit in the captured prefix. Not a false-pass for those asserts; full-branch brace-aware extraction would be stricter. |
| CSS parser | Fail-closed on zero/ambiguous exact selector matches; skips `/* */` comments and tracks strings; skips `@` rule interiors; assertions use exact selectors for the critical blocks. Trustworthy for current repository CSS shapes. |
| Z-index | Numerical parse/compare of banner vs `#bg-overlay` and `#app`. |
| Scroll | Rejects `overflow-y: auto` / `overflow: scroll` on `#status-area`; requires `.tab-pane` `overflow-y: auto` + `min-height: 0`, positive bottom padding, `.tab-pane.active` flex. |
| Summary containment | Index order proof: `pane-status` < `summary-container`/`story-summary` < `pane-character`, and both after `theme-header`. |
| setTheme | Brace-aware function body extraction; rejects `innerHTML` / `textContent =` / `.remove()`; permits active-class toggles. |
| Source/bundle | Requires complete normalized source module/CSS inclusion in generated bundles (not snippets). |

**Material overclaim?** No. The original weak global/includes checks were replaced with selector-scoped CSS, containment indices, brace-aware `setTheme`, and full-source bundle inclusion. Residual incomplete relay-branch capture is documented as a residual test limitation, not evidence that production is unproven.

## Report and release honesty

Candidate report `docs/ai-tasks/HUMAN-SMOKE-UI-REPAIR-001.md`:

- Records original evidence gaps and strengthened test SHA `c8f65edaae763cd5775e19e62d2f3dba2a5efaf7`
- Uses repository-relative test path `scripts/test_relay_viewport_theme_layout.js`
- Records evidence full-suite log `C:\AI\logs\human-smoke-ui-repair-001-evidence-full-suite.log`
- Does not claim live installer or human re-smoke

Release truth:

- Version consistently `1.82.1` across package, lockfile, README badges, VERSION_TRUTH, CHANGELOG head
- Historical `[1.82.0]` section remains intact
- Patch `[1.82.1]` describes only this Relay viewport / status-pane scroll / World Theme header repair

## Focused validation

All exit 0; version `1.82.1`:

- `npm ci`
- `npm run build:webview`
- `npm run compile`
- `node scripts/test_relay_viewport_theme_layout.js`
- `node scripts/test_playable_v0_player_action_hub.js`
- `node scripts/test_webview_bundle.js`
- `node scripts/test_webview_world_modules.js`
- `node scripts/check_i18n_keys.js`
- `npm run check:symbol-registry`
- `node scripts/check_version_consistency.js`
- `node scripts/validate_utf8_docs.js`

Build dirt restored; worktree clean before this report commit.

## Full suite

Process-scoped Windows PowerShell module path only.  
`Get-Command Get-FileHash` → Function `Get-FileHash` v3.1.0.0 (`Microsoft.PowerShell.Utility`).

| Item | Result |
|------|--------|
| Command | `npm test` once |
| Manifest | 248 scripts |
| Result | `Passed: 248/248` |
| Exit code | 0 |
| Failed scripts | 0 |
| External log | `C:\AI\logs\human-smoke-ui-repair-001-independent-verify-full-suite.log` |

## Limitations

- No live installer.
- No human re-smoke / visual integration smoke.
- Did not touch `C:\AI\wt-lorerelay-installer-current` or `G:\AI\LoreRelayWorlds\Fantasy`.
- No Relay/LLM gameplay, Antigravity gameplay, ComfyUI, or image generation.
- Did not merge or modify `main`, production implementation, release truth, or candidate reports.
- Static/source verification cannot replace post-integration visual confirmation of the four human-observed UI failures.

## Final status

**`HUMAN_SMOKE_UI_REPAIR_001_VERIFY_PASS`**

Production contracts address the four human-observed failures; strengthened test evidence is trustworthy for the repository shapes it claims; report/release honesty holds; focused gates and independent full suite pass at `1.82.1`.
