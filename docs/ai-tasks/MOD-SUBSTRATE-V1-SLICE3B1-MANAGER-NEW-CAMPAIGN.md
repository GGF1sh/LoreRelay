# MOD Substrate V1 Slice 3B1 — Manager for New Campaigns

## Status

`LOCAL_NON_GUI_VERIFICATION_COMPLETE_EXTERNAL_GATES_PENDING`

Base: `7ca65a1e495e13fbd6e74c7441f15e2cbad91875`

This record preserves the stopped-run evidence and the resumed High Risk verification. It is not an acceptance or completion record: exact-head CI and native Computer Use smoke remain terminal gates.

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

At this initial checkpoint no fourth run had been performed. The focused test, selected plan, independent review, final unchanged-tree full suite, Computer Use smoke, exact-head CI, and Standard Close were still pending.

### Authorized continuation result

The focused test was run once after explicit continuation authorization and stopped on a fourth test-only expectation error. The webview uses an `if (message.type === 'modManagerState')` listener and calls `packagesEl.replaceChildren()`; the static assertion incorrectly required a `case 'modManagerState'` switch branch. The assertion now matches the actual event-listener contract. No additional test run has been made after this failure.

The next explicitly authorized single run stopped on another test-only key mismatch: the localization assertion required `webview.modManager.adultVisible`, while the UI and all four locale bundles consistently use `webview.modManager.showAdult`. The assertion now checks the production key. No additional run has been made after this failure.

### Focused continuation PASS

After the next explicit continuation, the corrected test and the complete affected MOD regression set passed on HEAD `0252434077249f3a56d0b2ca7e900ae83a8aa4e9`:

- MOD Manager 3B1: 72 assertions
- Install lifecycle: 126 assertions
- Presentation adapters: 162 assertions
- Content adapters: 94 assertions
- MOD Substrate V1: 191 assertions
- Activation gate boundaries: 130 assertions

No executable source changed during these runs.

## Final non-GUI verification

- GitHub Codex security review completed once on `2ce20edcaa296e4bc2601b09fa2e117984aaf9aa`: no security findings.
- The existing exact-head CI failure was classified as stale generated Symbol Registry files, not a coverage threshold or product-test failure.
- One repair pass ran `npm run generate:symbol-registry`; only `docs/generated/SYMBOL_REGISTRY.md` and `docs/generated/symbol_registry.json` changed.
- Direct repair verification: `npm run check:symbol-registry` PASS (5,581 entries).
- Final clean Test Console plan target: `d167a52cc7928fb8ddd3cede30ac6be2a3bb033a`.
- Selected plan result: 27/27 commands PASS, including 24/24 focused commands, compile, UTF-8, i18n, webview structure/bundle, validation, and Symbol Registry checks.
- The plan required a fail-closed full suite because `scripts/build-webview.js` is not classified by the planner.
- One full suite on the final unchanged executable tree: 342/342 PASS; Combat 736/736 PASS; duration 174.7 seconds.
- Result directory: `.test-runs/2026-09-04T08-54-16-604Z-d167a52c`.

## Remaining terminal gates

- Push the documentation-only Symbol Registry repair and this record, then require exact-head PR CI success.
- Native Windows Computer Use smoke remains blocked by this Codex session exposing browser surfaces only (`apps=[]`). No additional retry is required in the same environment.
- Resume smoke on the same final HEAD only when native desktop-app control is available. Keep every controlled window on monitor 2.
- Until smoke passes, keep PR #94 Draft and do not Ready, merge, or claim Standard Close.
