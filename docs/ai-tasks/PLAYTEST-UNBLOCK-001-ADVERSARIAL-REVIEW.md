# PLAYTEST-UNBLOCK-001 — Independent Adversarial Verification

> **AI:** Grok  
> **Model:** Highest-capability Heavy (restored Weekly quota)  
> **Reasoning:** High / maximum available  
> **Role:** Independent adversarial verifier — durable closeout  
> **Date:** 2026-07-07 JST  
> **Repository:** `C:\AI\text-adventure-vsce`  
> **Reviewed implementation branch:** `task/PLAYTEST-UNBLOCK-001-start-scenario-ux`  
> **Reviewed implementation commit:** `4ce73dff7fbea0b416f4687a6554ede0cb1826ca`  
> **Baseline `origin/main`:** `55a20ac537cfacf109bc0dd2324ca66d74cf5ddd`

---

## 0. Git preflight (required)

| Check | Expected | Observed | Result |
|-------|----------|----------|--------|
| `origin/main` SHA | `55a20ac537cfacf109bc0dd2324ca66d74cf5ddd` | `55a20ac537cfacf109bc0dd2324ca66d74cf5ddd` | PASS |
| Candidate SHA | `4ce73dff7fbea0b416f4687a6554ede0cb1826ca` | `4ce73dff7fbea0b416f4687a6554ede0cb1826ca` | PASS |
| Ahead / behind `origin/main` | 1 / 0 | 1 / 0 | PASS |
| Changed file count | 17 | 17 (reconciled with `git diff --stat`) | PASS |

**17-file touch set (confirmed):**

- `docs/ai-tasks/PLAYTEST-UNBLOCK-001-IMPLEMENTATION.md`
- `docs/generated/SYMBOL_REGISTRY.md`
- `docs/generated/symbol_registry.json`
- `locales/en.json`, `locales/ja.json`, `locales/zh-CN.json`, `locales/zh-TW.json`
- `sample-scenarios/scrapbound-settlement/scenario.json`
- `scripts/run_all_tests.js`
- `scripts/test_playtest_unblock_001.js`
- `scripts/test_scenario_pack_core.js`
- `scripts/test_scrapbound_sample_integrity.js`
- `src/scenarioPack.ts`
- `src/scenarioPackCore.ts`
- `webview/index.html`
- `webview/modules/90-bootstrap.js`
- `webview/script.js`

No “14 files” discrepancy found on candidate branch.

---

## 1. What the focused test actually proves

`scripts/test_playtest_unblock_001.js` verifies only:

| Claim | Evidence level |
|-------|----------------|
| HTML contains `start-hub-home-btn`, `start-hub-resume-btn` | Static string |
| Bundled JS contains `startHubForcedVisible`, `openStartHubHome`, `resumeCurrentSession` | Static string |
| `applyScenarioLocaleOverlay(raw, 'ja')` returns Japanese title/narrative | Pure function |
| `parseProtagonistDraft` parses localized `setup.playerCharacter` | Pure function |

**Not proven by any automated test on this branch:**

- Home → Start Hub → Resume round-trip in a live Webview
- `messageHistory` survival across that round-trip under host `gameStateUpdate`
- Scrapbound load writes Japanese `status` / `options` into workspace `game_state.json`
- Scrapbound load creates a visible Character Profile row in the Webview
- `sendCharacterList` delivery timing relative to `openGame`

**Verdict:** String-presence and pure-overlay tests are necessary but **not sufficient** as runtime evidence.

---

## 2. Blocker A — Start Hub navigation

### Intended fix

Explicit **Start Hub** header button + **Resume current session** inside Start Hub, without clearing `messageHistory`.

### Concrete attack sequence

1. **Initial state:** Scrapbound loaded; `messageHistory.length > 0`; chat visible.
2. **Player sees:** Header **Start Hub** button (localized).
3. **Player action:** Click **Start Hub**.
4. **Expected:** Start Hub overlay; chat hidden; **Resume** row visible; history intact.
5. **Collapse mechanism:** Any incoming `gameStateUpdate` runs:

```javascript
startHubForcedVisible = false;
applyGameState(msg.state, msg.fullHistory);
```

This happens on **every** state sync — turn results, image patches, `sendCurrentState` after load, `requestState` refresh paths that also push state, etc.

6. **Player experience:** Start Hub may flash open, then immediately closes back to chat on the next host message without the player clicking **Resume**.

### Additional attacks

