# World Intent WI7b Migration Backup Restore Gate

> Status: Design proposal / ChatGPT-Codex gate.
> Date: 2026-07-04.
> Depends on: WI7 migration write-back gate.
> Scope: explicit, user-confirmed restore from a WI7 migration backup for `vehicle_state.json`.

## 1. Why WI7b Exists

WI7 introduces the first migration write-back path:

```text
vehicle_state.json v0 -> v1
```

It creates a strict timestamped backup before writing, but intentionally defers automatic rollback. That is the right call: rollback is also a write path, and write paths need their own gate.

WI7b defines that gate.

The purpose is narrow:

```text
Restore vehicle_state.json from a WI7-created migration backup.
```

It is not automatic rollback, not a generic restore system, and not a workspace-wide time machine.

## 2. Decision

Approved design direction:

- add an explicit restore command only after WI7 write-back exists;
- restore only `vehicle_state.json`;
- restore only from WI7 migration backup directories;
- require valid `migration_meta.json`;
- require explicit user selection and confirmation;
- create a strict pre-restore backup of the current `vehicle_state.json`;
- atomically replace `vehicle_state.json` from the selected backup;
- validate restored JSON shape before and after write;
- print bounded Output Channel diagnostics;
- never run automatically.

## 3. Non-Goals

WI7b must not:

- automatically rollback WI7 failures;
- restore all ledgers;
- restore arbitrary user-selected files;
- restore from outside the workspace;
- restore from backups not created by WI7;
- run during GM turn processing;
- run on extension activation;
- run from Webview buttons;
- run from Remote Play;
- alter `game_state.json`;
- touch `statePatch.ts`;
- touch `TurnResult.ts`;
- touch `turnLedgerPersistCore.ts`;
- repair semantic WI5 issues;
- call LLMs;
- become a general checkpoint/branch restore feature.

## 4. Command Contract

Recommended command id:

```text
textadventure.restoreVehicleStateMigrationBackup
```

Recommended command title:

```text
LoreRelay: Restore Vehicle State Migration Backup
```

The command is intentionally specific. Do not introduce a generic `Restore Migration Backup` command in WI7b.

## 5. Backup Directory Contract

WI7 backups are expected at:

```text
<workspace>/.lorerelay/backups/migrations/<timestamp>/vehicle_state.json
<workspace>/.lorerelay/backups/migrations/<timestamp>/migration_meta.json
```

WI7b may inspect only immediate child directories under:

```text
<workspace>/.lorerelay/backups/migrations/
```

It must not recursively scan arbitrary depth.

Valid backup directory rules:

- directory name must be a safe timestamp segment;
- `vehicle_state.json` must exist;
- `migration_meta.json` must exist;
- meta must parse as JSON;
- meta `ledger` must be `vehicle_state`;
- meta `sourceFile` must be `vehicle_state.json`;
- meta `fromVersion` and `toVersion` must be non-negative integers;
- meta must indicate a known WI7 migration shape, initially `0 -> 1`;
- resolved backup paths must stay inside workspace root.

Invalid backup directories should be ignored or listed as invalid diagnostics, but never restored.

## 6. User Selection Contract

If no valid backups exist:

```text
No vehicle state migration backups were found.
```

If valid backups exist, show a QuickPick-style list:

```text
20260704T153012Z  vehicle_state 0 -> 1
20260704T161830Z  vehicle_state 0 -> 1
```

The list must be sorted newest first.

Display metadata only. Do not show raw JSON.

## 7. Confirmation Contract

After selecting a backup, WI7b requires a modal confirmation:

```text
Restore vehicle_state.json from migration backup?

Backup: 20260704T153012Z
Migration: vehicle_state 0 -> 1

This will:
- create a pre-restore backup of the current vehicle_state.json
- replace vehicle_state.json with the selected backup
- not modify any other file
```

Allowed buttons:

```text
Restore Backup
Cancel
```

Only `Restore Backup` proceeds. Closing the dialog cancels.

No setting may disable this confirmation.

## 8. Pre-Restore Backup Contract

Before restoring, WI7b must create a strict backup of the current file:

```text
<workspace>/.lorerelay/backups/migration-restores/<timestamp>/vehicle_state.before_restore.json
<workspace>/.lorerelay/backups/migration-restores/<timestamp>/restore_meta.json
```

`restore_meta.json` should contain bounded metadata:

```ts
interface MigrationRestoreMeta {
    version: 1;
    createdAt: string;
    ledger: 'vehicle_state';
    restoredFrom: string;
    targetFile: 'vehicle_state.json';
    currentBackupFile: 'vehicle_state.before_restore.json';
}
```

