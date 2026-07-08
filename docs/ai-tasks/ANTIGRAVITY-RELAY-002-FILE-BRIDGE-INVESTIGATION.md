# ANTIGRAVITY-RELAY-002 File Bridge Investigation

- AI: Codex
- Model: GPT-5.5
- Reasoning: High
- Role: Investigate failed real Antigravity Relay smoke and design the minimum useful workspace-file bridge
- Date: 2026-07-08

## Exact Main Baseline

- Expected `origin/main`: `a90ba596c32d491af5d517295f39bba805e56558`
- Observed `origin/main` after fetch: `a90ba596c32d491af5d517295f39bba805e56558`
- Baseline verdict: MATCH

## Root Worktree Runtime Provenance

Root worktree inspected: `C:\AI\text-adventure-vsce`

- Current branch: `task/ANTIGRAVITY-INSTALL-001-verify`
- HEAD: `ec453fb9f79ad5f1d7c1b61a8bc0a08413869fd7`
- Relation to `origin/main`: `1 ahead / 4 behind`
- Dirty/untracked state:
  - `M webview/script.js`
  - `?? .claude/`

Installer script hashes in root worktree:

- `scripts/install_common.ps1`
  - SHA-256: `6AD9CCC614C5057BEB8B76F5717D62EA045CCB6CCF89F62A1C8F8669E5E4C2E3`
  - Git blob at root HEAD: `c8fef31a6c2a3282479c34e46ec114b5718dfb0b`
- `scripts/install_vscode_extension.ps1`
  - SHA-256: `412105477F84DC003F9408AD3D371D37DF2CC27EB4A14BCDF77AA28B5F164A84`
  - Git blob at root HEAD: `53ad3931bc6330a43b2b6deaf61ab0d45375963c`

Installer script hashes at `origin/main`:

- `scripts/install_common.ps1`
  - SHA-256: `904530F11E32E20CECF9D28C081F3FFE5CCAA0D52B395CEEDDAB8FF96B0CBBB5`
  - Git blob at `origin/main`: `5ebb709f9d0734b47c07a21191258abf48a7a870`
- `scripts/install_vscode_extension.ps1`
  - SHA-256: `980E432A8CA683AF5867FB8496D1A9D2E9AF5DBEE5F7CB15D83303E392BC0AAE`
  - Git blob at `origin/main`: `40eab00eab537bc451c4798bc59f5f6d0803a81f`

Conclusion:

- The root worktree was not exact current main at inspection time.
- Therefore a normal BAT invocation from that root worktree cannot be proven to have used exact current-main installer code.
- This does not by itself prove the installed extension is stale; installed runtime provenance is recorded separately below.

## Installed Extension Provenance

The two paths as written in the task did not exist:

- `C:\Users\Keisuke.antigravity\extensions`
- `C:\Users\Keisuke.gemini\antigravity-ide\extensions`

Actual LoreRelay installs found:

- `C:\Users\Keisuke\.antigravity\extensions\miya.lorerelay-1.77.15`
- `C:\Users\Keisuke\.antigravity-ide\extensions\miya.lorerelay-1.77.15`
- `C:\Users\Keisuke\.gemini\antigravity-ide\extensions\miya.lorerelay-1.77.15`

All three report:

- package name: `lorerelay`
- publisher: `Miya`
- version: `1.77.15`

Runtime hashes:

| Location | `out/extension.js` SHA-256 | `webview/script.js` SHA-256 |
| --- | --- | --- |
| `.antigravity\extensions` | `4E727D0EA1559F85A74429F834C8C6D2C0877E8FBBBAC909668D3435164C8917` | `8319DF28238EB8DE75FB241119728C512368A6A8F1F0E0FD857C8F50946B608F` |
| `.antigravity-ide\extensions` | `4E727D0EA1559F85A74429F834C8C6D2C0877E8FBBBAC909668D3435164C8917` | `8319DF28238EB8DE75FB241119728C512368A6A8F1F0E0FD857C8F50946B608F` |
| `.gemini\antigravity-ide\extensions` | `4E727D0EA1559F85A74429F834C8C6D2C0877E8FBBBAC909668D3435164C8917` | `8319DF28238EB8DE75FB241119728C512368A6A8F1F0E0FD857C8F50946B608F` |

