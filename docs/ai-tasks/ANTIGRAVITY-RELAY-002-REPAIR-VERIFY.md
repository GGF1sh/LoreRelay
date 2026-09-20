# ANTIGRAVITY-RELAY-002 Repair — Independent Re-Verify

- **AI:** Grok
- **Model:** Grok 4.5 (High)
- **Role:** Independent adversarial re-verifier (repair candidate only)
- **Date:** 2026-07-09 (JST)
- **Worktree:** `C:\AI\wt-antigravity-relay-002-repair-verify` (detached then branch)
- **Implementation changes:** **none** (this document only)
- **Merge:** **not performed**

## Preflight

| Check | Expected | Observed | Result |
| --- | --- | --- | --- |
| Main SHA | `cc15320fce9ebc7a5b44ad1d7adfb9c534ac8982` | `cc15320` present; repair is ancestor-descendant | MATCH |
| Original candidate | `33e652b690360f889d6543515846fb5afe07a9b4` | `33e652b Implement Antigravity Relay file bridge` | MATCH |
| Accepted failed review | `cf9f3b43d42bbd0793d11c94e31998def8a98d9e` | `cf9f3b4 docs: independent adversarial verify…` (verdict REPAIR_REQUIRED) | MATCH |
| Repair candidate | `2ffe79e9e0970984eb38d44c34fcce22c556bbe4` | `2ffe79e Repair Antigravity Relay file bridge` | MATCH |
| Repair branch | `task/ANTIGRAVITY-RELAY-002-repair` | present locally + `origin` | MATCH |
| Ancestry | main ⊂ repair | `git merge-base --is-ancestor cc15320 2ffe79e` → exit 0 | MATCH |
| Commits main..repair | implementation + repair | `33e652b`, `2ffe79e` (2 commits) | MATCH |

Repair author verdict (not accepted until this review): `ANTIGRAVITY_RELAY_002_REPAIR_READY_FOR_VERIFY`.

---

## Prior REPAIR_REQUIRED (4 points) — re-check only

### 1. GM Skill durable in LoreRelay Git + reinstall from fresh checkout

| Evidence | Result |
| --- | --- |
| `antigravity-skill/text-adventure-gm/SKILL.md` tracked at repair HEAD | **YES** (`git cat-file -e HEAD:…/SKILL.md` OK; 37 paths under tree) |
| Installer source | `scripts/install_antigravity_skill.ps1` L38: `..\antigravity-skill\text-adventure-gm` |
| No sibling non-git dependency | Installer no longer uses `..\..\TextAdventureGMSkill` |
| Fresh checkout reinstall | Ran `powershell -File scripts/install_antigravity_skill.ps1` from worktree; source → `~/.gemini/config/skills/text-adventure-gm`; SHA-256 **matched** repo skill after install |
| Focused test | `assertSkillStartupPriority()` requires repo `SKILL.md`, marker near top, installer path; **does not SKIP** when source missing (asserts presence) |

**Verdict (1): PASS** — prior failure (“skill only in unversioned sibling folder”) is closed.

Before reinstall, this machine had a **stale** installed skill (`ecc8ef17…` ≠ repo `43f2cbb5…`), so `test_antigravity_file_bridge.js` failed the optional “if installed, must match” hash. That is **local install drift**, not missing Git durability. After reinstall from the repair tree, the hash matched and the test passed.

---

### 2. Relay OFF / new scenario / session transition clears stale pending request

| Path | Wiring |
| --- | --- |
| Host helper | `src/antigravityRelayBridgeHost.ts` — `clearPendingAntigravityRelayRequest(workspace, reason, expectedRequestId?)` |
| Relay OFF (setting change) | `extension.ts` `onDidChangeConfiguration` → `clear…('relay-mode-off')` when enabled becomes false |
| Relay OFF (UI toggle) | `handleSetAntigravityRelayMode(false)` → clear + `config.update('antigravityRelay.enabled', false)` |
| Scenario load | `loadScenarioPack` / `loadBundledSampleScenario` / `handleRunQuickstart` → `'scenario-load'` |
| Session transitions | Parlor / In-World / experience profile / promote → `'session-transition'` |
| Accepted match only | `gameStateSync` clears with `'accepted-result'` **and** `relayMatch.requestId` (wrong id → no unlink) |
| Ordinary validation | Pure `validateTurnResultForPendingRelayRequest` does **not** delete the file; host clear only on explicit reasons |

Focused test writes a real request file and asserts:

- `clear…('accepted-result', 'wrong-id')` leaves file
- `clear…('relay-mode-off')` removes file
- validation with pending request does not remove file
- `clear…('scenario-load')` removes file

**Verdict (2): PASS**

---

### 3. Shared workspace identity contract (left ↔ right)

| Side | Contract |
| --- | --- |
| Request JSON | `workspacePath` + `workspaceIdentity` required by `parseAntigravityRelayRequest` |
| Builder | `path.resolve(workspacePath)`; identity defaults to resolved path |
| Host write | `extension.ts` sets both from `getWorkspacePath()` / `path.resolve` |
| Clipboard payload | `buildAntigravityRelayPayload(…, { workspacePath, workspaceIdentity, requestId, … })` |
| Skill (repo) | SKILL.md highest-priority section: request is authority; multi-root must use request `workspacePath` / `workspaceIdentity`, not ambiguous CWD |

**Verdict (3): PASS** (code + skill prose contract). Residual risk: skill compliance still depends on Antigravity following SKILL.md (instruction, not executable enforcement).

---

### 4. LoreRelay UI can turn Relay Mode ON/OFF

