# ANTIGRAVITY-INSTALL-002 — Independent Verify

- AI: Claude
- Model: Claude Sonnet 5
- Reasoning: High
- Role: Independent verifier for ANTIGRAVITY-INSTALL-002, with special attention to the real everyday BAT entrypoint
- Repository: `C:\AI\text-adventure-vsce` (`https://github.com/GGF1sh/LoreRelay`)
- Exact current main baseline: `a90ba596c32d491af5d517295f39bba805e56558`
- Candidate branch: `task/ANTIGRAVITY-INSTALL-002-fast-install`
- Exact candidate commit: `e3208a342c0a684b0e749a90816535c0cb6c344f`
- Read: `docs/AI_INTEGRATOR_CHAT_HANDOFF.md`, `docs/AI_EXPLORATION_BUDGET_POLICY.md`, `docs/ai-tasks/ANTIGRAVITY-INSTALL-002-IMPLEMENTATION.md`

No claim below is derived from trusting the Codex implementation report. Every claim was re-derived from fresh `git` output, direct code reading, and fresh command/packaging execution against the candidate commit, performed entirely in a dedicated worktree (`C:\AI\wt-antigravity-install-002-fast-install`, pre-existing and already checked out to the exact candidate commit) so that the user's dirty root worktree at `C:\AI\text-adventure-vsce` was never touched, reset, cleaned, switched, or stashed.

## Branch relation and exact touch set

```
git rev-parse origin/main                                                       -> a90ba596c32d491af5d517295f39bba805e56558
git rev-parse origin/task/ANTIGRAVITY-INSTALL-002-fast-install                  -> e3208a342c0a684b0e749a90816535c0cb6c344f
git merge-base <candidate> <main>                                               -> a90ba596c32d491af5d517295f39bba805e56558
git merge-base --is-ancestor <main> <candidate>                                -> true
git log --oneline main..candidate                                              -> e3208a3 Fix Antigravity install fast path (1 commit)
git log --oneline candidate..main                                              -> (empty)
```

Exactly **1 commit ahead, 0 behind**. Exact five-file touch set confirmed by `git diff main candidate --stat`:

```
.vscodeignore
docs/ai-tasks/ANTIGRAVITY-INSTALL-002-IMPLEMENTATION.md
scripts/install_common.ps1
scripts/install_vscode_extension.ps1
scripts/test_antigravity_installer.ps1
```

No webview module, `extension.ts`, `gmPromptBuilderCore.ts`, or locale file appears — no Relay behavior or unrelated product runtime code was touched.

## 1. Package hygiene — confirmed

