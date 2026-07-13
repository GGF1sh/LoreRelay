# INSTALLER-BOOTSTRAP-HERMETIC-FIXTURE-001 — Independent Verification

| Field | Value |
|------|--------|
| Prompt timestamp | `2026-07-14 01:40:33 JST (Asia/Tokyo)` |
| Task | Independent adversarial verification of `INSTALLER-BOOTSTRAP-HERMETIC-FIXTURE-001` |
| Verifier worktree | `C:\AI\wt-installer-bootstrap-hermetic-fixture-001-independent-verify` |
| Verification branch | `task/INSTALLER-BOOTSTRAP-HERMETIC-FIXTURE-001-independent-verify` |
| Mode | Read-only vs candidate implementation; report-only commit; no main push |

## Final verdict

**`INSTALLER_BOOTSTRAP_HERMETIC_FIXTURE_001_VERIFY_PASS`**

---

## 1. Identity and lineage (fail-closed)

| Check | Required | Observed | Result |
|------|----------|----------|--------|
| Current main | `da11e836c6e44a796e43ae12da44224bfcb1171c` | `da11e836c6e44a796e43ae12da44224bfcb1171c` | PASS |
| Main version | `1.82.3` | `1.82.3` | PASS |
| Candidate tip | `fd02e0a219d0ba96ba58f0e39a1bb5711462feea` | exact match | PASS |
| Candidate base | `da11e836c6e44a796e43ae12da44224bfcb1171c` | parent of first candidate commit | PASS |
| Ahead / behind | 2 ahead, 0 behind | `git rev-list --left-right --count` → `0 2` | PASS |
| Merge commits | none | linear parent chain | PASS |
| Verify branch base | exact candidate tip | `HEAD = fd02e0a…` | PASS |

### Exact candidate commit lineage

| # | Full SHA | Parent | Subject |
|---|----------|--------|---------|
| base | `da11e836c6e44a796e43ae12da44224bfcb1171c` | — | (current main) |
| 1 | `8dcf4979909de008b5a829567f330f64c82f2b4b` | `da11e83…` | `test: make installer Git fixture branch-hermetic` |
| 2 | `fd02e0a219d0ba96ba58f0e39a1bb5711462feea` | `8dcf497…` | `docs: record installer bootstrap fixture repair` |

---

## 2. Changed-file scope and production-change status

```text
git diff --name-status da11e83…fd02e0a
M  scripts/test_helpers/local_installer_git_fixture.js
A  docs/ai-tasks/INSTALLER-BOOTSTRAP-HERMETIC-FIXTURE-001.md
```

| Expectation | Result |
|-------------|--------|
| Exactly helper + durable report | **PASS** |
| Production source / BAT / package / locales / webview | **none changed** |
| Version remains `1.82.3` | **PASS** (no release-truth bump) |

**Production-change status: none.**

---

## 3. Static topology review (`local_installer_git_fixture.js`)

### Isolation

| Claim | Evidence | Verdict |
|------|----------|---------|
| Fresh bare origin under unique temp dir | `fs.mkdtempSync(...'lorerelay-installer-hermetic-')` + `git init --bare bareOrigin` | **PASS** |
| No network-addressable remote | remotes are absolute local paths; `assertLocalRemotes` rejects `https?://`, `ssh://`, `git@`, `github.com` | **PASS** |
| Does not use real `origin/main` | fixture clones only the local bare path | **PASS** |
| Does not mutate real repo branch / symbolic HEAD | all writes target `tempRoot` paths; bootstrap test asserts caller fixture source branch/HEAD/status unchanged | **PASS** |
| Only required baseline commit is authoritative fixture main | `git push bareOrigin ${candidateSha}:refs/heads/main` then assert `rev-parse refs/heads/main === candidateSha` | **PASS** |
| Bare `HEAD` explicitly symbolic | `git symbolic-ref HEAD refs/heads/main` + assert symbolic-ref output | **PASS** (not detached, not inherited multi-branch HEAD) |

### Contrast with prior defective pattern

| Before (main) | After (candidate) |
|---------------|-------------------|
| `git clone --bare testRoot bareOrigin` (imports all local branches + contextual HEAD) | `git init --bare` + explicit single-ref push of `candidateSha` to `refs/heads/main` |
| Updater `push origin HEAD:main` could non-FF if inherited HEAD ≠ main ancestry | Updater clones bare default (now symbolic main), asserts HEAD === oldMain, commits child of oldMain, normal FF push |

