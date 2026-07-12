# INSTALLER-TEST-HERMETIC-001

## Result

**INSTALLER_TEST_HERMETIC_READY_FOR_VERIFY**

The former full-suite failure was test-infrastructure nondeterminism: both
installer tests executed the real `install_extension_antigravity.bat`, whose
intentional `git fetch origin` contacted GitHub. With GitHub unavailable, P3
integration stopped at 243/245 despite no P3 regression.

## Local fixture design

`scripts/test_helpers/local_installer_git_fixture.js` creates, under a unique
account-owned temporary directory, a local bare origin, a disposable source
clone, and the disposable managed-checkout path. The source clone is detached
at the tested candidate and its `origin` is the absolute local bare-repository
path. The helper clears proxy variables, sets `GIT_TERMINAL_PROMPT=0`, enumerates
the source remotes, and rejects HTTP, SSH, GitHub, or non-absolute remote URLs.

The real BAT runs from that disposable clone and therefore performs its real
`git fetch origin` and real worktree orchestration exclusively against the
local bare origin. The bootstrap test pushes a disposable commit to local
`origin/main` and proves the fetch observes it; both tests temporarily hide the
local bare origin and prove fetch failure prevents managed-worktree creation
and installer invocation. Cleanup removes fixture worktrees and the exact
temporary fixture root.

## Production non-regression

No production installer or gameplay file changed. In particular,
`install_extension_antigravity.bat` remains the normal human entry point with
default `origin/main` and `git -C "%SOURCE_DIR%" fetch origin`; its managed
checkout and SHA-256 Skill-authority wiring are unchanged. No live installer,
human-facing managed checkout, live user workspace, or network gameplay was
used.

## Coverage retained

- Bootstrap: local `origin/main` fetch, managed worktree create/update,
  unmanaged-directory refusal, invalid-ref refusal, remote-update observation,
  local fetch-failure behavior, source identity/dirty-state preservation, and
  cleanup.
- Install chain: prepare-only invokes neither installer; extension success then
  Skill success exits zero; extension failure skips Skill; Skill failure
  propagates; the Skill runs from the managed checkout; SHA-256 authority is
  still present; local fetch failure is safe.
- Fixture remotes are verified as absolute local paths. This is not an OS-level
  network sandbox; it proves every Git remote reachable by the test fixture is
  local.

## Gates

- Focused: `test_antigravity_installer_bootstrap.js`,
  `test_antigravity_install_chain.js`, `test_antigravity_skill_installer.js`,
  and `test_antigravity_file_bridge.js` all passed without GitHub reachability.
- Canonical: webview build, compile, i18n keys, symbol registry, and version
  consistency all passed.
- Full suite: **245/245 passed**, exit 0. Complete uncommitted external log:
  `C:\AI\logs\installer-test-hermetic-full-suite.log`.

## Limitations

The fixture validates Git remote isolation, not a universal operating-system
network deny policy. Production installer behavior intentionally remains able
to fetch its configured real origin for normal human use.
