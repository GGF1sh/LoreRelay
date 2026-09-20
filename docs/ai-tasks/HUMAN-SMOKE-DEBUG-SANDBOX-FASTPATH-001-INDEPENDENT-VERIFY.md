# HUMAN-SMOKE-DEBUG-SANDBOX-FASTPATH-001 Independent Verification

**Date**: 2026-07-13  
**Auditor**: independent adversarial verification (no subagents)  
**Final status**: `HUMAN_SMOKE_DEBUG_SANDBOX_FASTPATH_001_VERIFY_PASS`

## Identity

| Item | Value |
|------|--------|
| Canonical repository | `C:\AI\text-adventure-vsce` |
| GitHub | `GGF1sh/LoreRelay` |
| Verification worktree | `C:\AI\wt-human-smoke-debug-sandbox-fastpath-001-independent-verify` |
| Verification branch | `task/HUMAN-SMOKE-DEBUG-SANDBOX-FASTPATH-001-independent-verify` |
| `origin/main` | `fc647b2abbf1297f18b7777646b5e38e7b457363` |
| Main version | `1.82.2` |
| Candidate branch | `task/HUMAN-SMOKE-DEBUG-SANDBOX-FASTPATH-001` |
| Candidate tip | `ea0ae47553d25502e82ebca95d15351185abc058` |
| Candidate version | `1.82.3` |

## Lineage

Exactly **4 ahead / 0 behind**, **no merge commits**:

```
fc647b2abbf1297f18b7777646b5e38e7b457363  origin/main (1.82.2)
 -> d4472737ffefb4d17eee672d250f32213ba5c84b  fix: keep debug sandbox commands on deterministic fast path
 -> 1295d7819ff6c6409692907fd1c196a0e49b96e6  test: cover numbered debug options and busy routing
 -> 82a2f164490ac7b9a7807a7ed2a8bd59f89b8d1c  chore: bump release truth to 1.82.3
 -> ea0ae47553d25502e82ebca95d15351185abc058  docs: record debug sandbox fast-path repair
```

Final commit modifies only:

`docs/ai-tasks/HUMAN-SMOKE-DEBUG-SANDBOX-FASTPATH-001.md`

### Changed-file count

Git durable count across the candidate range:

**31 files**

| Category | Count (approx.) | Examples |
|----------|-----------------|----------|
| Production TS/JS | 12 | `src/extension.ts`, `src/debugScenarioCore.ts`, `src/gameplayInputRouteCore.ts`, webview modules, `webview/script.js` |
| Antigravity skill prose | 1 | `antigravity-skill/text-adventure-gm/SKILL.md` |
| Generated symbol registry | 2 | `docs/generated/*` |
| Tests / manifest | 6 | `scripts/test_gameplay_input_fastpath.js`, relay/gate tests, `run_all_tests.js` |
| Release truth | 8 | package, lockfile, CHANGELOG, READMEs, VERSION_TRUTH |
| Candidate report | 1 | `docs/ai-tasks/HUMAN-SMOKE-DEBUG-SANDBOX-FASTPATH-001.md` |
| Generated webview bundle | included above | `webview/script.js` |

**Antigravity “28 files edited” vs Git 31**: treated as UI aggregation (grouping generated/bundle/docs), not a functional blocker. Durable Git count is **31**.

## Inspected files (initial ~8, then expanded on findings)

Primary:

- `webview/modules/10-game-state.js`
- `webview/modules/90-bootstrap.js`
- `src/webviewHandlers.ts`
- `src/extension.ts`
- `src/debugScenarioCore.ts`
- `src/debugScenarioRunner.ts`
- `src/gameplayInputRouteCore.ts`
- `src/deterministicWorkspaceMutationGate.ts`

Expanded:

- `src/debugScenarioRunnerCore.ts`
- `src/antigravityRelayBridgeCore.ts`
- `src/gmPromptBuilderCore.ts`
- `src/gameStateSync.ts`
- `antigravity-skill/text-adventure-gm/SKILL.md`
- `scripts/test_gameplay_input_fastpath.js`
- `scripts/test_antigravity_relay_webview.js`
- `scripts/test_antigravity_file_bridge.js`
- `scripts/test_deterministic_workspace_mutation_gate.js`
- `docs/ai-tasks/HUMAN-SMOKE-DEBUG-SANDBOX-FASTPATH-001.md`
- release-truth files for `1.82.3`

## Verified root cause

On main 1.82.2 behavior reconstructed from candidate before/after and current source:

1. Scenario options are unnumbered; `renderOptions` displayed `N. ${opt}`.
2. Historical path serialized the decorated string as player input (failure mode).
3. Debug matcher only whitespace-normalized, so `2. エルダの好感度を上げて` missed the grammar and fell through to Relay/GM when Relay was ON.
4. `isInputLocked()` previously ignored pending GM loading, allowing state refresh to redraw enabled options.
5. Host accepted concurrent player messages without a shared request lease.
6. Relay envelopes lacked explicit gameplay-only / no-repo-edit authority.

