# PLAYTEST-UNBLOCK-001 Implementation

Current main at branch creation:
- `55a20ac537cfacf109bc0dd2324ca66d74cf5ddd`

Branch:
- `task/PLAYTEST-UNBLOCK-001-start-scenario-ux`

## Scope implemented

1. Start Hub return path
- Added an explicit `Start Hub` button in the active session header.
- Added a `Resume current session` action inside Start Hub.
- Implemented client-side Start Hub toggling without clearing `messageHistory`, so returning home does not destroy the current scenario state.

2. Scrapbound Japanese locale
- Added a `locales.ja` overlay to `sample-scenarios/scrapbound-settlement/scenario.json`.
- Added pure locale-overlay resolution in `src/scenarioPackCore.ts`.
- `src/scenarioPack.ts` now applies the active locale before seeding game state and writes the localized scenario copy into the workspace, avoiding mixed-language sample state.

3. Scrapbound starter protagonist
- Added structured `setup.playerCharacter` to Scrapbound.
- `src/scenarioPack.ts` now bootstraps the scenario starter protagonist into Character Profile when no player-controlled protagonist already exists.
- Existing player protagonists remain authoritative; the sample starter only fills the empty case or reuses the same player protagonist when it already matches.

## Tests and verification

Commands run:
- `npm ci`
- `npm run compile`
- `node scripts/test_playtest_unblock_001.js`
- `node scripts/test_sample_scenarios.js`
- `node scripts/test_scrapbound_sample_integrity.js`
- `node scripts/test_scenario_pack_core.js`
- `node scripts/test_webview_bundle.js`
- `npm run generate:symbol-registry`
- `npm run check:symbol-registry`
- `npm test`

Results:
- Focused PLAYTEST-UNBLOCK-001 tests: PASS
- Compile: PASS
- Symbol Registry check: PASS after regeneration
- Full suite: `230/230 passed`

## Files changed

- `src/scenarioPack.ts`
- `src/scenarioPackCore.ts`
- `sample-scenarios/scrapbound-settlement/scenario.json`
- `webview/index.html`
- `webview/modules/90-bootstrap.js`
- `webview/script.js`
- `locales/en.json`
- `locales/ja.json`
- `locales/zh-CN.json`
- `locales/zh-TW.json`
- `scripts/test_playtest_unblock_001.js`
- `scripts/test_scenario_pack_core.js`
- `scripts/test_scrapbound_sample_integrity.js`
- `scripts/run_all_tests.js`
- `docs/generated/symbol_registry.json`
- `docs/generated/SYMBOL_REGISTRY.md`
