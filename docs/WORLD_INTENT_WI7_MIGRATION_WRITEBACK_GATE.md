# World Intent WI7 Migration Write-Back Gate

> Status: Design proposal / ChatGPT-Codex gate.
> Date: 2026-07-04.
> Depends on: WI6 pure migration helpers and WI6b read-only preview command.
> Scope: explicit, user-confirmed, single-ledger migration write-back.

## 1. Why WI7 Exists

WI6 and WI6b deliberately stop at dry-run reporting:

- WI6 computes a pure per-ledger migration result.
- WI6b previews known workspace migrations in an Output Channel.

That is the correct default. However, once dry-run has proven useful, LoreRelay needs a narrowly controlled path for applying a safe schema-only migration to an old workspace file.

WI7 is that gate.

The first approved write-back must be intentionally small:

```text
vehicle_state.json v0 -> v1
```

where v0 means a valid vehicle-state-shaped object missing `version`, and v1 means the same document with `version: 1`.

WI7 is not a global save upgrader. It is a single-file, explicit, backed-up migration apply command.

## 2. Decision

Approved design direction:

- add a write-back command only after WI6/WI6b are implemented;
- apply only one ledger per command invocation;
- pilot ledger is `vehicle_state.json` only;
- rerun migration preview from disk immediately before writing;
- require explicit user confirmation;
- create a strict timestamped backup before writing;
- abort if backup fails;
- write with atomic JSON write only after backup and validation;
- show a bounded success/failure report;
- never run automatically.

## 3. Non-Goals

WI7 must not:

- migrate all workspace ledgers at once;
- add a generic "fix everything" command;
- modify `game_state.json`;
- modify `statePatch.ts`;
- modify `TurnResult.ts`;
- modify `turnLedgerPersistCore.ts`;
- run during GM turn processing;
- run on extension activation;
- run from Webview buttons;
- run from Remote Play;
- run from replay/export;
- execute mod-provided migration scripts;
- infer missing gameplay facts;
- repair semantic WI5 sanity issues;
- downgrade future-version files.

## 4. Command Contract

Recommended command id:

```text
textadventure.applyVehicleStateMigration
```

Recommended command title:

```text
LoreRelay: Apply Vehicle State Migration
```

This command is intentionally specific. Avoid a generic `Apply Workspace Migrations` command in WI7.

Reason: a generic command invites accidental cross-ledger writes before the migration framework is battle-tested.

## 5. User Confirmation Contract

WI7 requires an explicit user confirmation every time.

Recommended confirmation message:

```text
Apply migration to vehicle_state.json?

This will:
- create a timestamped backup
- write migrated vehicle_state.json
- not modify any other file

Migration: vehicle_state 0 -> 1
```

Allowed buttons:

```text
Apply Migration
Cancel
```

Only `Apply Migration` proceeds. Closing the dialog is cancel.

No setting may disable this confirmation in WI7.

## 6. Fresh Read Requirement

WI7 must not apply a stale WI6b preview result.

Before writing, the command must:

1. resolve the active workspace root;
2. read `vehicle_state.json` fresh from disk;
3. parse JSON;
4. run WI6 migration helper fresh;
5. verify `status === 'migrated'` and `changed === true`;
6. verify `fromVersion === 0` and `toVersion === 1`;
7. validate migrated output with the existing vehicle parser.

If any check fails, abort without writing.

## 7. Backup Contract

WI7 must create a strict timestamped backup before write-back.

Recommended backup location:

```text
.lorerelay/backups/migrations/<timestamp>/vehicle_state.json
.lorerelay/backups/migrations/<timestamp>/migration_meta.json
```

Example timestamp:

```text
20260704T153012Z
```

`migration_meta.json` should contain bounded metadata only:

```ts
interface MigrationBackupMeta {
    version: 1;
    createdAt: string;
    ledger: 'vehicle_state';
    sourceFile: 'vehicle_state.json';
    fromVersion: number;
    toVersion: number;
    appliedSteps: Array<{ fromVersion: number; toVersion: number }>;
}
```

Rules:

- backup directory must be inside workspace root;
- backup copy must complete successfully before writing;
- if backup fails, abort;
- do not use `writeJsonAtomic(..., createBackup: true)` as the only backup mechanism, because the current helper ignores backup copy failure;
- do not include raw JSON in Output Channel logs.

