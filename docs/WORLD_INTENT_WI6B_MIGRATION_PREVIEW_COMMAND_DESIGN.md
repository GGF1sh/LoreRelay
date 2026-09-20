# World Intent WI6b Migration Preview Command Design

> Status: Design proposal / Codex gate draft.
> Date: 2026-07-04.
> Depends on: WI6 `ledgerMigrationCore.ts` pure dry-run migration helper.
> Scope: opt-in host command that previews known ledger migrations without writing files.

## 1. Why WI6b Exists

WI6 defines a pure per-ledger migration helper. That is useful for tests and future State Orchestrator work, but users and AI agents still need a safe way to answer:

```text
Which workspace files would need a schema migration right now?
```

WI6b adds that host-facing inspection surface without approving write-back.

The goal is similar to WI5b Workspace Sanity Check:

- opt-in command;
- read known workspace files;
- call pure core;
- print bounded diagnostics;
- never mutate the workspace.

## 2. Decision

Approved design direction:

- add a host command such as `LoreRelay: Preview Workspace Migrations`;
- load only known LoreRelay ledger files from the active workspace root;
- run WI6 migration helpers in dry-run mode;
- show a bounded report in a dedicated Output Channel;
- do not write migrated data;
- do not add an "apply migration" button;
- do not run automatically during activation or GM turns.

WI6b is a diagnostic command, not a save upgrader.

## 3. Non-Goals

WI6b must not:

- write any JSON file;
- create backups;
- offer an apply/repair button;
- call `statePatch.ts`;
- modify `TurnResult.ts`;
- run as part of `processTurnResult`;
- scan arbitrary directories;
- execute migration scripts from mods;
- pass raw ledger contents to Webview, Remote Play, replay export, or GM prompts;
- perform semantic auto-fixes from WI5;
- downgrade future-version files.

Write-back can only be considered in a later WI7 gate after dry-run reports are proven and manually reviewed.

## 4. Command Contract

Recommended command id:

```text
textadventure.previewWorkspaceMigrations
```

Recommended command title:

```text
LoreRelay: Preview Workspace Migrations
```

Recommended Output Channel:

```text
LoreRelay: World Intent
```

It may reuse the existing World Intent channel if present.

## 5. Host Loader Boundary

Recommended module:

```text
src/ledgerMigrationRunner.ts
```

Optional pure formatting module:

```text
src/ledgerMigrationHostCore.ts
```

The host loader may read only these workspace-root files:

| Ledger | File |
|---|---|
| `vehicle_state` | `vehicle_state.json` |
| `settlement_state` | `settlement_state.json` |
| `settlement_layout` | `settlement_layout.json` |
| `campaign_resources` | `campaign_resources.json` |
| `discoveries` | `discoveries.json` |
| `world_state` | `world_state.json` |
| `npc_registry` | `npc_registry.json` |
| `mod_profile` | `.lorerelay/mod_profile.json` |

For WI6b implementation, only `vehicle_state` needs an actual migration step. Other ledgers may report `unsupported` or `up_to_date` depending on available version detection, but must not invent migration steps.

Missing files are not errors. They should be reported as `missing` or skipped with an info line.

## 6. Report Shape

Recommended pure summary type:

```ts
export interface WorkspaceMigrationPreviewEntry {
    ledger: LedgerMigrationLedger;
    fileName: string;
    status: LedgerMigrationStatus | 'missing' | 'read_error';
    changed: boolean;
    fromVersion?: number;
    toVersion?: number;
    appliedSteps: Array<{ fromVersion: number; toVersion: number }>;
    issueCount: number;
    issues: Array<{
        severity: 'info' | 'warning' | 'error';
        code: string;
    }>;
}

export interface WorkspaceMigrationPreviewReport {
    version: 1;
    generatedAt: string;
    workspaceName?: string;
    entries: WorkspaceMigrationPreviewEntry[];
    totals: {
        missing: number;
        upToDate: number;
        migratable: number;
        blocked: number;
        invalid: number;
        unsupported: number;
        readError: number;
    };
}
```

The report must not include raw JSON documents.

## 7. Output Formatting

Output should be short and bounded:

```text
LoreRelay Workspace Migration Preview
Workspace: PostApocalypse

vehicle_state.json        migratable   0 -> 1   steps: 0->1
settlement_state.json     up_to_date   1
settlement_layout.json    missing
world_state.json          up_to_date   1

No files were changed.
```

Rules:

- one line per known ledger;
- maximum 20 issue lines total;
- issue text should show `ledger`, `severity`, `code`, not raw data;
- always end with `No files were changed.`;
- if all files are missing, still succeed with an explanatory message.

## 8. Security Boundary

WI6b must use workspace-root constrained paths.

Allowed:

- `path.join(workspaceRoot, fileName)` for fixed filenames;
- `.lorerelay/mod_profile.json` as a fixed subpath;
- `readFile` only;
- JSON parse with bounded error output.

Forbidden:

- user-provided file paths;
- recursive scanning;
- following symlink targets outside the workspace for migration preview;
- writing temporary files;
- exposing full parse error payloads that may include raw document snippets.

If the host has an existing safe workspace path helper, use it. If not, keep the path list fixed and resolved under the active workspace root.

