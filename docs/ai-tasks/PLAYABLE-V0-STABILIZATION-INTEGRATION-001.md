# PLAYABLE-V0-STABILIZATION-INTEGRATION-001

Prompt timestamp: `2026-07-14 02:09:19 JST (Asia/Tokyo)`

Integration date: `2026-07-14 JST`

## Purpose

Reconstruct the final LoreRelay playable-v0 stabilization tree from exact,
independently verified tracks; preserve the audited current-main UI/i18n work;
resolve the divergent historical `1.82.3` candidate as release `1.82.4`; and
prepare a guarded linear fast-forward of main.

## Repository and Base Identity

- Repository: `C:\AI\text-adventure-vsce`
- GitHub: `GGF1sh/LoreRelay`
- Exact integration base / required pre-push main:
  `da11e836c6e44a796e43ae12da44224bfcb1171c`
- Base version: `1.82.3`
- Integration branch: `integration/PLAYABLE-V0-STABILIZATION-INTEGRATION-001`
- Integration worktree: `C:\AI\wt-playable-v0-stabilization-integration-001`
- Release version: `1.82.4`

The integration branch was created directly from the exact base. No merge
commit was created.

## Current-Main UI/i18n History Considered

The five-commit audited burst already present in the base was preserved:

- `15824781b7bec1a4bd2b1ca680c1e17e94fcb9d0`
- `1c910cabfe846b84930bf8c5ac5d7fb1a60c54ad`
- `22523ea907dc7960baa36a93b0924bc22a96cab4`
- `f641d0fe30d901c6bda468d411dc352b144db875`
- `da11e836c6e44a796e43ae12da44224bfcb1171c`

Its report-only audit source was:

- `56d243331fc56cd93fa81b6a488dd150326d60b9`

The audit verdict is
`UNPLANNED_CLAUDE_MAIN_BURST_AUDIT_001_PASS`.

## Verified Track Commits Considered

### Debug-sandbox deterministic fast path

- Production source: `d4472737ffefb4d17eee672d250f32213ba5c84b`
- Tests: `1295d7819ff6c6409692907fd1c196a0e49b96e6`
- Historical version-only commit:
  `82a2f164490ac7b9a7807a7ed2a8bd59f89b8d1c`
- Candidate report: `ea0ae47553d25502e82ebca95d15351185abc058`
- Independent report: `6aa53f34745f6c6a5900ea5737fae25814c9331d`

### Writer-lease deterministic race harness

- Executable test repair: `e8ca1a15e354ace2b3a848979c1fc135ab96fef3`
- Repair report: `6c1c2fbb270732d099fa60be0119d87aed31c504`
- Independent report: `3f614b7ba0cb43ebbcea3f46b4f9f16810508617`

### Installer bootstrap hermetic fixture

- Executable helper repair: `8dcf4979909de008b5a829567f330f64c82f2b4b`
- Candidate report: `fd02e0a219d0ba96ba58f0e39a1bb5711462feea`
- Independent report: `49b1c5e4f519814d36ad6f76c5ddd8f2a57da432`

All required commits were verified as Git commit objects before reconstruction.
Each report-only commit was independently verified to add exactly its expected
report file.

## Explicitly Omitted Historical Version Commit

`82a2f164490ac7b9a7807a7ed2a8bd59f89b8d1c` was not cherry-picked.

Its diff was verified to touch only:

- `package.json`
- `package-lock.json`
- the four README version badges
- `CHANGELOG.md`
- `docs/VERSION_TRUTH.md`

The historical candidate used version `1.82.3`, which would overwrite the
distinct audited current-main `1.82.3` history. Its release-note meaning was
instead incorporated into the new `1.82.4` section without importing any
historical `1.82.3` values.

## Exact Linear Integration Commits

The source commits were replayed into the current-main lineage as follows:

| Integration commit | Meaning / source |
| --- | --- |
| `2fa2bcb25b6b2f8b2fd7b2885c1d6975e980ae1e` | current-main audit report from `56d2433...` |
| `cd3a75fb2e27c11d7171607d9d87b091f3c67e05` | debug production from `d447273...` |
| `2b6dfde73c34c39a8975128fa70323681d88d379` | debug tests from `1295d78...` |
| `d767f184c173040db52b9d5c37a2a78d45593913` | debug candidate report from `ea0ae47...` |
| `7ee19ba195a26c6c8a4f8a2a5424f35d4d90cc48` | debug independent report from `6aa53f3...` |
| `bf855c235fe61bdef2da0c6b8a75930a7c2f00a0` | writer harness from `e8ca1a1...` |
| `901953e72da03f2f742bdc482c883274997a506a` | writer repair report from `6c1c2fb...` |
| `be7ea96f3b5d6a2dfe9d046a1c4e283ae82d9d51` | writer independent report from `3f614b7...` |
| `0af30dd5c9521e1bd44fdb80b6c8430bbdf14e5f` | installer helper from `8dcf497...` |
| `7eac6fc32fa725a6fe0365847113e360d3f2f004` | installer candidate report from `fd02e0a...` |
| `630c6dd2d6f2adf3d75fe40f07c8d5b788bcce3f` | installer independent report from `49b1c5e...` |
| `cbbacd187203ddfe95f2032727ca3f890346beb3` | operational-document repairs |
| `57ef5975c42d06582e4ec09d81f21047b7e5c3cc` | coherent `1.82.4` release truth and regenerated registry |

