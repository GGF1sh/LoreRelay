# INSTALLER-RELEASE-001 Integration

Status: `INSTALLER_RELEASE_001_INTEGRATED_READY_FOR_REAL_INSTALL`

Integrated to `main`:

- implementation candidate: `ee005c5f27c95348838526943eaf27e92f9c5939`
- independent verify: `9ba4fe47c2726bec83e5ba0942aff9fe82f545eb`

Preflight passed: `origin/main` was exactly
`dca8ddf282360fcc192697a0a0f377292ac00bb2`; the candidate was main plus exactly
one commit; and the independent verifier was a docs-only commit for the exact
candidate, changing only `INSTALLER-RELEASE-001-INDEPENDENT-VERIFY.md`.

FAST post-merge gates passed:

- `npm run compile`
- `node scripts/check_version_consistency.js`
- `powershell.exe -File scripts/test_antigravity_installer.ps1`

Integrated-main checks passed:

- `package.json`: `1.78.0`
- `package-lock.json` root: `1.78.0`
- `package-lock.json` `packages[""]`: `1.78.0`
- installer aggregation: `return $results.ToArray()`
- expected VSIX name: `lorerelay-1.78.0.vsix`

No canonical installer, VSIX installation, or full `npm test` was run in this lane.

## Required human action

1. Fully exit Antigravity IDE.
2. Run `C:\AI\text-adventure-vsce\install_extension_antigravity.bat`.
3. Require installer exit `0`.
4. Require installed LoreRelay version `1.78.0`.
5. Restart Antigravity.
6. Continue MEDIA-M1 real smoke A-D.

Do not mark INSTALLER-RELEASE-001 DONE before the canonical BAT succeeds. Do not
mark MEDIA-M1 DONE before its human smoke passes.