## 8. Write Contract

After backup succeeds:

1. write migrated vehicle state with `writeJsonAtomic`;
2. re-read the written file;
3. validate the written file with the vehicle parser;
4. print success output with backup path;
5. optionally rerun WI6b preview and show `up_to_date`.

If `writeJsonAtomic` throws:

- do not attempt a second write;
- show an error;
- keep the backup;
- report that the original file may or may not have been replaced depending on the atomic write failure point.

If post-write verification fails:

- show an error with backup path;
- do not automatically rollback in WI7;
- instruct the user to restore from the backup manually or via a future explicit restore command.

Automatic rollback is deferred. It is a second write path and needs its own gate.

## 9. Path Safety

WI7 may touch only:

```text
<workspace>/vehicle_state.json
<workspace>/.lorerelay/backups/migrations/<timestamp>/vehicle_state.json
<workspace>/.lorerelay/backups/migrations/<timestamp>/migration_meta.json
```

Rules:

- no user-provided file paths;
- no recursive scan;
- no symlink traversal outside workspace;
- no applying migrations to files opened from arbitrary paths;
- fixed filename only;
- resolved paths must remain inside workspace root.

## 10. Output Channel Contract

Use the same World Intent Output Channel as WI6b if present.

Output should include:

```text
--- WI7 migration write-back ---
Workspace: <name>
Ledger: vehicle_state
File: vehicle_state.json
Migration: 0 -> 1
Backup: .lorerelay/backups/migrations/<timestamp>/vehicle_state.json
Result: success
```

On failure:

```text
Result: aborted
Reason: <bounded code>
No files were changed.
```

If backup succeeded and write then failed, output:

```text
Backup was created before the write attempt.
```

Never print raw JSON.

## 11. Relationship with WI5 and WI6b

Recommended operator flow:

```text
1. LoreRelay: Preview Workspace Migrations
2. LoreRelay: Apply Vehicle State Migration
3. LoreRelay: Preview Workspace Migrations
4. LoreRelay: Run Workspace Sanity Check
```

WI7 must not call WI5 automatically.

Reason: schema migration and semantic sanity are separate. A schema migration should not silently repair or reinterpret gameplay data.

WI7 may call the WI6b preview formatter after a successful write, but only as read-only reporting.

## 12. Relationship with State Orchestrator

WI7 is still not the State Orchestrator.

It may establish useful primitives:

- fixed ledger targeting;
- fresh dry-run before write;
- strict backup;
- atomic single-file write;
- post-write validation;
- bounded reporting.

It must not:

- coordinate multi-ledger transactions;
- define compensation policy;
- lock the whole workspace;
- participate in GM turn commit order;
- become a generic mutation executor.

Those belong to later State Orchestrator design.

## 13. Proposed Modules

Recommended host module:

```text
src/ledgerMigrationWritebackRunner.ts
```

Recommended pure helper module:

```text
src/ledgerMigrationWritebackCore.ts
```

Pure helper responsibilities:

- classify whether a `LedgerMigrationResult` is write-back eligible;
- create backup metadata;
- format bounded status lines;
- compute safe backup relative paths from a timestamp string;
- never import `fs`, `vscode`, or DOM.

Host runner responsibilities:

- command registration wrapper;
- VS Code confirmation dialog;
- fixed workspace path resolution;
- read fresh file;
- call WI6 migration helper;
- copy backup strictly;
- call `writeJsonAtomic`;
- post-write validation;
- Output Channel reporting.

## 14. Files Allowed

WI7 implementation may add/change:

- `src/ledgerMigrationWritebackCore.ts`;
- `src/ledgerMigrationWritebackRunner.ts`;
- `src/extension.ts` for command registration;
- `package.json` command contribution;
- locale keys for command title/messages;
- `scripts/test_ledger_migration_writeback_core.js`;
- `scripts/test_ledger_migration_writeback_runner.js` if dependencies can be injected;
- `CHANGELOG.md`;
- `AI_SHARED_LOG.md`.

## 15. Files Forbidden

WI7 must not modify:

- `src/statePatch.ts`;
- `src/types/TurnResult.ts`;
- `src/turnLedgerPersistCore.ts`;
- Webview modules;
- Remote Play handlers;
- replay/export writers;
- GM prompt builders;
- mod resolver write paths.

