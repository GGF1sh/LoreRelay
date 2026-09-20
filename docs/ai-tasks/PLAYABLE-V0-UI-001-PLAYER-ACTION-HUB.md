# PLAYABLE-V0-UI-001 — Coherent Player Action Hub

## Summary

Unified the deterministic P2 (direct trade), P3 (end day), and P4 (zero-turn
travel) flows — previously exposed as three unrelated top-level utility buttons
and three separate modal dialogs — into a single, coherent, player-facing hub
opened from one primary **暮らす** entry point in the World / Commerce area. No
deterministic gameplay authority, host message contract, request-id semantic,
persistence truth, or shared workspace mutation gate was changed. This is a
presentation + client-side-state change only. No AI narration and no
AI-dependent state mutation were introduced.

## Base and version

- Exact origin/main base: `92aa1cb2e008ebdc2cc49c66ae9896ee2e716ab3`
- Package version (unchanged): `1.81.0`
- Worktree: `C:\AI\wt-playable-v0-ui`
- Branch: `task/PLAYABLE-V0-UI-001-player-action-hub`
- Implementation commit: `bfd212c6fe846d537b333fd8daa5015b5e8e9e72`

## Inspected files (initial ≤ 8)

1. `webview/modules/85-world.js`
2. `webview/style.css` (built) / `webview/styles/85-world.css` (source)
3. `webview/script.js` (built bundle)
4. `scripts/test_market_travel_core.js`
5. `scripts/test_webview_world_modules.js`
6. `scripts/test_webview_bundle.js`
7. `scripts/test_shopkeeper_direct_trade_core.js`
8. `scripts/test_end_day_world_progression.js`

Expanded (protocol / gate questions only): `src/extension.ts` (host commit +
refresh contract), `scripts/test_shopkeeper_repair.js`,
`scripts/test_deterministic_workspace_mutation_gate.js`,
`scripts/run_all_tests.js`, `scripts/check_i18n_keys.js`,
`scripts/generate_symbol_registry.js`, `scripts/build-webview.js`.

## Changed files

- `webview/modules/85-world.js` — replaced the three-button cluster + three
  separate dialogs with one `暮らす` entry and the unified hub.
- `webview/styles/85-world.css` — new semantic hub CSS classes.
- `webview/script.js`, `webview/style.css` — regenerated bundles.
- `scripts/test_playable_v0_player_action_hub.js` — new focused UI contract test.
- `scripts/run_all_tests.js` — added the new test to the manifest.
- `scripts/test_shopkeeper_direct_trade_core.js` — updated the UI-contract check
  to the hub structure without weakening it (still asserts shopkeeper protocol,
  modal semantics, Escape, in-flight guard, no-AI-leak in the trade flow, and a
  width constraint — now via a semantic CSS class instead of an inline string).
- `docs/generated/symbol_registry.json`, `docs/generated/SYMBOL_REGISTRY.md` —
  regenerated for the changed webview symbols (required by
  `npm run check:symbol-registry`).

## Before / after interaction structure

Before:
- Commerce panel exposed three unrelated top-level buttons — `暮らす`
  (shopkeeper trade), `旅に出る` (travel), `一日を終える` (end day).
- Each opened its own separate fixed-overlay dialog styled with inline
  `style.cssText` / `width:min(100%,460px)` strings.

After:
- One primary **暮らす** button opens a single modal hub
  (`role="dialog"`, `aria-modal="true"`, `aria-label="暮らす"`).
- A compact status header shows canonical current state: 現在地 / credits /
  food / transport / cargo (no invented values).
- A keyboard-accessible tablist selects one of three sections:
  **取引 / 旅 / 一日を終える**. Default is 取引 when a usable current market
  exists; otherwise 旅 (with 取引 explaining the factual no-market state).

## Trade flow (取引)

Choose commodity → choose 購入 / 売却 → choose quantity (± stepper plus a
keyboard-editable integer field bounded 1–999) → **確認** shows a read-only
quote (commodity, operation, quantity, unit price, total, stock, and the
relevant player credits/holdings) → **確定** posts the unchanged
`shopkeeperDirectTrade` protocol with a fresh request id → the authoritative
receipt reads `購入しました` / `売却しました` (no "state was written" wording).
Changing commodity, operation, or quantity invalidates the preview and disables
確定 until a new preview is taken. On success the canonical header and market
option values refresh in place and the hub stays open.

## Travel flow (旅)

Lists only canonical available market destinations → select → **確認** shows a
read-only preview → **移動を確定** posts the unchanged `marketTravelCommit`
protocol. The zero-turn contract is stated plainly:
「移動では日付や世界ターンは進みません」. Internal terms
(`reachabilityBasis`, `systemsNotAdvanced`, `elapsedWorldTurns`, request ids)
never appear in the normal player UI — they are confined to a collapsed
"開発者向け詳細" `<details>` area. Changing the destination invalidates the old
preview. On success, when the destination market is usable, the hub switches
back to 取引 automatically.

## End-day flow (一日を終える)

