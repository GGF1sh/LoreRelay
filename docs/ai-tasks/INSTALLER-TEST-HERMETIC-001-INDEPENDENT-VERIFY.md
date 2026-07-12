# INSTALLER-TEST-HERMETIC-001 Independent Verification

Date: 2026-07-12

Verdict: INSTALLER_TEST_HERMETIC_VERIFY_PASS

## Scope

Verified branch `task/INSTALLER-TEST-HERMETIC-001` at `2a58ed81a4a5cfe16328891a5968124729751c04` in isolated worktree:

`C:\AI\wt-installer-test-hermetic-001-independent-verify`

No live installation was run. No Antigravity, ComfyUI, Relay/LLM gameplay, or image generation was run. The live worktree `C:\AI\wt-lorerelay-installer-current` was not touched.

## Integrity

- `origin/main` is `b7fccbeab75e2c86fe0a5b780069f6b9bbd66880`, matching the expected base.
- P3 repair candidate `c516db410560d1ddde5c210c90201e529ff2e968` is `main + 4`.
- Hermetic implementation `947a1b3312e29e6a743f0e3bafa23438690ae93b` has parent `c516db410560d1ddde5c210c90201e529ff2e968`.
- Hermetic report `2a58ed81a4a5cfe16328891a5968124729751c04` has parent `947a1b3312e29e6a743f0e3bafa23438690ae93b`.
- Total candidate shape is `main + 6`.
- Report commit `2a58ed8` is docs-only: `docs/ai-tasks/INSTALLER-TEST-HERMETIC-001.md`.
- Package version remains `1.79.0`.

Hermetic implementation changes only:

- `scripts/test_antigravity_installer_bootstrap.js`
- `scripts/test_antigravity_install_chain.js`
- `scripts/test_helpers/local_installer_git_fixture.js`

No candidate change was found in the production installer files, package/version files, `src/**`, or `webview/**` relative to the hermetic implementation boundary. Production installer files are byte-identical to `c516db4`:

- `install_extension_antigravity.bat`
- `scripts/install_vscode_extension.ps1`
- `scripts/install_antigravity_skill.ps1`

## Fixture Architecture

`scripts/test_helpers/local_installer_git_fixture.js` creates one unique `lorerelay-installer-hermetic-*` temporary root containing a local bare origin, disposable source clone, disposable managed checkout path, and local-only temporary refs/commits.

Verified controls:

- Fixture clone origin is an absolute local filesystem path.
- Fixture rejects HTTP, HTTPS, SSH, `git@`, and `github.com` remotes.
- `GIT_TERMINAL_PROMPT=0` is set for fixture process execution.
- Proxy variables are cleared in the fixture environment.
- The real repository origin, global Git config, and real repository refs are not modified.
- The human managed checkout is not used; tests pass `LORERELAY_INSTALLER_WORKTREE` under the fixture temp root.
- Cleanup removes the managed fixture worktree and the exact fixture temp root.
- Bootstrap and chain tests were run with `TEMP`/`TMP` set to `C:\AI\tmp installer hermetic verify`, covering spaces and Windows path separators.

I do not claim OS-level network isolation. The proof is fixture-level: local-only remotes, network remote rejection, prompt suppression, proxy clearing, and real `git fetch origin` against a local bare repository.

## Fetch Proof and Failure

Bootstrap test proved real fetch behavior:

- Created local bare `origin/main`.
- Ran the real production BAT from a disposable clone.
- Pushed a new disposable commit to the local bare `origin/main`.
- Ran the BAT again.
- Proved the managed checkout observed the new commit.
- Verified BAT output includes the real `git fetch origin` path.

Fetch failure test made the local bare origin unavailable by renaming it, without using any internet URL. It proved:

- BAT exits nonzero.
- Output reports `git fetch origin failed`.
- No managed worktree is created for the failed fetch path.
- Extension stub is not invoked.
- Skill stub is not invoked.
- Fixture is restored and cleaned afterward.

## Coverage

Retained bootstrap behavior verified:

- Managed worktree creation at `origin/main`.
- Existing managed worktree update to requested `HEAD`/ref.
- Incorrect unmanaged directory refused without deletion.
- Invalid ref refused before worktree creation.
- Source branch, HEAD, and dirty state unchanged.
- Local remote update observed after real fetch.
- Cleanup removes fixture worktree and temp root.

Retained install-chain behavior verified with the real BAT and fixture-only installer stubs:

- Prepare-only invokes neither installer.
- Extension success invokes Skill afterward.
- Both success returns zero.
- Extension failure skips Skill and propagates code.
- Skill failure propagates code.
- Skill runs from managed checkout.
- SHA-256 authority remains referenced.
- No real extension or Skill is installed.
- No dangling fixture commit/ref remains in the real repository.

## Production Non-Regression

Compared production installer files byte-for-byte with `c516db4`; no diff.

Confirmed:

- Human-facing BAT unchanged.
- Default ref remains `origin/main`.
- Production fetch behavior remains `git -C "%SOURCE_DIR%" fetch origin`.
- Managed checkout path default remains `C:\AI\wt-lorerelay-installer-current`.
- Extension installer runs before Skill installer.
- Mandatory Skill SHA-256 verification remains in `scripts/install_antigravity_skill.ps1`.
- P2/P3 production code is unchanged by the hermetic test/report commits.

## Test Results

Focused tests:

- `node scripts/test_antigravity_installer_bootstrap.js` passed with local fixture origin under `C:\AI\tmp installer hermetic verify\...\origin.git`.
- `node scripts/test_antigravity_install_chain.js` passed with local fixture origin under `C:\AI\tmp installer hermetic verify\...\origin.git`.
- `node scripts/test_antigravity_skill_installer.js` passed.
- `node scripts/test_antigravity_file_bridge.js` passed after compile artifacts were present.

Canonical gates:

- `npm run build:webview` passed.
- `npm run compile` passed.
- `node scripts/check_i18n_keys.js` passed.
- `npm run check:symbol-registry` passed.
- `node scripts/check_version_consistency.js` passed.

Full suite:

- Command run once: `npm test`
- Combined stdout/stderr log: `C:\AI\logs\installer-test-hermetic-verify-full-suite.log`
- Exit code: 0
- Manifest result: `Passed: 245/245`
- No failed scripts.

