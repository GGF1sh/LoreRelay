# INSTALLER-RELEASE-001: Fallback False-Failure Fix + Version Bump

Status: `INSTALLER_RELEASE_001_READY_FOR_VERIFY`

## Delivery identity

- Base `origin/main`: `dca8ddf282360fcc192697a0a0f377292ac00bb2` (confirmed via `git rev-parse origin/main` — matches the expected base exactly)
- Branch: `task/INSTALLER-RELEASE-001-fallback-versioning`
- No merge performed. MEDIA-M1 implementation was not modified.

## 1. Confirmed root cause (reproduced, hypothesis tested — not assumed)

The reported failure log showed all three Antigravity direct-folder fallback targets report
`Folder copy: OK`, immediately followed by overall failure: `Argument types do not match` /
`引数の型が一致しません`.

### Investigation method

Built minimal, isolated repro scripts and ran them directly under the actual Windows PowerShell
5.1 host (`$PSVersionTable.PSVersion` = `5.1.26100.8737`) rather than assuming the stated
hypothesis:

1. First reproduced the **exact** structure of `install_vscode_extension.ps1`'s
   `Invoke-PrimaryInstallWithFallback` + `FallbackAction` closure with 3 synthetic targets —
   confirmed the exact failure: all 3 "Folder copy: OK" lines print, then
   `Antigravity direct-folder fallback failed: Argument types do not match`.
2. Bisected line-by-line: `return $results` (no `@()` wrap) succeeds; `return @($results)`
   throws `System.ArgumentException: Argument types do not match` at that exact line.
3. Isolated further: the failure is specific to `@()` wrapping a
   `System.Collections.Generic.List[object]` — **not** `List[string]` (works), **not**
   `System.Collections.ArrayList` (works), **not** a manual `foreach` copy into a plain array
   (works), and **not** `return $results` unwrapped (works, auto re-collected as `Object[]`
   by the assignment). Both a single-item and an empty `List[object]` reproduce the throw.
4. Confirmed the fix: `$results.ToArray()` succeeds in every case tested (1 item, 3 items,
   empty) and preserves element count/content.

### Root cause

**Confirmed** (not merely hypothesized): on this Windows PowerShell 5.1 build, the array
subexpression operator `@()` throws `System.ArgumentException: Argument types do not match`
specifically when applied to a `System.Collections.Generic.List[object]` (the generic parameter
being literally `object`, not a concrete type). This is a PowerShell/.NET binder quirk in the
array-construction path used by `@()`, not a bug in the surrounding orchestration logic. The
exact failing line was `scripts/install_vscode_extension.ps1:136` (before fix):
`return @($results)` inside the Antigravity direct-folder `FallbackAction` closure.

Everywhere else in the codebase that builds a `List[object]` (`$movedExisting` in
`Install-PreparedExtensionToDirAtomic`) never wraps it with `@()` — it is only iterated via
`foreach` and read via `.Count`, so no other call site was affected. `Get-AntigravityExtensionsDirs`
returns a `List[string]` (unaffected type) without `@()` wrapping at its `return` site either.
Grep across `scripts/*.ps1` confirmed exactly one affected line.

Exception message locale note: the message text is rendered in the host's active
locale/codepage — the direct interactive repro produced English (`Argument types do not match`),
while invoking the same script through Node's `spawnSync` (as the test harness does) produced the
Japanese rendering (`引数の型が一致しません`) of the same `System.ArgumentException`. Both are the
same underlying exception; regression tests compare by exception **type**, not message text, to
stay locale-independent.

## 2. Fix applied

`scripts/install_vscode_extension.ps1` (Antigravity direct-folder `FallbackAction` closure):

```powershell
# before
return @($results)

# after
return $results.ToArray()
```

`.ToArray()` is available on `List<T>` in both Windows PowerShell 5.1 and PowerShell 7 and does
not go through the `@()` array-subexpression binder path that throws on this host. No other
production logic in `Invoke-PrimaryInstallWithFallback`, `Install-PreparedExtensionToDirAtomic`,
or the primary/fallback control flow was changed.

### Required behavior verified

`Primary CLI fails -> fallback runs -> all direct-folder targets succeed -> FallbackSucceeded =
true -> installer would exit 0` — reproduced end-to-end with the real
`Invoke-PrimaryInstallWithFallback` function (from `install_common.ps1`) and a `FallbackAction`
matching the real closure shape; `FallbackSucceeded = True`, all 3 results preserved, primary CLI
error retained only as a warning (`PrimaryError` set, no exception).

