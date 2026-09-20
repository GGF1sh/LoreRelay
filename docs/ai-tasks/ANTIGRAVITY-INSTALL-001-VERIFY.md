# ANTIGRAVITY-INSTALL-001 — Independent Verify

- AI: Claude
- Model: Claude Sonnet 5
- Reasoning: High
- Role: Independent verifier for ANTIGRAVITY-INSTALL-001
- Repository: `C:\AI\text-adventure-vsce` (`https://github.com/GGF1sh/LoreRelay`)
- Exact current main baseline: `176cd5f050a19cb09e70006af7f7760921d5dd8b`
- Candidate branch: `task/ANTIGRAVITY-INSTALL-001-vsix-integrity`
- Exact candidate commit: `3cb51a31b173ac511b6d9522e03a405a867b665b`
- Read: `docs/AI_INTEGRATOR_CHAT_HANDOFF.md`, `docs/AI_EXPLORATION_BUDGET_POLICY.md`, `docs/ai-tasks/ANTIGRAVITY-INSTALL-001-IMPLEMENTATION.md`

No claim here is derived from trusting the Codex implementation report. Every claim was re-derived from fresh `git` output, direct code reading, and fresh command execution on the candidate commit.

## Branch relation and exact touch set

```
git rev-parse origin/main                                                       -> 176cd5f050a19cb09e70006af7f7760921d5dd8b
git rev-parse origin/task/ANTIGRAVITY-INSTALL-001-vsix-integrity                -> 3cb51a31b173ac511b6d9522e03a405a867b665b
git merge-base <candidate> <main>                                               -> 176cd5f050a19cb09e70006af7f7760921d5dd8b
git merge-base --is-ancestor <main> <candidate>                                 -> true
git log --oneline main..candidate                                              -> 3cb51a3 Repair Antigravity VSIX installer integrity (1 commit)
git log --oneline candidate..main                                              -> (empty)
```

Exactly **1 commit ahead, 0 behind** current main, matching the expected relation.

Exact six-file touch set (`git diff main candidate --stat`):

```
docs/ai-tasks/ANTIGRAVITY-INSTALL-001-IMPLEMENTATION.md | 133 +++++
scripts/install_common.ps1                              | 322 +++++++++++++++++++--
scripts/install_vscode_extension.ps1                    |  71 ++---
scripts/run_all_tests.js                                |   1 +
scripts/test_antigravity_installer.js                   |  26 ++
scripts/test_antigravity_installer.ps1                  | 147 ++++++++++
```

No webview module, `extension.ts`, `gmPromptBuilderCore.ts`, or locale file appears in the diff — no Relay behavior or unrelated product code was touched.

## 1. VSIX preflight safety — confirmed in `install_common.ps1`