| Attack | Result |
|--------|--------|
| Open Start Hub, then take a game action (submit option / GM turn) | Hub closes on `gameStateUpdate` — **navigation unstable** |
| Open Start Hub to read demo list while reviewing chat context | Any background sync kicks user back — **browse intent broken** |
| From forced Start Hub, click **Scrapbound demo** again | `resumeCurrentSession()` then `loadBundledScenario` — may trigger scenario reset confirm; not a safe “peek at hub” action |
| `openStartHubHome()` when `messageHistory.length === 0` | No-op — acceptable |

### What is genuinely fixed

- A visible control exists (previously missing).
- `messageHistory` is **not** cleared by hub toggle itself.
- `applyParlorSession` / initial empty state still behave as before.

### Smallest repair

- In `gameStateUpdate` handler: **do not** clear `startHubForcedVisible` on incremental updates; only clear on explicit Resume, scenario load, or `fullHistory` full replace when appropriate.
- Add one Webview harness or host integration test: load fixture state → Home → assert hub visible after synthetic `gameStateUpdate` patch.

---

## 3. Blocker B — Scrapbound Japanese locale

### Intended fix

`locales.ja` overlay in sample `scenario.json`; `applyScenarioLocaleOverlay` at load; localized copy written to workspace `scenario.json`; opening `game_state` seeded from localized `opening`.

### Concrete attack sequence (locale = `ja`)

1. **Initial state:** `textAdventure.locale = ja`, fresh workspace.
2. **Player action:** Start Hub → Scrapbound demo.
3. **Player should see (first screen):** Japanese narrative, status, options — **likely PASS** for opening only.
4. **Why it can still collapse:**

| Gap | Detail |
|-----|--------|
| Opening only | Overlay applies at **load seed** time. Turn 2+ text comes from GM pipeline, not scenario overlay. |
| English sender label | `sender: 'Game Master'` hardcoded in `loadScenarioPackFromDir` entry seed. |
| English satellites | `meta.tags`, `campaign_kit.json`, `world_forge.json`, `game_rules.json`, UI chrome strings outside overlay remain English or i18n-bundle dependent. |
| Locale source mismatch | Overlay uses `getConfiguredLocale()` (extension setting), not VS Code UI language. User can believe “Japanese LoreRelay” while setting is still `en`. |
| No `game_state.json` test | Tests never read workspace after `loadScenarioPackFromDir`; only pure overlay output. |

### Concrete mixed-language sequence

1. Load Scrapbound with `ja` locale.
2. Opening shows Japanese status line `HP 18/18、空腹気味だが足取りは確か`.
3. Player picks an option; GM responds in English (model / `gm.*` locale / prompt language).
4. **Player perception:** “Still broken” — because only slice 1 of the session was localized.

### Smallest repair

- Seed `sender` from `t('...')` or localized meta.
- Add temp-workspace integration test: run load path → assert `game_state.json` opening `status.location` and `options[0]` are Japanese.
- Document clearly: **demo opening is localized; ongoing GM language is a separate setting.**

---

## 4. Blocker C — Character Profile empty

### Intended fix

`setup.playerCharacter` in Scrapbound; `ensureScenarioStarterProtagonist()` after `commitGameState`.

### Concrete attack sequence

1. **Initial state:** Fresh workspace, Webview panel not yet created.
2. **Host order in `loadScenarioPackFromDir`:**
   - `commitGameState(...)`
   - `ensureScenarioStarterProtagonist()` → `saveCharacter()` → `sendCharacterList()`
   - `openGame` (creates panel)
   - `setTimeout(400ms)` → `sendCurrentState`
3. **Collapse mechanism:** `sendCharacterList()` no-ops when `getPanel()` is null **at bootstrap time**.

### Mitigation (not tested)

Webview boot posts `requestState` → host calls `sendCharacterList()`. On **first panel creation**, this likely fills Profile **after** load.

### Remaining failure modes

| Attack | Outcome |
|--------|---------|
| Workspace already has `controlledBy: 'player'` character with empty name | Bootstrap **skipped** — Profile stays empty/wrong |
| Panel already open from prior session but Webview stale | Depends on `requestState`; not covered by tests |
| User looks at Profile in first 400ms before `requestState` completes | Brief empty flash possible |

### Smallest repair

- Call `sendCharacterList()` again immediately after `openGame` resolves (or inside the existing `setTimeout` beside `sendCurrentState`).
- Temp-workspace test: after load, assert `characters/*.json` or exported character list contains `scrapbound_runner` / `レン・ヴェイル`.

---

## 5. Full-suite claim audit

Implementation doc claims `230/230 passed`.

**Independent run on candidate worktree (`4ce73dff`):**

```
Passed: 229/230
Failed: [unit] test_antigravity_installer.js: exit 1
```

Failure is **environmental / out of PLAYTEST-UNBLOCK-001 scope** (Antigravity installer), but the blanket “230/230” claim is **not reproduced** on this verifier machine.