## 16. Required Tests

Add tests for:

1. eligible result: `vehicle_state`, `migrated`, `changed:true`, `0 -> 1`;
2. ineligible up-to-date result aborts;
3. ineligible invalid/blocked/unsupported result aborts;
4. wrong ledger aborts;
5. wrong version range aborts;
6. missing migrated payload aborts;
7. backup metadata contains only bounded metadata;
8. backup path is inside `.lorerelay/backups/migrations/<timestamp>/`;
9. malformed timestamp rejected or normalized safely;
10. pure helper imports no `fs`, `vscode`, or DOM;
11. runner reads `vehicle_state.json` fresh before write;
12. runner creates backup before write;
13. backup failure aborts before write;
14. write failure reports backup existence and does not retry a second write;
15. post-write validation failure is reported;
16. output never includes raw JSON;
17. user cancel makes no file changes;
18. successful write makes only `vehicle_state.json` plus backup/meta changes;
19. future-version vehicle state is not written;
20. `npm run compile`;
21. `npm test`;
22. `node scripts/validate_utf8_docs.js`.

## 17. Findings Table

| Severity | Issue | Recommendation |
|---|---|---|
| P0 | Migration write-back can become destructive save conversion. | WI7 is single-ledger, explicit, confirmed, and backup-first. |
| P0 | Existing backup flag can ignore backup copy failure. | Implement strict backup before `writeJsonAtomic`; abort if backup fails. |
| P0 | Stale preview result may write over a changed file. | Rerun migration from fresh disk read immediately before write. |
| P1 | Automatic rollback is another mutation path. | Defer rollback; report backup path instead. |
| P1 | Generic apply-all command can cause cross-ledger damage. | Pilot only `vehicle_state.json` v0 -> v1. |
| P2 | Output Channel may leak save contents. | Print metadata/status only; never raw JSON. |

## 18. Grok Implementation Prompt

```markdown
LoreRelay World Intent WI7 Migration Write-Back Gate を実装してください。
推奨モデル: Grok / Codex
推奨推論: High

必読:
1. AI_SHARED_LOG.md の Current Snapshot
2. CHANGELOG.md の [Unreleased]
3. docs/WORLD_INTENT_WI6_LEDGER_MIGRATION_DESIGN.md
4. docs/WORLD_INTENT_WI6B_MIGRATION_PREVIEW_COMMAND_DESIGN.md
5. docs/WORLD_INTENT_WI7_MIGRATION_WRITEBACK_GATE.md
6. src/ledgerMigrationCore.ts
7. src/vehicleMigrationCore.ts
8. src/ledgerMigrationRunner.ts
9. src/workspacePaths.ts
10. src/extension.ts
11. package.json

目的:
WI6/WI6b の dry-run migration が確認できた workspace に対して、明示ユーザー確認つきで `vehicle_state.json` v0 -> v1 だけを書き戻す host command を追加してください。

絶対条件:
- `vehicle_state.json` のみ。
- v0 -> v1 のみ。
- 毎回ユーザー確認。
- 書く直前に fresh read + dry-run migration。
- strict timestamped backup が成功しない限り書かない。
- backup 失敗は abort。
- `writeJsonAtomic(..., createBackup:true)` の backup だけに依存しない。
- `statePatch.ts` / `TurnResult.ts` / `turnLedgerPersistCore.ts` を触らない。
- Webview / Remote / Replay / GM prompt に接続しない。
- apply-all / repair-all / rollback command は作らない。
- raw JSON を Output Channel に出さない。

推奨実装:
- add `src/ledgerMigrationWritebackCore.ts`
- add `src/ledgerMigrationWritebackRunner.ts`
- register command `textadventure.applyVehicleStateMigration`
- command title: `LoreRelay: Apply Vehicle State Migration`
- backup to `.lorerelay/backups/migrations/<timestamp>/vehicle_state.json`
- write bounded `migration_meta.json`

必須テスト:
docs/WORLD_INTENT_WI7_MIGRATION_WRITEBACK_GATE.md §16 を満たしてください。

完了条件:
- npm run compile
- npm test
- node scripts/validate_utf8_docs.js
- CHANGELOG.md / AI_SHARED_LOG.md 更新
```

