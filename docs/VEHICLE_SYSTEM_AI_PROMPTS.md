# Vehicle System AI Prompts

Use this file to dispatch LoreRelay's Vehicle System work to other AI agents.
This is a coordination document only; the design contract is:

- `docs/VEHICLE_SYSTEM_DESIGN.md`
- `docs/VEHICLE_SYSTEM_CHATGPT_GATE.md`

## 0. Common Header

Paste this before any role-specific prompt:

```markdown
LoreRelay Vehicle System handoff.

Before working, read these files in order:

1. `AI_HANDOVER.md`
2. `AI_ROADMAP.md`
3. `AI_SHARED_LOG.md` Current Snapshot and recent entries
4. `docs/VEHICLE_SYSTEM_DESIGN.md`
5. `docs/VEHICLE_SYSTEM_CHATGPT_GATE.md`
6. `docs/SETTLEMENT_MODE_DESIGN.md` if touching settlement integration
7. `docs/CAMPAIGN_KIT_DESIGN.md` if touching travel/trade integration

Task constraints:

- Do not copy code, schemas, vehicle names, data, art, prose, or combat rules
  from Metal Max, Kenshi, Dwarf Fortress, CDDA, Caves of Qud, RimWorld,
  Star Wars, or any other reference.
- Extract only high-level design patterns.
- Vehicles are durable campaign assets with access limits.
- They are not a real-time driving simulator, tactical combat grid, pathfinding
  engine, or full vehicle crafting game.
- Feature flags default OFF.
- Persistence requires a separate apply gate.
- Webview is read-only first.
```

## 1. Grok/Codex Prompt - V1 Pure Core

Use this first.

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

## 2. Codex/ChatGPT Prompt - V1 Implementation Gate

Use after Grok/Codex V1 implementation.

```markdown
Review the Vehicle System V1 implementation against:

1. `docs/VEHICLE_SYSTEM_DESIGN.md`
2. `docs/VEHICLE_SYSTEM_CHATGPT_GATE.md`
3. `src/vehicleCore.ts`
4. `scripts/test_vehicle_core.js`
5. `scripts/run_all_tests.js`

Do not widen scope unless fixing a blocker.

Verify:

- pure core has no `vscode`, `fs`, DOM, or disk write
- parser caps all arrays
- IDs and closed unions are sanitized
- numeric values are clamped
- `canVehicleAccessLocation` handles size, required tags, blockers, disabled
  vehicles, and parking fallback
- `validateVehicleFleet` handles carrier hangars, carried vehicles, invalid
  refs, self-carry/cycles, and carried size limits
- prompt lines are compact and bounded
- no cargo/module/commerce/settlement dual-write exists
- no launch/recover/carrier assignment persistence exists
- tests cover all gate-required cases

Produce:

- findings table
- pass/block verdict
- minimal fix list if blocked
```

## 3. Future Prompt - V2 I/O and Prompt Injection Gate

Do not use until V1 passes.

```markdown
Design the next Vehicle System slice for optional `vehicle_state.json` disk I/O
and compact GM prompt injection.

Read:

1. `docs/VEHICLE_SYSTEM_DESIGN.md`
2. `docs/VEHICLE_SYSTEM_CHATGPT_GATE.md`
3. V1 implementation and tests
4. `src/gmPromptBuilder.ts`
5. `src/gameRules.ts`

Do not implement code.

Decide:

- whether to add `enableVehicleSystem` now
- how `vehicleState.ts` should read optional `vehicle_state.json`
- how many vehicle prompt lines are allowed
- how to avoid prompt bloat
- which files may be read
- what remains blocked until `vehicleOps` apply gate

Output a V2 gate document.
```

## 4. Claude Prompt - Future Read-only Vehicle Panel

Do not use until V1/V2 pass.

```markdown
Design a read-only Webview vehicle panel for LoreRelay.

Read:

1. `docs/VEHICLE_SYSTEM_DESIGN.md`
2. V1/V2 gate documents
3. `webview/modules/85-world.js`
4. existing character/status panel modules

Goal:

- show active vehicle
- show capacity, cargo band, condition, fuel/feed/mana, access restrictions
- show where the vehicle is parked/docked/stabled
- show modules as read-only chips
- show "cannot enter this location" warnings

Do not implement:

- direct disk writes
- vehicle editor
- cargo drag/drop
- module install/remove
- `vehicleOps`
- route/pathfinding
- tactical combat UI
```
