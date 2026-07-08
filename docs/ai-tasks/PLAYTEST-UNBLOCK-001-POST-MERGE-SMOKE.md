# PLAYTEST-UNBLOCK-001 Post-Merge Smoke

AI: Codex
Model: GPT-5.5
Reasoning: High
Role: Final integrator and terminal post-merge smoke owner

## Verdict

PLAYTEST_UNBLOCK_001_POST_MERGE_SMOKE_PASS

## Exact Inputs

- Initial `origin/main`: `55a20ac537cfacf109bc0dd2324ca66d74cf5ddd`
- Original implementation: `4ce73dff7fbea0b416f4687a6554ede0cb1826ca`
- Small repair candidate: `f03ff0c085b315702a4c370c8a396e94375540cb`
- Accepted adversarial review: `4e3fd36912da03ad0afcf08716b1cc1f2d499368`
- Accepted final verify: `abc26509973cc6acdbcce529686814f527382277`
- Integration tip pushed to `origin/main`: `9c4748226761efa5b73b9f9c9e68374de9db5a6a`

## Preflight

All required preconditions matched before integration:

- `origin/main`: `55a20ac537cfacf109bc0dd2324ca66d74cf5ddd`
- Candidate tip: `f03ff0c085b315702a4c370c8a396e94375540cb`
- Candidate relation to current main: `2 ahead / 0 behind`
- Candidate contained original implementation `4ce73dff7fbea0b416f4687a6554ede0cb1826ca`
- Candidate contained small repair `f03ff0c085b315702a4c370c8a396e94375540cb`
- Adversarial review commit changed only `docs/ai-tasks/PLAYTEST-UNBLOCK-001-ADVERSARIAL-REVIEW.md`
- Final verify commit changed only `docs/ai-tasks/PLAYTEST-UNBLOCK-001-SMALL-REPAIR-VERIFY.md`

Physical root before integration/install:

- Path: `C:\AI\text-adventure-vsce`
- Branch: `task/PLAYTEST-UNBLOCK-001-adversarial-review`
- HEAD: `4e3fd36912da03ad0afcf08716b1cc1f2d499368`
- Dirty state:
  - `?? .claude/`
- Root BAT SHA-256: `40449CAFA69EF43DB2F1F91C6A7B0165376AA52520C3DBCAC274E09A3E709A81`

## Integration

Used fresh clean integration worktree:

```text
C:\AI\wt-playtest-unblock-001-terminal-smoke
```

Integration steps:

1. Started from exact `origin/main` `55a20ac537cfacf109bc0dd2324ca66d74cf5ddd`.
2. Fast-forwarded to `f03ff0c085b315702a4c370c8a396e94375540cb`.
3. Cherry-picked adversarial review commit `4e3fd36912da03ad0afcf08716b1cc1f2d499368`.
4. Cherry-picked final verify commit `abc26509973cc6acdbcce529686814f527382277`.
5. Pushed integration tip to `main`.
6. Fetched `origin`.
7. Confirmed exact pushed `origin/main`: `9c4748226761efa5b73b9f9c9e68374de9db5a6a`.

Integrated changed files:

- `docs/ai-tasks/PLAYTEST-UNBLOCK-001-ADVERSARIAL-REVIEW.md`
- `docs/ai-tasks/PLAYTEST-UNBLOCK-001-IMPLEMENTATION.md`
- `docs/ai-tasks/PLAYTEST-UNBLOCK-001-SMALL-REPAIR-VERIFY.md`
- `docs/ai-tasks/PLAYTEST-UNBLOCK-001-SMALL-REPAIR.md`
- `docs/generated/SYMBOL_REGISTRY.md`
- `docs/generated/symbol_registry.json`
- `locales/en.json`
- `locales/ja.json`
- `locales/zh-CN.json`
- `locales/zh-TW.json`
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

## Fresh Automated Results

Commands run against exact pushed `origin/main` in `C:\AI\wt-playtest-unblock-001-terminal-smoke`:

```powershell
npm ci --include=dev
npm run compile
node scripts/test_playtest_unblock_001.js
node scripts/test_scenario_pack_core.js
node scripts/test_scrapbound_sample_integrity.js
node scripts/test_webview_bundle.js
npm run check:symbol-registry
node scripts/test_symbol_registry.js
npm run generate:symbol-registry
npm run check:symbol-registry
node scripts/test_symbol_registry.js
npm test
```

Results:

- `npm ci --include=dev`: PASS, 202 packages, 0 vulnerabilities
- `npm run compile`: PASS
- `node scripts/test_playtest_unblock_001.js`: PASS
- `node scripts/test_scenario_pack_core.js`: PASS
- `node scripts/test_scrapbound_sample_integrity.js`: PASS
- `node scripts/test_webview_bundle.js`: PASS
- Initial `npm run check:symbol-registry`: failed only on known Windows CRLF false-stale behavior
- Initial `node scripts/test_symbol_registry.js`: failed only on the same generated-file freshness check
- Symbol Registry diagnosis: zero real content diff under `git diff --ignore-cr-at-eol`
- `npm run generate:symbol-registry`: PASS, local normalization only
- `npm run check:symbol-registry`: PASS, 3862 entries
- `node scripts/test_symbol_registry.js`: PASS
- `npm test`: PASS, `230/230`