### Updater ancestry

| Claim | Evidence | Verdict |
|------|----------|---------|
| Updater checks out current fixture main | `git clone bareOrigin updater` after symbolic HEAD → main; assert `updater HEAD === oldMain` | **PASS** |
| `oldMain` captured from bare before mutation | `oldMain = rev-parse refs/heads/main` on bare before commit | **PASS** |
| Updater HEAD equals oldMain before mutation | strict assert before marker write | **PASS** |
| New commit direct parent is oldMain | `rev-parse HEAD^ === oldMain` | **PASS** |
| Push is normal FF (no force) | `git push origin HEAD:main` with no `--force` / `+` | **PASS** |
| Bare main equals new SHA after push | re-read bare `refs/heads/main === newSha` | **PASS** |
| Updater directory removed | `fs.rmSync(updater)` + `existsSync === false` assert | **PASS** |

### Source / managed-worktree safety

| Claim | Evidence | Verdict |
|------|----------|---------|
| Source may detach | `checkout --detach candidateSha` after proving `origin/main` | **PASS** |
| Source branch/HEAD/dirty unchanged by bootstrap exercise | `test_antigravity_installer_bootstrap.js` captures before/after | **PASS** (executable) |
| Managed worktree reaches exact fetched fixture main | bootstrap asserts `managed HEAD === mainSha` then `=== updatedMainSha` after real BAT fetch | **PASS** |
| Invalid path / invalid ref / offline-origin | still asserted in bootstrap test; `withOfflineOrigin` renames bare dir | **PASS** |
| Cleanup removes managed worktree + temp universe | `worktree remove --force` + `rmSync(tempRoot)` | **PASS** |
| No network credential prompt / long-lived process | `GIT_TERMINAL_PROMPT=0`, proxy env stripped, `spawnSync` with timeouts | **PASS** |

### Actual BAT still exercised

`scripts/test_antigravity_installer_bootstrap.js` still invokes:

```js
fixture.run('cmd.exe', ['/c', fixture.batPath], {
  env: {
    LORERELAY_INSTALLER_WORKTREE: target,
    LORERELAY_INSTALLER_REF: ref,
    LORERELAY_BOOTSTRAP_PREPARE_ONLY: '1',
    ...
  }
});
```

with `fixture.batPath = path.join(source, 'install_extension_antigravity.bat')`.

`install_extension_antigravity.bat` remains production BAT (`git fetch origin`, managed worktree add/reset). **Not mocked.**

### Test-quality assessment

Assertions re-query Git state from the bare origin / updater / source after operations (`rev-parse`, `symbolic-ref`, `existsSync`), rather than only comparing helper-local variables to themselves. Topology matrix (below) independently re-reads bare/source/managed state outside the bootstrap script. Combined with real BAT execution, this proves real topology, not a self-asserting mock.

---

## 4. Candidate claim checklist (1–11)

| # | Claim | Verdict |
|---|-------|---------|
| 1 | Fresh bare via `git init --bare` | **PASS** |
| 2 | Push exact `candidateSha` to `refs/heads/main` | **PASS** |
| 3 | Set bare HEAD symbolically to `refs/heads/main` | **PASS** |
| 4 | Verify bare main equals exact candidate SHA | **PASS** |
| 5 | Clone fixture source from deterministic main | **PASS** |
| 6 | Detach source only after origin/main proven | **PASS** |
| 7 | Updater begins from current fixture main | **PASS** |
| 8 | Updater commit direct parent is old fixture main | **PASS** |
| 9 | Normal fast-forward push | **PASS** |
| 10 | Bare fixture main equals new SHA | **PASS** |
| 11 | No updater directory after completion | **PASS** |

---

## 5. Focused executable verification

Environment note (host-only, **not** a candidate defect):

- Node spawns `powershell.exe` (Windows PowerShell 5.1) for `test_antigravity_installer.js` / skill installer tests.
- When the parent shell injects PowerShell 7-preview module paths into `PSModulePath`, Desktop PS 5.1 cannot resolve `Get-FileHash`.
- Focused PowerShell-dependent tests were re-run with a cleaned Windows PowerShell-only `PSModulePath`. Bootstrap fixture tests are pure Node/Git and unaffected.

### Commands (all exit 0)