These match the human-smoke symptoms (80s+ pending, Antigravity agent work, repo edits displayed, second option still clickable).

## A. Quick-option end-to-end route

```
scenario.json opening.options
  -> renderOptions: display `${i+1}. ${opt}`, post selectOption { text: opt, optionIndex: i }
  -> webviewHandlers: selectOption/freeInput -> handlePlayerInput(..., source quick_option when index valid)
  -> handlePlayerInput: acquire shared gate
  -> handleAcceptedPlayerInput: persist presentation text if index+text match; routeGameplayInput
  -> tryExecuteDebugScenarioCommand -> normalize + parse + deterministic runner
  -> else Relay or GM dispatcher
```

Independent confirmation:

- Payload uses **canonical** option text (`text: opt`), not display decoration.
- `optionIndex` is **zero-based** (`i` from `forEach`); host accepts integer `0 <= index < 12`.
- History/display uses `${index+1}. ${trimmed}` only when `availableOptions[index] === trimmed`.
- Free-typed input unchanged (`freeInput` posts raw text).
- Legacy decorated payloads still normalize when index+text match.
- Mismatched index/text is **not** stripped (probe: `2. 別の文`, `9. エルダ…`, `1. ヘルプ extra` preserved).

Production click contract is exercised by `test_antigravity_relay_webview.js` (real `renderOptions` + button click asserts `selectOption` text + `optionIndex`). Host routing contract is exercised via `routeGameplayInput` + gate tests + webviewHandlers wiring in extension.

## B. Normalization safety

`normalizeDebugScenarioPlayerInput` strips only when:

1. Leading ASCII/full-width digits + allowed punctuation (`.)）．。・`); and
2. Remaining text equals the option at that **one-based** index.

Independent uncommitted probes (all OK):

| Input | Result |
|-------|--------|
| `2. エルダの好感度を上げて` | stripped to canonical |
| `2. 別の文` / OOR index / `0.` | preserved |
| `3歩進んで…` (numeric gameplay, no marker) | preserved |
| `12 apples` / `2d6 roll` / coords / `3.14 pi` / date-like | preserved |
| Full-width `２．` forms | stripped when match |
| Trailing `！` mismatch | preserved |

Not an arbitrary leading-number stripper.

## C. Deterministic authority

- `routeGameplayInput` always tries debug fast path **before** Relay/GM.
- `handlePlayerInput` is the webview `selectOption`/`freeInput` host path; recognized debug commands call `tryExecuteDebugScenarioCommand` with presentation options; Relay ON/OFF does not skip recognition.
- Focused route tests: Relay ON/OFF → one debug execution, zero GM, zero Relay for recognized command; unknown input keeps GM/Relay fallbacks.
- Coding/agent path is not entered for recognized debug commands (no Relay request written).

## D. Shared lease lifecycle

Gate: `createDeterministicWorkspaceMutationGate` with token-scoped `release()` (idempotent; ignores stale token).

Production wiring:

- Every `handlePlayerInput` `acquire`s `{ actionKind: 'gameplay_request', requestId }`.
- BUSY posts `playerInputBusy` and returns without second mutation.
- Non-Relay paths release in `finally`.
- Relay path retains lease via `retainRelayGameplayLease` until:
  - accepted import (`onRelayRequestSettled` / accepted),
  - failed import (`notifyRelayImportFailure`),
  - Relay OFF / scenario load / session transition (`clearRelayRequestForCurrentWorkspace` releases retained lease),
  - replacement retain of a different requestId releases previous.
- Thrown errors still hit `finally` release when not retained.
- Player Action Hub mutations use the **same** gate instance (`deterministicWorkspaceMutationGate.run` in extension).
- Token mismatch prevents one request’s late release from clearing another’s lease (probe + source).

**Residual (documented, not REPAIR_REQUIRED):** active lease has **no timeout/force-unlock** except owner release, Relay settlement, OFF/load/session, or dispose. A forever-pending Relay without those events remains BUSY by design (mutual exclusion), not a silent leak from mismatched release.

Tests cover gate BUSY races, hub vs gameplay exclusion, idempotent release, and Relay settlement callbacks; full VS Code extension process is not smoke-driven here.

## E. UI pending state

- `isInputLocked()` = game-over **or** presence of `#gm-loading`.
- `renderOptions` no-ops when locked → state refresh cannot recreate enabled options while pending (tested).
- Click path calls `showGmLoading()` immediately after post.
- Free input / send / option buttons share `setInputLocked` / loading lock.
- `playerInputBusy`: does **not** unlock when owner is another `gameplay_request` (protects accepted request); unlocks only for competing non-gameplay mutation rejection.
- Success/failure clear loading via `gmEnd` / Relay waiting handlers (tested).