## 3. Version bump

| Location | Before | After |
| --- | --- | --- |
| `package.json` `version` | `1.77.15` | `1.78.0` |
| `package-lock.json` root `version` | `1.77.15` | `1.78.0` |
| `package-lock.json` `packages[""].version` | `1.77.15` | `1.78.0` |
| `README.md` / `README_en.md` / `README_zh-CN.md` / `README_zh-TW.md` badge | `1.77.15` | `1.78.0` |
| `CHANGELOG.md` first section after `[Unreleased]` | `[1.77.15]` | `[1.78.0] - 2026-07-10` (promoted from the accumulated `[Unreleased]` content, which already included MEDIA-M1 and everything integrated since 1.77.15 but had never been given a release heading) |
| `docs/VERSION_TRUTH.md` "現行" table | `1.77.15` | `1.78.0`, plus a new row recording MEDIA-M1 + this installer fix |

This is a **minor** bump (`1.77.15` -> `1.78.0`) because it identifies a backward-compatible
feature phase (MEDIA-M1 Compatibility Gate + Media Profile Spine) that was already merged to
`origin/main` (`6ab4bf1`) but had never been given its own version identity — every VSIX built
since then still reported `1.77.15` regardless of content. The installer fallback fix travels in
the same 1.78.0 identity because it is required for the 1.78.0 candidate to install and be human-
smoked at all; it does not by itself justify a separate bump.

### Versioning rule (added to `docs/VERSION_TRUTH.md`)

- **Patch bump** — repair-only release builds (bug/installer fixes, no behavior-visible feature).
- **Minor bump** — backward-compatible feature phases (e.g. MEDIA-M1).
- A **human-smoke candidate integrated to main** must carry a version identity newer than the
  previously shipped/tested candidate (prevents "same version number, different contents").
- **Docs-only commits** (review/report/handoff documents that do not touch `src/` or packaged
  content) do not require a version bump.

### Authoritative version location