Rules:

- if current `vehicle_state.json` exists, copy it before restore;
- if current file is missing, record that fact in metadata and continue only after user confirmation explicitly mentioned replacement target is missing;
- if pre-restore backup fails, abort;
- do not rely on `writeJsonAtomic(..., createBackup:true)` backup behavior.

## 9. Restore Write Contract

WI7b should restore the selected backup by atomically replacing `vehicle_state.json`.

Recommended approach:

1. read selected backup text;
2. parse backup JSON;
3. validate it is acceptable vehicle state input;
4. create pre-restore backup;
5. write backup text to a temp file in the workspace root directory;
6. rename temp file to `vehicle_state.json`;
7. re-read `vehicle_state.json`;
8. parse and validate again;
9. print success report.

If the project already has a safe atomic text-write helper, use it. If not, WI7b may introduce a narrow `writeTextAtomic` helper for this command, or parse JSON and write with `writeJsonAtomic` if preserving exact formatting is explicitly deemed non-goal.

Recommended default: preserve backup content as text where feasible.

## 10. Validation Contract

Before restore:

- backup JSON must parse;
- backup JSON must be acceptable to the current vehicle-state parser or migration preview flow;
- if backup is v0 shape, it may still be allowed because it is intentionally pre-migration data;
- future-version backup files are not allowed as restore source in WI7b.

After restore:

- re-read target file;
- parse JSON;
- verify it matches the selected backup semantically;
- run WI6b preview and expect it to report the restored v0 file as migratable again, or otherwise report a bounded warning.

Do not run WI5 automatically.

## 11. Output Channel Contract

Use the World Intent Output Channel.

Success:

```text
--- WI7b migration backup restore ---
Workspace: <name>
Ledger: vehicle_state
Restored from: .lorerelay/backups/migrations/<timestamp>/vehicle_state.json
Pre-restore backup: .lorerelay/backups/migration-restores/<timestamp>/vehicle_state.before_restore.json
Result: success
```

Abort:

```text
Result: aborted
Reason: <bounded code>
No files were changed.
```

Never print raw JSON.

## 12. Path Safety

WI7b may touch only:

```text
<workspace>/vehicle_state.json
<workspace>/.lorerelay/backups/migrations/<timestamp>/vehicle_state.json
<workspace>/.lorerelay/backups/migrations/<timestamp>/migration_meta.json
<workspace>/.lorerelay/backups/migration-restores/<timestamp>/vehicle_state.before_restore.json
<workspace>/.lorerelay/backups/migration-restores/<timestamp>/restore_meta.json
```

Rules:

- no arbitrary paths;
- no recursive restore;
- no symlink traversal outside workspace;
- fixed file names only;
- timestamp directory names must be sanitized;
- all resolved paths must remain inside workspace root.

## 13. Relationship with WI7

WI7b is a companion safety gate to WI7, but it must not be called automatically by WI7.

Allowed:

- WI7 failure output may tell the user the backup path.
- User may later run WI7b manually.

Forbidden:

- WI7 automatically invoking WI7b after write failure.
- WI7b trying to infer which backup to use from recent logs without user selection.

## 14. Relationship with Checkpoints and Git Timeline

LoreRelay already has checkpoints and Git timeline behavior. WI7b does not replace them.

WI7b is narrower:

- one ledger;
- one migration backup;
- one explicit restore command.

Do not connect WI7b to checkpoint restore, branch restore, replay export, or campaign rollback.

## 15. Proposed Modules

Recommended pure helper:

```text
src/ledgerMigrationRestoreCore.ts
```

Responsibilities:

- validate backup metadata;
- classify restore eligibility;
- create restore metadata;
- compute safe restore backup relative paths;
- format bounded output lines;
- no `fs`, `vscode`, DOM imports.

Recommended host runner:

```text
src/ledgerMigrationRestoreRunner.ts
```

Responsibilities:

- list immediate backup directories;
- read and validate metadata;
- show QuickPick;
- show modal confirmation;
- create pre-restore backup;
- atomically replace `vehicle_state.json`;
- post-write validation;
- Output Channel reporting.

## 16. Files Allowed

WI7b implementation may add/change:

- `src/ledgerMigrationRestoreCore.ts`;
- `src/ledgerMigrationRestoreRunner.ts`;
- `src/extension.ts` command registration;
- `package.json` command contribution;
- locale keys for command title/messages;
- `scripts/test_ledger_migration_restore_core.js`;
- `scripts/test_ledger_migration_restore_runner.js` if host dependencies can be injected;
- `CHANGELOG.md`;
- `AI_SHARED_LOG.md`.

