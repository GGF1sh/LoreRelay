# Codex Review Fix Log

## 2026-06-27 JST - Security Review Follow-up

### Summary
- Implemented fixes from Codex code review for VLM/Soulgaze, Character Creator image persistence, World Simulation duplicate ticks, schema drift, Mermaid rendering, PNG/Tavern card robustness, and locale test failures.

### Files touched
- `src/vlmProvider.ts`
- `src/gmBridgeRunner.ts`
- `src/characterManager.ts`
- `src/webviewHandlers.ts`
- `src/extension.ts`
- `src/emergentSimulator.ts`
- `src/worldStateCore.ts`
- `src/gmPromptBuilder.ts`
- `src/validateGameState.ts`
- `src/tavernCardImporter.ts`
- `src/utils/pngMetadata.ts`
- `game_state_schema.json`
- `package.json`
- `webview/modules/10-game-state.js`
- `webview/script.js`
- `locales/zh-CN.json`
- `locales/zh-TW.json`

### Verification
- `npm run compile` passed.
- `npm test` passed.

### Notes
- `CHANGELOG.md` and `AI_SHARED_LOG.md` currently contain invalid UTF-8 byte sequences, so Codex did not patch them directly to avoid widening encoding damage.
- Future cleanup should normalize those files to UTF-8, then merge this entry back into the shared log/changelog.

## 2026-06-28 JST - Codex - Living World Feedback Follow-up

### Summary
- Reviewed Claude Phase 4a/4b and Grok v1.4.1 hardening on `feat/v1.4-living-world-feedback`.
- Fixed remaining drift between `/world` patch generation, patch application, TypeScript types, validator, and `game_state_schema.json`.
- Prevented `remove` operations from deleting GM-patchable `/world` fields; location/faction/danger should be changed via validated `add`/`replace`.
- Made `buildStatePatchFromDiff()` expand direct-write fallback world changes into safe subpath patches instead of generating blocked wholesale `/world` replacements.
- Pruned expired Living World events before GM prompt injection and before Webview `recentChanges` display.

### Files touched
- `src/statePatch.ts`
- `src/validateGameState.ts`
- `src/types/GameState.ts`
- `src/gmPromptBuilder.ts`
- `src/worldView.ts`
- `game_state_schema.json`
- `scripts/test_state_patch.js`
- `scripts/test_world_state.js`

### Verification
- `npm run compile` passed.
- `npm test` passed.
