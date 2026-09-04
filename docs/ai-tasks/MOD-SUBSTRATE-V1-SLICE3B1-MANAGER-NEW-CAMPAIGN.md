# MOD Substrate V1 Slice 3B1 — Manager for New Campaigns

## Status

`IMPLEMENTATION_IN_PROGRESS_TEST_STOP_REACHED`

Base: `7ca65a1e495e13fbd6e74c7441f15e2cbad91875`

This record is intentionally checked in with the work-in-progress branch so a stopped local run does not lose its exact failure evidence. It is not an acceptance or completion record.

## Scope

- Advanced/settings MOD Manager for global and workspace packages.
- Host-owned folder/ZIP selection through the Slice 3A installer.
- Installed package rescan, compatibility/dependency/conflict status, enable/disable draft, deterministic resolve preview, and confirmed profile/lock commit.
- Activation only for new or empty campaigns. Existing campaign mutation remains deferred to the Slice 3B2 fork lifecycle.
- Adult metadata visibility, installed-payload session authorization, and package activation consent remain three separate actions.
- Adult consent and session authority are bound to `id + version + manifestHash + contentHash`.
- Safe Mode inspection and path/content-free diagnostic export.
- English, Japanese, Simplified Chinese, and Traditional Chinese UI strings.

Explicitly excluded: update, uninstall, workshop/download/update, Prompt MOD, Campaign Kit, Combat fixtures, replace/patch, arbitrary code, Start Hub redesign, Living navigation, and combat aftermath.

## Security contracts

- The webview cannot provide an import filesystem path. The extension host owns the native picker and passes only the selected URI to Slice 3A.
- Webview state contains metadata only. Package payload bytes, installed paths, and hidden adult identifiers/names are not posted.
- Hiding adult metadata revokes in-memory package read authority and clears the current preview.
- Restart creates no adult package read authority. An unchanged adult package must be explicitly re-authorized for the process before activation can leave Safe Mode.
- Profile and lock are published through a destination-local journal. Activation reads recover a known interrupted transaction; unexpected concurrent files fail closed.
- Manager messages have an exact host allowlist. Existing canonical mutation paths continue to use the activation gate.

## Verification checkpoint — 2026-09-04 JST

Completed before the stop:

- `npm ci --ignore-scripts --offline`: PASS
- `node scripts/check_i18n_keys.js`: PASS (1,350 references; zero missing in all four locales)
- `node scripts/validate_webview_html_structure.js`: PASS
- `npm run compile`: PASS after one TypeScript integration repair
- New focused regression added: `scripts/test_mod_manager.js`
- Existing adult adapter regression strengthened so a boolean alone cannot authorize adult payload reads.

The new focused test was attempted three times and stopped per `AGENTS.md` after three failures. All three failures were in newly authored test expectations, not diagnosed production failures:

1. The test searched serialized UI metadata for the word `persona`, but `persona` is a legitimate public capability name. It now uses a private payload sentinel.
2. A strict parser intentionally returned null-prototype objects, so `deepStrictEqual` rejected an otherwise identical approval. The test now compares its JSON value.
3. The test expected launcher ID `mod-manager-open`; the implemented HTML uses `mod-manager-btn`. The assertion now matches the actual stable ID.

No fourth run has been performed. Therefore the focused test, selected plan, independent review, final unchanged-tree full suite, Computer Use smoke, exact-head CI, and Standard Close are still pending.

## Required continuation

Resume from this unchanged worktree by running the new focused test once. If it passes, continue with the Slice 3B1 focused set and the repository High Risk verification sequence. If it exposes a production issue, classify and repair it before broad verification.
