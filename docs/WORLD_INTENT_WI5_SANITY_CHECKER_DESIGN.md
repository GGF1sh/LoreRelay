# World Intent WI5 Semantic Sanity Checker Design

> Status: Design proposal / Codex gate draft.
> Date: 2026-07-04.
> Scope: pure semantic sanity checker skeleton for already-parsed LoreRelay data.
> Default posture: report-only, no auto-fix, no persistence, no gameplay change.

## 1. Why WI5 Exists

WI1-WI4 proved a safe path for:

- intent parsing/query/execute vocabulary;
- closed vehicle action registry;
- diagnostic host bridge;
- small effect accounting records.

WI5 should not make World Intent authoritative. Instead, it should use the same discipline to answer:

> "Is this workspace internally consistent enough for the next AI/system to reason about safely?"

This is the Freeciv-inspired "ruleset sanity" layer, adapted to LoreRelay's architecture. It gathers semantic inconsistencies from local ledgers and subsystem definitions, produces bounded diagnostics, and stops there.

## 2. Decision

Approved design direction:

- add a pure `worldIntentSanityCore.ts`;
- define a shared `WorldSanityIssue` report shape;
- start with a small set of deterministic checkers;
- reuse existing subsystem validators where they already exist;
- do not repair anything automatically;
- do not read or write the filesystem in WI5 core;
- do not run automatically during every GM turn.

WI5 is a checker, not an orchestrator.

## 3. Non-Goals

WI5 must not:

- add `WorldIntent` to `TurnResult`;
- add new ledger writes;
- mutate `game_state.json`, `vehicle_state.json`, `settlement_layout.json`, or mod files;
- auto-fix IDs, links, load order, or stale references;
- block GM turns by default;
- introduce a generic rule expression evaluator;
- implement per-ledger migrations;
- create State Orchestrator transaction plans;
- run arbitrary mod code;
- inspect asset file contents beyond already-parsed manifest data.

Auto-fix requires a later separate gate.

## 4. WI5 Scope

WI5 should cover three report-only areas.

### 4.1 Vehicle Ledger Sanity

Use existing parsed `VehicleState` and existing helper logic where possible.

Initial checks:

- duplicate vehicle ids after parse should be impossible, but report if detected in supplied state;
- active vehicle id references a missing vehicle;
- active vehicle id references a lost vehicle;
- vehicle `status` and `durability.condition` are semantically suspicious;
- resource `current > max` after parse should be impossible, but report if supplied test data bypasses parser;
- carrier/hangar graph cycles or missing carried vehicles, using or mirroring `validateVehicleFleet()`;
- mobile-base linked vehicle has a missing settlement id if settlement data is supplied.

This checker observes. It does not normalize.

### 4.2 Mod/Profile Sanity

Use MOD1's parsed manifest/profile structures, not raw files.

Initial checks:

- missing dependency;
- disabled dependency;
- dependency cycle;
- declared conflict with an enabled mod;
- duplicate provided record ids and winner/overridden report;
- unsupported merge strategy should already parse away, but report "reserved strategy ignored" only if a later parser can preserve that fact;
- alias rule points to missing target record;
- alias rule cycle within the same domain.

WI5 must not change load order or replace records. Existing MOD resolver remains authoritative for resolution.

### 4.3 Game Rules / Feature Gate Sanity

Use already-parsed game rules.

Initial checks:

- `enableMobileBaseSystem === true` while `enableVehicleSystem` or `enableSettlementMode` is not true;
- `enableSettlementMode`-dependent UI or ops should be off if no settlement ledger exists, when ledger presence is provided;
- `textAdventure.worldIntent.vehicleBridgeMode` is outside `off|shadow|compare_only` only if a raw config value is supplied to the checker;
- incompatible future profile combinations should be warnings, not errors, unless they would cause a write-path failure.

WI5 should report "feature gate mismatch" rather than flip flags.

## 5. Proposed Types

Recommended new module:

```text
src/worldIntentSanityCore.ts
```

Recommended public contract:

