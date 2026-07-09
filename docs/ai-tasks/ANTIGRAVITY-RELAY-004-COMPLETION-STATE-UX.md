# ANTIGRAVITY-RELAY-004 Completion State UX

## Baseline

- Exact starting `origin/main`: `97b8b1e7438c155a857dcdd5df32b6652fca11ae`
- Branch: `task/ANTIGRAVITY-RELAY-004-completion-state-ux`
- Scope: narrow repair after successful ANTIGRAVITY-RELAY-003 real human smoke

## Real Human Smoke Evidence

ANTIGRAVITY-RELAY-003 real smoke result:

- Verdict recorded here: `ANTIGRAVITY_RELAY_003_REAL_SMOKE_PARTIAL_PASS`
- Core file round trip: PASS
- First matching import: PASS
- Multi-turn continuation: PASS
- Successful waiting-state completion: FAIL
- Clear pending/accepted UX: FAIL
- Automatic right-side chat submission: unsupported / not claimed

Observed successful path:

1. Antigravity Relay ON.
2. LoreRelay action created a pending request.
3. User sent on the right:

```text
/text-adventure-gm process pending LoreRelay request
```

4. Right processed the actual pending LoreRelay request.
5. Right created `turn_result.json`.
6. LoreRelay imported the result.
7. Narration, status, and options appeared correctly on the left.
8. User could choose the next option and continue the setup conversation.

## Why The Old Spinner Remained

The file bridge and import path worked, but the UI completion protocol was incomplete.

Root cause:

- `sendFreeInput()` optimistically called `showGmLoading()`.
- `showRelayWaitingState()` returned immediately when `#gm-loading` already existed.
- Therefore the generic GM loading row remained under the real Relay flow instead of being converted to Relay waiting UI.
- Successful matching Relay import posted `gameStateUpdate`, but there was no symmetric explicit completion event for the Relay waiting state.
- Failure already had `relayWaitingStateError`, so success needed the matching explicit protocol.

## Successful Completion Protocol

Implemented protocol:

```text
LoreRelay action in Relay mode
-> optimistic generic gm-loading row
-> relayWaitingStateStart converts/replaces that row with Relay waiting UI
-> matching turn_result accepted
-> host posts relayWaitingStateDone
-> webview removes waiting row, clears timer, unlocks controls
-> returned narration/options remain rendered
```

Failure remains explicit:

```text
Relay import failure
-> relayWaitingStateError
-> webview removes waiting row, unlocks controls, shows one Relay error
```

Duplicate/stale observations do not recreate the waiting state; only the matching newly accepted result sends `relayWaitingStateDone`.

## UI State Machine

Minimum states implemented:

- `idle`: ready to send a LoreRelay action to Antigravity.
- `pending`: request is prepared; user must send the short trigger on the right.
- `accepted`: represented by successful completion returning immediately to `idle`.
- `error`: Relay error is visible and controls are unlocked for recovery.

User-facing behavior:

- Free-text action and Relay option-button action share the same `sendFreeInput()` path.
- Pending state appears immediately when the host posts `relayWaitingStateStart`.
- Successful matching import returns to idle only after `relayWaitingStateDone`.
- Error state ends waiting and allows recovery.
- Relay OFF keeps ordinary Send behavior unchanged and clears visible Relay waiting UI.
- Restoring/reopening the webview starts from idle unless the host sends a real pending event; the button label alone is not the only status signal.

## Manual Trigger Platform Boundary

No automatic chat injection is claimed.

Pending UI now shows:

```text
/text-adventure-gm process pending LoreRelay request
```

The copy button copies only that short trigger. It does not copy the player's long action, and it does not claim to send anything into Antigravity.

## Changed Files

- `docs/ai-tasks/ANTIGRAVITY-RELAY-004-COMPLETION-STATE-UX.md`
- `docs/generated/SYMBOL_REGISTRY.md`
- `docs/generated/symbol_registry.json`
- `locales/en.json`
- `locales/ja.json`
- `locales/zh-CN.json`
- `locales/zh-TW.json`
- `scripts/run_all_tests.js`
- `scripts/test_antigravity_file_bridge.js`
- `scripts/test_antigravity_relay_webview.js`
- `src/gameStateSync.ts`
- `webview/modules/10-game-state.js`
- `webview/modules/20-input-audio-prep.js`
- `webview/modules/90-bootstrap.js`
- `webview/script.js`
- `webview/style.css`
- `webview/styles/15-ux-polish.css`

## Tests

Commands:

```powershell
npm run compile
node scripts/test_antigravity_file_bridge.js
node scripts/test_antigravity_relay_core.js
node scripts/test_antigravity_relay_webview.js
node scripts/check_i18n_keys.js
npm run check:symbol-registry
npm test
```

Results:

- `npm run compile`: PASS
- `node scripts/test_antigravity_file_bridge.js`: PASS
- `node scripts/test_antigravity_relay_core.js`: PASS
- `node scripts/test_antigravity_relay_webview.js`: PASS
- `node scripts/check_i18n_keys.js`: PASS, 0 missing keys in all 4 locales
- `npm run check:symbol-registry`: PASS after normal generator update
- `npm test`: PASS, `232/232`

Focused coverage added:

- Relay action does not leave a generic GM loading row underneath Relay waiting.
- Existing generic `gm-loading` can be converted/replaced by Relay waiting state.
- Successful matching Relay import explicitly clears waiting state.
- Success stops elapsed timer.
- Success unlocks controls.
- Failure clears waiting and remains recoverable.
- Idle -> pending -> accepted -> idle UI transition.
- Option-button Relay action enters the same pending state as free text.
- Relay OFF keeps ordinary Send behavior unchanged.
- Pending UI shows the exact short trigger.
- Copy-trigger action copies only `/text-adventure-gm process pending LoreRelay request`.
- UI explicitly denies automatic chat injection and does not claim automatic right-side submission.

## Exact Next Human Smoke

1. Open an empty game workspace folder in Antigravity.
2. Open LoreRelay.
3. Turn Antigravity Relay ON.
4. Send one LoreRelay action on the left.
5. Confirm the left pending UI shows the short trigger and copy button.
6. On the right, submit exactly:

```text
/text-adventure-gm process pending LoreRelay request
```

7. Confirm no long prompt copy/paste.
8. Confirm no unrelated 1/5 setup wizard.
9. Confirm the right side processes the pending request file.
10. Confirm `turn_result.json` is imported back to LoreRelay.
11. Confirm the left waiting state ends and the old GM loading row is gone.
12. Confirm narration/options appear on the left.
13. Choose one next option and confirm the next Relay pending state is the same as free text.

## Final Verdict

ANTIGRAVITY_RELAY_004_READY_FOR_VERIFY
