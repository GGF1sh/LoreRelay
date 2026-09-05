# MOD control transaction cleanup R5

Date: 2026-09-05 JST. Risk: **High** (journaled canonical pair, cleanup, crash recovery).
Exact base: `629ca56b850b2a877bc38bbb6e1f60c352269f48`.

## Repair

When a final control file already matched the expected hash, publication left its staged copy behind. The old cleanup retired the journal before attempting to remove that nonempty directory, producing a save failure despite correct canonical files.

Cleanup now begins only after exact canonical hashes and profile/lock semantic consistency validate. It accepts absent known artifacts, validates every present staged/backup file with the existing ordinary-file, identity, link-count, size and hash checks, and revalidates each before unlink. Unknown names and tampered artifacts remain intact.

The transaction and empty staging directories are removed before the journal. Recovery tolerates directories already removed by interrupted cleanup only after proving the exact canonical pair; it cannot publish from missing staging or accept a different final pair. The journal remains the recovery authority until retirement. All cleanup interruptions after canonical validation report `MOD_CONTROL_COMMITTED_CLEANUP_BLOCKED` with `committed: true`, distinguishing committed data from blocked cleanup without changing the UI/protocol.

No recursive production deletion, dependency, transaction framework, UI change, or change to install/adult-consent/Remote Play/checkpoint/combat behavior.

## Verification

The supplied GPT-6 Pro R5 reproduction is reused as independent pre-repair review. No subagent or additional review AI.

The initial Test Console plan omitted MOD behavior tests. Added focused cases to the existing `scripts/test_mod_manager.js`; the regenerated selected plan includes it.

- `npm run test:run -- --plan .test-runs/plans/2026-09-05T12-49-10-974Z-629ca56b-verify.json`: **7/7 PASS**, including compile, MOD Manager, validation and registry checks.
- MOD Manager: **255 assertions PASS**. Real temporary filesystem coverage includes fresh/no-op/both partial equality directions, exact canonical bytes and no unnecessary publication, one/both sides published, present/absent staging and backups, repeated recovery, existing concurrent-final rejection, unknown/tampered/oversized/hardlinked evidence preservation, and actual interruptions after staged/backup unlink, transaction/staging rmdir and journal unlink.
- Final `npm test`: **344/344 PASS**, including 16 combat groups / **736 tests, 736 passed, 0 failed**, 201.3 seconds. Executed once on the final unchanged executable tree; only this documentation result was added afterward. Log: `.test-runs/full-suite.log` in the task worktree. Includes the existing MOD activation, Safe Mode and install regressions.

The original dirty checkout and all existing worktrees are retained. Computer Use was not performed. Standard Close is authorized; exact-head CI, natural automatic review completion, merge gates and post-merge main CI are checked live and recorded on the PR and in the final response.
