# RUNTIME-003A Post-Merge Smoke Result

Date: 2026-07-07 JST

Task branch: `task/RUNTIME-003A-durable-replay-guard`

Latest `origin/main` integrated into task branch: `ec984f520352d4765b7e26bebade9441f6386d5f`

Task branch integration commit: `64021561e7310d107c29167aec273b9eb6e949f1`

Main merge commit: `5740fbbdb415c46be96c22ebca0a80a51625cee2`

## Pre-Main-Merge Verification

On `task/RUNTIME-003A-durable-replay-guard` after merging latest `origin/main`:

- Conflict check: PASS, no conflicts.
- `npm run compile`: PASS.
- `node scripts/test_runtime_accepted_replay_guard.js`: PASS.
- `npm test`: PASS, `225/225`.

The task branch was pushed before main merge:

- `origin/task/RUNTIME-003A-durable-replay-guard` -> `64021561e7310d107c29167aec273b9eb6e949f1`.

## Main Merge

Merged `origin/task/RUNTIME-003A-durable-replay-guard` into latest `origin/main`.

Conflict check: PASS, no conflicts.

No conflict-resolution implementation changes were needed.

## Post-Merge Smoke

Post-merge smoke was run from a clean detached worktree based on `origin/main`, after installing dependencies with `npm ci --include=dev`.

Commands:

- `npm ci --include=dev`: PASS.
- `npm run compile`: PASS.
- `node scripts/test_runtime_accepted_replay_guard.js`: PASS.
- `npm test`: PASS, `225/225`.

Note: an initial `npm run compile` attempt in the fresh detached worktree failed before dependency installation because `node_modules` was absent (`tsc` and `mermaid.min.js` unavailable). After `npm ci --include=dev`, the required smoke commands passed.

## Git / EOL State

EOL-only webview build artifacts were not staged or committed:

- `webview/script.js`
- `webview/style.css`
- `webview/vendor/mermaid.min.js`

`git diff --ignore-space-at-eol` reported no substantive diff for those files.

## Final Verdict

`RUNTIME003A_POST_MERGE_SMOKE_PASS`