`webview/script.js` and `package.json` differ from `origin/main` by raw bytes because installed files are CRLF and git blobs are LF. After in-memory CRLF normalization:

- installed `webview/script.js` equals `origin/main:webview/script.js`
- installed `package.json` equals `origin/main:package.json`

Installed bundle code evidence:

- `relayModeStatus` handler exists.
- `window.antigravityRelayMode` is set from the host message.
- `send-btn` label changes to `webview.relay.button.prepare` only when relay mode is true.
- `relay-mode-banner` is created only when relay mode is true.
- suppression list is exactly:
  - `img-btn`
  - `mic-btn`
  - `undo-btn`
  - `regen-btn`
  - `qr-undo`
  - `qr-retry`
  - `experience-profile-btn`
  - `parlor-settings-btn`
- `image-prompt-btn` is not in the installed suppression list.

Installed extension verdict:

- Installed runtime code is content-identical to current main after EOL normalization.
- The observed normal UI was not caused by a missing/stale Relay UI implementation.

## Exact Relay Mode State

Configuration key:

- `textAdventure.antigravityRelay.enabled`
- package default: `false`

Search scope:

- `C:\Users\Keisuke\.antigravity`
- `C:\Users\Keisuke\.antigravity-ide`
- `C:\Users\Keisuke\.gemini`
- `C:\Users\Keisuke\AppData\Roaming\Antigravity`
- `C:\Users\Keisuke\AppData\Roaming\Antigravity IDE`
- `C:\Users\Keisuke\AppData\Roaming\Code`
- `C:\AI\text-adventure-vsce\.vscode\settings.json`

Observed:

- No user/workspace setting explicitly sets `textAdventure.antigravityRelay.enabled`.
- The only matches were extension package/default metadata and generated registry entries.
- Effective inspected value is therefore the extension default: `false`.

Production host code evidence:

- On panel initialization, `sendRelayModeStatus()` is called.
- On `textAdventure.antigravityRelay.enabled` configuration changes, `sendRelayModeStatus()` is called again.
- `sendRelayModeStatus()` posts:
  - `type: 'relayModeStatus'`
  - `antigravityRelayMode: config.get<boolean>('antigravityRelay.enabled', false)`

Production webview code evidence:

- If `msg.type === 'relayModeStatus'`, webview sets `window.antigravityRelayMode = msg.antigravityRelayMode`.
- If false, send label is `webview.button.send`.
- If false, no relay banner remains.
- If false, Undo/Regenerate/other suppressed controls are displayed normally.

Observed smoke explanation:

- Undo visible: consistent with relay mode false.
- Regenerate visible: consistent with relay mode false.
- Send button showing normal localized Send text: consistent with relay mode false.
- No obvious Relay Mode banner: consistent with relay mode false.

Relay Mode classification:

`RELAY_MODE_WAS_OFF`

This is not an installed-extension stale-code finding. It is also not proof that `relayModeStatus` failed to apply. The runtime state evidence points to the setting never being enabled in the tested environment.

## Exact Live Skill Location

Live skill found:

`C:\Users\Keisuke\.gemini\config\skills\text-adventure-gm\SKILL.md`

Relevant non-adult files inspected:

- root `SKILL.md`
- root file list excluding `scenarios-r18-private`
- `scripts/gm_bridge_common.py`
- `scripts/ollama_gm.py`
- `scripts/koboldcpp_gm.py`
- `scripts/openrouter_gm.py`

Adult/private scenario contents were not intentionally read for this task.

Live skill behavior:

- Reads `game_state.json` for current state and visible recent log.
- Reads `world_forge.json`, `world_state.json`, `npc_registry.json`, `lorebook.json`, and `characters/` only when needed by the turn/domain.
- Does not instruct the agent to read clipboard content.
- Does not mention `antigravity_relay_request.json`.
- Does not mention `requestId`.
- Does not mention an expected output path carried by a relay request.
- Instructs the GM to write `turn_result.json` to the workspace root after each turn.
- Underlying bridge scripts support explicit `--action` / `--action-file`, but this is not the same as the Antigravity slash skill automatically discovering a LoreRelay request file.