`.vscodeignore` diff adds exactly `.claude/**`, `.codex/**`, `*.vsix`. Freshly packaged a real VSIX from the candidate worktree (`npx @vscode/vsce package`, independent of the flagged install script — see Commands section for why): **970 files, 25443581 bytes (~24.27 MB)**. `unzip -l` on the produced VSIX, grepped case-insensitively for `\.claude|\.codex|\.git/|\.vsix$|backup|staging`, returned **zero matches** — no nested VSIX, no `.claude`, no `.codex`, no `.git`, no installer backup/staging/temp content. This matches the expected ~969-file / ~25.4 MB class (previously 12024 files / 76.47 MB before this fix, observed independently in the prior ANTIGRAVITY-INSTALL-001 verify on a checkout that predated `.vscodeignore`'s hardening).

## 2. Artifact location — confirmed

`Get-LoreRelayVsixArtifactsDir` returns `Join-Path ([System.IO.Path]::GetTempPath()) 'lorerelay-vsix-artifacts'`; `[System.IO.Path]::GetTempPath()` is an OS API rooted at the user's system temp directory. Independently confirmed via `node -e "console.log(require('os').tmpdir())"` (the equivalent OS call): `C:\Users\Keisuke\AppData\Local\Temp` — a different drive subtree entirely from `C:\AI\text-adventure-vsce`. This path helper **cannot** resolve inside the repository by construction; there is no code path joining it with `$ProjectDir` or any repo-relative value. The fresh focused test also asserts this directly against the real function: `OK: artifact helper keeps generated VSIX outside the repo root` (`Assert-True (-not $artifactPath.StartsWith($repoRoot, ...))`).

## 3. CLI success fast path — confirmed in code and by fresh test

`install_vscode_extension.ps1` wires `Invoke-PrimaryInstallWithFallback -PrimaryAvailable ([bool]$agCmd) -PrimaryAction { Install-VsixViaCli ... } -FallbackAction { ... New-PreparedVsixInstallContent ... }`. Reading `Invoke-PrimaryInstallWithFallback` in `install_common.ps1`: on primary success it sets `PrimarySucceeded=$true` and `return`s **before** `FallbackAttempted`/`FallbackRan` are ever set and before the fallback scriptblock is invoked — structurally guaranteeing the fallback closure (which is the only call site of `New-PreparedVsixInstallContent` → `Expand-ArchiveSafe`) never executes on CLI success. Freshly reran the new unit-level tests for this exact function on the candidate: `OK: CLI success does not invoke direct-folder fallback`, `OK: CLI success attempts the primary path once`, `OK: CLI success skips the fallback path entirely` (asserted via real call counters, not just report flags).

## 4. CLI failure fallback — confirmed in code and by fresh test

Same orchestration helper: on primary unavailable/failure, `FallbackAttempted`/`FallbackRan` are set and the fallback scriptblock runs. Inside `install_vscode_extension.ps1`'s fallback closure: `New-PreparedVsixInstallContent` (validates + extracts **once**) is called once outside the `foreach ($extDir in $fallbackDirs)` loop, and `Install-PreparedExtensionToDirAtomic` is called **per target dir reusing the same `$prepared` object** — confirmed by reading the loop body directly (no second `Expand-ArchiveSafe`/`Test-VsixPackageIntegrity` call inside the loop). `Install-PreparedExtensionToDirAtomic` retains the exact same stage → move-existing-to-backup → rename-promote → remove-backup-on-success / restore-from-backup-on-failure sequence previously verified in ANTIGRAVITY-INSTALL-001 (this function is a refactor of the prior `Install-VsixToDirDirectAtomic` body, parameterized on already-prepared content rather than re-extracting). Freshly reran: `OK: CLI failure runs direct-folder fallback`, `OK: CLI failure invokes fallback once`, plus all pre-existing atomic/rollback assertions (`OK: atomic replacement succeeds...`, `OK: rollback restores the old version on replacement failure`, etc.) still pass unchanged.

## 5. Historical visible `Expand-Archive` — exact source re-derived independently

Grepped the candidate's own scripts for the literal `Expand-Archive` cmdlet: only `scripts/install_common.ps1`'s **function name** `Expand-ArchiveSafe` and its two call sites appear; the function body itself calls `[System.IO.Compression.ZipFile]::ExtractToDirectory(...)`, never the `Expand-Archive` cmdlet. No temp file named `lorerelay-vsix-*.zip` or `lorerelay-unzip-*.ps1` exists anywhere in the candidate tree.

Independently read the **actual, currently checked-out** `C:\AI\text-adventure-vsce\scripts\install_common.ps1` (read-only, the dirty root worktree, HEAD `ec453fb9f79ad5f1d7c1b61a8bc0a08413869fd7`) and found, verbatim, still present on disk right now:
```
$tempZip = Join-Path ([System.IO.Path]::GetTempPath()) ("lorerelay-vsix-{0}.zip" -f [Guid]::NewGuid().ToString('N'))
...
'Expand-Archive -LiteralPath $Zip -DestinationPath $Dest -Force'
...
$scriptPath = Join-Path ([System.IO.Path]::GetTempPath()) ("lorerelay-unzip-{0}.ps1" -f [Guid]::NewGuid().ToString('N'))
```
This is an exact byte-for-byte match to the user's reported visible path (`Expand-Archive`, `...lorerelay-vsix-<guid>.zip`). `ec453fb`'s tree for this file traces to pre-ANTIGRAVITY-INSTALL-001 main (`176cd5f`), since `ec453fb` only adds a review doc on top of that base and never received either installer repair.

**Classification: stale root installer code** (matches the implementation doc's own classification, independently re-derived here from the live file rather than trusted from the report) — specifically, it is neither current main, nor the INSTALL-001 candidate, nor this INSTALL-002 candidate; it is whatever pre-INSTALL-001 main state the dirty root worktree happened to be checked out to when the user observed it. Exact chain: `install_extension_antigravity.bat` (uses `%~dp0`, its own physical directory) → whatever `scripts\install_vscode_extension.ps1`/`install_common.ps1` physically sit next to it → the stale `Expand-ArchiveSafe` implementation → temp `lorerelay-vsix-<guid>.zip` → visible `Expand-Archive` cmdlet UI.

## 6. Fresh tests — rerun in the isolated candidate worktree

| Command | Result |
| --- | --- |
| `node scripts/test_antigravity_installer.js` | PASS — 26/26 `OK` assertions, including all 4 new fast-path/hygiene assertions and all pre-existing integrity/atomic/rollback assertions |
| `npm run compile` | PASS, exit `0` |
| `npm test` (first run) | `227/228` — `test_symbol_registry.js` failed only on the already-known Symbol Registry Windows CRLF false positive |
| Zero-real-diff proof | `git diff --stat docs/generated/` → no changed lines; `git diff --ignore-cr-at-eol --exit-code -- docs/generated/SYMBOL_REGISTRY.md docs/generated/symbol_registry.json` → exit `0` |
| `npm run generate:symbol-registry` then rerun | `node scripts/test_symbol_registry.js` → 9/9 PASS |
| `npm test` (final) | **228/228**, exit `0` |

The EOL-only normalization was **not committed** — `git checkout -- docs/generated/` restored the working tree in the candidate worktree afterward; the candidate branch itself was not modified.

## 7. Fresh clean-package timing

**Limitation, disclosed rather than worked around:** running the actual `scripts/install_vscode_extension.ps1` end-to-end (which would produce the CLI-phase duration, `FALLBACK_RAN`, and `VISIBLE_EXPAND_ARCHIVE` booleans directly) requires `powershell.exe -ExecutionPolicy Bypass -File ...`. A sandbox policy denial blocked this exact invocation pattern when run ad hoc (outside the repo's own pre-approved `node scripts/test_antigravity_installer.js` wrapper), both in this task and in the prior ANTIGRAVITY-INSTALL-001 verify. Per the standing instruction to work around such denials only in reasonable, non-bypassing ways, the following was gathered independently instead, without invoking the blocked pattern:

- **Package phase**: ran `npx @vscode/vsce package` directly (an already-approved tool call pattern from the prior verify) on the candidate worktree, timed via wall-clock before/after: **~12s** for a **970-file, 25443581-byte (~24.27 MB)** VSIX. This is in the same class as the expected ~969 files / ~25.4 MB and consistent with the implementation doc's own reported 15.7s package phase (both well under the ~22s total-class expectation once a CLI phase of a few seconds is added).
- **SHA-256** of the independently-produced VSIX: `d74d475d765b261c4b003db886926bbd2c84508b2ad7bc24b2af0b2fdc1b9c27` (will legitimately differ from the implementation doc's own hash — different build timestamp/temp paths inside the archive — but the file count/size class matches).
- **CLI-phase / total-duration / `FALLBACK_RAN` / `VISIBLE_EXPAND_ARCHIVE`**: not independently re-measured end-to-end in this session due to the sandbox denial above. Substituted evidence: (a) the structural code guarantee in §3/§4 that a successful CLI call returns before the fallback closure (containing the only extraction call) is ever entered; (b) the fresh call-counter-based unit tests in §3/§4 proving this exact behavior against the real `Invoke-PrimaryInstallWithFallback` function; (c) the §5 grep proving no `Expand-Archive` cmdlet invocation exists anywhere in the candidate's code, so a CLI-success run structurally cannot display it. This is treated as sufficient corroboration for the fast-path claim but is weaker than an end-to-end timed rerun; it is recorded as a disclosed gap, not silently assumed equivalent.

## Critical operational boundary — literal everyday user BAT

Independently re-derived, not assumed:

- `install_extension_antigravity.bat` (read from the dirty root worktree): uses `set "SCRIPT_DIR=%~dp0"` and runs `powershell.exe ... -File "%SCRIPT_DIR%scripts\install_vscode_extension.ps1" -Target "antigravity"` — it always executes whatever `scripts\install_vscode_extension.ps1`/`install_common.ps1` are **physically present on disk in the same directory tree as the `.bat` file itself**, resolved at run time via its own path, not via any git ref.
- The root worktree `C:\AI\text-adventure-vsce` is physically checked out to branch `task/ANTIGRAVITY-INSTALL-001-verify` at `ec453fb9f79ad5f1d7c1b61a8bc0a08413869fd7` (confirmed live, unchanged throughout this task: `git status --short` → `M webview/script.js`, `?? .claude/`; `git rev-parse HEAD` → `ec453fb9...`). That commit's tree for `scripts/install_common.ps1` is the **pre-INSTALL-001, pre-INSTALL-002 stale version** (confirmed in §5 by reading the live file).
- Merging `task/ANTIGRAVITY-INSTALL-002-fast-install` to `origin/main` on GitHub changes the remote ref only. It does **not** modify any file physically present in `C:\AI\text-adventure-vsce`. Git has no mechanism that pushes a merge into an unrelated local checkout; the root worktree's working tree only changes when something inside that worktree runs `git fetch`/`git checkout`/`git pull`/`git merge`, none of which this task (or the INSTALL-001/INSTALL-002 implementation tasks) performed there, by explicit design (to avoid disturbing the user's dirty root work).

**Answer: (B).** Running the literal path `C:\AI\text-adventure-vsce\install_extension_antigravity.bat` today, and immediately after this candidate is merged to `origin/main`, would **still execute the stale pre-repair installer scripts** currently checked out in that root worktree — not the repaired CLI-fast-path/atomic/hygiene-fixed code verified above. The fix exists only in the candidate branch (and, once merged, in the `origin/main` ref) — not in the one physical location the user's BAT actually reads from.

## Operational gap classification

This is **not** an implementation defect in the candidate — every property required by this task (package hygiene, artifact isolation, CLI-first fast path skipping fallback, safe fallback with single-extraction reuse, atomic install/rollback, no stale `Expand-Archive` cmdlet) was independently confirmed true of the candidate's own code and tests. The gap is a **deployment/entrypoint decoupling**: the one file path the user's muscle-memory BAT invocation reads from (`C:\AI\text-adventure-vsce`) is a long-lived, intentionally-undisturbed dirty worktree that is not fast-forwarded when work merges to `origin/main` elsewhere. No amount of correctness in the candidate branch closes this gap by itself.

**Recommended smallest safe repair (not implemented here, per task instructions):** do not touch the dirty root worktree. Instead, make the user's BAT resilient to "which physical location has the current installer code" by having it delegate to a small, separate, always-fresh location rather than `%~dp0`'s own tree — e.g., a thin bootstrap step in (or invoked by) `install_extension_antigravity.bat` that maintains a dedicated, disposable installer worktree (following the exact pattern already used throughout this project's own `C:\AI\wt-*` directories — e.g., a fixed path like `C:\AI\wt-lorerelay-installer-current`), fetches/fast-forwards **that** worktree to `origin/main` before each run, and invokes `scripts\install_vscode_extension.ps1` from there instead of from `%SCRIPT_DIR%`. This requires zero changes to the dirty root worktree's branch/state and zero destructive operations against it — the root worktree can remain exactly as the user left it indefinitely.

## Blockers

None blocking on the candidate implementation itself — verdict below reflects the terminal-acceptance operational gap, not a code defect. One disclosed evidence-quality gap: end-to-end live-run timing (`CLI phase duration`, `FALLBACK_RAN`, `VISIBLE_EXPAND_ARCHIVE`) could not be independently re-measured in this session because the sandbox denied ad hoc `powershell.exe -ExecutionPolicy Bypass` invocation of `install_vscode_extension.ps1` outside the repo's own pre-approved test wrapper; package-phase metrics (file count, size, hygiene) were independently reproduced instead, and the fast-path/no-fallback guarantee was independently confirmed structurally and via fresh unit-level tests rather than an end-to-end timed rerun.

# Final Verdict

`ANTIGRAVITY_INSTALL_002_ROOT_ENTRYPOINT_REPAIR_REQUIRED`
