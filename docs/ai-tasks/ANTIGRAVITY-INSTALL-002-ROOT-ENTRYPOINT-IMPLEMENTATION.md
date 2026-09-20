# ANTIGRAVITY-INSTALL-002 Root Entrypoint Implementation

AI: Codex
Model: GPT-5.5
Reasoning: High
Role: Terminal root-entrypoint repair implementer

## Scope

Implemented only the root terminal entrypoint repair for `ANTIGRAVITY-INSTALL-002`.

The literal everyday BAT path:

```text
C:\AI\text-adventure-vsce\install_extension_antigravity.bat
```

now bootstraps into a dedicated managed installer checkout before invoking the existing Antigravity installer. It no longer runs the stale root worktree scripts directly.

## Baseline And Inputs

- Initial exact `origin/main`: `a90ba596c32d491af5d517295f39bba805e56558`
- Parent fast-install candidate: `e3208a342c0a684b0e749a90816535c0cb6c344f`
- Accepted independent review: `650adedc1c98e884a58c65789f2e7c17e3d696c2`
- Implementation branch: `task/ANTIGRAVITY-INSTALL-002-root-entrypoint`
- Implementation worktree: `C:\AI\wt-antigravity-install-002-root-entrypoint`

## Implementation

`install_extension_antigravity.bat` now:

- treats `%~dp0` as the source repository that owns the literal root BAT;
- fetches `origin` in the source repository;
- resolves the installer ref, defaulting to `origin/main`;
- prepares a dedicated managed installer worktree, defaulting to `C:\AI\wt-lorerelay-installer-current`;
- allows explicit test/verification overrides through `LORERELAY_INSTALLER_REF` and `LORERELAY_INSTALLER_WORKTREE`;
- verifies an existing managed path is a Git worktree rooted exactly at the configured path;
- compares normalized absolute Git common-dir identity to ensure the managed checkout belongs to the same repository;
- updates an existing managed checkout to the resolved commit with guarded worktree reset/cleanup only after those identity checks pass;
- creates the managed checkout as a detached worktree if it does not exist;
- verifies the managed checkout HEAD matches the resolved installer commit;
- installs dependencies only when `node_modules\typescript\bin\tsc` is absent;
- invokes `scripts\install_vscode_extension.ps1 -Target antigravity` from the managed checkout;
- supports `LORERELAY_BOOTSTRAP_PREPARE_ONLY=1` for non-installing focused tests;
- supports `LORERELAY_INSTALLER_NO_PAUSE=1` for automation.

No installer behavior was redesigned beyond the root entrypoint bootstrap.

## Focused Test Coverage

Added `scripts/test_antigravity_installer_bootstrap.js`, registered in `scripts/run_all_tests.js`.

The test exercises the real BAT through `cmd.exe /c` and real Git worktrees. It verifies:

- valid managed worktree creation at a requested ref;
- valid managed worktree update to a different requested ref;
- refusal of an unmanaged existing target directory without deleting it;
- invalid requested ref failure before install/worktree creation;
- source worktree branch, HEAD, and dirty state remain unchanged.

Existing `scripts/test_antigravity_installer.js` continues to cover CLI success, fallback behavior, package hygiene, external VSIX artifact placement, and atomic rollback.

## Root BAT Deployment

The physical root worktree was not switched, reset, stashed, or cleaned.

Before deployment:

- Root path: `C:\AI\text-adventure-vsce`
- Root branch: `task/ANTIGRAVITY-INSTALL-001-verify`
- Root HEAD: `ec453fb9f79ad5f1d7c1b61a8bc0a08413869fd7`
- Root dirty state:
  - `M webview/script.js`
  - `?? .claude/`
- Root BAT SHA-256 before deployment: `946DE436D6AC0EE98267135902EF185933C4CC6DC5B0AEC78C86200A0FEC1B41`

Backup:

- Backup path: `C:\AI\lorerelay-installer-entrypoint-backups\install_extension_antigravity.20260708-193710.bat`
- Backup SHA-256: `946DE436D6AC0EE98267135902EF185933C4CC6DC5B0AEC78C86200A0FEC1B41`

After deployment:

- Root branch: `task/ANTIGRAVITY-INSTALL-001-verify`
- Root HEAD: `ec453fb9f79ad5f1d7c1b61a8bc0a08413869fd7`
- Root dirty state:
  - `M install_extension_antigravity.bat`
  - `M webview/script.js`
  - `?? .claude/`
- Root BAT SHA-256 after deployment: `51FE09CB6C2E8B3DDB8A93FE279A9B3BC43A04D377F1A134189AECAE3DFD0EC6`

