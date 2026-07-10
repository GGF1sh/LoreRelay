# INSTALLER-RELEASE-001 Independent Verify

- **AI:** Grok  
- **Model:** Grok 4.5 (High)  
- **Role:** Narrow independent verification (no implementation changes, no merge)  
- **Date:** 2026-07-10 (JST)  
- **Worktree:** `C:\AI\wt-installer-release-001-verify` @ candidate `ee005c5`  
- **Scope:** INSTALLER-RELEASE-001 only — not a broad MEDIA-M1 review  

## Final verdict

```text
INSTALLER_RELEASE_001_VERIFY_PASS
```

---

## Integrity

| Item | Expected | Observed | Result |
| --- | --- | --- | --- |
| `origin/main` | `dca8ddf282360fcc192697a0a0f377292ac00bb2` | exact match | MATCH |
| Main tip subject | MEDIA-M1 post-merge installer blocker doc | `dca8ddf docs: record MEDIA-M1 post-merge installer blocker` | MATCH |
| Candidate branch | `task/INSTALLER-RELEASE-001-fallback-versioning` | present on origin | MATCH |
| Candidate tip | main + exactly 1 commit | `ee005c5f27c95348838526943eaf27e92f9c5939` | MATCH |
| Shape `main...candidate` | `0 1` (left-right) | `0 1` | MATCH |
| Main moved? | no | tip still `dca8ddf` at end of verify | NO |

Candidate subject:

```text
ee005c5 fix(installer): stop misreporting a successful Antigravity fallback as failed; bump to 1.78.0
```

### Candidate touch set (vs `origin/main`)

```text
CHANGELOG.md
README.md
README_en.md
README_zh-CN.md
README_zh-TW.md
docs/VERSION_TRUTH.md
docs/ai-tasks/INSTALLER-RELEASE-001-FALLBACK-VERSIONING.md
package-lock.json
package.json
scripts/install_vscode_extension.ps1
scripts/test_antigravity_installer.ps1
```

11 files, +370 / −13. Production installer logic change is a **one-line return seam** in `install_vscode_extension.ps1` (`return @($results)` → `return $results.ToArray()` + comment). `scripts/install_common.ps1` is **unchanged**. No broad installer redesign. MEDIA-M1 production sources not touched.

---

## 1. Version transition

| Check | Expected | Observed | Result |
| --- | --- | --- | --- |
| `package.json` | `1.78.0` | `1.78.0` | PASS |
| `package-lock.json` root | `1.78.0` | `1.78.0` | PASS |
| `package-lock.json` `packages[""]` | `1.78.0` | `1.78.0` | PASS |
| README badges (`README.md`, `_en`, `_zh-CN`, `_zh-TW`) | `version-1.78.0` | all four match | PASS |
| CHANGELOG first release | `[1.78.0]` | `## [1.78.0] - 2026-07-10` (after `[Unreleased]`) | PASS |
| `docs/VERSION_TRUTH.md` | `1.78.0` | package.json row + 現行 table | PASS |

`node scripts/check_version_consistency.js` on candidate:

```text
OK: package.json version 1.78.0
OK: package-lock.json root version matches
OK: package-lock.json packages[""] version matches
OK: README.md badge matches
OK: README_en.md badge matches
OK: README_zh-CN.md badge matches
OK: README_zh-TW.md badge matches
OK: VERSION_TRUTH.md package.json row matches
OK: CHANGELOG.md first release matches
All version consistency checks passed.
```

---

## 2. Historical correctness

| Claim | Evidence | Result |
| --- | --- | --- |
| `1.77.15` introduced 2026-07-04 | `0de2ef3` — `2026-07-04 22:56:51 +0900` — `v1.77.15: Debug Trace retention, coalesce, live run, test manifest` | PASS |
| Pre-candidate main still reports `1.77.15` | `origin/main` `package.json` = `"1.77.15"`; `VERSION_TRUTH` table = **1.77.15** | PASS |
| Candidate establishes new version identity | main `1.77.15` → candidate `1.78.0` (minor bump for feature phase + installer repair co-release) | PASS |