Focused tests on candidate:

- `node scripts/test_playtest_unblock_001.js` — PASS
- `npm run compile` — PASS

---

## 6. Top break cases (ranked)

| # | Break case | Blocker | Severity |
|---|------------|---------|----------|
| 1 | `gameStateUpdate` forces `startHubForcedVisible = false` — Start Hub cannot be stayed in during play | A | High |
| 2 | Focused tests prove symbols only, not runtime UX | All | High |
| 3 | `sendCharacterList` may fire before panel exists; recovery relies on undocumented `requestState` path | C | Medium |
| 4 | Pre-existing empty `player` character blocks starter bootstrap | C | Medium |
| 5 | Localization is opening-only; GM follow-up can remain English | B | Medium |
| 6 | `sender: 'Game Master'` English in seeded entry | B | Low |
| 7 | Locale requires `textAdventure.locale`, not VS Code UI language | B | Low |
| 8 | Start Hub → click another demo triggers scenario reload, not passive browse | A | Low |
| 9 | Bundled ledgers / tags remain English | B | Low |
| 10 | `230/230` not reproduced here due unrelated installer test | Process | Low |

---

## 7. Per-blocker verdicts

| Blocker | Verdict | Notes |
|---------|---------|-------|
| **A. Start Hub navigation** | **PARTIAL FIX — runtime unstable** | Control exists; hub evicted by routine state sync |
| **B. Scrapbound Japanese** | **PARTIAL FIX — opening screen only** | Pure overlay correct; full session not localized |
| **C. Character Profile** | **LIKELY FIX on fresh open — unproven** | Logic sound; timing/existing-player gaps remain |

---

## 8. Test-evidence verdict

| Question | Verdict |
|----------|---------|
| Do string-presence tests equal runtime PASS? | **NO** |
| Does hybrid/static proof validate Start Hub behavior? | **NO** |
| Does hybrid/static proof validate full Japanese gameplay? | **NO** |
| Does hybrid/static proof validate visible Character Profile? | **NO** |
| Does pure overlay test validate workspace `game_state.json`? | **NO** |

---

## 9. Four minimum repair items

These are the smallest set required to move from `PLAYTEST_UNBLOCK_PASS_WITH_SMALL_REPAIR` to confident merge:

1. **Preserve forced Start Hub across incremental `gameStateUpdate`** (or only clear on Resume / full reload).
2. **`sendCharacterList()` after `openGame`** in scenario load path.
3. **Skip-bootstrap guard:** if existing player character has empty name, still apply scenario starter (narrow exception).
4. **Temp-workspace integration test** asserting Japanese opening fields in written `game_state.json` + starter character id present.

### Optional follow-ups (not required for minimum closeout)

5. **Localized GM entry sender** via `t()` (cosmetic but removes obvious English leak).
6. **Do not claim 230/230** without noting `test_antigravity_installer.js` environment dependency.

No Antigravity Relay, clipboard, `/text-adventure-gm`, installer, or File Bridge changes required for this slice.

---

## 10. Final verdict

```
PLAYTEST_UNBLOCK_PASS_WITH_SMALL_REPAIR
```

**Reasoning:**

- The branch is **not** a no-op; it addresses real gaps and pure-layer tests pass.
- It is **not** fully verified for the three original user-visible failures because:
  - Start Hub return is **unstable** under normal `gameStateUpdate` traffic.
  - Japanese fix is **credible for turn 0 only**, not whole-session honesty.
  - Character Profile fix is **plausible** but rests on init timing not covered by tests.
- One small Webview state-handling fix + one host-side `sendCharacterList` timing fix + one temp-workspace test would move this to confident merge.

**Not assigned:** `PLAYTEST_UNBLOCK_NOT_READY` — core intent is present.  
**Not assigned:** `PLAYTEST_UNBLOCK_PASS` — adversarial runtime attacks above still succeed without manual play confirmation.

---

## 11. Recommended human smoke (5 minutes)

Not a substitute for automated proof, but required before calling user blockers closed:

1. Set `textAdventure.locale` = `ja`.
2. Load Scrapbound from Start Hub.
3. Confirm opening narrative + options + status are Japanese.
4. Confirm Character Profile shows `レン・ヴェイル`.
5. Click **Start Hub** → confirm hub stays open through one GM turn or wait 5s → if it snaps back, Blocker A is **still open**.
6. Click **Resume** → confirm same chat history returns.

---

## 12. Boundary respected

Did **not** evaluate Antigravity left/right Relay mismatch, clipboard handoff, `/text-adventure-gm`, installer behavior, or File Bridge — per task scope.