What causes `turn_result.json` today:

- The live skill instructs the agent/GM to write `turn_result.json` every turn.
- The helper `gm_bridge_common.py` function `process_llm_response()` builds a turn result and calls `write_turn_result(cwd, turn_result)`.
- The helper writes to `cwd / "turn_result.json"` via a temporary file and replace.

## Current Handoff Boundary

Current Relay Mode production code:

- If `textAdventure.antigravityRelay.enabled` is true:
  - builds the normal GM prompt breakdown
  - builds an Antigravity relay payload
  - writes that JSON payload to `vscode.env.clipboard`
  - posts `relayWaitingStateStart` to the webview
  - returns before invoking the normal GM bridge

Current Relay Mode production code does not:

- inject text into Antigravity Agent chat
- call an Antigravity API
- write a deterministic workspace relay request file
- attach a request id to `turn_result.json`
- require the result to match a pending request id

Therefore invoking `/text-adventure-gm` alone has no guaranteed access to the LoreRelay-side request. Clipboard-only handoff depends on the user manually pasting the copied payload into Antigravity chat.

This explains the real smoke failure: the user entered a request on the LoreRelay side, then invoked `/text-adventure-gm` on the Antigravity side, but the slash skill had no deterministic path to that LoreRelay request and proceeded from its own generic flow/state.

## File-Bridge Experiment

Disposable workspace:

`%TEMP%\lorerelay-antigravity-file-bridge-probe`

Synthetic request file created:

`.text-adventure/antigravity_relay_request.json`

Fields:

- `requestId`
- `playerAction`
- `minimalContext`
- `availableOptions`
- `expectedOutputPath`

Result:

- File creation succeeded.
- Search of the live skill root, excluding `scenarios-r18-private`, found zero references to:
  - `antigravity_relay_request`
  - `requestId`
  - `expectedOutputPath`

Experiment verdict:

- The current live skill cannot be proven to reliably find or read the request file before starting its own generic flow.
- The request file is a viable contract shape, but current live instructions do not support it.

## Accept All / Filesystem Semantics

What was proven locally:

- LoreRelay's existing watcher can only observe files after they exist on the filesystem.
- Existing helper scripts write real filesystem files directly when run.
- The current live skill's root instruction asks Antigravity to write `turn_result.json`, but the investigation did not have a callable Antigravity UI/agent automation path to prove whether proposed edits reach disk before or only after user "Accept All".

Observed filesystem search:

- No recent `turn_result.json` related to the failed smoke was found under `C:\AI`.
- Only an older unrelated file was found:
  - `C:\AI\LoreRelayExperiments\notebooklm-campaign-brain\test_data\turn_result.json`

Accept All verdict:

- Not proven.
- A mergeable implementation should not depend on unverified pre-accept filesystem visibility.
- The next real smoke must explicitly record whether Antigravity writes the result file to disk before acceptance or only after acceptance.

## RequestId Feasibility

Feasible in principle:

- LoreRelay can generate a request id when writing a request file.
- The skill can be instructed to copy the request id into `turn_result.json`.
- LoreRelay can require a matching id before importing a relay result.

Not supported today:

- Current `turn_result.json` schema/path does not carry a relay `requestId`.
- Current live skill does not know to read a relay request file or echo its id.
- Current watcher accepts standard `turn_result.json` without matching it to a pending relay request.

## Minimal Implementation Touch Set

Implementation should stay narrow and explicit.

Likely source touch set:

- `src/extension.ts`
  - In Relay Mode, write `.text-adventure/antigravity_relay_request.json` in addition to clipboard.
  - Include `requestId`, `playerAction`, prompt/context payload, `availableOptions`, expected result path, timestamp.
- `src/gmPromptBuilderCore.ts`
  - Extend or reuse payload builder to produce deterministic request-file content.
- `src/statePatch.ts` or `src/gameStateSync.ts`
  - Validate optional relay request id on imported `turn_result.json` only when a pending Relay request exists.
- `src/GameState.ts` / schema if the request id must be represented in typed turn result metadata.
- `scripts/test_antigravity_relay_core.js`
  - Assert deterministic request-file payload and id round-trip expectations.