## F. Relay authority boundary

Request file (`buildAntigravityRelayRequest`) and clipboard payload (`buildAntigravityRelayPayload`) both emit:

- `trafficClass: "gameplay_narrative"`
- `authority.repositoryEditsAllowed: false`
- `allowedWorkspaceWrites: ["turn_result.json"]`

`parseAntigravityRelayRequest` fails closed if trafficClass/authority missing or broadened (`repositoryEditsAllowed: true` rejected). Request-id matching and import paths remain covered by file-bridge tests.

### Prompt-level vs hard isolation

`antigravity-skill/text-adventure-gm/SKILL.md` adds highest-priority prose requiring gameplay-only behavior and forbidding repo edits. **This is an operational instruction boundary, not OS-level filesystem isolation.** Residual risk remains if an agent ignores skill/request constraints. That residual **does not block PASS** because:

- recognized debug commands never reach Relay;
- every LoreRelay-built gameplay Relay envelope denies repository edits and fails closed when broadened;
- the candidate report and this verification record the limitation honestly.

## G. Source/generated and release truth

- Focused `build:webview` + `compile` + bundle/hub tests pass; symbol-registry check current (4101 entries).
- Version consistently **1.82.3** across package, lockfile, badges, VERSION_TRUTH, CHANGELOG head.
- Historical **1.82.2** section remains intact.
- Candidate report does not claim installer or human re-smoke; explicitly requires integration + re-smoke.
- No unrelated feature work observed outside the repair/test/release/docs scopes above.

## Candidate claims checklist

| # | Claim | Verdict |
|---|--------|---------|
| 1 | Visible numbering serialized into input (root cause) | Confirmed historical failure mode |
| 2 | Matcher lacked presentation normalization | Confirmed pre-fix behavior; fixed |
| 3 | Fell through to Relay/GM | Confirmed by route order + tests |
| 4 | Pending refresh recreated options | Fixed via `gm-loading` lock |
| 5 | Host lacked shared exclusion | Fixed via shared gate acquire |
| 6 | Quick options send canonical text + index | Confirmed source + webview test |
| 7 | Legacy numbered strip only on index+text match | Confirmed source + probes |
| 8 | Debug before GM/Relay regardless of Relay flag | Confirmed |
| 9 | All player requests acquire shared gate | Confirmed for `handlePlayerInput` |
| 10 | Relay retains lease until settlement/OFF/load/session | Confirmed wiring |
| 11 | Gameplay Relay marks no repo edits | Confirmed envelope + parse fail-closed |
| 12 | Player Action Hub still on same gate | Confirmed |
| 13 | Full suite 250/250 | Independently reproduced |

## Tests run

All exit 0:

- `npm ci`
- `npm run build:webview`
- `npm run compile`
- `node scripts/test_gameplay_input_fastpath.js`
- `node scripts/test_debug_scenario_core.js`
- `node scripts/test_antigravity_relay_core.js`
- `node scripts/test_antigravity_relay_webview.js`
- `node scripts/test_antigravity_file_bridge.js`
- `node scripts/test_deterministic_workspace_mutation_gate.js`
- `node scripts/test_webview_bundle.js`
- `node scripts/test_playable_v0_player_action_hub.js`
- `node scripts/check_i18n_keys.js`
- `npm run check:symbol-registry`
- `node scripts/check_version_consistency.js`
- `node scripts/validate_utf8_docs.js`
- uncommitted adversarial normalize + lease token probes (exit 0, fail_count 0)

## Full suite

| Item | Result |
|------|--------|
| Command | `npm test` once |
| Manifest | **250** scripts |
| Result | **Passed: 250/250** |
| Failed | 0 |
| Exit code | 0 |
| Log | `C:\AI\logs\human-smoke-debug-sandbox-fastpath-001-independent-verify-full-suite.log` |

Build dirt restored; worktree clean before this report commit.

## Limitations

- No live installer.
- No human re-smoke on installed 1.82.3.
- Did not touch `C:\AI\wt-lorerelay-installer-current`, `G:\AI\LoreRelayWorlds\Fantasy`, installed Antigravity extension, or `main`.
- Static/host unit evidence cannot replace post-integration visual smoke of the original failure.
- Antigravity skill text is not hard FS isolation.
- Live issue must not be declared resolved until integration + install + human re-smoke.

## Final verdict

**`HUMAN_SMOKE_DEBUG_SANDBOX_FASTPATH_001_VERIFY_PASS`**

No material false-positive test, no demonstrated lease lifecycle leak, no alternate bypass of the debug fast path for the quick-option contract, consistent `1.82.3` release truth, and independently reproduced **250/250**.