This report is committed after the executable/release gates; its commit becomes
the integration tip used by the guarded push.

## Conflict Resolution

### `webview/modules/90-bootstrap.js`

Git auto-merged this source file without conflict markers, but the result was
manually audited rather than accepted blindly. The debug patch adds the
`playerInputBusy` branch while preserving current-main behavior:

- locale data is checked before Relay toggle text is replaced, preventing raw
  i18n keys before `localeBundle`;
- `localeBundle` refreshes both the Relay toggle and Relay-aware Send button;
- Relay mode status continues to update toggle, Send button, banner, and
  waiting-state UI;
- the debug fast path retains canonical quick-option payloads, guarded
  normalization, local deterministic recognized commands, pending UI lock, and
  the shared host mutation boundary.

### Generated webview bundle

`webview/script.js` was not manually combined. After source resolution,
`npm run build:webview` regenerated the bundle from 33 modules. The regenerated
content matched the integrated committed bundle after EOL normalization, and
the module/bundle equivalence tests passed.

### Generated symbol registry

`docs/generated/SYMBOL_REGISTRY.md` and
`docs/generated/symbol_registry.json` were the only content conflicts during
the debug production cherry-pick. Current-main generated output was retained
temporarily, then both files were regenerated from the final source using
`npm run generate:symbol-registry`. The final registry contains 4,101 entries,
and `npm run check:symbol-registry` passed.

No production source conflict required choosing an entire `ours` or `theirs`
file.

## Verified Blob Status

- Writer harness final blob:
  `921f8d0484f1bb0614f5563066e5c3e184c2908a` — exactly matches the independently
  verified blob.
- Installer helper final blob:
  `6e7041ade6040e4e11ac38b2709900f8b8282129` — exactly matches the independently
  verified helper content.

Because neither verified blob changed during integration, the previous writer
40-run ceremony and installer 10-run / 4-topology stress matrices were not
repeated. Each repaired path was run once in focused validation and once through
the final manifest.

## Operational-Document Corrections

`docs/ai-tasks/LORELAY-CURRENT-HANDOFF.md` now:

- reads live main through `git fetch origin` and `git rev-parse origin/main`
  instead of embedding a self-staling tip;
- records version `1.82.4` and all three integrated stabilization tracks;
- distinguishes production behavior from test-infrastructure repairs;
- states that collapsed Relay-banner recovery, live installer refresh, and
  real VS Code extension-host human smoke remain pending;
- distinguishes static harness checks from real human smoke;
- keeps genre/economy work design-only.

`docs/ai-tasks/GENRE-AWARE-EVENTS-AND-ECONOMY-PROFILE-001.md` now clarifies that
`WorldForge` exposes `meta.theme` on the relevant simulation path while
`CommerceForge` / `WorldKitTickInput` do not expose that same typed path. Any
commerce/theme wiring therefore needs an explicit seam. No genre/economy
production implementation was added.

## Version and Release Truth

The final value is `1.82.4` across:

- `package.json`
- `package-lock.json` root and package entry
- README badges in all four READMEs
- `docs/VERSION_TRUTH.md`
- the first release section in `CHANGELOG.md`

The existing `1.82.3` section describing current-main UI/i18n fixes is
preserved. The `1.82.4` section separates:

- production fixes: deterministic debug-sandbox fast path and gameplay request
  serialization / Relay gameplay-only authority;
- test infrastructure: deterministic live-overlap writer-lease race harness
  and branch-hermetic installer bootstrap Git fixture.

## Changed-File Classification

Relative to exact base main, the intended delta is limited to 42 files,
including this final integration report.

### Production / packaged behavior (13)

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

### Regenerated artifacts (3)

- `webview/script.js`
- `docs/generated/SYMBOL_REGISTRY.md`
- `docs/generated/symbol_registry.json`

### Tests / test infrastructure (8)

- `scripts/run_all_tests.js`
- `scripts/test_antigravity_file_bridge.js`
- `scripts/test_antigravity_relay_core.js`
- `scripts/test_antigravity_relay_webview.js`
- `scripts/test_deterministic_workspace_mutation_gate.js`
- `scripts/test_gameplay_input_fastpath.js`
- `scripts/test_helpers/local_installer_git_fixture.js`
- `scripts/test_runtime_accepted_replay_guard.js`

### Release truth (8)

- `package.json`
- `package-lock.json`
- `README.md`
- `README_en.md`
- `README_zh-CN.md`
- `README_zh-TW.md`
- `CHANGELOG.md`
- `docs/VERSION_TRUTH.md`

### Operational and evidence documentation (10)

