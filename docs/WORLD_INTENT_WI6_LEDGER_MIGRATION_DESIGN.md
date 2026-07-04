# World Intent WI6 Per-Ledger Migration Helper Design

> Status: Design proposal / Codex gate draft.
> Date: 2026-07-04.
> Scope: pure per-ledger migration planning helpers.
> Default posture: dry-run first, no filesystem writes, no global save migration, no auto-repair.

## 1. Why WI6 Exists

LoreRelay now has many independent ledgers:

- `game_state.json`
- `vehicle_state.json`
- `settlement_state.json`
- `settlement_layout.json`
- `campaign_resources.json`
- `discoveries.json`
- `world_state.json`
- `npc_registry.json`
- mod profiles/manifests

Earlier versions got by with parser-level normalization. That is still the right default, but as systems grow, parser fallback alone becomes too quiet:

- the app may silently drop unsupported future fields;
- old workspace files may parse as empty ledgers;
- users and AI agents cannot see whether a file was upgraded, rejected, or left untouched;
- future State Orchestrator work needs a consistent way to ask "what migration would be needed?"

WI6 introduces a common migration helper pattern without turning it into a global save upgrader.

## 2. Decision

Approved design direction:

- add a pure `ledgerMigrationCore.ts`;
- start with one pilot ledger, preferably `vehicle_state.json`;
- migrations are per-ledger and version-step based;
- default host behavior is dry-run/report-only;
- no write-back in WI6 core;
- no cross-ledger migration;
- no auto-fix of semantic sanity issues;
- no State Orchestrator transaction plan.

WI6 is not a save converter. It is a deterministic migration planner and pure transformer.

## 3. Non-Goals

WI6 must not:

- rewrite files automatically;
- migrate every ledger at once;
- modify `statePatch.ts`;
- modify `TurnResult.ts`;
- create a global workspace version;
- infer missing gameplay facts with LLM;
- fix semantic inconsistencies found by WI5;
- run during every GM turn;
- alter ledger persist order;
- install a background watcher;
- accept arbitrary migration scripts from mods.

Host-side write-back can be a later WI6b/WI7 gate after dry-run reports are proven.

## 4. Core Concepts

### Ledger-Specific Ownership

Each ledger owns its migration path.

Examples:

```text
vehicle_state: 0 -> 1
settlement_layout: 1 -> 2
campaign_resources: 1 -> 2
```

There should be no "one giant workspace migration" in WI6.

### Version Step Chain

Migrations should be explicit step functions:

```ts
type LedgerMigrationStep = {
    ledger: LedgerMigrationLedger;
    fromVersion: number;
    toVersion: number;
    migrate(raw: unknown): unknown;
};
```

The runner applies only contiguous steps:

```text
from 0 -> 1 -> 2
```

If a step is missing, the report is blocked.

### Dry-Run Report

Every migration run returns:

- whether it can migrate;
- whether it changed data;
- source version;
- target version;
- applied steps;
- warnings;
- migrated raw document, only in memory.

No disk write happens in core.

## 5. Proposed Types

Recommended new module:

```text
src/ledgerMigrationCore.ts
```

Recommended contract:

```ts
export const LEDGER_MIGRATION_REPORT_VERSION = 1 as const;

export type LedgerMigrationLedger =
    | 'vehicle_state'
    | 'settlement_state'
    | 'settlement_layout'
    | 'campaign_resources'
    | 'discoveries'
    | 'world_state'
    | 'npc_registry'
    | 'mod_profile';

export type LedgerMigrationStatus =
    | 'up_to_date'
    | 'migrated'
    | 'blocked'
    | 'unsupported'
    | 'invalid';

export interface LedgerMigrationIssue {
    severity: 'info' | 'warning' | 'error';
    code: string;
    message: string;
}

export interface LedgerMigrationResult {
    version: typeof LEDGER_MIGRATION_REPORT_VERSION;
    ledger: LedgerMigrationLedger;
    status: LedgerMigrationStatus;
    changed: boolean;
    fromVersion?: number;
    toVersion: number;
    appliedSteps: Array<{ fromVersion: number; toVersion: number }>;
    issues: LedgerMigrationIssue[];
    migrated?: unknown;
}

export interface LedgerMigrationStep {
    ledger: LedgerMigrationLedger;
    fromVersion: number;
    toVersion: number;
    migrate(raw: unknown): unknown;
}
```

Recommended runner:

```ts
export function migrateLedgerDocument(input: {
    ledger: LedgerMigrationLedger;
    raw: unknown;
    targetVersion: number;
    steps: readonly LedgerMigrationStep[];
    getVersion?: (raw: unknown) => number | undefined;
    validate?: (raw: unknown) => boolean;
}): LedgerMigrationResult;
```

## 6. Version Detection

Version detection must be ledger-specific.

| Ledger | Version field |
|---|---|
| `game_state` | `schemaVersion` |
| `vehicle_state` | `version` |
| `settlement_state` | `version` |
| `settlement_layout` | `version` |
| `campaign_resources` | `version` |
| `discoveries` | `version` |

WI6 should not force every ledger to rename its version field.

Recommended helper:

```ts
getNumericVersion(raw, ['version', 'schemaVersion'])
```

Rules:

- missing version may be treated as `0` only by a ledger-specific migration;
- non-integer version is `invalid`;
- future version greater than target is `unsupported`;
- negative version is `invalid`;
- version equal to target validates as `up_to_date`.

## 7. Pilot: Vehicle State v0 -> v1