CHANGELOG order confirms chronology: `[1.78.0] - 2026-07-10` then `[1.77.15] - 2026-07-04`.

---

## 3. PowerShell root cause

### Independent reproduction (this verify host)

Host: Windows PowerShell 5.1 (`powershell.exe`, `$PSVersionTable.PSVersion` = `5.1.26100.8737`).

Minimal probe:

```powershell
$probe = New-Object 'System.Collections.Generic.List[object]'
[void]$probe.Add([pscustomobject]@{ Ok = $true; Path = 'A' })
[void]$probe.Add([pscustomobject]@{ Ok = $true; Path = 'B' })
[void]$probe.Add([pscustomobject]@{ Ok = $true; Path = 'C' })
@($probe)            # throws
$probe.ToArray()     # succeeds, Count = 3
```

| Case | Result |
| --- | --- |
| `List[object]` + `@()` | **`System.ArgumentException`** (message locale-dependent: English *Argument types do not match* / Japanese *引数の型が一致しません*) |
| `List[object]` + `.ToArray()` | succeeds; preserves 3 elements |
| `List[string]` + `@()` | **not affected** — succeeds |

### Production seam

Diff of `scripts/install_vscode_extension.ps1` vs main is exclusively:

```diff
- return @($results)
+ # NOTE: do not use @($results) here. ... Argument types do not match ...
+ return $results.ToArray()
```

`finally { Remove-PreparedVsixInstallContent ... }` and the rest of the fallback loop are unchanged. No unrelated fallback orchestration changes in `Invoke-PrimaryInstallWithFallback` (`install_common.ps1` untouched).

### Focused test evidence

`scripts/test_antigravity_installer.ps1` assertion block D:

- asserts `@(List[object])` throws **`System.ArgumentException`** (type-based, locale-safe)
- asserts `.ToArray()` preserves all appended elements and does not throw

Observed on this host: both PASS.

---

## 4. Primary / fallback behavior

Verified by production control flow (`Invoke-PrimaryInstallWithFallback`) + expanded regression tests A–C and install-script zero-target throw. Mapping to required cases:

| Case | Required | Evidence | Result |
| --- | --- | --- | --- |
| **A** | primary fails + 1 fallback success → overall success | test A: `PrimaryAvailable $false` + one `List[object].ToArray()` result → `FallbackSucceeded` | PASS |
| **B** | primary fails + 3 fallback successes → overall success | test B: CLI throw + 3 synthetic targets → `FallbackSucceeded`, `Result.Count = 3` | PASS |
| **C** | primary fails + fallback failure → overall failure with both errors | test C: throw join contains both `synthetic CLI failure` and `synthetic fallback failure` | PASS |
| **D** | zero discovered fallback targets → failure | production: empty `$fallbackDirs` throws `No Antigravity extension directories discovered for direct-folder fallback.` (lines 121–122) | PASS (code) |
| **E** | successful fallback keeps primary error only as warning | `install_vscode_extension.ps1` on `FallbackSucceeded`: `Write-Warning $PrimaryError` + `$errors.Add`; test B retains `PrimaryError` | PASS |

Note: test file labels D/E also cover List[object] root-cause pins and version identity; required behavioral D (zero targets) is the production throw above.

---

## 5. Atomic install safety

| Concern | Observation | Result |
| --- | --- | --- |
| Prepared content cleanup | `try { ... return ToArray() } finally { Remove-PreparedVsixInstallContent }` still present around multi-target loop | PASS |
| Real target failure still fails | `Install-PreparedExtensionToDirAtomic` catch path rolls back stage/dest and restores backups; uncaught throws surface via fallback action → overall failure path C | PASS |
| Successful copies not rolled back because aggregation fails | Pre-fix `@($results)` threw **after** per-dir `Install-PreparedExtensionToDirAtomic` succeeded — false overall failure. `.ToArray()` removes that post-success throw without changing per-target commit semantics | PASS |
| No broad redesign | `install_common.ps1` diff empty; only return seam + tests + version/docs | PASS |

