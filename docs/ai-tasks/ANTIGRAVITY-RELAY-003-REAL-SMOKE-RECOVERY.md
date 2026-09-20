# ANTIGRAVITY-RELAY-003 Real-Smoke Recovery

## Baseline

- Exact starting `origin/main`: `dbded9855cc120bd3f3f2f893c26e83f5c9665f4`
- Branch: `task/ANTIGRAVITY-RELAY-003-real-smoke-recovery`
- Prior real smoke verdict: `ANTIGRAVITY_RELAY_002_REAL_SMOKE_FAILED`

## Human Smoke Evidence

Observed workspace:

```text
G:\AI\LoreRelayWorlds\Fantasy
```

Observed flow:

- LoreRelay showed `Antigravity Relay ON`.
- User submitted the left-side LoreRelay Genesis request.
- Running `/text-adventure-gm` did not automatically process the pending left-side request.
- The right side processed the turn only after the user manually pasted the full left-side text.
- Antigravity wrote `G:\AI\LoreRelayWorlds\Fantasy\turn_result.json`.
- LoreRelay stayed indefinitely in the GM-processing / waiting state.
- Closing and reopening the LoreRelay panel did not import the result.

Corrected smoke classification:

- automatic left -> right: FAIL
- manual pasted prompt -> right processing: PASS
- right creates `turn_result.json`: PASS
- right -> left import: FAIL

## User Workspace Forensics

Read-only inspection found:

```text
.text-adventure/antigravity_relay_request.json
turn_result.json
game_state.json
last_good_game_state.json
.text-adventure/runtime/writer_lease.json
.text-adventure/runtime/writer_lease.json.bak
```

Missing:

```text
.text-adventure/runtime/accepted_turn_scope.json
.text-adventure/runtime/accepted_turn_ledger.json
```

Critical relationship:

```json
{
  "requestId": "agr-1-122abd1f5882bf97cebe",
  "resultRequestId": "agr-1-122abd1f5882bf97cebe",
  "match": true,
  "requestCreatedAt": "2026-07-09T07:41:26.072Z",
  "requestMtime": "2026-07-09T07:41:26.073Z",
  "resultMtime": "2026-07-09T07:41:47.023Z",
  "scopeExists": false,
  "ledgerExists": false
}
```

The `turn_result.json` had matching `metadata.requestId`, so the failure was not a stale/mismatched result. The workspace was left with a retained root `turn_result.json` but no accepted-turn authority files.

## Left -> Right Root Cause

The real platform behavior observed by the user is that entering `/text-adventure-gm` alone did not submit a model turn that processed the pending request file. A SKILL.md instruction cannot execute file processing without an actual Antigravity/Gemini model turn.

Repair:

- Updated the repo-owned skill to state that slash-command selection alone may only activate the skill.
- Updated LoreRelay UI instructions to require one short right-side trigger message:

```text
/text-adventure-gm process pending LoreRelay request
```

The user no longer needs to copy the long LoreRelay prompt. The pending request file remains the source of truth.

## Right -> Left Root Cause

The first Relay request did not initialize accepted-turn scope before the first result was written.

Current import code validated the matching Relay `requestId`, then entered accepted-turn preflight. With no `accepted_turn_scope.json` and a retained root `turn_result.json`, `preflightAcceptedTurn()` returned repair-required with the exact authority reason:

```text
legacy ambiguous retained turn_result.json without accepted-turn scope
```

That explains why reopening the panel did not recover the result: watcher, sweep, and fallback all converge on the same preflight boundary.

Repair:

- Relay request creation now calls `ensureAcceptedTurnScope(workspacePath)` before writing `.text-adventure/antigravity_relay_request.json`.
- Import of a verified pending Relay result now calls `ensureAcceptedTurnScopeForVerifiedRelayResult(workspacePath)` after `metadata.requestId` match and before accepted-turn preflight.
- This rescue API is only used after pending request validation succeeds. Ordinary non-Relay retained `turn_result.json` remains fail-closed as legacy ambiguous.

