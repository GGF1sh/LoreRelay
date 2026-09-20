# Settlement Mode / StoneSense-style View Design

> Status: design only. No implementation in this document.
>
> Source inspirations: Dwarf Fortress play reports / DFHack and StoneSense architecture patterns / Cataclysm: Dark Days Ahead overmap-mapgen-event patterns / RimTalk-style in-world conversations / Caves of Qud procedural history and discovery density / Kenshi outpost pressure and faction world-states.
>
> License boundary: do not copy source code, schemas, sprite assets, JSON data, names, or game text from referenced projects. Extract only high-level design patterns.
>
> Expanded reference notes: [`docs/SETTLEMENT_REFERENCE_PATTERNS.md`](SETTLEMENT_REFERENCE_PATTERNS.md)

## 0. Goal

LoreRelay should support a Dwarf Fortress / CDDA-like feeling without becoming a full colony sim or game engine.

The target is:

- a settlement that stores resources, residents, visitors, merchants, incidents, and projects;
- a limited layered view of that settlement, inspired by StoneSense but backed by LoreRelay JSON;
- in-world conversations with people who exist in the settlement context;
- a return loop from Campaign Kit expeditions into settlement growth and problems.

The non-goal is:

- no full physical tile simulation;
- no freeform SimCity-style zoning game in v1;
- no dwarf-level job scheduling;
- no deep geological strata simulation;
- no 3D engine as the canonical state;
- no GM prompt injection of full tile grids.

## 0.1 Reference Pattern Summary

Settlement Mode uses references in different layers:

| Reference | Useful Pattern | LoreRelay Target |
|---|---|---|
| Dwarf Fortress / StoneSense | layered settlement, incident history, readable isometric projection | settlement ledger and display-only view |
| Cataclysm: Dark Days Ahead | overmap/local abstraction, survival resources, delayed concrete detail | tile overmap, resources, bounded local layouts |
| RimTalk-style mods | people speaking from inside a running world | In-World Chat and NPC Registry |
| Caves of Qud | procedural history, village hubs, strange discoveries, appraisal loop | World Forge, discoveries, Chronicle, Lorebook |
| Kenshi | outpost vulnerability, faction world-states, merchant/visitor pressure, away-time progression | Settlement Mode, Living World, Commerce, Observatory |

The key split:

- Qud-like patterns add **world meaning and discovery density**.
- Kenshi-like patterns add **world pressure on settlements**.
- Neither should expand M1 into a combat sim, real-time squad AI, freeform
  building sim, or setting clone.

## 1. Mental Model

LoreRelay already has the macro layer:

- `world_forge.json`: regions, locations, factions, coordinates, biome metadata.
- `world_state.json`: dynamic macro state, markets, NPC positions, quest hooks, recent changes.
- `tileOvermapCore.ts`: display-only macro tile view derived from world data.

Settlement Mode adds a meso layer:

- `settlement_state.json`: persistent settlement facts and deltas.
- `settlement_layout.json`: optional static layout skeleton for one settlement site.
- `settlementViewCore.ts`: display snapshot builder, never authoritative.

Recommended layering:

```text
Macro:
  world_forge.json + world_state.json
  -> tileOvermap display snapshot

Meso:
  settlement_layout.json + settlement_state.json
  -> settlement/isometric display snapshot

Micro:
  not stored in v1 except as abstract buildings/zones/projects
```

The key rule is the same as Cartography and Tile Overmap:

> Simulation and persistence are canonical JSON. Renderers are replaceable views.

## 2. Experience Loop

Settlement Mode should reinforce the existing Campaign Kit loop:

```text
Campaign Mode:
  leave hub -> explore / scavenge / trade / quest

Return:
  bring discoveries, resources, contacts, rumors, injuries, and obligations home

Settlement Mode:
  appraise, repair, build, negotiate, rest, host merchants, resolve incidents

World Reaction:
  factions, markets, residents, visitors, and job boards respond

In-World Chat:
  talk to merchant / watch captain / quartermaster / resident without necessarily changing state
```

This is not "build every wall by hand."
It is "a settlement ledger that produces stories."

## 3. Data Contracts

### 3.1 `settlement_state.json` v1

Minimal canonical state:

```ts
interface SettlementStateV1 {
  version: 1;
  locationId: string;
  kind: SettlementKind;
  settlementDay: number;
  population: number;
  morale: number;     // 0..100
  security: number;   // 0..100
  stocks: Record<string, number>;
  buildings: SettlementBuilding[];
  residents: SettlementResident[];
  visitors: SettlementVisitor[];
  merchants: SettlementMerchant[];
  projects: SettlementProject[];
  incidents: SettlementIncident[];
  pendingEvents: SettlementPendingEvent[];
  history: SettlementHistoryEntry[];
}
```

Suggested unions:

