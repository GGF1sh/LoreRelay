# LORERELAY-TEST-CONSOLE-001

- Prompt timestamp: `2026-07-14 04:48:35 JST (Asia/Tokyo)`
- Required base: `08807d98234cada6d10ee194779d56202afa2fbd`
- Branch: `tooling/LORERELAY-TEST-CONSOLE-001`
- Worktree: `C:\AI\wt-lorerelay-test-console-001`
- Product version: `1.82.4` (unchanged)

## Architecture

The candidate is a dependency-free local Node.js application with four layers:

1. `planner.js` collects committed, staged, dirty, and untracked changes; applies version-controlled impact rules; records reasons; and fails closed for unknown packaged files.
2. `engine.js` executes direct process arguments with live stdout/stderr capture, timeouts, cancellation, phase gates, configurable concurrency, and exclusive collision groups.
3. `server.js` exposes the same planner and engine over a `127.0.0.1`-only HTTP API. The compact HTML/CSS/JavaScript dashboard polls current state and renders preflight, reasons, progress, counts, logs, artifacts, and human-smoke status.
4. `report.js` writes a self-contained offline report and concise AI-readable summary below the ignored `.test-runs/` directory.

The BAT launcher changes to the repository directory and invokes `npm run test:console`. CLI entry points use the same code paths as the dashboard.

## Changed files

- `.gitignore`
- `LoreRelay_Test_Console.bat`
- `package.json`
- `scripts/run_all_tests.js`
- `scripts/test_test_console.js`
- `tools/test-console/cli.js`
- `tools/test-console/lib/engine.js`
- `tools/test-console/lib/planner.js`
- `tools/test-console/lib/preflight.js`
- `tools/test-console/lib/report.js`
- `tools/test-console/lib/server.js`
- `tools/test-console/public/app.js`
- `tools/test-console/public/index.html`
- `tools/test-console/public/styles.css`
- `tools/test-console/test-impact-rules.json`
- `tools/test-console/test/test_console.test.js`
- `docs/ai-tasks/LORERELAY-TEST-CONSOLE-001.md`

No `src/`, locale, gameplay, packaged webview, installer, campaign, or live-world file is part of the candidate diff.

## Manifest-sharing strategy

`scripts/run_all_tests.js` remains the only full ordered manifest. It now guards `main()` with `require.main === module` and exports the manifest plus existing helpers. Direct execution, flags, ordering, output shape, and sequential `npm test` behavior are unchanged. The console imports this manifest and adds only its own registered test entry.

Baseline comparison against `08807d9` established:

- baseline entries: 250;
- candidate entries: 251;
- all 250 existing entries remain in the same relative order and appear exactly once;
- the only new entry is `unit:test_test_console.js`;
- `npm test -- --list` reports validate 7, unit 230, smoke 13, simulation 1, total 251.

## Impact-rule design

`tools/test-console/test-impact-rules.json` maps reviewable globs to manifest tests, verify boundaries, reasons, full-suite policy, and exclusive groups. Initial coverage includes webview modules/styles/index, locales, TypeScript source, test scripts, installer paths/helpers, symbol registry, package/version/release truth, samples, simulation/NOAI, documentation, and repository tooling configuration.

For `src/**`, the planner adds conservative exact filename and test-reference inference. Every selected command contains one or more machine-readable reasons. Files not matched by a rule are placed in `unknownFiles`, set `complete: false`, and force a full suite. Verify boundaries are added only when a matched rule records the boundary reason.

Supported modes are focused, verify, integration, and release. Integration adds one final full-manifest gate. Release adds the same automated gate plus a pending, non-automated checklist; it never claims human smoke.

## Exclusive groups and phase gates

- `installer-worktree`: installer and hermetic worktree jobs.
- `fixed-port`: remote-play and WebSocket tests.
- `writer-race`: writer, queue, race, interleave, and atomicity tests.
- `simulation-stress`: simulation and NOAI stress jobs.
- `generated-output`: build/generator boundaries and their serialized readers.
- `full-suite`: the final manifest gate.