```powershell
npm ci
npm run compile
node scripts/test_antigravity_installer_bootstrap.js
node scripts/test_antigravity_installer.js
node scripts/test_antigravity_skill_installer.js
node scripts/check_version_consistency.js
node scripts/validate_utf8_docs.js
```

| Command | Exit |
|---------|------|
| `npm ci` | 0 |
| `npm run compile` | 0 |
| `test_antigravity_installer_bootstrap.js` | 0 |
| `test_antigravity_installer.js` | 0 |
| `test_antigravity_skill_installer.js` | 0 |
| `check_version_consistency.js` | 0 |
| `validate_utf8_docs.js` | 0 |

Focused log:

`C:\AI\logs\installer-bootstrap-hermetic-fixture-001-independent-verify-focused.log`

### 10 consecutive bootstrap runs

| Metric | Result |
|--------|--------|
| Runs | 10 |
| Failures | **0** |
| Residual new `lorerelay-installer-hermetic-*` temp dirs after suite | **0** |
| Residual managed fixture worktrees | **0** (each run cleans `tempRoot`) |
| Network-accessible remotes | none observed (local bare absolute paths only) |

**10/10 PASS.**

---

## 6. Independent four-case topology matrix

Executed in isolated temporary **caller** repositories only (never real LoreRelay main). Harness used candidate `createLocalInstallerGitFixture` and independently verified invariants.

| Case | Caller state | Result |
|------|--------------|--------|
| 1 | Symbolic HEAD on `main` | **PASS** |
| 2 | Symbolic HEAD on orphan `task/unrelated-topo` (main not ancestor) | **PASS** — fixture main = that tip, not caller main |
| 3 | Detached HEAD | **PASS** |
| 4 | Local main advances after fixture creation | **PASS** — fixture bare main stays at creation baseline until updater FF |

In every case verified:

- fixture bare HEAD → `refs/heads/main`
- initial fixture main = exact selected baseline (`rev-parse HEAD` of caller at create time)
- updater starts at fixture main
- updater commit parent = previous fixture main
- push fast-forwards fixture main
- source fetch observes updated main
- managed worktree reaches exact updated SHA
- caller repository state remains as expected (unchanged for cases 1–3; case 4 remains at advanced tip without fixture bleed)

---

## 7. Raw candidate full-suite classification (not re-run for failure reproduction)

| Check | Result |
|------|--------|
| Candidate changes `scripts/test_runtime_accepted_replay_guard.js`? | **No** (empty diff vs main) |
| Candidate changes `src/acceptedTurnReplayGuard.ts`? | **No** |
| Historical nondeterministic assertions still present at candidate tip? | **Yes** — still asserts `two-process stale takeover has exactly one winner` and `two-process empty workspace acquisition has exactly one winner` |
| Writer-lease repair `e8ca1a15…` on candidate tip? | **No** (`merge-base --is-ancestor` fails) |
| Writer-lease repair `e8ca1a15…` on current main? | **No** |

Therefore the historical raw full-suite failure is **independent of the installer helper delta**.

Honest prior raw result (from candidate durable report / known history; not re-executed solely to re-fail):

- **248/249**
- only `test_runtime_accepted_replay_guard.js` failed
- installer bootstrap test itself **passed**

This verification does **not** classify that known unchanged failure as an installer-candidate defect.

Known writer-lease repair identity:

| Role | SHA |
|------|-----|
| Executable test repair only | `e8ca1a15e354ace2b3a848979c1fc135ab96fef3` |
| Repair report tip | `6c1c2fbb270732d099fa60be0119d87aed31c504` |
| Independent verify report | `3f614b7ba0cb43ebbcea3f46b4f9f16810508617` |

---

## 8. Disposable composite full-suite validation

### Method

1. Disposable worktree at exact candidate tip `fd02e0a…`:  
   `C:\AI\wt-installer-bootstrap-hermetic-fixture-001-composite-validation` (detached HEAD).
2. Uncommitted apply of verified writer-lease test repair only:

   ```powershell
   git cherry-pick --no-commit e8ca1a15e354ace2b3a848979c1fc135ab96fef3
   ```

3. Preconditions checked before `npm test`:
   - no commit created
   - no branch pushed
   - dirty file set: only `scripts/test_runtime_accepted_replay_guard.js`
   - no production file changes
   - package version still `1.82.3`
   - working blob hash matched repair blob:  
     `921f8d0484f1bb0614f5563066e5c3e184c2908a` === `e8ca1a15…:scripts/test_runtime_accepted_replay_guard.js`
