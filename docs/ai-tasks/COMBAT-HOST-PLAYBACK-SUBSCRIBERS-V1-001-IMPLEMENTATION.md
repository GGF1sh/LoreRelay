# COMBAT-HOST-PLAYBACK-SUBSCRIBERS-V1-001 Implementation

Date: 2026-07-22 JST  
Base: `origin/main` @ `f53048c6bb6725d9682e9384c71c66694f7c7718`  
Branch: `task/COMBAT-HOST-PLAYBACK-SUBSCRIBERS-V1-001`  
Risk: Medium  
Reference-only (not merged): `786ea5da0ea575cb297b0f1f1c09a4cc30ec04b5`

## Scope implemented

1. **Finite starting coordinates**
   - `isValidUnit` now requires `position.x` and `position.y` to both be finite numbers.
   - Invalid coordinates are rejected at `isValidScenario` / normalize / import / apply.
   - `createCombatCommandPlaytest` returns structured `INVALID_COMBAT_LAB_SCENARIO` without throwing.
   - Defensive non-finite guard remains in `mapUnitsIntoPlaytestBounds`.

2. **Host-owned playback scheduler**
   - New pure helper `consumePlaybackTicks` uses elapsed-time accumulation (`totalMs * tickRate / 1000`) so 10/24/25/30/60 Hz advance correctly without the reference commit’s `Math.round(rate/10)` error.
   - `CombatCommandPlaytestHost` owns one session, one scheduler, carry residual, and catch-up cap.
   - Webview no longer schedules `stepCombatCommandPlaytest` via `setInterval`.
   - New message: `setCombatCommandPlaytestRunning`.
   - Start accepts optional `autoRun` for first Run click.

3. **Multi-webview subscribers**
   - Host maintains a subscriber map; open/restore re-subscribes without restarting battle.
   - Closing one subscriber does not dispose the session.
   - Snapshots include `tickRate` and `running` for restore.
   - Stale `startId` is rejected on run/step/issue.

## Out of scope (unchanged)

Battle View layout, drag resize, Fit/Zoom, roster/MP HUD, combat mechanics, BattleSpec redesign, `stepCombat()` semantics, persistence, world/character mutation, broad i18n, old PR #40 branch cleanup.

## Verification

- `npm run test:plan -- --base origin/main --head HEAD --mode verify`
- `npm run compile`
- `node --test out/combatCommandPlaytestCore.test.js out/combatCommandPlaytestHost.test.js out/combatCommandWebviewAdapter.test.js`
- `node scripts/test_webview_bundle.js`
- `node scripts/test_combat_manifest_coverage.js`
- `node scripts/validate.js`
- `npm run check:symbol-registry` (after regenerate)
- Manual VS Code smoke: recommended for integrator (Run/Pause, single host session, close/reopen, non-30Hz scenario); automated host clock tests cover rate/subscriber/lifecycle contracts without wall-clock waits.

## Files

- `src/combatLabCore.ts`
- `src/combatCommandPlaytestCore.ts` / `.test.ts`
- `src/combatCommandPlaytestHost.ts` / `.test.ts` (new)
- `src/combatCommandWebviewAdapter.test.ts`
- `src/extension.ts`
- `src/webviewHandlers.ts`
- `webview/modules/89f-combat-lab.js`
- `webview/script.js` (generated)
- `scripts/combat_test_manifest.js`
- `docs/generated/symbol_registry.json` / `SYMBOL_REGISTRY.md`
