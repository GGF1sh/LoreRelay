# Mobile Base System ChatGPT Gate

Date: 2026-07-04 JST
Reviewer: Codex / ChatGPT
Status: Approved for **MB1 pure link contract only**.

This gate reviews:

1. `docs\MOBILE_BASE_SYSTEM_DESIGN.md`
2. `docs\VEHICLE_SYSTEM_DESIGN.md`
3. `docs\VEHICLE_SYSTEM_CHATGPT_GATE.md`
4. Settlement Mode design patterns

## Findings

| Severity | Finding | Decision |
|---|---|---|
| Critical | Mobile bases can become a full colony/ship simulator. | MB1 is pure link validation and prompt summary only. No jobs, pathfinding, room editing, or simulation. |
| Critical | Mobile bases connect two canonical ledgers and can create dual-write bugs. | MB1 has no writes. Later ops must split vehicle writes and settlement writes; cross-ledger ops require a separate gate. |
| High | Vehicle and settlement data can duplicate each other. | Vehicle owns movement/access/fuel/docking. Settlement owns residents/stocks/facilities/incidents. |
| High | A caravan can be mistaken for one vehicle instead of a moving community. | Treat caravan as Mobile Community: a social ledger plus optional vehicle fleet. MB1 only validates/summarizes; no joiner generation. |
| High | Transport contracts and passengers can become a second quest/inventory system. | MB1 does not implement contracts. Future transport contracts need their own ledger/gate and capacity rules. |
| High | Autonomous NPC caravans/ships can become hidden pathfinding/world simulation. | Treat them as coarse Living World route actors in a later gate; no autonomous route simulation in MB1. |
| High | Prompt chunks can dump full room/cargo/layout data. | Prompt lines must cap facilities/problems and must not include raw layout/tile grids. |
| High | Carrier/hangar details can dump the whole fleet. | MB1 prompt may summarize carried vehicles, but must cap names and never implement launch/recover persistence. |
| High | UI can become a direct mobile-base editor. | No Webview in MB1. Future UI is read-only first. |
| Medium | Mobile bases require both exterior and interior access concepts. | MB1 may summarize exterior access warnings; interior access is an enum, not a pathfinding model. |
| Medium | Reference games may tempt content copying. | Only high-level patterns are allowed; no layouts, names, data, or mechanics copied. |
| Low | Naming may blur with Vehicle System. | Internal term: Mobile Base. It is a Vehicle `mobileBase` link to Settlement Mode. |

## Gate Verdict

Approved for MB1:

- `src/mobileBaseCore.ts`
- pure `parseMobileBaseLink()`
- pure `validateMobileBaseLink()`
- pure `buildMobileBasePromptLines()`
- tests

Blocked until later gates:

- file I/O;
- feature flag wiring;
- GM prompt injection wiring;
- `mobileBaseOps`;
- any write to `vehicle_state.json`;
- any write to `settlement_state.json`;
- any cross-ledger operation;
- Webview;
- map overlay;
- travel tick;
- travel announcement / joiner generation;
- transport contracts / passenger requests;
- autonomous NPC caravan or trade-ship simulation;
- launch/recover carrier operations;
- cargo/fuel/stock combined consumption.

## Final MB1 Contract

Implement:

```ts
// src/mobileBaseCore.ts
export function parseMobileBaseLink(input: unknown): MobileBaseLink | undefined;
export function validateMobileBaseLink(
  vehicle: VehicleEntry | undefined,
  settlement: SettlementState | undefined
): MobileBaseLinkResult;
export function buildMobileBasePromptLines(
  vehicle: VehicleEntry,
  settlement: SettlementState,
  options?: MobileBasePromptOptions
): string[];
```

Rules:

- no `vscode`;
- no `fs`;
- no DOM;
- no input mutation;
- deterministic for same input;
- closed unions normalize to safe defaults;
- prompt lines are bounded;
- no raw layout/tile grid;
- no cargo dump;
- no full fleet dump;
- no hidden room leakage;
- no state writes.

Recommended caps:

- prompt lines: 7
- facilities/problems in prompt: 3
- line length: 180 chars
- carried vehicle names in prompt: 4
- warnings: 8

## Required MB1 Tests

Add:

```text
scripts/test_mobile_base_core.js
```

Required cases:

- missing link returns undefined;
- invalid mode/layout profile normalizes safely;
- vehicle without `mobileBase` validates as not mobile base;
- missing settlement fails with reason;
- mismatched settlementId fails;
- valid vehicle + settlement succeeds;
- prompt lines include base name/mode and docking/access warning;
- caravan/mobile community mode does not require treating the whole caravan as
  one vehicle;
- prompt lines include capped hangar/carried vehicle summary when available;
- prompt lines include capped facilities/problems only;
- prompt lines do not include raw layout/tile grid;
- input objects are not mutated.

## Required Verification

```powershell
cd C:\AI\text-adventure-vsce
npm run compile
node scripts/test_mobile_base_core.js
npm test
node scripts/validate_utf8_docs.js
```

## Copy-paste Prompt For Grok/Codex MB1

```markdown
You are implementing LoreRelay Mobile Base System MB1.

Read first:

1. `docs/MOBILE_BASE_SYSTEM_DESIGN.md`
2. `docs/MOBILE_BASE_SYSTEM_CHATGPT_GATE.md`
3. `docs/VEHICLE_SYSTEM_DESIGN.md`
4. `docs/VEHICLE_SYSTEM_CHATGPT_GATE.md`
5. Existing pure-core patterns:
   - `src/vehicleCore.ts`, if it exists
   - `src/settlementCore.ts`
   - `src/settlementViewCore.ts`
   - `scripts/run_all_tests.js`

Implement MB1 only:

- `src/mobileBaseCore.ts`
- `scripts/test_mobile_base_core.js`
- test runner registration

Core exports:

- `parseMobileBaseLink(input)`
- `validateMobileBaseLink(vehicle, settlement)`
- `buildMobileBasePromptLines(vehicle, settlement, options?)`

Required behavior:

- pure TypeScript only
- no `vscode`
- no `fs`
- no DOM
- no input mutation
- deterministic output
- closed unions normalize safely
- validate vehicle.mobileBase.settlementId against settlement
- summarize the mobile base compactly for GM prompt
- include exterior access/docking warning when present
- include capped hangar/carried vehicle summary when available
- cap facilities/problems
- do not leak raw layout/tile grid

Do not implement:

- file I/O
- feature flags
- GM prompt injection wiring
- mobileBaseOps
- travel announcement / joiner generation
- transport contracts / passenger requests
- autonomous NPC caravan or trade-ship simulation
- vehicleOps
- launch/recover carrier operations
- settlementOps
- Webview UI
- map overlay
- travel tick
- cross-ledger writes

Verification:

- `npm run compile`
- `node scripts/test_mobile_base_core.js`
- `npm test`
- `node scripts/validate_utf8_docs.js`

Update docs/logs only if you can avoid mixing unrelated dirty work. Commit only
intentional files.
```

## Handoff

After MB1 passes, run a second gate for optional I/O and prompt injection.
Do not connect docking/travel persistence until a third apply gate.
