# Antigravity Relay 001 — Small Fix Verify

Date: 2026-07-08 JST
Branch: `task/antigravity-relay-001-small-fix`
Head: `3e2a851c57ae71572399d3d917cf39f427344d60`
Base: current main at branch point `c87b8d08e975627d1feb05a519b6247a4b3261b9`
Status: `VERIFYING — ONE SMALL FIX REMAINS`

## Verdict

`ANTIGRAVITY_RELAY_SMALL_FIX_NOT_YET_READY`

Most requested repairs are now code-grounded:

- real `send-btn` is used;
- relay waiting clears on `turnResult`, not generic `gameStateUpdate`;
- production `buildAntigravityRelayPayload()` is exercised by the focused test;
- relay strings moved to the locale path;
- branch is current-main-based and contains the prior accepted repair plus this fix.

## Remaining blocker — suppression IDs are still wrong/incomplete

The accepted suppression set includes:

```text
img-btn
mic-btn
undo-btn
regen-btn
qr-undo
qr-retry
experience-profile-btn
parlor-settings-btn
```

The implementation currently hides:

```text
qr-undo
qr-retry
image-prompt-btn
mic-btn
experience-profile-btn
parlor-settings-btn
```

Problems:

1. `image-prompt-btn` is not the main scene-image control; the real input-area button is `img-btn`.
2. `undo-btn` is missing.
3. `regen-btn` is missing.

Therefore Relay Mode still leaves normal LoreRelay action affordances visible.

## Minimum repair

Change only the suppression list to the exact accepted IDs above, regenerate `webview/script.js`, rerun the focused relay test, Slice 1 focused test, i18n check, and full suite.

No other implementation changes are needed.

## Final Verdict

`ANTIGRAVITY_RELAY_ONE_LINE_STYLE_REPAIR_REQUIRED`
