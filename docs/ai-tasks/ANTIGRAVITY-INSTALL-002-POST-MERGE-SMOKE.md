# ANTIGRAVITY-INSTALL-002 Post-Merge Smoke

AI: Codex
Model: GPT-5.5
Reasoning: High
Role: Final integrator and terminal post-merge smoke runner

## Verdict

ANTIGRAVITY_INSTALL_002_DONE_REAL_RELAY_SMOKE_PENDING

## Exact Inputs

- Initial `origin/main`: `a90ba596c32d491af5d517295f39bba805e56558`
- Fast-install implementation: `e3208a342c0a684b0e749a90816535c0cb6c344f`
- Root-entrypoint final candidate: `8b6dacb672161d3afb1067f6c56448ab04256e82`
- Root-entrypoint live-proof implementation commit: `ee101d1c3ad426e62e8e8356ff3c88615f1d8f4b`
- Prior independent review: `650adedc1c98e884a58c65789f2e7c17e3d696c2`
- Final independent review: `8c9ccb573d26c47dcd6d0effd63256af56f5b787`
- Integration tip pushed to `origin/main`: `e9f9fef520ceecd2810ba09c4ce1c72e321cd8ce`

## Preconditions

All required preconditions matched before integration:

- `origin/main`: `a90ba596c32d491af5d517295f39bba805e56558`
- Candidate branch tip: `8b6dacb672161d3afb1067f6c56448ab04256e82`
- Candidate relation to current main: `6 ahead / 0 behind`
- Prior review commit changed only `docs/ai-tasks/ANTIGRAVITY-INSTALL-002-VERIFY.md`
- Final review commit changed only `docs/ai-tasks/ANTIGRAVITY-INSTALL-002-ROOT-ENTRYPOINT-VERIFY.md`

Physical root state matched before integration:

- Path: `C:\AI\text-adventure-vsce`
- Branch: `task/ANTIGRAVITY-INSTALL-001-verify`
- HEAD: `ec453fb9f79ad5f1d7c1b61a8bc0a08413869fd7`
- Dirty state:
  - `M install_extension_antigravity.bat`
  - `M webview/script.js`
  - `?? .claude/`
- Root BAT SHA-256: `51FE09CB6C2E8B3DDB8A93FE279A9B3BC43A04D377F1A134189AECAE3DFD0EC6`

Backup remained present:

- Path: `C:\AI\lorerelay-installer-entrypoint-backups\install_extension_antigravity.20260708-193710.bat`
- SHA-256: `946DE436D6AC0EE98267135902EF185933C4CC6DC5B0AEC78C86200A0FEC1B41`

## Integration

Used a fresh clean integration worktree:

```text
C:\AI\wt-antigravity-install-002-terminal-smoke
```

Integration steps:

1. Added detached worktree at exact current `origin/main`.
2. Fast-forwarded from `a90ba596c32d491af5d517295f39bba805e56558` to candidate `8b6dacb672161d3afb1067f6c56448ab04256e82`.
3. Cherry-picked prior review commit `650adedc1c98e884a58c65789f2e7c17e3d696c2`.
4. Cherry-picked final review commit `8c9ccb573d26c47dcd6d0effd63256af56f5b787`.
5. Confirmed integrated diff files:
   - `.vscodeignore`
   - `docs/ai-tasks/ANTIGRAVITY-INSTALL-002-IMPLEMENTATION.md`
   - `docs/ai-tasks/ANTIGRAVITY-INSTALL-002-ROOT-ENTRYPOINT-IMPLEMENTATION.md`
   - `docs/ai-tasks/ANTIGRAVITY-INSTALL-002-ROOT-ENTRYPOINT-VERIFY.md`
   - `docs/ai-tasks/ANTIGRAVITY-INSTALL-002-VERIFY.md`
   - `install_extension_antigravity.bat`
   - `scripts/install_common.ps1`
   - `scripts/install_vscode_extension.ps1`
   - `scripts/run_all_tests.js`
   - `scripts/test_antigravity_installer.ps1`
   - `scripts/test_antigravity_installer_bootstrap.js`
6. Pushed integration tip to `main`.
7. Fetched `origin`.
8. Confirmed exact pushed `origin/main`: `e9f9fef520ceecd2810ba09c4ce1c72e321cd8ce`.

## Automated Post-Merge Tests

Commands run against exact pushed `origin/main` in `C:\AI\wt-antigravity-install-002-terminal-smoke`:

```powershell
npm ci --include=dev
node scripts/test_antigravity_installer_bootstrap.js
node scripts/test_antigravity_installer.js
npm run compile
npm test
npm run generate:symbol-registry
npm run check:symbol-registry
npm test
```

Results:

- `npm ci --include=dev`: PASS, 202 packages, 0 vulnerabilities
- `node scripts/test_antigravity_installer_bootstrap.js`: PASS
- `node scripts/test_antigravity_installer.js`: PASS
- `npm run compile`: PASS
- Initial `npm test`: `228/229`, failed only on known Symbol Registry Windows CRLF false-stale condition
- Symbol Registry diagnosis before normalization: zero real content diff under `git diff --ignore-cr-at-eol`
- `npm run generate:symbol-registry`: PASS, local normalization only
- `npm run check:symbol-registry`: PASS, 3859 entries
- Final `npm test`: PASS, `229/229`

No EOL-only generated noise was committed.

## Terminal Literal BAT Smoke

Before running the terminal smoke, this process explicitly cleared:

- `LORERELAY_INSTALLER_REF`
- `LORERELAY_INSTALLER_WORKTREE`
- `LORERELAY_BOOTSTRAP_PREPARE_ONLY`

The only installer env var set was:

- `LORERELAY_INSTALLER_NO_PAUSE=1`

Command executed:

```text
C:\AI\text-adventure-vsce\install_extension_antigravity.bat
```

Log:

```text
C:\AI\antigravity-install-002-post-merge-terminal.log
```

Result:

- Exit code: `0`
- Start: `2026-07-08T20:40:51.6585256+09:00`
- End: `2026-07-08T20:41:11.3812981+09:00`
- Total literal-BAT wall time: `19.723s`

Log evidence:

- Bootstrap source entrypoint: `C:\AI\text-adventure-vsce\install_extension_antigravity.bat`
- Installer ref: `origin/main`
- No `Ref override is active` line appeared
- Desired installer checkout SHA: `e9f9fef520ceecd2810ba09c4ce1c72e321cd8ce`
- Managed installer path: `C:\AI\wt-lorerelay-installer-current`
- Managed installer checkout SHA: `e9f9fef520ceecd2810ba09c4ce1c72e321cd8ce`
- Dependencies: reused existing managed `node_modules`
- Installer invoked from managed worktree: `Building LoreRelay v1.77.15 from C:\AI\wt-lorerelay-installer-current`
- CLI install succeeded
- Direct-folder fallback did not run after CLI success
- Required log line appeared: `Skipping direct-folder fallback because CLI install succeeded.`

Forbidden historical UI/path evidence:

- `Expand-Archive`: absent
- `lorerelay-vsix-<guid>.zip`: absent
- `Direct-folder fallback starting`: absent

## Terminal Timing

- Bootstrap preparation duration: `1.546s`
- Dependency preparation duration: `0s` / reused existing managed `node_modules`
- Package duration: `16.144s`
- CLI duration: `2.005s`
- Total literal-BAT wall time: `19.723s`

## Package Evidence

VSIX:

```text
C:\Users\Keisuke\AppData\Local\Temp\lorerelay-vsix-artifacts\lorerelay-1.77.15.vsix
```

Package class:

- File count: `970`
- Display size: `24.26 MB`
- Size bytes: `25435878`
- SHA-256: `912f9624bf3a31994fc4c520e133d3bd3a74f1f2bdf703b07e783de9463e489c`

This remains in the expected normal hygiene class.

## Installed Versions

All known locations remained valid at `1.77.15`:

- `C:\Users\Keisuke\.antigravity\extensions\miya.lorerelay-1.77.15\package.json`: `1.77.15`
- `C:\Users\Keisuke\.antigravity-ide\extensions\miya.lorerelay-1.77.15\package.json`: `1.77.15`
- `C:\Users\Keisuke\.gemini\antigravity-ide\extensions\miya.lorerelay-1.77.15\package.json`: `1.77.15`

## Root State After Terminal Smoke

Physical root state remained unchanged:

- Branch: `task/ANTIGRAVITY-INSTALL-001-verify`
- HEAD: `ec453fb9f79ad5f1d7c1b61a8bc0a08413869fd7`
- Dirty state:
  - `M install_extension_antigravity.bat`
  - `M webview/script.js`
  - `?? .claude/`
- Root BAT SHA-256: `51FE09CB6C2E8B3DDB8A93FE279A9B3BC43A04D377F1A134189AECAE3DFD0EC6`

Managed installer state:

- Path: `C:\AI\wt-lorerelay-installer-current`
- HEAD: `e9f9fef520ceecd2810ba09c4ce1c72e321cd8ce`
- Dirty generated files after compile/package:
  - `webview/script.js`
  - `webview/style.css`
  - `webview/vendor/mermaid.min.js`
- Managed dirty files were verified as CRLF-only under `git diff --ignore-cr-at-eol`.

## Working Tree State

Integration worktree after tests had only known generated CRLF-only dirty files:

- `docs/generated/SYMBOL_REGISTRY.md`
- `docs/generated/symbol_registry.json`
- `webview/script.js`
- `webview/style.css`
- `webview/vendor/mermaid.min.js`

All were verified as zero real content diff under `git diff --ignore-cr-at-eol`.

Physical root worktree retained exactly the expected dirty state and was not reset, cleaned, switched, stashed, or otherwise modified beyond the already-deployed BAT.

## Final Smoke Verdict

ANTIGRAVITY_INSTALL_002_DONE_REAL_RELAY_SMOKE_PENDING