4. Ran once:

   ```powershell
   npm ci
   npm run compile
   npm test
   ```

5. After validation: `git reset --hard`, worktree removed with `git worktree remove --force`.  
   Confirmed: composite path gone; no composite branch/ref remains; real `main` still `da11e83…`.

### Composite result

| Metric | Result |
|--------|--------|
| Manifest scripts | 249 |
| Passed | **249/249** |
| Failed scripts | **0** |
| Exit code | **0** |
| Installer bootstrap test | **PASS** (in-suite) |
| Corrected writer-lease test (`test_runtime_accepted_replay_guard.js`) | **PASS** (in-suite) |
| Duration | ~143.2s |

Log:

`C:\AI\logs\installer-bootstrap-hermetic-fixture-001-independent-verify-composite-full-suite.log`

---

## 9. Impact-test selection rationale

| Surface | Why selected / skipped |
|---------|------------------------|
| `local_installer_git_fixture.js` + `test_antigravity_installer_bootstrap.js` | **Changed dependency surface** — hermetic origin topology and BAT prepare-only bootstrap |
| `test_antigravity_installer.js` / skill installer / install-chain (in full suite) | Adjacent installer harness sharing fixture helper patterns / BAT chain |
| Adversarial topology matrix | Proves independence from caller branch/HEAD inheritance |
| 10× bootstrap | Stability under repeated temp Git universe create/destroy |
| Composite full suite once | Combines two independently scoped **test-harness** repairs (installer fixture + writer-lease) without integrating production |
| UI / simulation-as-focused-primary / economy / OCR / media / gameplay | **Not focused dependencies** of this helper-only change (simulation still ran only inside the single composite full suite) |
| Raw full suite alone on raw candidate | Known to fail only on unchanged historical writer test — not re-run solely to re-obtain that failure |

### Skipped domains (as focused work)

- UI/webview polish, i18n race, Relay banner recovery  
- Simulation soak / economy profiles (except as part of composite full suite)  
- OCR / Comfy / media generation  
- Live installer / human smoke  
- Writer-lease production redesign (explicitly out of scope)

---

## 10. Version decision

| Item | Value |
|------|-------|
| Candidate package version | **1.82.3** (unchanged) |
| Release-truth bump required for this candidate? | **No** — test helper + docs only |
| Integration note | When integrating with other unmerged 1.82.3-content candidates (e.g. debug-sandbox), resolve same-version/different-content via **1.82.4+** at integration time — not required by this helper-only delta alone |

---

## 11. Limitations

- PowerShell-dependent installer unit tests require a Windows PowerShell-compatible `PSModulePath` when the host shell has PowerShell 7-preview module pollution (host environment, not candidate code).
- Composite full suite applied writer-lease repair **uncommitted** in a disposable worktree; it does not integrate that repair into the candidate branch or main.
- Live installer, managed installer checkout, installed extension, and live world were **not** exercised.
- Human smoke was **not** performed.
- This report does not approve merging without normal integration hygiene (Graphite/branch policy, collision with other candidates, etc.).

---

## 12. Safety confirmations

| Surface | Status |
|---------|--------|
| `main` | **Untouched** (still `da11e83…`) |
| Live installer run | **Not performed** |
| Managed installer checkout | **Untouched** |
| Installed extension files | **Untouched** |
| Live world | **Untouched** |
| Human smoke | **None** |
| Candidate implementation | **Not modified** |
| Composite commit/ref/push | **None remaining** |
| Verification push target | only `task/INSTALLER-BOOTSTRAP-HERMETIC-FIXTURE-001-independent-verify` |

---

## 13. Final verdict (repeat)

### `INSTALLER_BOOTSTRAP_HERMETIC_FIXTURE_001_VERIFY_PASS`

All PASS gates satisfied:

- scope = helper + report only; no production change  
- deterministic bare main + symbolic HEAD  
- updater direct-parent + fast-forward proof  
- actual BAT exercised  
- focused tests exit 0  
- 10/10 bootstrap  
- 4/4 topology matrix  
- raw writer-lease failure proven unrelated/unchanged  
- disposable composite full suite **249/249** exit 0  
- composite state discarded with no leftover ref/push  

No repairs implemented during verification. No main push.
