# PLAYTEST-UNBLOCK-001 Small Repair — Independent Final Verify

- AI: Claude
- Model: Claude Sonnet 5
- Reasoning: High
- Role: Independent final verifier for PLAYTEST-UNBLOCK-001 implementation + small repair
- Repository: `C:\AI\text-adventure-vsce` (`https://github.com/GGF1sh/LoreRelay`)
- Exact current main: `55a20ac537cfacf109bc0dd2324ca66d74cf5ddd`
- Exact original candidate: `4ce73dff7fbea0b416f4687a6554ede0cb1826ca` (`task/PLAYTEST-UNBLOCK-001-start-scenario-ux`)
- Exact repair candidate: `f03ff0c085b315702a4c370c8a396e94375540cb` (`task/PLAYTEST-UNBLOCK-001-small-repair`)
- Exact accepted adversarial review: `4e3fd36912da03ad0afcf08716b1cc1f2d499368` (verdict `PLAYTEST_UNBLOCK_PASS_WITH_SMALL_REPAIR`)
- Read: `docs/ai-tasks/PLAYTEST-UNBLOCK-001-ADVERSARIAL-REVIEW.md` (at `4e3fd369`), `docs/ai-tasks/PLAYTEST-UNBLOCK-001-SMALL-REPAIR.md` (at `f03ff0c0`)

No claim below is derived from trusting the Codex small-repair report. Every claim was re-derived from `git` output, direct code reading, and fresh command execution in an isolated worktree (`C:\AI\wt-playtest-unblock-001-small-repair`, pre-existing, checked out exactly at the repair candidate).

## Git ancestry

```
git rev-parse origin/main                                     -> 55a20ac537cfacf109bc0dd2324ca66d74cf5ddd
git merge-base --is-ancestor main original                    -> true (1 commit ahead: 4ce73df)
git merge-base --is-ancestor original repair                  -> true (1 commit ahead: f03ff0c)
git log --oneline main..repair                                -> f03ff0c, 4ce73df (exactly 2 commits ahead of main)
git merge-base --is-ancestor adversarialReview repair          -> false (expected — separate durable evidence, not required to be an ancestor)
```

All five expected relations match exactly.

## Exact 7-file repair delta (`git diff original repair --stat`)

```
docs/ai-tasks/PLAYTEST-UNBLOCK-001-SMALL-REPAIR.md
docs/generated/SYMBOL_REGISTRY.md
docs/generated/symbol_registry.json
scripts/test_playtest_unblock_001.js
src/scenarioPack.ts
webview/modules/90-bootstrap.js
webview/script.js
```

Exactly the expected 7 files. No Relay file, installer file, or unrelated gameplay-mechanics file touched.

## A. Start Hub repair — verdict: FIXED