## Accepted-Turn Scope Findings

The highest-priority hypothesis was confirmed:

```text
no accepted_turn_scope.json
+
first turn_result.json already exists
->
legacy ambiguous retained turn_result.json without accepted-turn scope
```

The repair preserves the old fail-closed behavior for ambiguous ordinary files while giving a narrow authority path to matching Relay results.

## Watcher Findings

No stale workspace watcher lifecycle defect was reproduced.

Findings:

- The user workspace had an active writer lease heartbeat, so the extension host was still alive.
- `startGameStateWatcher()` already disposes old watchers and creates a current-workspace `turn_result.json` watcher.
- It also sweeps retained `turn_result.json` on watcher start.
- `checkPendingTurnResultFile()` uses `getActiveWorkspaceFolder()` and therefore follows the current workspace.

Conclusion: the observed right -> left failure was not accepted as "watcher probably missed it." The concrete blocker was accepted-turn preflight rejecting the retained first result because scope was missing.

## Visible Failure Handling

Before this repair, Relay import rejection could leave the webview waiting indefinitely.

Repair:

- On matching Relay import failure after parse, request validation, lease, preflight, or processing failure, the host now sends `relayWaitingStateError`.
- The webview removes the waiting spinner, re-enables input controls, and displays a visible Relay error.
- The host also records the technical reason in the GM Bridge output log and shows a VS Code error message.

## Changed Files

- `antigravity-skill/text-adventure-gm/SKILL.md`
- `docs/ai-tasks/ANTIGRAVITY-RELAY-003-REAL-SMOKE-RECOVERY.md`
- `docs/generated/SYMBOL_REGISTRY.md`
- `docs/generated/symbol_registry.json`
- `locales/en.json`
- `locales/ja.json`
- `locales/zh-CN.json`
- `locales/zh-TW.json`
- `scripts/test_antigravity_file_bridge.js`
- `src/acceptedTurnReplayGuard.ts`
- `src/extension.ts`
- `src/gameStateSync.ts`
- `webview/modules/20-input-audio-prep.js`
- `webview/modules/90-bootstrap.js`
- `webview/script.js`

## Tests

Commands:

```powershell
npm run compile
node scripts/test_antigravity_file_bridge.js
node scripts/test_antigravity_relay_core.js
node scripts/check_i18n_keys.js
npm run check:symbol-registry
npm test
```

Results:

- `npm run compile`: PASS
- `node scripts/test_antigravity_file_bridge.js`: PASS
- `node scripts/test_antigravity_relay_core.js`: PASS
- `node scripts/check_i18n_keys.js`: PASS, 0 missing keys in all 4 locales
- `npm run check:symbol-registry`: PASS
- `npm test`: PASS, `231/231`

Additional local action:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install_antigravity_skill.ps1
```

Result: PASS. Installed Gemini skill was refreshed from the repo-owned skill source.

## Remaining Human Smoke Flow

Use this updated flow:

1. Open LoreRelay on the left.
2. Open the same LoreRelay workspace on the right in Antigravity.
3. Turn visible `Antigravity Relay` ON.
4. Choose or send one LoreRelay action on the left.
5. On the right, send:

```text
/text-adventure-gm process pending LoreRelay request
```

6. Confirm the right side does not start the 1/5 genre setup wizard.
7. Confirm the right side processes the pending request file, not a manually pasted long prompt.
8. Confirm `turn_result.json` returns to LoreRelay and the left-side waiting state ends.

## Limitations

- Full automatic chat injection remains unsupported and was not claimed.
- Slash-command selection alone may not process a request unless Antigravity submits a model turn.
- The repair intentionally does not touch ComfyUI, image generation, Anima, Gameplay Slice 1, Start Hub, or installer architecture.

## Final Verdict

ANTIGRAVITY_RELAY_003_READY_FOR_VERIFY
