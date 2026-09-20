# HUMAN-SMOKE-DEBUG-SANDBOX-FASTPATH-001

## Verdict

`HUMAN_SMOKE_DEBUG_SANDBOX_FASTPATH_001_CANDIDATE_READY`

This is a candidate repair only. The live issue must not be called resolved until
the task branch is integrated, version 1.82.3 is packaged and installed, and the
original human smoke is repeated successfully.

## Repository identity

- Repository: `GGF1sh/LoreRelay`
- Base: `fc647b2abbf1297f18b7777646b5e38e7b457363`
- Branch: `task/HUMAN-SMOKE-DEBUG-SANDBOX-FASTPATH-001`
- Validated implementation tip (before this evidence-only report commit):
  `82a2f164490ac7b9a7807a7ed2a8bd59f89b8d1c`
- Starting version: `1.82.2`
- Candidate version: `1.82.3`
- Isolated worktree: `C:\AI\wt-human-smoke-debug-sandbox-fastpath-001`

Remote `origin/main` was fetched before work began and matched the required base
exactly. No change was made to `main`.

## Human-observed failure

In installed main 1.82.2, clicking the visible second debug-sandbox option sent
`2. エルダの好感度を上げて`. The UI stayed pending for more than 80 seconds,
Antigravity Relay interpreted the request as agent work, reported a narrative
relationship result and repository file changes, and another quick option was
still available while the first request was pending.

## Verified root cause

The scenario source stores unnumbered options. `renderOptions` added `N. ` for
display and also serialized that decorated string as player input. With Relay ON,
the click was additionally routed through the free-input path. The debug parser
only trimmed/collapsed whitespace, so the decorated string did not match the
deterministic debug grammar and fell through to the Relay branch.

The duplicate-send symptom had two independent causes: `isInputLocked()` only
reported game-over state, so a pending state refresh could redraw enabled option
buttons; and the host accepted concurrent `handlePlayerInput` messages without a
shared authoritative request lease.

Finally, the Relay request identified a workspace and player action but did not
explicitly classify the traffic as gameplay or deny repository-edit authority.
The repo-owned Antigravity skill likewise lacked that explicit highest-priority
boundary.

## Inspected files

Initial inspection was limited to the directly relevant scenario and routing
path: `AGENTS.md`, `sample-scenarios/debug-sandbox/scenario.json`,
`webview/modules/10-game-state.js`, `webview/modules/20-input-audio-prep.js`,
`src/webviewHandlers.ts`, `src/extension.ts`, `src/debugScenarioCore.ts`, and
`src/debugScenarioRunner.ts`. Follow-up inspection covered
`src/debugScenarioRunnerCore.ts`, `src/gmPromptBuilderCore.ts`,
`src/antigravityRelayBridgeCore.ts`, `src/deterministicWorkspaceMutationGate.ts`,
`src/gameStateSync.ts`, `antigravity-skill/text-adventure-gm/SKILL.md`, and the
focused test scripts.

## Before and after routing

Before:

`scenario option -> webview "2. ..." -> host -> debug miss -> Relay/GM fallback`

After:

`scenario option -> numbered display + raw option/index payload -> host shared lease -> debug fast path`

Legacy or externally supplied numbered payloads use the same host normalization
and fast path. Unknown input still routes to Relay when Relay is ON and to the
normal GM provider when Relay is OFF.

## Input normalization contract

`normalizeDebugScenarioPlayerInput` removes a presentation marker only when:

1. the marker is a supported ASCII/full-width one-based option number and
   punctuation form; and
2. the remaining normalized text exactly equals the option stored at that index.

Covered forms include `2. command`, `2.command`, `2) command`, `2）command`,
`２．command`, and incidental leading whitespace. Numeric gameplay text that is
not an exact decorated option, including dates, coordinates, quantities, and the
scenario's numeric travel command, is preserved. The persisted/displayed player
entry retains numbered quick-option presentation while deterministic routing uses
canonical option text.

## Deterministic authority and concurrency boundary

`routeGameplayInput` always attempts the debug fast path before either narrative
dispatcher. A recognized command executes once through the existing deterministic
debug runner, writes one `turn_result.json`, enters the existing accepted-turn and
persistence path, and sends no GM or Relay request. Relay mode does not influence
recognition.

The existing deterministic workspace mutation gate now supports explicit leases.
Every accepted player request acquires that shared host gate before persistence or
mutation. Duplicate quick-option, free-input, keyboard, or direct webview messages
receive stable `WORLD_MUTATION_IN_PROGRESS` BUSY authority without a second
pending-state system. Normal/debug requests release in `finally`; Relay requests
retain the same lease until accepted result, failed import, Relay OFF, scenario
load, or session transition. Existing Player Action Hub operations continue using
the same gate.

The webview now treats an existing `gm-loading` row as input-locked, so state
refresh cannot recreate enabled quick options. Success and failure messages clear
the optimistic row through the existing GM/Relay completion handlers.

## Relay/development-agent boundary

Both clipboard payloads and request files now require:

