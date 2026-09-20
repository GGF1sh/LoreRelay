AI: Codex
Model: GPT-5.4
Reasoning: High

# PLAYTEST-UNBLOCK-001 Small Repair

- Exact main: `origin/main` = `55a20ac537cfacf109bc0dd2324ca66d74cf5ddd`
- Exact parent candidate: `4ce73dff7fbea0b416f4687a6554ede0cb1826ca`
- Exact accepted review commit: `4e3fd36912da03ad0afcf08716b1cc1f2d499368`
- Repair branch: `task/PLAYTEST-UNBLOCK-001-small-repair`

## Applied Repairs

1. Preserve Start Hub while open
   - Removed the ordinary `gameStateUpdate` reset that was clearing `startHubForcedVisible`.
   - Start Hub now stays open across incremental sync until explicit `Resume` or another explicit navigation path.

2. Re-send Character List after `openGame`
   - Added a post-`openGame` `sendCharacterList()` alongside the existing `sendCurrentState()`, BGM, SFX, and Scenario Director sync.
   - This closes the panel-not-yet-open gap for scenario starter protagonist creation.

3. Narrow whitespace-only existing-player exception
   - Starter bootstrap now treats only usable player profiles as authoritative.
   - Existing player profiles with blank / whitespace-only names no longer block deterministic Scrapbound starter creation.
   - Valid unrelated player profiles remain untouched and still block starter overwrite/creation.

4. Temp-workspace integration proof
   - Replaced the prior symbol/string-only focused test with a production-grounded temp-workspace test.
   - Added a narrow opening-status normalization seam so scenario opening `condition` persists in schema-compatible form.

## Changed Files

- `docs/generated/SYMBOL_REGISTRY.md`
- `docs/generated/symbol_registry.json`
- `docs/ai-tasks/PLAYTEST-UNBLOCK-001-SMALL-REPAIR.md`
- `scripts/test_playtest_unblock_001.js`
- `src/scenarioPack.ts`
- `webview/modules/90-bootstrap.js`
- `webview/script.js`

## Production-Grounded Test Design

- Webview behavior proof
  - Executes real `webview/modules/10-game-state.js` + `webview/modules/90-bootstrap.js` in a minimal fake DOM/runtime.
  - Verifies: active history -> Home -> synthetic incremental `gameStateUpdate` -> Start Hub remains visible -> history preserved -> Resume restores the same session.

- Temp workspace scenario proof
  - Uses real compiled production modules in a temp workspace with a VS Code stub.
  - Exercises `loadBundledSampleScenario('scrapbound-settlement')`.
  - Verifies:
    - Japanese opening narrative, status, and options persist to workspace `game_state.json`
    - workspace `scenario.json` is localized canonical copy with no top-level `locales`
    - starter character persists as `scrapbound_runner`
    - starter reaches active character and party
    - Character List is re-sent after `openGame`
    - valid unrelated player stays authoritative
    - matching starter is reused
    - whitespace-only-name player does not block creation
    - repeated load does not duplicate starter

## Focused Results

- `npm run compile`
  - PASS
- `node scripts/test_playtest_unblock_001.js`
  - PASS
- `node scripts/test_scenario_pack_core.js`
  - PASS
- `node scripts/test_scrapbound_sample_integrity.js`
  - PASS
- `node scripts/test_webview_bundle.js`
  - PASS
- `npm run generate:symbol-registry`
  - PASS
- `npm run check:symbol-registry`
  - PASS
- `node scripts/test_symbol_registry.js`
  - PASS

## Full Suite

- `npm test`
  - PASS (`230/230`)

## Unrelated Environment Limitation

- None during this repair run.

## Final Verdict

`PLAYTEST_UNBLOCK_001_REPAIR_READY_FOR_VERIFY`