- `scripts/test_runtime_turn_result_acceptance.js` or focused new script
  - Assert mismatched relay result is rejected/ignored while matching result imports.
- `TextAdventureGMSkill/SKILL.md` or installed-skill source path in repo, if this repo owns the distributed skill
  - Instruct `/text-adventure-gm` to first check `.text-adventure/antigravity_relay_request.json`, read it, act on `playerAction`, and echo `requestId`.
- `package.json` / generated artifacts only if tests/scripts or packaged skill assets require registration.

This is within an <=8 source-file prototype if kept disciplined.

However, do not implement until these missing proofs are supplied:

- Confirm the repo-owned skill source that installer packages to `C:\Users\Keisuke\.gemini\config\skills\text-adventure-gm`.
- Confirm Antigravity can read `.text-adventure/antigravity_relay_request.json` in the real opened workspace when invoked via `/text-adventure-gm`.
- Confirm result file reaches the real filesystem in a watcher-observable way.
- Confirm `requestId` can round-trip through the real skill output.

## Narrow Recommendation

Current clipboard-only handoff:

```text
LoreRelay player action
-> clipboard payload
-> user must manually paste into Antigravity chat
-> /text-adventure-gm has no guaranteed access to the payload
-> Antigravity may start its own generic flow
```

Recommended file bridge:

```text
LoreRelay player action
-> write .text-adventure/antigravity_relay_request.json
-> user invokes /text-adventure-gm
-> skill first reads exact request file
-> skill writes turn_result.json with matching requestId
-> LoreRelay watcher imports only matching result
```

Recommendation verdict:

- The file bridge is the right minimum direction.
- The current live skill does not yet support it.
- Stop at implementation-ready design until a real Antigravity read/write proof is captured.

## Installer-Performance Finding: ANTIGRAVITY-INSTALL-002

Recorded only; not fixed in this task.

Observed installed extension sizes:

- `C:\Users\Keisuke\.antigravity\extensions\miya.lorerelay-1.77.15`
  - files: `12020`
  - bytes: `172279998`
  - MB: `164.3`
- `C:\Users\Keisuke\.antigravity-ide\extensions\miya.lorerelay-1.77.15`
  - files: `12021`
  - bytes: `172278733`
  - MB: `164.3`
- `C:\Users\Keisuke\.gemini\antigravity-ide\extensions\miya.lorerelay-1.77.15`
  - files: `12020`
  - bytes: `172279998`
  - MB: `164.3`

Confirmed concerns:

- `.vscodeignore` at `origin/main` does not exclude:
  - `.claude/**`
  - `.codex/**`
  - `*.vsix`
- Installed extension contains nested AI worktree content, including `.claude\worktrees`.
- `origin/main` installer still performs Antigravity CLI install and then unconditional direct-folder installs for both known Antigravity extension roots:
  - `.antigravity\extensions`
  - `.gemini\antigravity-ide\extensions`
- Direct-folder install uses archive extraction/copy, so repeated full archive extraction/copy remains a performance issue.

## Start Hub Navigation Finding: START-HUB-NAV-001

Recorded only; not fixed in this task.

Source evidence:

- `webview/modules/90-bootstrap.js` defines `updateStartHubVisibility()`.
- The function shows Start Hub only when `messageHistory.length === 0`.
- No explicit return-home navigation button/command was found in the inspected webview source.

Finding:

- After entering a scenario/session, Start Hub is no longer conveniently reachable.
- This is separate from Antigravity Relay and should be handled as a dedicated UX task.

## New Findings

1. `RELAY_MODE_WAS_OFF`: the failed real smoke did not actually exercise Relay Mode UI behavior because the setting was absent/default false.
2. Installed LoreRelay runtime code is current-main equivalent after EOL normalization; this is not an installed stale-code failure.
3. The live `/text-adventure-gm` skill is workspace-file based for `game_state.json` / `turn_result.json`, but has no current relay request-file contract.
4. The root worktree was not exact current main at inspection time, so normal BAT provenance from that worktree is not clean.
5. Installer bloat is worse than the reported `76.47 MB` in the inspected installed copies: about `164.3 MB` and `12020+` files per copy.

## Final Verdict

`ANTIGRAVITY_FILE_BRIDGE_NOT_SUPPORTED`

