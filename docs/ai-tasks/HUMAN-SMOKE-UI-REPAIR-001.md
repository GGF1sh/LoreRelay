# HUMAN-SMOKE-UI-REPAIR-001 Report

**Date**: 2026-07-13
**Version**: 1.82.1
**Status**: **READY FOR INDEPENDENT VERIFICATION**

## Observed Failures (from Human Smoke Test)
1. Enabling Antigravity Relay created a large blank area above the application.
2. The right Adventure Status pane could no longer scroll far enough to display the complete Story Summary section.
3. The Relay banner text was not visible in the blank area.
4. The World Theme heading was squeezed into a narrow vertical column and appeared to disappear when switching themes.

## Root Causes
- **Relay viewport clipping & hidden banner**: The banner was prepended to the body, but the body had `height: 100vh; overflow: hidden;` and `#app` independently had `height: 100vh;`, placing the total height at `banner height + 100vh` inside a clipped `100vh` container. Additionally, the banner lacked a high z-index stacking context to stay above background overlays.
- **Nested Scrolling**: Both `#status-area` and `.tab-pane` used `overflow-y: auto;` causing nested scrollbar conflicts that clipped the bottom content (Story Summary) and made it unreachable.
- **Squeezed Theme Header**: `#theme-header` was styled as a flex row with `justify-content: space-between`, which squeezed the heading `span` into a narrow vertical column when the status pane width was narrow.

## Implemented Fixes & Contracts

### 1. Relay Viewport & Layout Contract
- Added `relay-mode-active` class to `body` when Relay mode is toggled on.
- Made `body.relay-mode-active` a flex column container.
- Moved `#relay-mode-banner` inline styles to `10-layout-chat.css`, setting it to `flex: 0 0 auto` and `z-index: 10`.
- Made `body.relay-mode-active #app` styled as `flex: 1 1 auto; height: auto; min-height: 0;` so it consumes only the remaining viewport height.

### 2. Scroll Ownership
- Removed `overflow-y: auto` from `#status-area` and set it to `overflow: hidden`.
- Retained `overflow-y: auto` on the active `.tab-pane` as the sole authoritative scroll container.
- Added `padding-bottom: 32px` to `.tab-pane` to prevent the final Story Summary content from being flush against the bottom edge.

### 3. World Theme Header Layout
- Styled `#theme-header` as a column layout: `flex-direction: column; align-items: flex-start; gap: 8px;`.
- Protected the theme title from shrinking with `flex-shrink: 0; white-space: nowrap;`.
- Styled `.theme-selector` as `width: 100%; display: flex; flex-wrap: wrap; gap: 6px; align-items: center;` to allow the buttons to wrap cleanly underneath the title.

## Regression Testing
- Created a new focused test: [test_relay_viewport_theme_layout.js](file:///c:/AI/wt-human-smoke-ui-repair-001/scripts/test_relay_viewport_theme_layout.js).
- Added it to the unified test runner manifest in `scripts/run_all_tests.js`.
- Verified that all assertions pass successfully (Relay class toggles, banner stacking, scroll container dominance, theme header shrink protection, and EOL normalized module bundling).

## Verification Results
- **Full Suite**: 248/248 tests passed.
- **External Log**: `C:\AI\logs\human-smoke-ui-repair-001-full-suite.log`
- **Validation scripts**: `check_version_consistency.js` and `validate_utf8_docs.js` exited 0.
- **Symbol Registry**: Updated and matched (`check:symbol-registry` exited 0).

## Gates & Next Steps
- **No live installer** was run during this repair.
- **No live human re-smoke** was performed.
- Candidate requires **independent verification** on branch `task/HUMAN-SMOKE-UI-REPAIR-001` before integration.