Only the allowed root BAT was changed by this task. The pre-existing dirty `webview/script.js` and `.claude/` state was preserved.

## Literal Path End-To-End Proof

Command exercised:

```text
C:\AI\text-adventure-vsce\install_extension_antigravity.bat
```

Environment:

- `LORERELAY_INSTALLER_REF=origin/task/ANTIGRAVITY-INSTALL-002-root-entrypoint`
- `LORERELAY_INSTALLER_NO_PAUSE=1`

Successful live log:

- `C:\AI\antigravity-install-002-root-entrypoint-live-4.log`

Result:

- Exit code: `0`
- Start: `2026-07-08T19:42:02.4281404+09:00`
- End: `2026-07-08T19:42:20.7604806+09:00`
- Total wall time: `18.33s`
- Managed installer worktree: `C:\AI\wt-lorerelay-installer-current`
- Candidate SHA used in live proof: `ee101d1c3ad426e62e8e8356ff3c88615f1d8f4b`
- Managed checkout HEAD after proof: `ee101d1c3ad426e62e8e8356ff3c88615f1d8f4b`
- Dependency prep: reused existing managed `node_modules`

Timing breakdown:

- Bootstrap prep: approximately `1.66s`
- Dependency prep: `0s` / reused
- Package duration: approximately `14.78s`
- CLI duration: approximately `1.87s`
- Total duration: `18.33s`

Package evidence:

- Files: `967`
- Size: `24.24 MB`
- Size bytes: `25418731`
- VSIX SHA-256: `73abeb954e5364828345666ca0de007e0c5ccdb99bbfc66298e6863d346adf6e`
- VSIX path: `C:\Users\Keisuke\AppData\Local\Temp\lorerelay-vsix-artifacts\lorerelay-1.77.15.vsix`

Install behavior:

- Old visible `Expand-Archive` path did not appear in the final successful log.
- `Skipping direct-folder fallback because CLI install succeeded.` appeared.
- `Direct-folder fallback starting` did not appear.

Installed version evidence:

- `C:\Users\Keisuke\.antigravity\extensions\miya.lorerelay-1.77.15\package.json`: `1.77.15`
- `C:\Users\Keisuke\.antigravity-ide\extensions\miya.lorerelay-1.77.15\package.json`: `1.77.15`
- `C:\Users\Keisuke\.gemini\antigravity-ide\extensions\miya.lorerelay-1.77.15\package.json`: `1.77.15`

## Verification Commands

Commands run in `C:\AI\wt-antigravity-install-002-root-entrypoint`:

```powershell
npm ci --include=dev
npm run compile
node scripts/test_antigravity_installer_bootstrap.js
node scripts/test_antigravity_installer.js
npm run check:symbol-registry
node scripts/test_symbol_registry.js
npm test
```

Results:

- `npm ci --include=dev`: PASS, 202 packages, 0 vulnerabilities
- `npm run compile`: PASS
- `node scripts/test_antigravity_installer_bootstrap.js`: PASS
- `node scripts/test_antigravity_installer.js`: PASS
- Initial `npm test`: `228/229`, failed only on Symbol Registry generated-file freshness.
- Symbol Registry diagnosis: generated docs had zero real content diff under `git diff --ignore-cr-at-eol`; this was CRLF-only.
- `npm run generate:symbol-registry`: used to normalize the local working tree for the check; EOL-only output was not committed.
- `npm run check:symbol-registry`: PASS, 3859 entries.
- `node scripts/test_symbol_registry.js`: PASS.
- Final `npm test`: PASS, `229/229`.

## Git And EOL State

Implementation branch real diff from parent candidate before this report:

- `install_extension_antigravity.bat`
- `scripts/run_all_tests.js`
- `scripts/test_antigravity_installer_bootstrap.js`

This report adds:

- `docs/ai-tasks/ANTIGRAVITY-INSTALL-002-ROOT-ENTRYPOINT-IMPLEMENTATION.md`

Known dirty implementation-worktree files after compile/test:

- `docs/generated/SYMBOL_REGISTRY.md`
- `docs/generated/symbol_registry.json`
- `webview/script.js`
- `webview/style.css`
- `webview/vendor/mermaid.min.js`

All known dirty generated files above were verified as CRLF-only with:

```powershell
git diff --ignore-cr-at-eol --exit-code -- docs/generated/SYMBOL_REGISTRY.md docs/generated/symbol_registry.json webview/script.js webview/style.css webview/vendor/mermaid.min.js
```

No EOL-only generated noise is intended to be committed.

## Final Verdict

ANTIGRAVITY_INSTALL_002_ROOT_ENTRYPOINT_READY_FOR_VERIFY
