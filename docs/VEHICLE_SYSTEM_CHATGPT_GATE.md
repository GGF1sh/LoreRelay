# Vehicle System ChatGPT Gate

Date: 2026-07-04 JST
Reviewer: Codex / ChatGPT
Status: Approved for **V1 pure core and prompt-summary contract only**.

This gate reviews:

1. `docs/VEHICLE_SYSTEM_DESIGN.md`
2. Existing LoreRelay patterns:
   - independent ledgers
   - `*Core.ts` pure parsing
   - feature flags default OFF
   - apply gates before persistence
   - read-only Webview first

## Findings

| Severity | Finding | Decision |
|---|---|---|
| Critical | Vehicles can accidentally become a full tactical movement or combat engine. | V1 is pure ledger parsing, access checks, and compact prompt summaries only. No pathfinding, no combat grid, no physics. |
| Critical | Vehicles can bypass dungeon/building constraints if size/access is not first-class. | V1 must include `VehicleAccessProfile`, `LocationVehicleAccess`, and `canVehicleAccessLocation()`. |
| High | Vehicle state could pollute `game_state.json` or `world_state.json`. | Use independent optional `vehicle_state.json`; no embedding in existing ledgers. |
| High | Webview could become a direct garage editor. | No Webview implementation in V1. Future UI must be read-only until a separate apply gate. |
| High | Cargo/modules can create complex dual ledgers with campaign resources. | V1 may parse/cap cargo/modules, but must not sync, trade, install, or persist ops. |
| High | Carrier vehicles can introduce cyclic containment and multi-entry write bugs. | V1 may parse hangar/carried references and validate them purely. Launch/recover persistence is blocked until a later gate. |
| High | GM prompt chunks can bloat quickly. | Prompt lines must cap vehicle count, summarize active/nearby vehicles only, and omit raw cargo details unless relevant. |
| Medium | Large vehicles need safe parking fallback when blocked. | Access result must include reason and optional `parkingLocationId`. |
| Medium | Vehicle combat values can invite deterministic battle mechanics too early. | Use abstract bands/power only; no per-weapon resolution in V1. |
| Medium | Fantasy/sci-fi/post-apoc variants may fragment schemas. | Use one Mobile Asset schema with closed unions for `kind`, terrain, access, power type, and modules. |
| Low | User-facing terminology may be inconsistent. | Internal term: Mobile Asset. UI can say "乗り物" / "Vehicle". |

## Gate Verdict

Approved for V1:

- `src/vehicleCore.ts`
- pure parser/sanitizer for `vehicle_state.json`
- pure `canVehicleAccessLocation()`
- pure `validateVehicleFleet()`
- pure `buildVehiclePromptLines()`
- tests
- optional design docs / prompts

Blocked until later gates:

- any disk write;
- `vehicleOps` persistence;
- Webview garage/dock/stable UI;
- map overlay wiring;
- settlement/commerce automatic sync;
- cargo/module install/remove persistence;
- launch/recover or carrier assignment persistence;
- combat resolution;
- route/pathfinding engine.

## Final V1 Contract

Implement a pure module:

```ts
// src/vehicleCore.ts
export function parseVehicleState(input: unknown): VehicleState;
export function canVehicleAccessLocation(
  vehicle: VehicleEntry,
  locationAccess: LocationVehicleAccess | undefined
): VehicleAccessResult;
export function validateVehicleFleet(state: VehicleState): VehicleFleetValidationResult;
export function buildVehiclePromptLines(
  state: VehicleState,
  options?: VehiclePromptOptions
): string[];
```

Rules:

- no `vscode`;
- no `fs`;
- no DOM;
- no mutation of inputs;
- deterministic for same input;
- arrays capped;
- IDs validated;
- numbers clamped;
- closed unions normalized;
- all output prompt lines bounded;
- carrier/hangar references must be bounded and cycle-safe;
- carried vehicles must not exceed carrier `maxCarriedSize`;
- feature-flag behavior is handled by caller, not by this pure core.

Recommended caps:

- vehicles: 24
- modules per vehicle: 12
- cargo items per vehicle: 24
- crew assignments per vehicle: 12
- notes per vehicle: 12
- carried vehicle refs per carrier: 24
- prompt vehicles: 3
- prompt carried vehicle names per carrier: 4
- prompt line length: 180 chars

## Required V1 Tests

Add:

```text
scripts/test_vehicle_core.js
```

Required cases:

- missing/invalid state parses to empty ledger;
- valid state preserves safe vehicle fields;
- invalid IDs are rejected or normalized;
- vehicle arrays are capped;
- modules/cargo/crew/notes are capped;
- negative capacity/durability/resource values are clamped;
- current cargo is capped to cargo capacity;
- closed unions normalize to safe defaults;
- disabled vehicle access is denied;
- large vehicle is denied from a medium-only location;
- missing required access tag is denied;
- parking fallback is included when provided;
- suitable vehicle/location returns allowed;
- carrier hangar refs are capped;
- self-carry and indirect carry cycles are rejected or reported;
- carried vehicle size greater than carrier max is rejected or reported;
- prompt lines cap to active + nearby vehicles;
- prompt lines summarize fleet/carrier state without dumping all vehicles;
- prompt lines include access restrictions for active vehicle;
- prompt lines do not dump long cargo/module lists;
- input is not mutated.

## Non-Goals

- No Webview.
- No file I/O.
- No prompt injection wiring.
- No `turn_result.vehicleOps` apply.
- No campaign resource sync.
- No settlement write.
- No launch/recover or carrier assignment persistence.
- No route/pathfinding.
- No tactical combat.
- No physics.
- No vehicle editor.

## Required Verification

```powershell
cd C:\AI\text-adventure-vsce
npm run compile
node scripts/test_vehicle_core.js
npm test
node scripts/validate_utf8_docs.js
```

## Copy-paste Prompt For Grok/Codex V1

```markdown
You are implementing LoreRelay Vehicle System V1.

Read first:

1. `docs/VEHICLE_SYSTEM_DESIGN.md`
2. `docs/VEHICLE_SYSTEM_CHATGPT_GATE.md`
3. Existing pure-core patterns:
   - `src/settlementCore.ts`
   - `src/campaignResourcesCore.ts`
   - `src/worldStateCore.ts`
   - `scripts/run_all_tests.js`

Implement V1 only:

- `src/vehicleCore.ts`
- `scripts/test_vehicle_core.js`
- test runner registration

Core exports:

- `parseVehicleState(input: unknown): VehicleState`
- `canVehicleAccessLocation(vehicle, locationAccess): VehicleAccessResult`
- `validateVehicleFleet(state): VehicleFleetValidationResult`
- `buildVehiclePromptLines(state, options?): string[]`

Required behavior:

- pure TypeScript only
- no `vscode`
- no `fs`
- no DOM
- no input mutation
- deterministic output
- cap vehicles/modules/cargo/crew/notes
- validate IDs
- clamp numeric fields
- closed unions normalize to safe defaults
- include vehicle size/access restrictions
- include fleet/carrier/hangar relationships
- reject or report self-carry, indirect cycles, invalid carrier refs, and
  over-size carried vehicles
- deny oversized vehicles from restricted locations with a clear reason
- include optional parking fallback in access result
- build compact GM prompt lines for active/nearby vehicles only

Do not implement:

- Webview UI
- file I/O
- `vehicle_state.json` disk reads/writes
- `vehicleOps`
- launch/recover vehicle ops
- carrier assignment persistence
- GM prompt wiring
- map overlay
- settlement/commerce sync
- route/pathfinding
- tactical combat
- physics

Verification:

- `npm run compile`
- `node scripts/test_vehicle_core.js`
- `npm test`
- `node scripts/validate_utf8_docs.js`

Update `CHANGELOG.md` and `AI_SHARED_LOG.md` only if you can do so without
mixing unrelated dirty work. Commit only intentional files.
```

## Handoff

After V1 passes, run a second gate before adding:

- `vehicleState.ts` disk I/O;
- `game_rules.json` `enableVehicleSystem`;
- GM prompt injection;
- `turn_result.vehicleOps`;
- Webview garage/dock/stable panels.
