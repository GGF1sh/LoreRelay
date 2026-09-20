# Mobile Base System AI Prompts

Use this file to dispatch LoreRelay's Mobile Base System work to other AI
agents.

Design contract:

- `docs/MOBILE_BASE_SYSTEM_DESIGN.md`
- `docs/MOBILE_BASE_SYSTEM_CHATGPT_GATE.md`
- `docs/VEHICLE_SYSTEM_DESIGN.md`
- `docs/VEHICLE_SYSTEM_CHATGPT_GATE.md`

## 0. Common Header

Paste this before any role-specific prompt:

```markdown
LoreRelay Mobile Base System handoff.

Before working, read these files in order:

1. `AI_HANDOVER.md`
2. `AI_ROADMAP.md`
3. `AI_SHARED_LOG.md` Current Snapshot and recent entries
4. `docs/VEHICLE_SYSTEM_DESIGN.md`
5. `docs/VEHICLE_SYSTEM_CHATGPT_GATE.md`
6. `docs/MOBILE_BASE_SYSTEM_DESIGN.md`
7. `docs/MOBILE_BASE_SYSTEM_CHATGPT_GATE.md`
8. `docs/SETTLEMENT_MODE_DESIGN.md`

Task constraints:

- Do not copy code, schemas, layouts, names, data, art, prose, ship designs, or
  combat systems from Space Haven, Fuga: Melodies of Steel, Metal Max, Kenshi,
  Dwarf Fortress, CDDA, RimWorld, Caves of Qud, Star Wars, or any other
  reference.
- Extract only high-level design patterns.
- A mobile base is a vehicle with a settlement ledger attached.
- It is not a second colony sim, room editor, pathfinding engine, or tactical
  vehicle combat system.
- Feature flags default OFF.
- Persistence requires later apply gates.
- Webview is read-only first.
```

## 1. Grok/Codex Prompt - MB1 Pure Link Core

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
- treat caravan/mobile_community as a social moving base, not as one giant
  vehicle
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

## 2. Codex/ChatGPT Prompt - MB1 Implementation Gate

```markdown
Review the Mobile Base System MB1 implementation against:

1. `docs/MOBILE_BASE_SYSTEM_DESIGN.md`
2. `docs/MOBILE_BASE_SYSTEM_CHATGPT_GATE.md`
3. `src/mobileBaseCore.ts`
4. `scripts/test_mobile_base_core.js`

Verify:

- pure core has no `vscode`, `fs`, DOM, or disk writes
- mobileBase link parsing is bounded and deterministic
- settlementId mismatch is rejected
- missing vehicle/settlement states fail safely
- caravan/mobile community mode is summarized without pretending the whole
  caravan is one physical vehicle
- prompt lines are capped
- prompt includes capped hangar/carried vehicle summary when present
- prompt does not leak raw layout/tile grid or hidden data
- no cross-ledger writes exist
- no Webview or prompt-injection wiring was added

Produce:

- findings table
- pass/block verdict
- minimal fix list if blocked
```

## 3. Future Claude Prompt - Read-only Mobile Base UI

Do not use until MB1 and I/O/prompt gates pass.

```markdown
Design a read-only Mobile Base panel for LoreRelay.

Read:

1. `docs/MOBILE_BASE_SYSTEM_DESIGN.md`
2. `docs/MOBILE_BASE_SYSTEM_CHATGPT_GATE.md`
3. Vehicle and Settlement Mode current implementation
4. Webview module conventions

Goal:

- show active mobile base
- show vehicle condition/fuel/access
- show docking/parking state
- show internal facilities/stocks/incidents from settlement ledger
- show "cannot enter" warnings
- reuse Settlement Mode views where possible

Do not implement:

- direct disk writes
- room editor
- crew job scheduler
- mobileBaseOps
- vehicleOps
- settlementOps
- tactical combat UI
- pathfinding
```