## 17. Files Forbidden

WI7b must not modify:

- `src/statePatch.ts`;
- `src/types/TurnResult.ts`;
- `src/turnLedgerPersistCore.ts`;
- Webview modules;
- Remote Play handlers;
- replay/export writers;
- GM prompt builders;
- checkpoint restore logic;
- Git timeline logic.

## 18. Required Tests

Add tests for:

1. valid WI7 backup metadata is accepted;
2. missing metadata is rejected;
3. wrong ledger is rejected;
4. wrong sourceFile is rejected;
5. unsupported version range is rejected;
6. unsafe timestamp segment is rejected;
7. backup list sorts newest first;
8. invalid backup JSON is rejected before pre-restore backup;
9. pre-restore backup failure aborts before target write;
10. user cancel makes no file changes;
11. successful restore touches only `vehicle_state.json` plus restore backup/meta;
12. restore output includes selected backup path and pre-restore backup path;
13. output never includes raw JSON;
14. post-write validation failure is reported;
15. runner scans only immediate children of fixed migrations backup directory;
16. pure restore core imports no `fs`, `vscode`, or DOM;
17. no `statePatch`, `TurnResult`, `turnLedgerPersistCore`, Webview, Remote, Replay changes;
18. `npm run compile`;
19. `npm test`;
20. `node scripts/validate_utf8_docs.js`.

## 19. Findings Table

| Severity | Issue | Recommendation |
|---|---|---|
| P0 | Restore can become arbitrary file overwrite. | Restore only fixed `vehicle_state.json` from fixed WI7 backup directories. |
| P0 | Automatic rollback can worsen partial-write ambiguity. | WI7b is manual only; never auto-called by WI7. |
| P0 | Restore can destroy the post-migration file. | Create strict pre-restore backup before writing. |
| P1 | Backup metadata can be forged or malformed. | Validate bounded metadata and path containment; reject unsafe timestamps. |
| P1 | Recursive scans can leak unrelated data. | Inspect immediate child directories only. |
| P2 | Output can leak save contents. | Metadata/status only; never raw JSON. |

## 20. Grok Implementation Prompt

```markdown
LoreRelay World Intent WI7b Migration Backup Restore Gate を実装してください。
推奨モデル: Grok / Codex
推奨推論: High

必読:
1. AI_SHARED_LOG.md の Current Snapshot
2. CHANGELOG.md の [Unreleased]
3. docs/WORLD_INTENT_WI7_MIGRATION_WRITEBACK_GATE.md
4. docs/WORLD_INTENT_WI7B_MIGRATION_RESTORE_GATE.md
5. src/ledgerMigrationWritebackCore.ts
6. src/ledgerMigrationWritebackRunner.ts
7. src/vehicleMigrationCore.ts
8. src/workspacePaths.ts
9. src/extension.ts
10. package.json

目的:
WI7 が作成した migration backup から、ユーザーが明示的に選択・確認した場合だけ `vehicle_state.json` を復元する command を追加してください。

絶対条件:
- restore 対象は `vehicle_state.json` のみ。
- restore 元は `.lorerelay/backups/migrations/<timestamp>/vehicle_state.json` のみ。
- `migration_meta.json` 必須。
- QuickPick でバックアップ選択。
- modal confirmation 必須。
- restore 前に現在の `vehicle_state.json` を strict pre-restore backup。
- pre-restore backup 失敗時は abort。
- WI7 から自動呼び出ししない。
- arbitrary path / recursive scan / symlink escape 禁止。
- `statePatch.ts` / `TurnResult.ts` / `turnLedgerPersistCore.ts` を触らない。
- Webview / Remote / Replay / GM prompt / checkpoint / git timeline に接続しない。
- raw JSON を Output Channel に出さない。

推奨実装:
- add `src/ledgerMigrationRestoreCore.ts`
- add `src/ledgerMigrationRestoreRunner.ts`
- register command `textadventure.restoreVehicleStateMigrationBackup`
- command title: `LoreRelay: Restore Vehicle State Migration Backup`
- pre-restore backup to `.lorerelay/backups/migration-restores/<timestamp>/vehicle_state.before_restore.json`
- write bounded `restore_meta.json`

必須テスト:
docs/WORLD_INTENT_WI7B_MIGRATION_RESTORE_GATE.md §18 を満たしてください。

完了条件:
- npm run compile
- npm test
- node scripts/validate_utf8_docs.js
- CHANGELOG.md / AI_SHARED_LOG.md 更新
```