A compact read-only preview states the consequence (the world advances by
exactly one turn; market/world update; AI is not called) → explicit
**一日を終える** confirmation posts the unchanged `endDayCommit` protocol →
processing state → factual receipt → header/market refresh. This section and its
confirm control carry stronger visual emphasis (orange accent) than the
zero-turn travel and trade confirmations. No additional artificial confirmation
layer beyond the existing preview/confirm contract was added.

## Shared UI state model

A single client-side state machine governs the hub. Per-section review regions
carry a `data-state` of idle / preview / loading / submitting / success /
success-stale / busy / error / empty. A hub-level `_hubMutationInFlight`
(null | trade | travel | endday) enforces that:

- only one deterministic mutation is ever in-flight; while it is accepted by the
  host, the close control and every other section's confirm are genuinely
  disabled;
- nothing is queued and nothing is auto-retried;
- `WORLD_MUTATION_IN_PROGRESS` and `BUSY` are terminal for that request (the
  in-flight guard clears and the player may manually retry);
- stale host responses are ignored by request-id / destination correlation and
  never overwrite a newer selection;
- closing the hub sends no message and makes no cancellation claim;
- persisted-success-with-refresh-failure keeps its success state
  (`success-stale`) and adds a factual "画面を再読込してください" note.

## Accessibility and keyboard

- Dialog semantics (`role="dialog"`, `aria-modal="true"`, Japanese
  `aria-label`), tablist/tab/tabpanel roles with `aria-selected` / `tabindex`
  roving.
- Esc closes the hub when no submission is being accepted; focus returns to the
  opening 暮らす button.
- Focus enters the hub predictably (the active tab) on open.
- Arrow / Home / End move between section tabs; Enter/Space activate natively.
- Status/result updates use `role="status" aria-live="polite"` regions.
- Disabled controls are genuinely disabled; visible `:focus-visible` outlines;
  reduced-motion media query; theme-driven colors for high-contrast.

## Factual authority preserved

P2 pricing/inventory authority, P3 world progression, P4 zero-turn behavior,
request-id semantics, persistence truth, the shared workspace mutation gate, and
host refresh truth are all unchanged. The webview gained no simulation or
gameplay authority. No host request gates were altered. No host change was
required — the existing factual responses were sufficient to represent every UI
state.

## Tests added / updated

- Added `scripts/test_playable_v0_player_action_hub.js` (manifest category
  `smoke`) — inspects committed source, semantic CSS, and the built bundle, and
  slices real function bodies to assert: one 暮らす entry; the three separate
  top-level buttons are gone; the 取引/旅/一日を終える tablist; correct
  `旅に出る` text; no mojibake (`譌 蜃 繧 證`); trade + travel preview
  invalidation; explicit end-day preview→confirm; stale request/destination
  correlation for all three flows; BUSY / `WORLD_MUTATION_IN_PROGRESS` as
  non-success; persisted-success-with-refresh-failure distinguishable;
  Esc/focus-return; semantic CSS classes with inline dialog styles removed; the
  bundle carries the hub; and module⊆bundle after EOL normalization.
- Updated `scripts/test_shopkeeper_direct_trade_core.js` UI-contract check to the
  hub structure without weakening it.

## Build and focused validation (all exit 0)

- `npm ci` — OK
- `npm run build:webview` — OK (script.js 15836 lines / style.css 6393 lines)
- `npm run compile` — OK (tsc clean)
- `node scripts/test_playable_v0_player_action_hub.js` — PASS
- `node scripts/test_market_travel_core.js` — PASS
- `node scripts/run_noai_play_p4_fixtures.js` — PASS
- `node scripts/test_shopkeeper_direct_trade_core.js` — PASS
- `node scripts/test_shopkeeper_repair.js` — PASS
- `node scripts/test_end_day_world_progression.js` — PASS
- `node scripts/run_noai_play_p3_fixtures.js` — PASS
- `node scripts/test_webview_bundle.js` — PASS
- `node scripts/test_webview_world_modules.js` — PASS
- `node scripts/test_deterministic_workspace_mutation_gate.js` — PASS

## Canonical gates (all exit 0)

- `node scripts/check_i18n_keys.js` — 0 missing across ja / en / zh-CN / zh-TW
  (no new i18n keys introduced)
- `npm run check:symbol-registry` — up to date after regeneration
- `node scripts/check_version_consistency.js` — OK (1.81.0)
- `node scripts/validate_utf8_docs.js` — OK

## Full suite

- Command: `npm test` (run exactly once)
- Manifest scripts: **247**
- Result: **Passed 247 / 247, 0 failed, exit code 0** (duration ≈ 102s)
- External log (outside the repository):
  `C:\AI\logs\playable-v0-ui-001-full-suite.log`

## Limitations

- No live installer was run.
- No human gameplay smoke test was performed (the UI is operable and contract-
  verified, but not exercised by a person end-to-end).
- The repository ships no DOM harness for webview modules, so the focused test
  verifies real source/bundle structure and state-machine relationships rather
  than executing the DOM.

This candidate is ready for independent UI verification, not integration.