Workspace-writer commands run alone. Focused, boundary, and full-suite phases run in order, and a failed/timed-out/cancelled earlier phase prevents later gates from starting. On Windows, cancellation terminates the command process tree with `taskkill /t /f`.

## Fingerprint, resume, and full-suite policy

The SHA-256 run fingerprint includes base SHA, head SHA, dirty diff hash (including untracked content), selected executable/argument definitions, timeouts/groups/phases, `package-lock.json` hash, and relevant Node/npm/Python/Git/PowerShell versions.

A saved plan is rejected when current HEAD, package version, dirty state, or dirty diff hash no longer matches. Passed commands are reused only from local `.test-runs` records with the exact fingerprint. A changed source, test, configuration, command definition, lockfile, or tool version creates a different fingerprint. There is no cross-tree cache.

Full-suite attempts are append-only run directories. A second unchanged-fingerprint full-suite execution requires both `--allow-repeat-full-suite` and a non-empty `--reason`; the override and prior-attempt count are recorded. Resuming an interrupted run may reuse an already passed full-suite command without falsely counting it as a repeat execution.

## Dashboard validation

The local dashboard was exercised in the in-app browser at `127.0.0.1:3219` in verify mode. Measured planned state at a 1265 x 720 viewport:

- status: `planned`;
- identity cards: 5;
- changed-file rows: 16 at the measured pre-documentation state;
- selected-command rows: 4;
- preflight facts: 18;
- unknown warning visible: no;
- browser console warnings/errors: 0;
- human-smoke display: `NOT PERFORMED`.

## Validation results

Focused console run:

- result: PASS, 3/3 selected commands;
- UTF-8 documents: PASS (1,139 files at that run);
- version consistency: PASS;
- orchestration policy tests: PASS, 14/14 after final hardening;
- artifact: `.test-runs/2026-07-13T20-03-58-998Z-08807d98/` (earlier 13-test focused artifact) plus the final direct 14-test console run.

Compatibility checks:

- `npm run compile`: PASS after installing the locked dependencies in this isolated worktree;
- packaged build outputs produced by compile were restored to base and are absent from the candidate diff;
- `npm test -- --list`: PASS;
- baseline manifest order/presence comparison: PASS.

Final full-suite boundary:

- command: integration-mode `npm run test:plan` followed by `npm run test:run`;
- result: PASS, 251/251 manifest entries;
- output: `.test-runs/<UTC-timestamp>-<short-head-sha>/` containing `plan.json`, `results.json`, `summary.md`, `index.html`, and per-command logs;
- human smoke: NOT PERFORMED.

## Sample AI-readable summary

```text
TEST_RUN_PASS

Base: 08807d98234cada6d10ee194779d56202afa2fbd
Target: <candidate-tip>
Version: 1.82.4
Fingerprint: <results.json fingerprint>
Changed files: 17
Focused: 3/3
Full suite: PASS
Unknown files: 0
Human smoke: not performed
Results: 4 passed, 0 failed, 0 skipped; .test-runs/<run>/
```

## Known limitations

- Impact inference is intentionally conservative and filename/reference based; unfamiliar packaged paths force the full suite instead of guessing.
- Live dashboard output uses short-interval localhost polling rather than WebSockets.
- V1 has no database, hosted service, or cross-worktree result cache.
- A process can ignore graceful termination on non-Windows platforms; timeout/cancellation status is still recorded after the direct child closes.
- Package/install refresh, installed-extension identity, real VS Code interaction, and live user-data safety remain manual release checks.

## Safety confirmations

- Production behavior and package version `1.82.4` are unchanged.
- Frozen candidate `task/HUMAN-SMOKE-RELAY-BANNER-RECOVERY-001` remains untouched at `9e304d7188e2e0c61852e204879bf1580f5e3415`.
- `main` and `origin/main` remain untouched at `08807d98234cada6d10ee194779d56202afa2fbd`.
- Installer state, installed VS Code extensions, live world data, user data, and campaign data were untouched.
- The final tooling candidate still requires independent verification before merge or release use.