`docs/VERSION_TRUTH.md` is the authoritative record (already existed prior to this task). It
names `package.json` `version` and the `CHANGELOG.md` first section after `[Unreleased]` as the
two sources of truth, cross-checked mechanically by `scripts/check_version_consistency.js`
(already wired into `npm test` under the `validate` category — this task did not need to create
a new version-consistency checker, only keep the existing one green and extend
`docs/VERSION_TRUTH.md`'s narrative rules).

## 4. Version / install interaction

- `npm run compile` succeeded and reported `lorerelay@1.78.0` in both `build:webview` and the
  top-level `compile` script banner.
- `New-LoreRelayVsixArtifactPath -Version '1.78.0'` (real function, not reimplemented) resolves
  to `lorerelay-1.78.0.vsix` — verified behaviorally (test F).
- A synthetic VSIX built with `package.json` name `lorerelay` / publisher `Miya` / version
  `1.78.0` passes `Test-VsixPackageIntegrity` reporting `PackageVersion = 1.78.0`, and the
  extracted `extension/package.json` (`Get-ExtractedExtensionPackageInfo`) also reports `1.78.0`
  (tests G).
- Direct-folder target directory naming (`"$ExtensionId-$Version"` in
  `Install-PreparedExtensionToDirAtomic`) resolves to `miya.lorerelay-1.78.0` once `$Version` is
  `1.78.0` — unchanged logic, confirmed by inspection; not independently re-tested here because
  the existing `Install-VsixToDirDirectAtomic` regression tests already exercise this naming
  with a synthetic version and the naming template itself was not touched.

This bump alone does not eliminate IDE file locking (the primary CLI `EPERM: operation not
permitted, rename` failure that triggers the fallback in the first place is a separate, pre-
existing condition — likely the Antigravity IDE holding the currently-loaded extension file open).
What it does fix is that a **successful** fallback is no longer misreported as a failure, and that
repeatedly reinstalling unrelated builds under the same stale `1.77.15` identity is no longer
happening going forward.

## 5. Tests

Extended `scripts/test_antigravity_installer.ps1` (already wired into `npm test` via
`scripts/test_antigravity_installer.js`, category `unit` — no new manifest entry needed).

| Test | What it proves |
| --- | --- |
| A | Primary unavailable + fallback succeeds once => `FallbackSucceeded = true`, result preserved |
| B | Primary fails + 3 fallback targets all succeed => overall success, all 3 results preserved, primary error retained only as a non-fatal warning field |
| C | Primary fails + fallback itself throws => overall failure, thrown message contains **both** the primary and fallback error text |
| D | (a) confirms the root cause precisely: `@(List[object])` throws `System.ArgumentException` on this host (checked by exception **type**, locale-independent); (b) confirms the fix: `List[object].ToArray()` does not throw and preserves all elements |
| E/F | `package.json` version equals `1.78.0`; `New-LoreRelayVsixArtifactPath` resolves to `lorerelay-1.78.0.vsix` |
| G | A synthetic VSIX built at version `1.78.0` reports `1.78.0` both from `Test-VsixPackageIntegrity` and from the extracted `extension/package.json` |

Version-file consistency (package.json / package-lock.json root / `packages[""]`) is covered by
the pre-existing `scripts/check_version_consistency.js` (already in the `validate` manifest
category) rather than a new duplicate test — it already checks exactly what task item E asked for,
plus README badges, `VERSION_TRUTH.md`, and the CHANGELOG release heading.

### Exact commands run and results

```
npm run compile                              -> PASS (lorerelay@1.78.0)
node scripts/test_antigravity_installer.js   -> PASS (all existing + new A-G assertions)
node scripts/check_version_consistency.js    -> PASS (9/9 checks)
npm test                                     -> PASS 235/235 (45.5s)
```

`npm test` was run exactly once after all fixes/tests/version edits were in place, per the
"do not repeatedly run the full suite" instruction; the narrow installer test and version check
were run first and iterated on directly.

## 6. Changed files

Production/tooling:
- `scripts/install_vscode_extension.ps1` — the one-line fallback aggregation fix (`@($results)`
  -> `$results.ToArray()`), with an explanatory comment.

Version identity (7 files, all required by `check_version_consistency.js`):
- `package.json`, `package-lock.json`, `README.md`, `README_en.md`, `README_zh-CN.md`,
  `README_zh-TW.md`, `docs/VERSION_TRUTH.md`

Changelog:
- `CHANGELOG.md` — promoted the accumulated `[Unreleased]` section to `[1.78.0] - 2026-07-10`,
  opened a fresh empty `[Unreleased]` above it, added the missing MEDIA-M1 feature entry (the
  code was already merged but had no changelog entry) and a new `### Fixed` entry for this
  installer repair + the stale-version problem.

Tests:
- `scripts/test_antigravity_installer.ps1` — added regression tests A-D (fallback aggregation)
  and F-G (version-aware VSIX naming/extraction); no new test manifest entry required (existing
  `test_antigravity_installer.js` wrapper already runs it).

Not committed: `webview/script.js` showed as modified by `git status` after `npm run compile`,
but `git diff --stat` for that file was empty (zero insertions/deletions) — a known EOL/CRLF
normalization artifact for this repo (`docs/AI_INTEGRATOR_CHAT_HANDOFF.md` §16.7), not a real
content change, so it was left uncommitted.

## 7. MEDIA-M1 state

MEDIA-M1 implementation (`src/mediaProfileCore.ts`, `src/mediaCompatibility.ts`, and all other
MEDIA-M1 touch-set files) was **not modified** in this task. MEDIA-M1 remains merged to
`origin/main` at `6ab4bf1` with independent adversarial verification `MEDIA_M1_VERIFY_PASS`
(`docs/ai-tasks/MEDIA-M1-INDEPENDENT-VERIFY.md`). MEDIA-M1 is **not** marked `DONE` by this task.

## 8. Exact post-integration recovery steps

Once this branch is reviewed/merged to `main` (not performed by this task):

1. `git fetch origin && git checkout main && git pull` — confirm `origin/main` now includes this
   fix and `package.json` version `1.78.0`.
2. Run the canonical installer BAT (`install_extension_antigravity.bat`) for real; require
   process exit `0`.
3. Confirm the Antigravity IDE now reports the extension installed at version `1.78.0` (either
   via successful CLI install or, if the CLI `EPERM` rename condition recurs, via the
   direct-folder fallback correctly reporting success this time).
4. Only then continue the existing MEDIA-M1 human smoke steps A-D from
   `docs/ai-tasks/MEDIA-M1-COMPATIBILITY-PROFILE-SPINE.md` (known-bad Anima stack rejected,
   legal SDXL/Illustrious stack generates, bad world-map inheritance rejected, legal world-map
   binding proceeds).
5. Update `docs/AI_INTEGRATOR_CHAT_HANDOFF.md` / the control board once the real human smoke is
   recorded — do not mark MEDIA-M1 `DONE` until that gate closes.

## Final verdict

`INSTALLER_RELEASE_001_READY_FOR_VERIFY`