## 9. Relationship with WI5b

WI5b and WI6b should remain separate commands:

```text
LoreRelay: Run Workspace Sanity Check
LoreRelay: Preview Workspace Migrations
```

Recommended future combined flow:

```text
1. Preview migrations.
2. If a later explicit migration write-back command exists, run it manually.
3. Run sanity check on parsed canonical data.
```

WI6b must not call WI5 and must not interpret semantic sanity issues as migration tasks.

## 10. Relationship with State Orchestrator

WI6b is intentionally not the State Orchestrator.

It may produce data that a future Orchestrator can reuse:

- known ledger list;
- migration status;
- per-ledger dry-run result;
- read-only summary.

It must not:

- create transaction plans;
- lock ledgers;
- coordinate multi-ledger writes;
- define compensation policy.

Those belong to a later SO1 / WI7 gate.

## 11. Files Allowed

WI6b implementation may add/change:

- `src/ledgerMigrationHostCore.ts` for pure report formatting and totals;
- `src/ledgerMigrationRunner.ts` for VS Code host command;
- `src/extension.ts` command registration;
- `package.json` contributes command entry;
- `scripts/test_ledger_migration_host_core.js`;
- `scripts/test_ledger_migration_runner.js` only if host dependencies can be injected safely;
- `CHANGELOG.md`;
- `AI_SHARED_LOG.md`;
- locale keys for command title/messages if needed.

## 12. Files Forbidden

WI6b must not modify:

- `src/statePatch.ts`;
- `src/types/TurnResult.ts`;
- `src/turnLedgerPersistCore.ts`;
- Webview modules;
- Remote Play handlers;
- replay/export writers;
- GM prompt builders.

## 13. Required Tests

Add tests for:

1. pure formatter summarizes `up_to_date`, `migrated`, `blocked`, `invalid`, `unsupported`, `missing`, and `read_error`;
2. totals count statuses correctly;
3. issue output is bounded;
4. report does not include raw JSON contents;
5. missing files are non-fatal;
6. vehicle v0 file reports migratable 0 -> 1;
7. vehicle v1 file reports up-to-date;
8. future vehicle version reports unsupported;
9. invalid JSON becomes read_error without throwing from the command;
10. host loader reads only fixed known filenames;
11. command output contains `No files were changed.`;
12. no `writeFile`, `writeJsonAtomic`, or mutation helper imports in runner;
13. `npm run compile`;
14. `npm test`;
15. `node scripts/validate_utf8_docs.js`.

## 14. Findings Table

| Severity | Issue | Recommendation |
|---|---|---|
| P0 | Preview command can become an accidental migration writer. | Do not expose apply/write/backup behavior in WI6b. |
| P0 | Recursive scans or user-selected paths can leak unrelated data. | Read only fixed ledger filenames under the workspace root. |
| P1 | Raw JSON can leak into Output Channel. | Format bounded status/code lines only. |
| P1 | Users may mistake dry-run output for applied migration. | Always show `No files were changed.` |
| P2 | Combining WI5 and WI6b can blur semantic repair vs schema migration. | Keep separate commands and separate reports. |

## 15. Grok Implementation Prompt

```markdown
LoreRelay World Intent WI6b Migration Preview Command を実装してください。
推奨モデル: Grok / Codex
推奨推論: High

必読:
1. AI_SHARED_LOG.md の Current Snapshot
2. CHANGELOG.md の [Unreleased]
3. docs/WORLD_INTENT_WI6_LEDGER_MIGRATION_DESIGN.md
4. docs/WORLD_INTENT_WI6B_MIGRATION_PREVIEW_COMMAND_DESIGN.md
5. src/ledgerMigrationCore.ts
6. src/worldIntentSanityRunner.ts
7. src/worldIntentSanityHostCore.ts
8. src/extension.ts
9. package.json

目的:
WI6 の pure dry-run migration helper を使って、ワークスペースの既知 ledger に対する migration preview command を追加してください。

絶対条件:
- read-only command only。
- ファイルを書かない。
- backup を作らない。
- apply/repair ボタンを作らない。
- `statePatch.ts` / `TurnResult.ts` / `turnLedgerPersistCore.ts` を触らない。
- Webview/Remote/Replay/GM prompt へ接続しない。
- raw JSON を Output Channel に出さない。
- コマンド出力の末尾に必ず `No files were changed.` を出す。

推奨実装:
- add `src/ledgerMigrationHostCore.ts` for pure formatting/totals.
- add `src/ledgerMigrationRunner.ts` for VS Code command wrapper.
- register command `textadventure.previewWorkspaceMigrations`.
- command title: `LoreRelay: Preview Workspace Migrations`.
- read only fixed known files under workspace root.
- vehicle_state v0 -> v1 migration is the only real pilot; other ledgers can be missing/up-to-date/unsupported based on available version detection.

必須テスト:
docs/WORLD_INTENT_WI6B_MIGRATION_PREVIEW_COMMAND_DESIGN.md §13 を満たしてください。

完了条件:
- npm run compile
- npm test
- node scripts/validate_utf8_docs.js
- CHANGELOG.md / AI_SHARED_LOG.md 更新
```