Existing atomic assertions in the same test file still pass (invalid archive abort, rollback on replacement failure, successful replacement).

---

## 6. Versioning rule

`docs/VERSION_TRUTH.md` durable policy (INSTALLER-RELEASE-001):

| Rule | Present | Practical? |
| --- | --- | --- |
| patch for repair-only release | yes (e.g. 1.78.0 → 1.78.1) | yes |
| minor for backward-compatible feature phase | yes (e.g. 1.77.15 → 1.78.0) | yes — this candidate |
| every new human-smoke candidate has newer version identity | yes | yes — prevents same-version different VSIX |
| docs-only commits need no bump | yes | yes |

Separation of duties:

- **`check_version_consistency.js`** — still verifies **numeric consistency** across package / lock / badges / CHANGELOG / VERSION_TRUTH (ran: all OK).
- **VERSION_TRUTH policy** — decides **when** to bump (freshness / release class); checker does not encode that policy.

---

## 7. Tests

Worktree: `C:\AI\wt-installer-release-001-verify` @ `ee005c5`.

| Command | Result |
| --- | --- |
| `npm run compile` | PASS (webview build + `tsc -p ./`) |
| `node scripts/check_version_consistency.js` | PASS (all rows) |
| Installer-focused: `powershell.exe -File scripts/test_antigravity_installer.ps1` | PASS (all assertions incl. A–G / root-cause D) |
| Installer-focused: `node scripts/test_antigravity_installer.js` | PASS under clean Windows PowerShell `PSModulePath` |
| `npm test` | **235/235** PASS |

### Host note (not a candidate defect)

Under this verifier’s parent shell (PowerShell 7-preview), child `powershell.exe` 5.1 inherited a PS7-polluted `PSModulePath`, which can make `Get-FileHash` fail to resolve until `PSModulePath` is set to the Desktop 5.1 module path. With:

```text
PSModulePath=...\WindowsPowerShell\Modules;...\WindowsPowerShell\v1.0\Modules
```

`npm test` reports **Passed: 235/235**. Without that cleanup the same suite was **234/235** solely on `[unit] test_antigravity_installer.js` / `Get-FileHash` — environment noise class seen on prior verifies, **not** caused by the INSTALLER-RELEASE-001 return-seam fix. Root-cause List[object] assertions still pass on the same host either way when the hash path is reachable.

Suite was not re-run after the successful 235/235 run.

---

## Residual / non-blockers

1. **Zero-target fallback (required case D)** is enforced in production script throw, not a dedicated synthetic unit case labeled “D” in the test file (test “D” is the List[object] repro). Acceptable: production path is clear and zero dirs cannot succeed.
2. **Human smoke** of a real Antigravity multi-folder install was not re-executed end-to-end on physical IDE roots in this verify; behavior is covered by production control flow + synthetic multi-target aggregation tests.
3. **MEDIA-M1** not re-reviewed (out of scope).

---

## Verdict rationale

- Main identity stable at expected SHA; candidate is exactly one commit on top.  
- Version identity consistently `1.78.0`; historical `1.77.15` (2026-07-04) and pre-candidate main remain correct.  
- PowerShell 5.1 root cause independently reproduced; fix is the minimal `.ToArray()` seam; `List[string]` unaffected.  
- Primary/fallback A–E behaviors supported by tests and production code.  
- Atomic cleanup / failure / no post-success aggregation false-fail preserved; no redesign.  
- Version policy + consistency checker both present and coherent.  
- Compile, version check, installer-focused tests, and **235/235** full suite PASS.

```text
INSTALLER_RELEASE_001_VERIFY_PASS
```
)