```ts
type SettlementKind =
  | 'village'
  | 'fortress'
  | 'outpost'
  | 'scrapyard'
  | 'station'
  | 'caravan_camp'
  | 'hidden_village'
  | 'underwater_fort'
  | 'other';

type SettlementLayer = -2 | -1 | 0 | 1;

type SettlementZoneType =
  | 'gate'
  | 'plaza'
  | 'market'
  | 'workshop'
  | 'stockpile'
  | 'quarters'
  | 'clinic'
  | 'barracks'
  | 'shrine'
  | 'waterworks'
  | 'ruins'
  | 'hazard'
  | 'other';
```

Example record shapes:

```ts
interface SettlementBuilding {
  id: string;
  name: string;
  zoneType: SettlementZoneType;
  layer: SettlementLayer;
  status: 'intact' | 'damaged' | 'under_construction' | 'disabled' | 'ruined';
  projectId?: string;
}

interface SettlementResident {
  npcId: string;
  role: 'leader' | 'guard' | 'merchant' | 'artisan' | 'healer' | 'scout' | 'resident' | 'other';
}

interface SettlementVisitor {
  npcId: string;
  untilDay: number;
  purpose: 'trade' | 'refuge' | 'quest' | 'diplomacy' | 'pilgrimage' | 'other';
}

interface SettlementMerchant {
  npcId: string;
  untilDay: number;
  wares: string[];
}

interface SettlementProject {
  id: string;
  name: string;
  kind: 'repair' | 'construction' | 'upgrade' | 'research' | 'fortify' | 'ritual' | 'other';
  targetBuildingId?: string;
  progress: number;   // 0..100
  etaDays?: number;
  requiredStocks?: Record<string, number>;
}

interface SettlementIncident {
  id: string;
  day: number;
  kind: 'shortage' | 'attack' | 'illness' | 'breakdown' | 'visitor' | 'rumor' | 'dispute' | 'discovery' | 'other';
  severity: 'info' | 'warning' | 'critical';
  resolved: boolean;
  text: string;
}

interface SettlementPendingEvent {
  id: string;
  templateId: string;
  day: number;
  choices: Array<{ id: string; label: string; hint?: string }>;
}
```

Caps and validation:

- arrays should cap around 20-80 depending on field;
- `residents + visitors + merchants` should expose at most 10-20 named NPCs to prompts/UI by default;
- IDs use existing LoreRelay safe ID style;
- strings clamp aggressively;
- all writes go through existing workspace queue/circuit breaker patterns.

### 3.2 `settlement_layout.json` v1

Static or lazily generated layout:

```ts
interface SettlementLayoutV1 {
  version: 1;
  locationId: string;
  profileId: string;
  width: number;    // v1 target: 16..32
  height: number;   // v1 target: 16..32
  layers: SettlementLayer[];
  zones: SettlementZone[];
  gates: SettlementGate[];
  variantId: string;
}
```

Important:

- Do not store every tile by default.
- Store zones and features. A view snapshot may expand them into tiles.
- Generate extra layers only when a scenario or operation needs them.

Suggested limited Z model:

| Layer | Meaning |
|---|---|
| `1` | watchtower / roof / upper deck |
| `0` | plaza / market / workshop / warehouse |
| `-1` | cellar / waterway / shelter |
| `-2` | ruins / polluted zone / scenario-only deep layer |

## 4. Turn Channels

Settlement should not mutate via chat text directly.

Add a future `turn_result.settlementOps` channel:

```ts
type SettlementOp =
  | { type: 'start_project'; projectId: string; kind: string; targetBuildingId?: string }
  | { type: 'advance_project'; projectId: string; progressDelta: number }
  | { type: 'adjust_stock'; resourceId: string; delta: number; reason?: string }
  | { type: 'resolve_incident'; incidentId: string; outcome?: string }
  | { type: 'host_visitor'; npcId: string; untilDay: number; purpose: string }
  | { type: 'depart_visitor'; npcId: string }
  | { type: 'expand_layer'; layer: SettlementLayer; reason?: string };
```

Rules:

- settlementOps are optional and default-off.
- GM narration may suggest settlement changes, but only settlementOps persist them.
- no tile grid patches.
- no direct writes from Webview clicks unless they insert chat text or call a safe handler.

## 5. Simulation Tick

`settlementTickCore.ts` should be pure.

Suggested weekly/day tick:

```text
consume basic stocks
advance projects
expire visitors/merchants
evaluate event catalog
append incidents/history
optionally generate quest hooks
```

Event model inspired by CDDA EoC but much smaller:

```ts
type SettlementCondition =
  | { stockBelow: { id: string; amount: number } }
  | { statBelow: { key: 'morale' | 'security'; value: number } }
  | { factionRepBelow: { factionId: string; rep: number } }
  | { projectActive: { projectId: string } }
  | { worldTurnMod: { mod: number; eq: number } }
  | { hazardNearby: { hazard: string } };
```

Keep the catalog deterministic:

```text
seed = hash(worldSeed, locationId, settlementDay, catalogVersion)
```

## 6. Prompt Integration

GM prompt chunk:

```text
[Settlement]
Location: Hearthmere Village (settlementDay 12)
Population 42, morale 63, security 58.
Stocks: food 21, water 17, parts 4 (low), medicine 0 (OUT).
Buildings: market intact, workshop damaged, cellar intact.
Visitors: Rovan the trader until day 14.
Projects: Repair Workshop 40%, ETA 3 days.
Incidents: water pump failure unresolved.
Use settlementOps for persistent changes. Do not invent completed construction without ops.
```

Budget:

- priority below Game Rules / Campaign Kit core loop;
- above lorebook/vision when Settlement Mode is active;
- hard cap, likely 1200-1800 chars.

In-World Chat:

- may reference settlement status;
- should not mutate state unless explicitly promoted into Campaign/Settlement action;
- excellent for merchant talk, guard reports, workshop advice, resident gossip.

## 7. View Strategy

### 7.1 Current 2D Tile View

First strengthen existing tile view:

- show NPC/merchant markers from `world_state.npcPositions`;
- show faction/frontline/hazard overlays;
- show quest and job board markers;
- keep it display-only.

### 7.2 Settlement Snapshot

`settlementViewCore.ts` should produce a compact view model:

```ts
interface SettlementViewSnapshot {
  locationId: string;
  layer: SettlementLayer;
  width: number;
  height: number;
  tiles: SettlementViewTile[];
  markers: SettlementViewMarker[];
  legend: Array<{ code: string; label: string }>;
}
```

Renderer rule:

- `settlementViewCore` can expand zones into tiles;
- Webview renders the snapshot;
- snapshot is never persisted as canonical state.

### 7.3 StoneSense-style Isometric View

Implement after M1/M2.

Minimum features:

- Canvas renderer;
- pan/zoom;
- follow current location/player marker;
- layer selector `Z+1 / Z0 / Z-1 / Z-2`;
- graceful fallback for unknown tiles;
- no Three.js in first iteration.

### 7.4 Low-poly 3D Diorama

Dream track only.

Detailed design and gate:

- [`docs/SETTLEMENT_MODE_M5_DESIGN.md`](SETTLEMENT_MODE_M5_DESIGN.md)
- [`docs/SETTLEMENT_MODE_M5_CHATGPT_GATE.md`](SETTLEMENT_MODE_M5_CHATGPT_GATE.md)

If implemented:

- fixed/limited camera;
- read-only;
- generated from view snapshot;
- no canonical state in 3D scene.

## 8. Implementation Phases

### M1: Settlement Model Foundation

Goal:

- define `settlement_state.json` and optional `settlement_layout.json`;
- implement pure parser/tick scaffolding;
- no UI beyond debug payload if needed.

Files:

- `src/settlementCore.ts`
- `src/settlementState.ts`
- `src/settlementLayoutCore.ts`
- `scripts/test_settlement_core.js`

Acceptance:

- parser clamps invalid input;
- tick consumes small resources deterministically;
- layout generator creates bounded zones for one location;
- no GM prompt changes unless feature flag is enabled.

### M2: 2D Map Layer Strengthening

Goal:

- add display overlays to existing tile view.

Inputs:

- `world_state.npcPositions`
- `recentChanges`
- factionControl
- questHooks / campaign job board
- FoW state

Acceptance:

- no prompt budget increase;
- no state writes from tile clicks;
- markers are capped and sanitized.

### M3: Isometric World / Settlement View

Goal:

- StoneSense-like Canvas renderer for macro and/or settlement snapshots.

Acceptance:

- draw from snapshot only;
- pan/zoom;
- layer selector;
- fallback glyph/sprite for unknown tiles;
- smoke test proves bundle symbols and DOM structure.

### M4: Limited Z-Level Operations

Goal:

- support `expand_layer` or on-demand layout layer generation.

Acceptance:

- only allowed layers `-2..1`;
- no full underground simulation;
- layer creation is deterministic and bounded.

### M5: Low-poly Diorama

Goal:

- optional future visualizer.
- dream track, default OFF.
- split into M5a pure diorama snapshot and M5b Three.js read-only renderer.

Acceptance:

- read-only;
- no canonical state in Three.js;
- not a blocker for Settlement Mode.
- no M5b renderer before M5a pure snapshot and gate pass.

## 9. AI Division

Recommended:

- ChatGPT: data contract, safety review, prompt chunk/ops boundary.
- Claude: Webview view model and Canvas renderer UI.
- Grok: implementation of pure core + state file + tests, then E2E with sample world.
- Gemini: README/feature explanation, screenshots, comparison wording, user-facing guide.

## 10. First Practical Slice

Do **M1 only** first.

M1 is enough to unlock:

- a settlement ledger;
- resource pressure;
- merchants/visitors;
- a future settlement prompt chunk;
- later StoneSense-style rendering without repainting the architecture.

Do not start with 3D.
Do not start with a full tile editor.
Do not start with pathfinding.

Start with the ledger that makes stories happen.