| Layer | Evidence |
| --- | --- |
| DOM | `webview/index.html` `#relay-toggle-btn` |
| Webview | click → `postMessage({ type: 'setAntigravityRelayMode', enabled: !… })`; labels via `webview.relay.toggle.on` / `.off` (`Antigravity Relay ON` / `Relay OFF`) |
| Handler | `webviewHandlers.ts` case `setAntigravityRelayMode` |
| Host | `handleSetAntigravityRelayMode` updates real `textAdventure.antigravityRelay.enabled` |
| Banner / title | `webview.relay.banner.active` + `webview.relay.toggle.title` describe LoreRelay action → right `/text-adventure-gm` → same request; no automatic chat injection |

Focused test: message routes to injected `handleSetAntigravityRelayMode` with `[true, false]`.

**Verdict (4): PASS**

---

## Additional checks (requested)

### Generic 1/5 wizard suppression — skill instruction order

- Marker `## LoreRelay Antigravity Relay File Bridge (highest startup priority)` at **byte index 308** (well before setup section).
- Explicit: if valid request file → do **not** start genre/protagonist/tone/image setup wizard; process `playerAction`; write `turn_result.json` with `metadata.requestId`.
- If file absent/invalid → normal startup (1–5 questions) continues.

**PASS** as durable skill text in Git. **Not** a live Antigravity slash-command execution proof.

### Matching `requestId` only / mismatch before state mutation

`processTurnResultFileAtSerialized` (`gameStateSync.ts`):

1. Read pending request  
2. `validateTurnResultForPendingRelayRequest`  
3. On `!relayMatch.ok` → `{ kind: 'rejected', accepted: false }` **return**  
4. Only then lease / `preflightAcceptedTurn` / `processTurnResult`  
5. Clear pending only after successful apply, with matching `requestId`

Validator: matching metadata.requestId → ok; wrong/missing id → fail; no pending → ok (ordinary mode).

**PASS**

### Ordinary sync does not clear active request

Proven by unit path: validate + read leave file; only OFF / scenario / session / accepted-result clear.

**PASS**

### Relay OFF does not break normal GM path

When `antigravityRelay.enabled` is false, `handlePlayerInput` does **not** take the early relay return; continues to `invokeGmBridge` / clipboard fallback as before.

**PASS** (source control-flow review)

---

## Fresh tests (this machine)

| Command | Result | Notes |
| --- | --- | --- |
| `npm run compile` | **PASS** | webview build + `tsc` |
| `node scripts/test_antigravity_file_bridge.js` | **PASS** | After reinstalling skill from repo source; **FAIL** before if installed skill stale |
| `node scripts/test_antigravity_relay_core.js` | **PASS** | |
| `node scripts/check_i18n_keys.js` | **PASS** | 4 locales missing 0 |
| `npm run check:symbol-registry` | **FAIL** (working tree) | See §Test honesty |
| `npm test` / `node scripts/run_all_tests.js` | **229/231** | Not 231/231 |

### Failures (229/231)

1. **`test_symbol_registry.js`** — `generate_symbol_registry.js --check` reports stale files.  
   - `core.autocrlf=true` on this machine.  
   - Git blob is LF; working tree after checkout is CRLF.  
   - Generator output **content-equal** to git blob after LF normalization (hashes match).  
   - **Same `--check` failure on main `cc15320`** in another worktree → **pre-existing Windows/autocrlf environment issue**, not introduced by repair content.

2. **`test_antigravity_installer.js`** — nested `powershell.exe` path hits `Get-FileHash` / `Get-FileSha256` failure inside `install_common.ps1` during VSIX artifact hashing.  
   - Not part of the four prior REPAIR_REQUIRED items.  
   - Clean interactive `powershell.exe` can resolve `Get-FileHash`; suite path still fails here.  
   - Classified as **environment / installer harness** noise for this re-verify scope (not a regression of file-bridge host/skill durability).

### Expected 231/231

**Not reproduced.** Observed **229/231**. Repair doc’s “231/231” claim is **not independently confirmed** on this Windows agent host. Content of the two failures is not a reopen of the original four REPAIR_REQUIRED findings.

---

## What this review does **not** prove

- Live Antigravity process actually reading the request and skipping the wizard (skill is prose; no AG process harness).
- Multi-root VS Code folder selection vs Antigravity project root under all user launch modes (contract is explicit; runtime still operator-dependent).
- Full VS Code Extension Host UI click path for the Relay toggle (webview→handler seam unit-tested; panel not launched).

---

## Final judgment

The four REPAIR_REQUIRED blockers from `cf9f3b4` are **addressed in the repair candidate** with durable Git evidence and focused production-path tests:

1. Skill versioned + installer points at repo source; reinstall from checkout works.  
2. Pending request cleared on OFF / scenario / session; not on ordinary validate.  
3. `workspacePath` / `workspaceIdentity` shared on request + clipboard + skill.  
4. Visible Relay Mode toggle bound to real setting.

Suite claim **231/231 is not met here (229/231)** for environmental reasons documented above; those two failures also fail or noise outside the four-point repair scope.

**ANTIGRAVITY_RELAY_002_REPAIR_VERIFY_PASS**

(With explicit non-blocking residual: live Antigravity wizard suppression remains skill-instruction compliance; Windows autocrlf symbol-registry check + installer Get-FileHash suite path still fail on this host.)

---

## Commands / SHAs (audit)

```
verify HEAD: 2ffe79e9e0970984eb38d44c34fcce22c556bbe4  (until this doc commit)
main:        cc15320fce9ebc7a5b44ad1d7adfb9c534ac8982
failed:      cf9f3b43d42bbd0793d11c94e31998def8a98d9e
original:    33e652b690360f889d6543515846fb5afe07a9b4
branch out:  task/ANTIGRAVITY-RELAY-002-repair-verify
```