No EOL-only generated noise was committed.

## Literal Everyday Install Gate

Before running the literal BAT, this process explicitly unset:

- `LORERELAY_INSTALLER_REF`
- `LORERELAY_INSTALLER_WORKTREE`
- `LORERELAY_BOOTSTRAP_PREPARE_ONLY`

The only installer environment variable set was:

- `LORERELAY_INSTALLER_NO_PAUSE=1`

Command executed:

```text
C:\AI\text-adventure-vsce\install_extension_antigravity.bat
```

Log:

```text
C:\AI\playtest-unblock-001-post-merge-terminal.log
```

Result:

- Exit code: `0`
- Start: `2026-07-08T23:45:46.7883056+09:00`
- End: `2026-07-08T23:46:08.8100016+09:00`
- Total literal-BAT wall time: `22.022s`

Log evidence:

- Literal source entrypoint: `C:\AI\text-adventure-vsce\install_extension_antigravity.bat`
- Installer ref: `origin/main`
- No `Ref override is active` line appeared
- Desired installer checkout SHA: `9c4748226761efa5b73b9f9c9e68374de9db5a6a`
- Managed installer path: `C:\AI\wt-lorerelay-installer-current`
- Managed installer checkout SHA: `9c4748226761efa5b73b9f9c9e68374de9db5a6a`
- Dependencies: reused existing managed `node_modules`
- Installer invoked from managed worktree: `Building LoreRelay v1.77.15 from C:\AI\wt-lorerelay-installer-current`
- CLI install succeeded
- Direct-folder fallback did not run after CLI success
- Required log line appeared: `Skipping direct-folder fallback because CLI install succeeded.`

Forbidden historical path evidence:

- `Expand-Archive`: absent
- `lorerelay-vsix-<guid>.zip`: absent
- `Direct-folder fallback starting`: absent

## Install Timing

- Bootstrap preparation duration: `1.760s`
- Dependency preparation duration: `0s` / reused existing managed `node_modules`
- Package duration: `17.846s`
- CLI duration: `2.395s`
- Total literal-BAT wall time: `22.022s`

## Package Evidence

VSIX path:

```text
C:\Users\Keisuke\AppData\Local\Temp\lorerelay-vsix-artifacts\lorerelay-1.77.15.vsix
```

Package class:

- File count: `976`
- Display size: `24.29 MB`
- Size bytes: `25466364`
- SHA-256: `928280aa289b7c361351ad849f0a2d808c5e65b37229b449aa3b418df1594dc0`

This remains in the expected normal hygiene class.

## Installed Version

All known locations remained valid at `1.77.15`:

- `C:\Users\Keisuke\.antigravity\extensions\miya.lorerelay-1.77.15\package.json`: `1.77.15`
- `C:\Users\Keisuke\.antigravity-ide\extensions\miya.lorerelay-1.77.15\package.json`: `1.77.15`
- `C:\Users\Keisuke\.gemini\antigravity-ide\extensions\miya.lorerelay-1.77.15\package.json`: `1.77.15`

## Root And Managed State After Install

Physical root remained unchanged:

- Branch: `task/PLAYTEST-UNBLOCK-001-adversarial-review`
- HEAD: `4e3fd36912da03ad0afcf08716b1cc1f2d499368`
- Dirty state:
  - `?? .claude/`
- Root BAT SHA-256: `40449CAFA69EF43DB2F1F91C6A7B0165376AA52520C3DBCAC274E09A3E709A81`

Managed installer worktree:

- Path: `C:\AI\wt-lorerelay-installer-current`
- HEAD: `9c4748226761efa5b73b9f9c9e68374de9db5a6a`
- Dirty generated files after compile/package:
  - `webview/script.js`
  - `webview/style.css`
  - `webview/vendor/mermaid.min.js`
- Managed dirty files were verified as CRLF-only under `git diff --ignore-cr-at-eol`.

Integration worktree after tests had only known generated CRLF-only dirty files:

- `docs/generated/SYMBOL_REGISTRY.md`
- `docs/generated/symbol_registry.json`
- `webview/script.js`
- `webview/style.css`
- `webview/vendor/mermaid.min.js`

All known generated dirty files were verified as zero real content diff under `git diff --ignore-cr-at-eol`.

## User 5-Minute Human Smoke

The machine is ready for the requested human smoke:

1. Open LoreRelay.
2. Set locale to Japanese.
3. Load Scrapbound.
4. Confirm Japanese narrative/status/options.
5. Open Character Profile and confirm レン・ヴェイル.
6. Click Start Hub.
7. Wait several seconds / allow normal state sync.
8. Confirm Start Hub does not kick back to chat.
9. Click Resume.
10. Confirm exact same session returns.

## Final Smoke Verdict

PLAYTEST_UNBLOCK_001_POST_MERGE_SMOKE_PASS