`Test-VsixPackageIntegrity` (new function) checks, in order:
- non-empty: `if ($item.Length -le 0) { throw "VSIX is empty..." }`
- ZIP-openable: `[System.IO.Compression.ZipFile]::OpenRead($VsixPath)` wrapped in try/catch, rethrown as `"VSIX archive validation failed: ..."`
- required entries loop over `'[Content_Types].xml'`, `'extension.vsixmanifest'`, `'extension/package.json'` — throws `"VSIX archive is missing required entry: $required"` if any absent (checked with both `/` and `\` separators)
- `extension/package.json` parsed via `Read-ZipEntryTextUtf8` + `ConvertFrom-Json`; missing/unparseable throws
- version presence checked (`if (-not $packageVersion) { throw ... }`) and compared to `$ExpectedVersion` if supplied
- extension ID derived from `publisher.name` (`Get-ExtensionIdentityFromPackage`) and compared to `$ExpectedExtensionId` if supplied
- returns a report object including `Sha256 = Get-FileSha256 -Path $item.FullName` (real `Get-FileHash -Algorithm SHA256`)

All eight required checks are present and in a fail-fast order (identity/version checks only run after the archive and entries are proven valid).

## 2. Canonical VSIX isolation — confirmed in `install_common.ps1` / `install_vscode_extension.ps1`

`Invoke-VsixCliInstallIsolated`:
- computes `originalHashBefore` on the canonical path,
- copies to a new GUID-named temp file and hashes it (`tempHashBefore`),
- invokes the CLI **on the temp copy only**: `& $CliPath --install-extension $tempVsixPath --force` (never `$VsixPath`),
- recomputes `originalHashAfter` in a `finally` block and throws `"Canonical VSIX hash changed across CLI attempt"` if it differs from `originalHashBefore`.

`install_vscode_extension.ps1`'s `Install-VsixViaCli` was rewritten to call `Invoke-VsixCliInstallIsolated` instead of invoking the CLI directly on `$VsixPath` (confirmed by diff: the old code passed `$VsixPath` straight to `--install-extension`; the new code only ever passes `$cliReport.TempCopyPath`, which is removed afterward in `finally`).

## 3. Atomic folder install — confirmed in `install_common.ps1` (`Install-VsixToDirDirectAtomic`)

Exact order in the new function: preflight validate (`Test-VsixPackageIntegrity`) → extract to a **temp** dir (`Expand-ArchiveSafe -DestDir $extractDir`, not the target) → validate extracted `extension/package.json` id+version (`Get-ExtractedExtensionPackageInfo`) → stage a full copy under `.{targetDirName}.staging-<guid>` inside the target dir → **only then** move any existing `$ExtensionId-*` directories into `.{ExtensionId}.backup-<guid>` → `Rename-Item` the staging dir to the final name (atomic promote, `$promoted = $true`) → remove the backup dir **only after** promotion succeeds.

This directly repairs the old `install_vscode_extension.ps1::Install-VsixToDirDirect`, which the diff shows **deleted** any existing `$ExtensionId-*` directory as its very first action, before any extraction or validation — confirmed by reading the pre-image of that function in the diff (`Get-ChildItem ... | Remove-Item` runs before `Expand-ArchiveSafe` is even called). The new code no longer contains that function at all; `install_vscode_extension.ps1::Install-VsixToDirDirect` is now a thin delegate to `Install-VsixToDirDirectAtomic`.

Rollback (`catch` block of `Install-VsixToDirDirectAtomic`): if promotion already happened but a later step fails, removes the promoted `destDir`; if not yet promoted, removes the staging dir; for every moved-existing entry whose original path is now missing, moves it back from backup to its original path; removes the backup dir; rethrows. This satisfies "rollback restores prior install on failure" and "backup removed only after success" (success path removes backup right after promote; failure path restores originals then removes the now-empty backup dir).

## 4. Primary extraction failure — confirmed

`Expand-ArchiveSafe` now wraps `[System.IO.Compression.ZipFile]::ExtractToDirectory` in try/catch and throws `"Archive extraction failed: $($_.Exception.Message)"` immediately on any failure. Because `Install-VsixToDirDirectAtomic` calls `Expand-ArchiveSafe` **before** `Get-ExtractedExtensionPackageInfo` (the function that throws the `'extension' directory not found`/`'extension/package.json' not found` diagnoses), a real archive corruption now terminates at the primary extraction error and structurally cannot reach the secondary "directory not found" message — the code path that produced it is never executed once extraction itself throws.

## 5. Existing-install preservation — freshly proven by rerunning the focused test

`node scripts/test_antigravity_installer.js` (fresh run on the candidate checkout, PowerShell subprocess, real filesystem):
- created a real fake existing install (`miya.lorerelay-1.70.0` with a `package.json` and a `marker.txt`),
- attempted `Install-VsixToDirDirectAtomic` with a **byte-truncated real ZIP** (not a flag/mock) as the source,
- asserted the invalid archive aborted the install, and both the fake install's directory and its `marker.txt` survived unchanged;
- separately created a second fake existing install, then called the same function with a valid synthetic VSIX but `-PreCommitHook { throw 'simulated replacement failure' }` (a real hook parameter of the production function, invoked after staging+backup, before rename) — asserted the failure surfaced and the **old version directory was restored with its correct `package.json` version (`1.70.0`)**.

Both properties were proven fresh in this session, not reused from the implementation report.

## 6. Real package — built fresh from the candidate

Ran `npx @vscode/vsce package --baseContentUrl ... --baseImagesUrl ... --out <scratch>/lorerelay-verify-1.77.15.vsix` directly on the candidate checkout (`vscode:prepublish` ran `npm run compile` first, which passed). Packaging succeeded: `12024 files, 76.47 MB` reported by `vsce`.

Independently inspected the produced VSIX with `unzip` and Node (not by trusting `vsce`'s own report, and without re-invoking the PowerShell preflight function directly, since a sandbox policy denial blocked running an ad-hoc PowerShell script with `-ExecutionPolicy Bypass` outside the repo's own named test files — the same property was instead cross-checked with independent non-PowerShell tools):

| Field | Value |
| --- | --- |
| Exact size | `80185568` bytes |
| SHA-256 | `ecc063a831227c4fdb6bc5c4947901f09c79e89de92b7041469fa810cc888d69` |
| ZIP central directory | opens; `unzip -l` lists `[Content_Types].xml`, `extension.vsixmanifest`, `extension/package.json` |
| Package version (from `extension/package.json`) | `1.77.15` — matches repository `package.json` |
| Extension ID (`publisher.name`, lowercased) | `miya.lorerelay` |

This independently corroborates the same fields `Test-VsixPackageIntegrity` computes and checks (size, hash, entry presence, version, ID); the function's own pass/fail behavior for these exact checks was separately proven by the focused PowerShell test (`OK: valid VSIX passes preflight`, `OK: truncated VSIX fails preflight before install mutation`).

No new destructive live install (CLI or direct-folder replace against the real Antigravity extension directories) was performed for this verify — the existing durable live-install evidence in the implementation doc plus this fresh non-destructive packaging/preflight check and the fresh focused-test rerun were sufficient to prove every required claim.

## Focused-test grounding (not a self-asserting fake)

`scripts/test_antigravity_installer.js` is a 26-line Node wrapper that `spawnSync`s `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/test_antigravity_installer.ps1` and forwards stdout/stderr/exit code — it does not itself assert anything.

`scripts/test_antigravity_installer.ps1` dot-sources the real production file (`. (Join-Path $PSScriptRoot 'install_common.ps1')`) and calls the actual exported functions directly: `Test-VsixPackageIntegrity`, `Invoke-VsixCliInstallIsolated`, `Install-VsixToDirDirectAtomic`. It builds a genuine ZIP via `[System.IO.Compression.ZipFile]::CreateFromDirectory`, corrupts it by truncating real bytes (`$bytes[0..126]`), and drives a real fake CLI (`fake-antigravity.cmd`) that appends `.mutated` to its own second argument (the isolated temp copy path) to adversarially prove the canonical file is untouched while the temp copy legitimately can change. This is genuine production-code exercise, not a self-asserting fixture.

## Commands — rerun fresh on candidate commit `3cb51a3` (detached-HEAD checkout)

| Command | Result |
| --- | --- |
| `node scripts/test_antigravity_installer.js` | PASS — 14/14 `OK` assertions, `Antigravity installer tests passed.` |
| `npm run compile` | PASS, exit `0` |
| `npm test` (first run) | `227/228` — `[unit] test_symbol_registry.js: exit 1` |
| `node scripts/test_symbol_registry.js` (direct) | Failed only on `generated files are current under --check`: reported committed `docs/generated/*` as stale |
| `npm run generate:symbol-registry` then re-check | `git diff --stat` on `docs/generated/*` = zero real lines changed; raw byte-count gap (`1737449` vs `1693625` = `43824`) exactly equals the file's CRLF count — confirms a pure `core.autocrlf=true` Windows-checkout EOL artifact, not real drift. This is the same pre-existing, already-documented tooling gap identified in the prior ANTIGRAVITY-RELAY-001 final verify (the `--check` script's raw string comparison is not EOL-normalized) and is unrelated to this candidate, which never touches `docs/generated/`. |
| `npm test` (after EOL normalization) | **228/228**, exit `0` |

## EOL-noise classification

- **Real content**: all six files in the candidate's own diff — genuine implementation changes, none EOL-only.
- **EOL-only, not real content**: the pre-existing `docs/generated/{SYMBOL_REGISTRY.md,symbol_registry.json}` CRLF-checkout false-positive above (zero-line `git diff`, byte gap == CRLF count) and the standing `webview/script.js` advisory (known issue 16.7). Neither originates from this candidate's own commit.

## Working tree cleanliness

After the two above EOL-affected files and `webview/script.js` were discarded (`git checkout --`), `git status --short` on the candidate checkout showed only the pre-existing untracked `.claude/` folder (known issue 16.8, predates this task) — no committed or staged unrelated noise. This review branch was created cleanly from `origin/main`.

## Blockers

None blocking. One informational, non-blocking, already-known tooling gap re-confirmed: `scripts/generate_symbol_registry.js --check` (and therefore `test_symbol_registry.js`) is not EOL-normalized and will report false staleness on a bare Windows checkout before any local `--write` has run — unrelated to the Antigravity Installer implementation itself.

# Final Verdict

`ANTIGRAVITY_INSTALLER_VERIFY_PASS`