- `docs/ai-tasks/LORELAY-CURRENT-HANDOFF.md`
- `docs/ai-tasks/GENRE-AWARE-EVENTS-AND-ECONOMY-PROFILE-001.md`
- `docs/ai-tasks/UNPLANNED-CLAUDE-MAIN-BURST-AUDIT-001.md`
- `docs/ai-tasks/HUMAN-SMOKE-DEBUG-SANDBOX-FASTPATH-001.md`
- `docs/ai-tasks/HUMAN-SMOKE-DEBUG-SANDBOX-FASTPATH-001-INDEPENDENT-VERIFY.md`
- `docs/ai-tasks/INTEGRATION-BLOCKER-WRITER-LEASE-RACE-001.md`
- `docs/ai-tasks/INTEGRATION-BLOCKER-WRITER-LEASE-RACE-001-INDEPENDENT-VERIFY.md`
- `docs/ai-tasks/INSTALLER-BOOTSTRAP-HERMETIC-FIXTURE-001.md`
- `docs/ai-tasks/INSTALLER-BOOTSTRAP-HERMETIC-FIXTURE-001-INDEPENDENT-VERIFY.md`
- `docs/ai-tasks/PLAYABLE-V0-STABILIZATION-INTEGRATION-001.md`

No unrelated gameplay, simulation, economy, OCR, media, scenario-data, or
installer-production file changed.

## Focused Validation

Final focused gate: 22/22 commands completed, failures 0, all exit codes 0.

The required commands passed:

- `npm ci`
- `npm run build:webview`
- `npm run compile`
- all nine requested gameplay/Relay/webview focused tests
- all three requested installer focused tests
- i18n, symbol-registry, version, and UTF-8 checks

Three additional directly dependent tests were selected:

- `scripts/test_antigravity_relay_core.js`, because this integration changes
  that test plus the Relay/bootstrap/prompt boundary it inspects;
- `scripts/test_debug_scenario_core.js`, because `src/debugScenarioCore.ts`
  changed;
- `scripts/test_gm_prompt_builder_core.js`, because
  `src/gmPromptBuilderCore.ts` changed.

An initial focused attempt stopped at installer bootstrap before its assertions
could complete because C: had exactly zero free bytes. The failed fixture was
classified as an environment-capacity failure, not a topology assertion. No
source was changed. The current worktree dependency tree was NTFS-compressed
without deleting files or touching another worktree, restoring more than 2 GiB.
The final complete focused gate was then recorded from the repaired environment
and all 22 commands passed.

Focused log:
`C:\AI\logs\playable-v0-stabilization-integration-001-focused.log`

## Test Impact Decision

Focused domains were selected for direct dependency reasons:

- debug command parsing/routing and canonical numbered-option normalization;
- gameplay request serialization and shared workspace mutation exclusion;
- Relay gameplay-only authority, file bridge, webview waiting/busy behavior,
  and current-main locale refresh;
- writer-lease live-overlap harness and recovery semantics;
- Player Action Hub / viewport / theme / bundle regression coverage;
- installer bootstrap topology, installer contract, and skill packaging;
- generated registry, release truth, i18n keys, and UTF-8 documentation.

Economy, simulation soak, OCR, media generation, unrelated scenario fixtures,
and the live installer were not selected as focused domains because no file in
those production domains changed. All current manifest scripts, including those
domains, still ran once at the final integration boundary.

## Full-Suite Gate

- Command: `npm test`
- Live manifest scripts: 250
- Passed: 250/250
- Failed scripts: 0
- Duration: 134.1 seconds
- Exit code: 0
- Full-suite runs in this task: exactly one

The debug fast-path test, repaired writer-lease test, installer bootstrap test,
and version consistency check all passed in the manifest.

Full-suite log:
`C:\AI\logs\playable-v0-stabilization-integration-001-full-suite.log`

## Untouched Surfaces

- `C:\AI\wt-lorerelay-installer-current`
- installed Antigravity extension files
- `G:\AI\LoreRelayWorlds\Fantasy`
- live VS Code extension state
- user campaign data
- genre/economy production implementation
- collapsed Relay-banner recovery implementation
- unrelated and old integration worktrees

The live installer was not run or refreshed. Human smoke was not performed.

## Remaining Work

Collapsed Relay-banner recovery remains the next required repair. After that
repair is independently verified and integrated, refresh the live installer and
perform combined real VS Code extension-host human smoke.

## Guarded-Push Status at Report Creation

No push had occurred when this report content was written; main remained at the
required base. This ordering is intentional so the report itself is included in
the exact integration tip. After committing this report and rerunning only
version consistency plus UTF-8 validation, the operator must:

1. fetch origin again;
2. require `origin/main` to remain exactly
   `da11e836c6e44a796e43ae12da44224bfcb1171c`;
3. require that base to be an ancestor of the report tip;
4. push the integration branch;
5. fast-forward main without force;
6. perform the specified fresh post-push worktree validation.

The actual guarded-push and post-push results are reported by the final task
response; this durable report does not predeclare network writes that had not
yet happened.