```json
{
  "trafficClass": "gameplay_narrative",
  "authority": {
    "scope": "gameplay_narrative",
    "repositoryEditsAllowed": false,
    "allowedWorkspaceWrites": ["turn_result.json"]
  }
}
```

Parsing fails closed if the boundary is absent or broadened. The repo-owned
Antigravity skill treats `playerAction` as data, forbids coding/development-agent
work and repository/configuration/version-control edits, and permits only the
workspace-root `turn_result.json` for Relay traffic. Normal non-gameplay developer
workflows are unchanged.

## Changed files

Production and generated artifacts:

- `antigravity-skill/text-adventure-gm/SKILL.md`
- `src/antigravityRelayBridgeCore.ts`
- `src/debugScenarioCore.ts`
- `src/debugScenarioRunner.ts`
- `src/debugScenarioRunnerCore.ts`
- `src/deterministicWorkspaceMutationGate.ts`
- `src/extension.ts`
- `src/gameStateSync.ts`
- `src/gameplayInputRouteCore.ts`
- `src/gmPromptBuilderCore.ts`
- `src/webviewHandlers.ts`
- `webview/modules/10-game-state.js`
- `webview/modules/90-bootstrap.js`
- `webview/script.js`
- `docs/generated/SYMBOL_REGISTRY.md`
- `docs/generated/symbol_registry.json`

Tests:

- `scripts/run_all_tests.js`
- `scripts/test_antigravity_file_bridge.js`
- `scripts/test_antigravity_relay_core.js`
- `scripts/test_antigravity_relay_webview.js`
- `scripts/test_deterministic_workspace_mutation_gate.js`
- `scripts/test_gameplay_input_fastpath.js`

Release truth:

- `package.json`
- `package-lock.json`
- `CHANGELOG.md`
- `README.md`
- `README_en.md`
- `README_zh-CN.md`
- `README_zh-TW.md`
- `docs/VERSION_TRUTH.md`

Evidence:

- `docs/ai-tasks/HUMAN-SMOKE-DEBUG-SANDBOX-FASTPATH-001.md`

## Tests added or expanded

- Direct typed and all required numbered/full-width debug command forms.
- Numeric non-presentation input preservation.
- Recognized routing with Relay OFF and ON, with zero GM/Relay dispatch and one
  deterministic execution.
- Unknown input GM/Relay fallback.
- Quick-option canonical payload plus explicit index metadata.
- Double-click, second-option, and free-input race rejection.
- Pending refresh cannot recreate enabled options.
- Shared lease BUSY, idempotent release, success cleanup, and failure cleanup.
- Relay success/failure lease settlement callbacks.
- Relay authority envelope validation and repository-edit denial.

## Validation evidence

- `npm.cmd ci` -> exit 0; 202 packages installed.
- `npm.cmd run build:webview` -> exit 0; `script.js` built from 33 modules.
- `npm.cmd run compile` -> exit 0.
- `node scripts/test_gameplay_input_fastpath.js` -> exit 0.
- `node scripts/test_debug_scenario_core.js` -> exit 0.
- `node scripts/test_antigravity_relay_core.js` -> exit 0.
- `node scripts/test_antigravity_relay_webview.js` -> exit 0.
- `node scripts/test_antigravity_file_bridge.js` -> exit 0.
- `node scripts/test_deterministic_workspace_mutation_gate.js` -> exit 0.
- `node scripts/test_webview_bundle.js` -> exit 0.
- `node scripts/test_playable_v0_player_action_hub.js` -> exit 0.
- `node scripts/check_i18n_keys.js` -> exit 0; all four locales missing 0.
- `npm.cmd run check:symbol-registry` initially identified the expected stale
  generated files; `npm.cmd run generate:symbol-registry` regenerated 4,101
  entries, and the repeated check exited 0.
- `node scripts/check_version_consistency.js` -> exit 0; version 1.82.3.
- `node scripts/validate_utf8_docs.js` -> exit 0; 1,113 files.

Full suite:

- Command: `npm.cmd test`
- Manifest: 250 scripts (validate 7, unit 229, smoke 13, simulation 1)
- Result: 250/250 passed
- Failed scripts: none
- Exit code: 0
- Duration: 130.0 seconds
- External log:
  `C:\AI\logs\human-smoke-debug-sandbox-fastpath-001-full-suite.log`

## Commits before the evidence-only report

- `d4472737ffefb4d17eee672d250f32213ba5c84b` —
  `fix: keep debug sandbox commands on deterministic fast path`
- `1295d7819ff6c6409692907fd1c196a0e49b96e6` —
  `test: cover numbered debug options and busy routing`
- `82a2f164490ac7b9a7807a7ed2a8bd59f89b8d1c` —
  `chore: bump release truth to 1.82.3`

## Limitations and remaining gate

- No installer was built or run.
- The installed Antigravity extension/skill was not modified.
- No user workspace or live world was modified.
- Human re-smoke was not performed.
- Remaining gate: integrate the dedicated branch, package/install 1.82.3, then
  repeat the original debug-sandbox quick-option smoke with Relay ON and OFF and
  verify zero repository changes.