The first pilot should be intentionally boring.

Vehicle state currently expects:

```ts
{ version: 1, vehicles: [...] }
```

WI6 pilot can support:

```ts
{ vehicles: [...] }
```

as implicit v0 and migrate it to:

```ts
{ version: 1, vehicles: [...] }
```

Then pass it through existing `parseVehicleState()` for validation/canonicalization.

Do not invent vehicles, active vehicle ids, fuel values, carrier relations, or mobile base links.

## 8. Interaction with WI5

WI5 and WI6 are adjacent but not the same:

- WI5 reports semantic inconsistencies in already-parsed data.
- WI6 upgrades raw ledger document shape across versions.

Allowed future flow:

```text
raw ledger
  -> WI6 migrate dry-run
  -> parse canonical ledger
  -> WI5 sanity report
```

Forbidden in WI6:

- calling WI5 and then auto-fixing issues;
- changing migration result based on semantic warnings;
- hiding migration issues because WI5 says the parsed state is ok.

## 9. Host Integration

WI6 core is pure.

Allowed later host command:

```text
LoreRelay: Preview Workspace Migrations
```

The command may:

- read known workspace ledgers;
- call migration helpers;
- print a dry-run report;
- optionally offer a future explicit "write migrated files" flow after another gate.

WI6 initial phase must not implement write-back.

If write-back is later approved, it must:

- use `writeJsonAtomic`;
- make a timestamped backup;
- be explicit user-confirmed;
- migrate one file at a time;
- never run during GM turn processing.

## 10. Files Allowed

WI6 pure core implementation may add/change:

- add `src/ledgerMigrationCore.ts`;
- add `scripts/test_ledger_migration_core.js`;
- optionally add one vehicle-specific helper in `src/vehicleMigrationCore.ts`;
- `package.json` for test registration;
- `CHANGELOG.md`;
- `AI_SHARED_LOG.md`.

Allowed imports:

- pure parser/validator helpers such as `parseVehicleState`;
- no host I/O.

## 11. Files Forbidden

WI6 initial pure core must not modify:

- `src/statePatch.ts`;
- `src/types/TurnResult.ts`;
- `src/turnLedgerPersistCore.ts`;
- workspace write helpers;
- Webview modules;
- Remote Play handlers;
- update manager;
- replay/export writers.

## 12. Required Tests

Add tests for:

1. up-to-date v1 vehicle state returns `up_to_date`, `changed:false`;
2. missing version vehicle state migrates v0 -> v1;
3. migrated v0 -> v1 output validates through `parseVehicleState`;
4. future version returns `unsupported`;
5. negative/non-integer version returns `invalid`;
6. missing migration step returns `blocked`;
7. multi-step chain applies contiguous steps in order;
8. steps are not skipped;
9. migration does not mutate input raw object;
10. invalid migrated output returns `invalid` or `blocked` per chosen contract;
11. report contains bounded issue messages;
12. result does not include filesystem paths;
13. no imports from `fs`, `vscode`, or DOM in migration core;
14. optional vehicle pilot does not invent active vehicle ids;
15. `npm run compile`;
16. `npm test`;
17. `node scripts/validate_utf8_docs.js`.

## 13. Findings Table

| Severity | Issue | Recommendation |
|---|---|---|
| P0 | Migration can become silent destructive save conversion. | WI6 core is pure dry-run; no writes, no automatic host command. |
| P0 | Global workspace migrations can break independent ledger ownership. | Keep migrations per-ledger and step-based. |
| P1 | Parser normalization can hide that migration occurred. | Return explicit status, applied steps, and issues. |
| P1 | Future-version files can be accidentally downgraded. | Treat `fromVersion > targetVersion` as `unsupported`. |
| P2 | Migration reports can leak raw data. | Bounded issue fields only; migrated raw is in-memory return, not diagnostic text. |

## 14. Grok Implementation Prompt

```markdown
LoreRelay World Intent WI6 Per-Ledger Migration Helper pure core を実装してください。

推奨モデル: Grok / Codex
推奨推論: High

必読:
1. AI_SHARED_LOG.md の Current Snapshot
2. CHANGELOG.md の [Unreleased]
3. docs/WORLD_INTENT_CORE_DESIGN.md
4. docs/WORLD_INTENT_WI5_SANITY_CHECKER_DESIGN.md
5. docs/WORLD_INTENT_WI6_LEDGER_MIGRATION_DESIGN.md
6. src/vehicleCore.ts

目的:
各 ledger が自分の version migration を安全に持てるよう、pure `ledgerMigrationCore.ts` を追加してください。
最初の pilot は `vehicle_state` v0 -> v1（`version` 欠落に `version:1` を付けるだけ）に限定してください。

絶対条件:
- core は dry-run / pure only。
- ファイルを書かない。
- `statePatch.ts` は触らない。
- `TurnResult.ts` は触らない。
- `fs` / `vscode` / DOM import 禁止。
- global workspace migration は作らない。
- semantic auto-fix はしない。

推奨実装:
- add `src/ledgerMigrationCore.ts`
- optionally add `src/vehicleMigrationCore.ts`
- add `scripts/test_ledger_migration_core.js`
- package.json の npm test に追加

必須テスト:
docs/WORLD_INTENT_WI6_LEDGER_MIGRATION_DESIGN.md §12 を満たしてください。

完了条件:
- npm run compile
- npm test
- node scripts/validate_utf8_docs.js
- CHANGELOG.md / AI_SHARED_LOG.md 更新
```

