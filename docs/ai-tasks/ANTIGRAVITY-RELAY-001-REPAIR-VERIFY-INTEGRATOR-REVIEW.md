# Antigravity Relay 001 — Repair Verify Integrator Review

Date: 2026-07-08 JST
Repair branch: `task/antigravity-relay-001-repair`
Repair commit: `ee6fa55e9fce4a2dc14b64cbed63353228f40f57`
Base: `eeb4907a090c578e13ec0ad1036092224157d37b`
Status: `VERIFYING — SMALL REPAIR REQUIRED`

## Verdict

`ANTIGRAVITY_RELAY_REPAIR_NOT_READY`

The repair is correctly based on current main and closes most of the previous intake. The branch is exactly one commit ahead of the accepted main baseline.

However, four verification blockers remain.

## R-V1 — Send button status wiring targets the wrong DOM id

The real input button in `webview/index.html` is:

```html
<button id="send-btn" ...>Send</button>
```

The repair's `relayModeStatus` handler looks up:

```js
document.getElementById('player-send-btn')
```

Therefore the player-facing Send label is not proven to change to `Prepare for Antigravity`.

Repair: use the existing `sendBtn` reference or the real `send-btn` id.

## R-V2 — Relay waiting clears on any state update, not an accepted external result

The repair currently does:

```js
if (msg.state) {
  applyGameState(...);
  if (window.antigravityRelayMode) {
    hideGmLoading(true);
  }
}
```

Any ordinary state refresh can therefore clear `Waiting for Antigravity` before a new external `turn_result.json` is accepted.

This violates the accepted implementation note that waiting must clear only when the external result is actually observed/applied.

Repair: bind clearance to a turn-result-bearing update or an existing accepted-result signal.

## R-V3 — Accepted suppression contract is still incomplete

Relay mode status only hides `#qr-undo` and `#qr-retry`.

The accepted repair contract also requires non-relay controls such as image, microphone, undo, regenerate, experience-profile, and parlor-settings controls to stop presenting normal action affordances while Relay Mode is active.

Repair the exact accepted control set; do not broaden beyond it.

## R-V4 — Focused test does not exercise production relay code

`scripts/test_antigravity_relay_core.js` reconstructs a local JavaScript object with hard-coded values and asserts that object.

It does not import or execute the production payload builder / relay routing path, so it would still pass if production code regressed.

Repair: extract or expose the smallest pure production helper for the outbound envelope, or add deterministic integration coverage that executes the real production path.

## Additional quality issue — hard-coded English

The relay banner, waiting text, information message, and Send replacement are hard-coded English. The accepted gate expected the normal i18n path and the project supports four locales.

This should be repaired in the same narrow pass because it is already inside the accepted UI contract; no new feature is required.

## What passed review

- branch is rebased/replayed onto current main;
- accepted setting name is used;
- mode status is pushed on panel start and configuration change;
- normal GM provider dispatch is bypassed;
- normal `gmStart` is no longer emitted for relay handoff;
- accepted envelope kind/version is restored;
- clipboard remains outbound transport;
- `turn_result.json` remains the return path;
- generated webview change no longer contains the prior unrelated Player-label drift.

## Minimum next repair

1. Fix `send-btn` wiring.
2. Clear relay wait only on actual accepted external result.
3. Complete the already-accepted suppression set.
4. Replace the self-contained stub test with production-grounded coverage.
5. Move relay UI strings through existing i18n.
6. Re-run compile, build:webview, focused relay test, Slice 1 focused test, i18n check, and full suite.

No broad exploration.
No gameplay changes.
No new ingestion path.

## Final Verdict

`ANTIGRAVITY_RELAY_REPAIR_SMALL_FIX_REQUIRED`
