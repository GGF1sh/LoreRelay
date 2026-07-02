# LoreRelay Testing

LoreRelay uses a **manifest-driven test runner** (`scripts/run_all_tests.js`) executed in **GitHub Actions CI** on every push/PR to `main`.

## Quick start

```bash
npm run compile    # required before unit tests (they load out/*.js)
npm test           # full suite
npm run test:unit  # fast core logic tests
npm run test:smoke # integration / layout / remote-play checks
npm run test:validate  # schema, i18n, UTF-8, workflow contracts
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

## CI

Workflow: [`.github/workflows/ci.yml`](.github/workflows/ci.yml)

1. `npm ci`
2. `npm run compile`
3. `npm test` (full manifest)

## Writing new tests

1. Add `scripts/test_<feature>.js` (or `.py` for ComfyUI helpers).
2. Register it in `MANIFEST` inside `scripts/run_all_tests.js` with the right category.
3. Core modules: keep logic in `src/*Core.ts`, test via `require('../out/...')` after compile.
4. VSCode-dependent code: use the `vscode` stub pattern in existing tests (see `test_state_patch.js`).

## Phase 2 (planned)

- `c8` coverage on `*Core.ts` modules
- Coverage artifact upload in CI
- Stricter `validateGameState` numeric range tests