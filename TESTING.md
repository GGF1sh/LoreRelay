# LoreRelay Testing

LoreRelay uses a **manifest-driven test runner** (`scripts/run_all_tests.js`) executed in **GitHub Actions CI** on every push/PR to `main`.

## Quick start

```bash
npm run compile    # required before unit tests (they load out/*.js)
npm test           # full suite
npm run test:unit  # fast core logic tests
npm run test:smoke # integration / layout / remote-play checks
npm run test:validate  # schema, i18n, UTF-8, workflow contracts
npm run test:coverage  # unit suite + c8 coverage on out/*Core.js
```

List all scripts and categories:

```bash
node scripts/run_all_tests.js --list
```

## Categories

| Category | Purpose | Examples |
|----------|---------|----------|
| **validate** | Repo invariants, schemas, i18n parity, cartography workflow JSON | `validate.js`, `check_i18n_keys.js` |
| **unit** | Pure/core logic (TypeScript `*Core.ts` compiled to `out/`), state patch, world generation | `test_tile_overmap_core.js`, `test_state_manager.js` |
| **smoke** | Heavier checks: Webview bundle, sample scenarios, remote play, cartography layout render | `test_webview_bundle.js`, `test_cartography_layout_smoke.js` |

`validate.js` also runs nested suites inline: `test_turn_result_pipeline.js`, `test_state_patch.js`, `test_lorebook.js`, `test_lorebook_python.py`.

Each manifest entry has a per-process timeout (default: 60s). Long-running smoke tests can opt into a larger timeout in `scripts/run_all_tests.js`; a hung test now fails with a clear timeout instead of freezing CI.

## Coverage (Phase 2–3)

Configuration: [`.c8rc.json`](.c8rc.json)

- **Scope:** compiled `out/*Core.js` only (pure logic modules)
- **Command:** `npm run test:coverage` (runs `test:unit` under c8)
- **CI gate:** aggregate thresholds — lines/statements ≥70%, functions ≥65%, branches ≥65%
- **Artifact:** `coverage/lcov.info` uploaded on each CI run (download from Actions → Artifacts)

Current baseline (unit suite): ~92% lines / ~75% branches on Core modules. Phase 3 added targeted tests for `scenarioPackCore`, `mediaPathCore`, `cartographyPathCore`, and `ttsBridgeCore` branch gaps.

### Phase 3 test additions

| Script | Covers |
|--------|--------|
| `test_scenario_pack_core.js` | `resolveBundledSampleDir`, `BUNDLED_SAMPLE_IDS`, `OPTIONAL_PACK_FILES`, extRoot layout |
| `test_media_paths.js` (extended) | `getImageMimeType`, missing file / directory rejection, `isAllowedImagePath` |
| `test_cartography_path_core.js` (extended) | empty paths, invalid temp map hex |
| `test_tts_bridge_core.js` (extended) | `defaultEdgeVoiceForLang`, `rateToEdgeTtsPercent`, `sanitizeTtsBridgePayload`, `redactTtsLogText` |

Shared VSCode stub: [`scripts/test_helpers/vscode_stub.js`](scripts/test_helpers/vscode_stub.js) — use `installVscodeStub()` when loading extension code that imports `vscode`.

## CI

Workflow: [`.github/workflows/ci.yml`](.github/workflows/ci.yml)

CI is split so the unit suite is not run twice:

- `validate-and-smoke`: `npm ci` -> `npm run compile` -> `npm run test:validate` -> `npm run test:smoke`
- `coverage`: `npm ci` -> `npm run compile` -> `npm run test:coverage`
- Coverage job uploads `coverage/lcov.info`

Tag pushes (`v*`) run `.github/workflows/release.yml`, compile the extension, package a VSIX, upload it as an artifact, and attach it to the GitHub Release.

## Writing new tests

1. Add `scripts/test_<feature>.js` (or `.py` for ComfyUI helpers).
2. Register it in `MANIFEST` inside `scripts/run_all_tests.js` with the right category.
3. Core modules: keep logic in `src/*Core.ts`, test via `require('../out/...')` after compile.
4. VSCode-dependent code: use [`scripts/test_helpers/vscode_stub.js`](scripts/test_helpers/vscode_stub.js) (`installVscodeStub()`) or follow the inline pattern in `test_state_patch.js`.

## validateGameState hardening

`scripts/test_validate_game_state.js` covers numeric ranges for `world.regions.*.dangerLevel` (0–10, finite) and `world.worldTurnAtLastSync` (finite, ≥0). Extend this file when adding new `game_state.json` numeric fields.
