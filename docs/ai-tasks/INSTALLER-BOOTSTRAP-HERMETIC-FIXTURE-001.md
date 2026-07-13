# INSTALLER-BOOTSTRAP-HERMETIC-FIXTURE-001

## Metadata
* Prompt generation timestamp: 2026-07-14 01:02:31 JST
* Exact base/main SHA: da11e836c6e44a796e43ae12da44224bfcb1171c

## Defect
* Exact original failure: `git push origin HEAD:main failed. ! [rejected] HEAD -> main (non-fast-forward)` in `pushRemoteMainUpdate()`.
* Root cause: The bare clone inherited all local branches and default HEAD from the source repository. The updater cloned this default HEAD, meaning `HEAD:main` would be a non-fast-forward push if the default HEAD was not a descendant of the bare repository's main (e.g. a detached candidate or task branch).

## Fix
* Before topology: `git clone --bare testRoot bareOrigin`, inheriting all local branches and a contextual default HEAD.
* After topology: `git init --bare bareOrigin`, explicitly pushing only `candidateSha` to `refs/heads/main`, and symbolically setting `HEAD` to `refs/heads/main`.
* Bare-origin HEAD and main assertions: Added explicit assertions to verify that bare origin HEAD resolves to `refs/heads/main` and points to the baseline SHA.
* Changed files: `scripts/test_helpers/local_installer_git_fixture.js`
* Confirmation: Installer production behavior was unchanged (no product files modified).

## Validation
* Adversarial topology matrix: All passed (symbolic HEAD on main, symbolic HEAD on unrelated task branch, detached HEAD, main advancing independently).
* 20-run focused result: 20/20 passed.
* Related installer test results: Passed.
* Full-suite result: 248/249 passed. `test_runtime_accepted_replay_guard.js` failed (exit 1).
* Log path: `C:\AI\logs\installer-bootstrap-hermetic-fixture-001-full-suite.log`
* Impact-test selection rationale: Focused tests were selected because they directly relate to the installer bootstrap, managed installer worktree, and local-origin fetch behavior. The full suite was run once as the final integration-readiness boundary.
* Skipped domains: UI, simulation, writer-lease, economy, OCR, and media focused tests were skipped during initial validation because their dependency surfaces were unchanged.
* Version decision: 1.82.3 (unchanged).
* Limitations: Blocked by unrelated test failure `test_runtime_accepted_replay_guard.js`.

## Safety Confirmations
* Main, managed installer checkout, installed extension, and live world were untouched.
* No human smoke was performed.