Code: the diff removes exactly one line, `startHubForcedVisible = false;`, from the `gameStateUpdate` handler in `webview/modules/90-bootstrap.js`, immediately before `applyGameState(msg.state, msg.fullHistory)`. Read the full state machine (not just the diff):
- `openStartHubHome()` — sets `startHubForcedVisible = true` (no-ops if `messageHistory.length === 0`, matching the task's "acceptable no-op").
- `resumeCurrentSession()` — sets `startHubForcedVisible = false` (explicit user action).
- `applyParlorSession()` (a distinct, explicit navigation path — loading a parlor session) still clears it — a legitimate explicit-navigation clear, not "routine sync."
- The `gameStateUpdate` handler no longer touches the flag at all.
- `updateStartHubVisibility()` derives `showHub = !hasHistory || startHubForcedVisible` and is called from `renderMessage()` (i.e., after every entry applied by `applyGameState`), so hub visibility is correctly re-derived after every sync using the now-untouched flag.
- `applyGameState(state, fullHistory)` (`webview/modules/10-game-state.js`) only resets `messageHistory = []` when `fullHistory` is true (full replace/panel-reopen); incremental syncs (`fullHistory: false`) merge by id and never delete existing entries — confirms history survives incremental sync regardless of Start Hub state.

Focused test (`runStartHubBehaviorTest` in `scripts/test_playtest_unblock_001.js`): loads the **real** `10-game-state.js` and `90-bootstrap.js` source via `vm.runInContext` (not reimplemented), dispatches `DOMContentLoaded`, clicks the real `homeBtn` (wired via the real production listener), then dispatches a synthetic `gameStateUpdate` through the **real registered `window.addEventListener('message', ...)` handler** (not by calling internal functions directly) with `fullHistory: false`, and asserts: hub stays visible, chat stays hidden, `messageHistory` length/content unchanged, then clicks the real `resumeBtn` and asserts return to chat with history still intact. This directly covers required steps 1–9. Rerun fresh: `OK: Start Hub stays open across incremental sync and Resume restores the active session`.

Edge cases: incremental sync while open — covered by the test above. Explicit Resume — covered. Full-history sync while Home open — not separately automated, but by code inspection `fullHistory: true` still never touches `startHubForcedVisible` (the removed line was unconditional for the whole handler), so the hub would remain visible under a full-history resync exactly as under incremental sync; `messageHistory` would be rebuilt from the authoritative full entry list rather than "deleted" in a data-loss sense. This is a minor evidence gap (not independently automated) rather than a defect. Webview process reload: per task instruction, ephemeral Home state resetting on reload is explicitly not required and not treated as a defect.

## B. Character List resend — verdict: FIXED

`src/scenarioPack.ts` diff: `sendCharacterList` is imported and called inside the existing `setTimeout(() => { sendCurrentState(0, true); sendCharacterList(); sendBgmManifest(); sendSfxManifest(); pushScenarioDirectorToWebview(); ... })` block, which itself runs immediately after `await vscode.commands.executeCommand('textadventure.openGame')`. This matches the exact required ordering: scenario state commit → starter persistence (`ensureScenarioStarterProtagonist`, called earlier in the same function) → `openGame` → post-open sync → `sendCurrentState` → `sendCharacterList` → media/director sync.

`sendCharacterList()` (`src/characterManager.ts:170`) is a pure read+`postMessage` function (`getCharacters()`, `getActiveCharacterId()`, `getPartyIds()`, no writes) that no-ops via `if (!panel) { return; }` — confirms both "early call safely no-ops" and "resend cannot create a duplicate profile" (it never creates anything).

Test grounding: `runScenarioBootstrapIntegrationTests` `require()`s the **real compiled** `scenarioPack`, `characterManager`, `gameStateSync`, `mediaManifest` modules, wires a `getPanel` closure that only returns a real panel-shaped object *after* the stubbed `textadventure.openGame` command executes (reproducing the exact panel-not-yet-created timing gap), and captures real `panel.webview.postMessage` calls into an array. The test then filters `messages` for `type === 'characterList'` and asserts the persisted starter (`scrapbound_runner`) appears in one of those captured messages — this is a genuine observation through the production characterManager/Webview boundary, not a file-only check.

## C. Blank-player policy — verdict: FIXED, including the adversarial same-ID case

Read the full repaired `ensureScenarioStarterProtagonist` (`src/scenarioPack.ts:61-106`):
- `usablePlayerCharacters` filters to `controlledBy === 'player'` AND non-blank trimmed `name` — blank/whitespace-only-named player records are excluded from consideration entirely.
- `reusablePlayer` is searched only within `usablePlayerCharacters` (by preferred ID or by name match) → case 3 (existing matching starter reused, activated, partied, no duplicate: confirmed by `setActiveCharacter` + `addToParty` + early `return` with no `saveCharacter` call).
- The blocking check is now `usablePlayerCharacters.length > 0` (was: any player character at all) → case 2 (valid unrelated player blocks creation, remains untouched: confirmed, since a valid non-blank player is in `usablePlayerCharacters`) and case 4 (whitespace-only-name player no longer blocks creation: confirmed, since it's excluded from `usablePlayerCharacters`).
- Case 1 (no existing player → starter created) and case 5 (repeated load → no duplicate, since the second load finds the created starter via `reusablePlayer` by ID) both follow directly from the same logic.

**Adversarial case 6 (malformed whitespace-only player already occupies the exact preferred ID `scrapbound_runner`)** — traced precisely: `takenIds = existing.map(c => c.id)` includes the malformed record's id. Since `preferredId` (`'scrapbound_runner'`) **is** in `takenIds`, `!takenIds.includes(preferredId)` is false, so `id = resolveUniqueCharacterId(draft.name, takenIds)` — a **fallback ID**, not the canonical `scrapbound_runner`. A new profile is created with this fallback ID, saved, activated, and partied. The malformed record is never read for overwrite, never deleted, never mutated — the function only ever calls `saveCharacter`/`setActiveCharacter`/`addToParty` with the *new* fallback id.

Answering the required questions directly: the repair **does** produce a usable starter (a new, valid, active, partied character); it does **not** preserve the canonical `scrapbound_runner` identity in this specific collision case (a fallback ID is used instead); it **does** create a fallback ID; it **does** leave the malformed record untouched. Per the task's own instruction not to invent a blocker for malformed legacy data that cannot satisfy every ideal property, and since the accepted contract ("Character Profile must become usable and must not silently overwrite a valid unrelated player") is fully satisfied — a usable profile is created, and the malformed record was never "a valid unrelated player" to begin with — this is **not** a blocker.

## D. `normalizeOpeningStatus` — verdict: legitimate schema-boundary normalization, not a test-shaping hack

`src/types/GameState.ts` declares `condition?: string[]`, `inventory?: string[]`, `skills?: string[]` — all string arrays. The real `sample-scenarios/scrapbound-settlement/scenario.json` (inspected directly, not from the report) supplies `opening.status.condition` as the plain string `"HP 18/18, Hungry but steady"` — a genuine, pre-existing mismatch against the declared `GameStatus` schema, independent of this repair or its test. `normalizeOpeningStatus` spreads the original object and coerces only `condition`/`inventory`/`skills` into one-element arrays **when and only when** they are non-empty strings; any field already an array, or absent, passes through unchanged (the type check `typeof status[field] === 'string'` is false in both cases). `location`, `time`, and `funds` are never touched by the transform (confirmed by direct code read — they are not in the coerced-field list) and are asserted unchanged by the confirmed real scenario data above. Missing/invalid `raw` (non-object, array, null/undefined) returns `{}` — a safe empty object. Because the transform is purely additive/corrective and never rejects a well-formed input, old scenario packs with already-array `condition`/`inventory`/`skills` (or with none of these fields at all) continue loading unchanged. This is a legitimate fix for a real, independently-verifiable schema mismatch — not code altered solely to satisfy the new test.

## E. Temp-workspace integration proof — verdict: genuinely production-grounded

`runScenarioBootstrapIntegrationTests` calls the real `scenarioPack.loadBundledSampleScenario('scrapbound-settlement')` (via the required compiled module) against a real `os.tmpdir()`-based temp workspace, with `installVscodeStub(...)` providing only the unavoidable external VS Code API boundary (`workspace.workspaceFolders`, `getConfiguration`, `commands.executeCommand`, `window.*`) — no reimplementation of scenario/character logic anywhere in the stub. Verified directly in the test source (not merely trusted from the report):
- Expected Japanese values (`expectedNarrative`, `expectedOptions`, `expectedStatus`, `expectedName`) are read from the **real** `sampleScenario.locales.ja` block of the actual scenario file — not independently reconstructed strings, avoiding "fake helper duplicating scenarioPack logic."
- Asserts persisted `game_state.json` fields directly: `status.location`, `status.time`, `status.condition` (compared as `JSON.stringify([expectedStatus.condition])`, i.e. proving the array-wrapping from §D against the real localized string), `status.funds`, and narrative/options.
- Asserts workspace `scenario.json`: `meta.title` matches the localized title, and `!Object.prototype.hasOwnProperty.call(starterCase.scenario, 'locales')` — proving the workspace copy is the localized canonical copy with no top-level `locales` block.
- Asserts persisted character state: `starter.id === 'scrapbound_runner'`, `starter.name === expectedName` (レン・ヴェイル), `starter.controlledBy === 'player'`, `activeCharacterId === 'scrapbound_runner'`, `partyIds.includes('scrapbound_runner')`, exactly one `scrapbound_runner.json` character file, and a captured `characterList` postMessage containing the starter.
- Separately exercises the unrelated-valid-player case, the matching-starter-reuse case (single character file, no duplicate), and the whitespace-only-name case — all against the same real production module boundary.

This satisfies the required test-honesty bar: real production compiled modules are load-bearing throughout; stubs exist only at the VS Code API boundary.

## F. Bundle and generated artifacts — verdict: clean, deterministic, no unrelated drift

`webview/script.js` diff is exactly the same single-line removal (`startHubForcedVisible = false;`) as the module source diff — bundle corresponds to the modular source change with no additional lines. A fresh `npm run compile` in this session reproduced the committed bundle byte-for-byte (`git diff --stat webview/script.js` after rebuild: empty). `docs/generated/symbol_registry.json`/`SYMBOL_REGISTRY.md` diff between original and repair candidates contains only `"line": N -> N-1` shifts for existing `webview/modules/90-bootstrap.js` entries — a direct, deterministic consequence of the one-line removal; the new `normalizeOpeningStatus` function is module-private (no `export` keyword in `src/scenarioPack.ts`), so it correctly does not appear as a new registry entry, and no unrelated sourcePath or entry appears in the diff.

## Fresh commands — rerun on candidate `f03ff0c0` in the isolated worktree

Dependencies already present (`node_modules/typescript/bin/tsc` existed); `npm ci` was not required.

| Command | Result |
| --- | --- |
| `npm run compile` | PASS, exit `0` |
| `node scripts/test_playtest_unblock_001.js` | PASS — all 5 `OK` assertions (Start Hub, temp-workspace bootstrap, unrelated player, matching-starter reuse, whitespace-only-name) |
| `node scripts/test_scenario_pack_core.js` | PASS — 9/9 |
| `node scripts/test_scrapbound_sample_integrity.js` | PASS — 4/4 |
| `node scripts/test_webview_bundle.js` | PASS |
| `npm run check:symbol-registry` | PASS — "up to date", 3862 entries |
| `node scripts/test_symbol_registry.js` | PASS — 9/9 |
| `npm test` | **PASS, 230/230**, exit `0` — no environment-dependent (Antigravity installer) failure was observed in this run, so the task's fallback handling for that known-unrelated condition was not needed this time |

Working-tree state after the full run: only `webview/style.css` and `webview/vendor/mermaid.min.js` showed as modified, both confirmed zero-real-diff (CRLF advisory only via `git diff --stat`, no changed lines) and restored with `git checkout --` before finishing; nothing was committed.

## Blockers

None. No repair requirement remains open; the fresh 230/230 full-suite result matches the expected exact count with no unrelated-environment caveat needed this run.

# Final Verdict

`PLAYTEST_UNBLOCK_001_REPAIR_VERIFY_PASS`