```ts
export const WORLD_SANITY_REPORT_VERSION = 1 as const;

export type WorldSanitySeverity = 'info' | 'warning' | 'error';

export type WorldSanityDomain =
    | 'vehicle'
    | 'mobile_base'
    | 'mod'
    | 'game_rules'
    | 'world_intent';

export interface WorldSanityIssue {
    version: typeof WORLD_SANITY_REPORT_VERSION;
    severity: WorldSanitySeverity;
    domain: WorldSanityDomain;
    code: string;
    message: string;
    entity?: {
        kind: string;
        id?: string;
    };
    related?: Array<{
        kind: string;
        id?: string;
    }>;
    recommendation?: string;
}

export interface WorldSanityReport {
    version: typeof WORLD_SANITY_REPORT_VERSION;
    ok: boolean;
    issueCount: number;
    errorCount: number;
    warningCount: number;
    infoCount: number;
    issues: WorldSanityIssue[];
    truncated?: boolean;
}
```

Recommended input shape:

```ts
export interface WorldSanityInput {
    vehicleState?: VehicleState;
    settlementState?: SettlementStateV1;
    gameRules?: {
        enableVehicleSystem?: boolean;
        enableSettlementMode?: boolean;
        enableMobileBaseSystem?: boolean;
    };
    modProfile?: ModProfile;
    mods?: Readonly<Record<string, ParsedModManifest>>;
    rawConfig?: {
        vehicleBridgeMode?: unknown;
    };
}
```

WI5 may avoid importing every subsystem at once if that creates dependency knots. In that case, split into small helpers:

- `checkVehicleSanity(input)`
- `checkModSanity(input)`
- `checkGameRuleSanity(input)`
- `buildWorldSanityReport(input)`

## 6. Severity Rules

Use severity consistently:

| Severity | Meaning | Examples |
|---|---|---|
| `error` | Data relation is internally impossible or likely to break a write/read path. | carrier cycle; active vehicle missing; mobile base link points to missing settlement |
| `warning` | Playable but suspicious or likely to confuse UI/AI. | mobile base enabled without settlement mode; declared mod conflict; active vehicle is lost |
| `info` | Diagnostic note for operators; not harmful. | bridge mode off; reserved future merge strategy ignored if observable |

`ok` is true only when `errorCount === 0`.

Warnings should not make `ok` false.

## 7. Bounded Output

Reports must be bounded:

- max issues default: 100;
- max message length: 240 chars;
- max recommendation length: 240 chars;
- max related refs per issue: 8;
- deterministic issue order.

Recommended issue order:

1. domain order: `game_rules`, `vehicle`, `mobile_base`, `mod`, `world_intent`;
2. severity order: `error`, `warning`, `info`;
3. code;
4. entity id.

Do not include raw mod payloads, raw manifests, raw vehicle objects, or unbounded JSON.

## 8. Relationship to Existing Validators

WI5 should reuse or wrap existing checks:

- `validateVehicleFleet(state)` can become a source of vehicle issues;
- `validateMobileBaseLink(vehicle, settlement)` can become a source of mobile-base issues;
- MOD1 resolver conflict/dependency reports can become mod issues;
- `parseVehicleWorldIntentBridgeMode()` can validate raw bridge config if supplied.

Do not move those validators into WI5. Local subsystem validators remain close to their domain. WI5 only normalizes their findings into one report surface.

## 9. Host Integration

WI5 core is pure. Host integration is optional and should be separate.

Allowed after core:

- add a command such as `LoreRelay: Run Workspace Sanity Check`;
- load local parsed ledgers;
- call `buildWorldSanityReport`;
- show summary in Output Channel.

Forbidden in WI5 core:

- `vscode` imports;
- `fs` imports;
- automatic run on every turn;
- automatic repair.

If a command is implemented in the same phase, keep it read-only and opt-in.

## 10. Files Allowed

WI5 core implementation may add/change:

- add `src/worldIntentSanityCore.ts`;
- add `scripts/test_world_intent_wi5_sanity_core.js`;
- `package.json` for test registration;
- `CHANGELOG.md`;
- `AI_SHARED_LOG.md`;
- optionally a small read-only host wrapper in a later WI5b, not the initial pure core.

WI5 pure core may import types and pure helpers from:

- `vehicleCore.ts`;
- `mobileBaseCore.ts`;
- `modSystemCore.ts`;
- `worldIntentCore.ts`.

## 11. Files Forbidden

WI5 initial pure core must not modify:

- `src/types/TurnResult.ts`;
- `src/statePatch.ts`;
- `src/turnLedgerPersistCore.ts`;
- Webview modules;
- Remote Play handlers;
- replay/export writers;
- workspace write helpers;
- schema files to introduce auto-fix metadata.

## 12. Required Tests

Add tests for:

1. empty input -> ok report with zero issues;
2. valid vehicle fleet -> ok;
3. active vehicle id missing -> error;
4. active vehicle id points to lost vehicle -> warning or error, document chosen severity;
5. carrier graph cycle -> error;
6. carried vehicle missing -> error;
7. carried vehicle exceeds carrier size -> error;
8. mobile base enabled without vehicle/settlement flags -> warning;
9. mobile base link missing settlement -> error when settlement data is supplied;
10. mod missing dependency -> error;
11. mod disabled dependency -> warning or error, document chosen severity;
12. mod dependency cycle -> error;
13. declared enabled conflict -> warning;
14. duplicate mod record id produces deterministic winner/overridden issue;
15. alias rule missing target -> warning;
16. alias rule cycle -> error;
17. invalid bridge mode raw config -> warning;
18. issue cap truncates deterministically and sets `truncated:true`;
19. report ordering is deterministic;
20. output does not include raw manifest/vehicle JSON payloads;
21. `npm run compile`;
22. `npm test`;
23. `node scripts/validate_utf8_docs.js`.

## 13. Findings Table

| Severity | Issue | Recommendation |
|---|---|---|
| P0 | A sanity checker can become an auto-fixer by accident. | WI5 is report-only. No mutations, no writes, no repair plans. |
| P0 | A generic checker may import host I/O and become hard to test. | Keep `worldIntentSanityCore.ts` pure; host command is WI5b or opt-in wrapper. |
| P1 | Combining all subsystem validators can create dependency knots. | Keep domain helpers small; normalize reports at the top. |
| P1 | Raw mod/vehicle payloads in diagnostics can leak or bloat output. | Closed issue fields only; bounded messages; no raw JSON. |
| P2 | Too many warnings can make reports unusable. | Add deterministic cap and severity ordering from the start. |

## 14. Grok Implementation Prompt

```markdown
LoreRelay World Intent WI5 Semantic Sanity Checker pure core を実装してください。

推奨モデル: Grok / Codex
推奨推論: High

必読:
1. AI_SHARED_LOG.md の Current Snapshot
2. CHANGELOG.md の [Unreleased]
3. docs/WORLD_INTENT_CORE_DESIGN.md
4. docs/WORLD_INTENT_WI5_SANITY_CHECKER_DESIGN.md
5. src/vehicleCore.ts
6. src/mobileBaseCore.ts
7. src/modSystemCore.ts
8. src/worldIntentCore.ts

目的:
既存の vehicle / mobile base / mod / game rules の整合性を、pure function で bounded report にまとめる `worldIntentSanityCore.ts` を追加してください。

絶対条件:
- report-only。自動修復しない。
- `TurnResult.ts` は変更しない。
- `statePatch.ts` は変更しない。
- `fs` / `vscode` / DOM import 禁止。
- disk write / replay write / GM prompt injection なし。
- raw manifest / raw vehicle JSON を issue に含めない。

推奨実装:
- add `src/worldIntentSanityCore.ts`
- expose `buildWorldSanityReport(input)`
- small helpers: `checkVehicleSanity`, `checkModSanity`, `checkGameRuleSanity`
- reuse `validateVehicleFleet`, `validateMobileBaseLink`, MOD1 resolver reports where practical
- add `scripts/test_world_intent_wi5_sanity_core.js`

必須テスト:
docs/WORLD_INTENT_WI5_SANITY_CHECKER_DESIGN.md §12 を満たしてください。

完了条件:
- npm run compile
- npm test
- node scripts/validate_utf8_docs.js
- CHANGELOG.md / AI_SHARED_LOG.md 更新
```

