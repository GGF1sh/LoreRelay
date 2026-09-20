# LoreRelay Economy / Production / Logistics Architecture

Status: design only
Implementation status: not started
First implementation slice: `NOAI-ECON-FLOWS-001`

## 0. Decision summary

LoreRelay must separate **game difficulty** from **diegetic world conditions**.

`difficulty` is a meta-game control for adjudication and challenge calibration:

- dice/DC baselines;
- combat opposition and tactics;
- failure consequence severity;
- assistance, hints, and fail-forward generosity;
- how strictly the GM interprets uncertain actions.

Economy, production, pollution, soil quality, facility damage, demand, and logistics are
facts about the world. They must not be collapsed into a global easy/hard economy switch.

```text
Meta-game challenge
  └─ Difficulty / GM adjudication / combat calibration

World state
  ├─ Site productive potential
  ├─ Installed production capacity
  ├─ Facility condition
  ├─ Demand
  ├─ Route capacity and disruption
  └─ Market stock and price pressure
```

The existing five values remain useful:

- `abundant`
- `plentiful`
- `normal`
- `scarce`
- `barren`

However, they should be understood as **background resource availability**, not player
difficulty. For compatibility, the existing `economyProfile` schema name can remain until a
separate migration or UI wording slice is justified.

## 1. Difficulty boundary

### 1.1 Appropriate uses of difficulty

Difficulty may affect more than combat, but it should remain a meta-game layer.

Good uses include:

- baseline DCs for uncertain actions;
- enemy strength, coordination, and tactical competence;
- how severe failed checks become;
- whether the GM offers warnings before irreversible choices;
- availability of fail-forward outcomes;
- puzzle hints or action suggestions;
- recovery generosity after a failed scene.

Difficulty should adjust how the game challenges the player. It should not silently rewrite
the physical history or geography of the setting.

### 1.2 Inappropriate uses of difficulty

The following are world conditions, not difficulty settings:

- whether a valley is fertile;
- whether an ore seam exists;
- whether an arcology retains working factories;
- whether soil is polluted;
- whether a refinery was damaged;
- whether a road is blockaded;
- whether a settlement consumes more food than it receives;
- whether a local specialty exists only in one region.

These conditions can make play difficult, but the difficulty is an emergent consequence of
the world state.

```text
Poor soil
+ damaged facilities
+ high demand
+ blocked routes
= severe shortage
```

### 1.3 Optional campaign presets

LoreRelay may eventually offer authoring presets such as `survivalPressure`, but such a
preset should generate or bias world conditions explicitly. It must not remain a hidden
multiplier applied to every market.

For example, a post-apocalyptic preset could establish:

```text
default background availability: barren
common facility condition: damaged
route risk: high
pollution: widespread
```

The authored world can still override that prior:

```text
Arcology Seven
  manufactured_goods: abundant
  medicine: plentiful
  food: normal

Miracle Valley
  food: abundant
  clean_water: plentiful

Contaminated Wastes
  food: barren
  scrap: plentiful
```

## 2. Current system boundary

The existing system currently owns:

- arbitrary commodity ids through `CommodityDef`;
- `basePrice`, weight, and optional economic role;
- markets and their traded commodity ids;
- `world_state.markets` as canonical stock and `priceIndex` state;
- deterministic player buy/sell operations;
- `basePrice * priceIndex * supplyBias` price calculation;
- five-tier background market recovery and price behavior;
- global, category/role, and commodity-specific availability overrides;
- market shocks from structured world events;
- faction-reputation price drift;
- deterministic soak observation of market behavior.

Important files:

- `src/livingWorldTypes.ts`
- `src/commerceCore.ts`
- `src/worldSimCommerceCore.ts`
- `src/worldKitTickCore.ts`
- `src/worldStateCore.ts`
- `src/livingWorldBridge.ts`
- `src/emergentSimulator.ts`
- `src/noaiSoakRunnerCore.ts`

The existing system does not yet own:

- physical production sites;
- explicit per-node consumption;
- commodity flow over routes;
- route bottlenecks;
- facility damage and repair;
- processing recipes;
- carrier inventory;
- NPC merchant cargo movement;
- blockades and raids as logistics state;
- logistics-map visualization.

The new system must sit below and around the existing market layer. It must not replace the
existing price or player-trade authority.

```text
Production / Demand / Logistics
              ↓ stock delta
Existing MarketStateMap
              ↓
Existing recovery / shock / price logic
              ↓
Commerce UI / GM narration / NPC reactions
```

## 3. World production model

### 3.1 Four separate factors

Effective supply should eventually be understood as four separate concepts.

```text
site productive potential
  × installed capacity
  × current condition
  × logistics delivery
  = market supply
```

#### Site productive potential

Slow-changing, spatial, and commodity-specific facts:

- soil fertility;
- mineral deposits;
- solar exposure;
- magical density;
- radiation or pollution;
- access to ancient infrastructure;
- water availability;
- proximity to orbital or planar infrastructure.

#### Installed capacity

Facilities and infrastructure created or recovered in the world:

- farms;
- mines;
- hydroponics;
- refineries;
- automated factories;
- mana collectors;
- salvage operations.

#### Current condition

Fast-changing operational state:

- damage;
- maintenance;
- sabotage;
- occupation;
- temporary workforce loss;
- repair.

#### Logistics delivery

How much produced material reaches its destination:

- route capacity;
- blockade;
- raid;
- escort;
- weather or disaster;
- transport availability.

### 3.2 Restoration versus repair

Restoring land and repairing a facility are different actions.

```text
Repair facility
  → raises facility condition
  → relatively fast and local

Purify land / restore ecosystem
  → raises site productive potential
  → slow and regional
```

A raid normally damages facility condition or route state. Scorched-earth actions, magical
corruption, or severe contamination may also lower site potential. A purification campaign
can gradually raise it again.

This separation supports stories similar to restoring an initially dead or poisoned region
without treating the entire world as a single hard-mode economy.

### 3.3 Slice-001 simplification

`NOAI-ECON-FLOWS-001` should not implement all four factors.

It uses `baseOutputPerTick` as the already-resolved healthy output for one source. Later
slices may decompose it into capacity, site yield, and condition.

```text
Slice 001:
  baseOutputPerTick

Later:
  capacityPerTick * siteYieldMultiplier * condition
```

The initial core must not multiply explicit production by the global `economyProfile`.

## 4. Minimal canonical flow model

`EconomyNode` is preferred over `ResourceNode`, because nodes represent places or economic
actors rather than the resource itself. A faction is not a physical logistics endpoint, so
ownership should be a reference/state relationship rather than a node kind.

```ts
type EconomyNodeKind =
    | 'region'
    | 'settlement'
    | 'facility'
    | 'market'
    | 'store';

interface EconomyNode {
    id: string;
    kind: EconomyNodeKind;
    label: string;
    locationId?: string;
    regionId?: string;
    marketLocationId?: string;
}

interface ProductionSource {
    id: string;
    nodeId: string;
    commodityId: string;
    baseOutputPerTick: number;
}

interface ResourceDemand {
    id: string;
    nodeId: string;
    commodityId: string;
    baseDemandPerTick: number;
}

interface TradeRoute {
    id: string;
    fromNodeId: string;
    toNodeId: string;
    commodityId: string;
    capacityPerTick: number;
    baseRisk?: number;
}

interface EconomyFlowDefinition {
    nodes: EconomyNode[];
    productionSources: ProductionSource[];
    demands: ResourceDemand[];
    tradeRoutes: TradeRoute[];
}
```

Possible future authored location:

```text
world_forge.commerce.resourceFlows
```

Slice 001 defines the in-memory contract only. It does not extend the forge parser.

## 5. Deterministic flow output

The flow core should return explanations as well as net deltas.

```ts
interface TradeFlowSummary {
    routeId: string;
    fromNodeId: string;
    toNodeId: string;
    commodityId: string;
    volume: number;
    capacity: number;
    utilization: number;
    risk: number;
    status: 'open';
}

interface NodeFlowSummary {
    nodeId: string;
    commodityId: string;
    openingStock: number;
    produced: number;
    imported: number;
    exported: number;
    fulfilledDemand: number;
    unmetDemand: number;
    unshippedSupply: number;
}

interface MarketStockDelta {
    nodeId: string;
    marketLocationId: string;
    commodityId: string;
    supplied: number;
    consumed: number;
    delta: number;
}
```

`unmetDemand` belongs to a node summary, not a route summary. When several routes enter one
market, unmet demand cannot be attributed uniquely to a single route.

### 5.1 Slice-001 algorithm

Slice 001 deliberately supports only direct, same-tick production flow.

- A route draws only from production created at its source during that tick.
- It does not export existing market inventory.
- It does not support multi-hop transit.
- It does not store cargo at intermediate nodes.
- It does not process goods.
- Risk is metadata and does not randomly alter volume.
- Route status is always `open`.
- Output order is stable by id.

When one source feeds several routes, allocate by route capacity rather than input order.

```text
routeVolume =
  routeCapacity
  * min(1, producedAmount / totalOutgoingCapacity)
```

At a market-backed destination:

```text
available =
  openingMarketStock
  + retainedLocalProduction
  + incomingRouteVolume

fulfilledDemand = min(baseDemand, available)
unmetDemand = baseDemand - fulfilledDemand

marketStockDelta =
  retainedLocalProduction
  + incomingRouteVolume
  - fulfilledDemand
```

The delta must never produce negative stock when applied to the supplied opening state.

## 6. Interaction with the existing market system

Future host integration should follow this order:

```text
1. Read canonical world_state.markets
2. Compute production / routes / demand
3. Apply bounded market stock deltas
4. Run existing tickMarketRecovery()
5. Apply existing structured market shocks
6. Apply faction-reputation price drift
7. Let NPC Agency inspect the final market state
```

The flow core must not write `priceIndex`. Existing market code remains the sole price
authority.

The current five-tier profile remains a background/fallback layer for:

- unmodelled small producers;
- household production;
- off-map imports;
- general economic resilience;
- baseline resting price and shock sensitivity.

Explicit node production must not automatically receive an additional tier multiplier.

### 6.1 Known integration risk

Existing soak evidence shows that market stock can already grow without an upper bound after
repeated player selling. Applying positive flow deltas could amplify that behavior.

Before Slice 002 applies flow deltas to canonical state, it must decide one of:

- authored storage capacity;
- explicit overflow/waste behavior;
- another bounded stock policy.

Slice 001 only returns deltas and therefore does not expand the existing canonical-state risk.

## 7. Local specialties and custom goods

Custom commodity ids already support world-specific goods such as:

- `moon_peach`
- `sakuradite`
- `spice_wine`
- `ancient_battery`
- `dragon_silk`
- `mana_fuel`

Origin should be structural: a commodity is local because its production sources exist only
at particular nodes.

Rarity should emerge from:

- few production sources;
- low output;
- limited route capacity;
- high demand;
- high route risk;
- high base price;
- background scarcity;
- processing requirements.

Do not hard-code fantasy, industrial, cyberpunk, or post-apocalyptic commodity classes.
Optional lore tags may be added later for GM authoring, but should not be simulation rules.

## 8. Processing / processing trade

Processing belongs in a later slice and should initially be one deterministic step.

```ts
interface ProcessingRecipe {
    id: string;
    inputs: Record<string, number>;
    outputs: Record<string, number>;
}

interface ProcessingSite {
    id: string;
    nodeId: string;
    recipeId: string;
    maxBatchesPerTick: number;
}
```

```text
batches = min(
  maxBatchesPerTick,
  floor(each available input / each required input)
)
```

Examples:

- grain -> ale;
- ore + fuel -> metal;
- `sakuradite_ore` -> `refined_sakuradite`;
- herbs -> medicine;
- `crude_oil` -> fuel.

Do not allow outputs from one recipe to feed another recipe during the same tick. This avoids
order-dependent chains and cycle handling.

## 9. NPC, faction, player, and GM boundaries

Deterministic simulation owns:

- facility ownership state;
- facility condition;
- route operator references;
- route state;
- build/repair/raid/sabotage costs and results;
- output and capacity modifiers;
- delivered volume;
- stock deltas.

GM narration owns:

- personalities and dialogue;
- cultural meaning of goods;
- visible details of facilities and caravans;
- motives behind conflict;
- how a raid, repair, or purification is described;
- story and quest hooks derived from shortages or monopolies.

NPCs and players should produce structured intents rather than directly editing stock.

```ts
type EconomyAction =
    | { type: 'build_facility'; nodeId: string }
    | { type: 'repair_facility'; sourceId: string; amount: number }
    | { type: 'raid_facility'; sourceId: string }
    | { type: 'escort_route'; routeId: string }
    | { type: 'sabotage_route'; routeId: string }
    | { type: 'invest_route'; routeId: string; amount: number }
    | { type: 'purify_site'; nodeId: string; commodityId?: string };
```

Full dynamic trader AI must wait until stable flow summaries and bounded stock behavior exist.

## 10. UI visualization contract

The core returns semantic data, not pixels or colors.

UI may derive:

- line thickness from `volume`;
- opacity from `utilization`;
- color from `risk` and `status`;
- direction animation from `fromNodeId` to `toNodeId`;
- bottleneck markers from high utilization plus destination unmet demand;
- shortage warnings from `unmetDemand`;
- commodity filtering from `commodityId`.

The initial UI slice should begin with static read-only routes. Animation is a later visual
enhancement, not part of the simulation core.

## 11. Implementation slices

### `NOAI-ECON-FLOWS-001`: pure production/demand/direct-flow backbone

Includes:

- `src/economyFlowCore.ts`;
- minimal types;
- deterministic direct flow;
- route and node summaries;
- market stock deltas;
- diagnostics;
- focused tests.

Excludes parser, host wiring, persistence, UI, processing, NPCs, damage, raids, and construction.

### `NOAI-ECON-FLOWS-002`: parser, stock bound, and opt-in tick integration

- parse `world_forge.commerce.resourceFlows`;
- decide storage/overflow behavior;
- apply deltas before existing market recovery;
- preserve byte-compatible behavior when no flow definition exists.

### `NOAI-ECON-FLOWS-003`: one-step processing

- recipes and processing sites;
- deterministic input consumption and output production;
- no same-tick multi-stage chains.

### `NOAI-ECON-FLOWS-004`: potential, condition, and disruptions

- site productive potential;
- facility condition;
- route states;
- repair, pollution, purification, blockade, and raid modifiers;
- no random autonomous raid system yet.

### `NOAI-ECON-FLOWS-005`: read-only route visualization

- node and route payload;
- static lines and filters;
- risk, shortage, and bottleneck indicators;
- animation deferred.

### `NOAI-ECON-FLOWS-006`: faction/player facility actions

- ownership;
- build, repair, raid, escort, sabotage, invest, and purify intents;
- deterministic results with GM narration hooks.

### `NOAI-ECON-FLOWS-007`: store integration

- derive store availability from existing market supply first;
- introduce independent store inventory only if gameplay requires it.

### `NOAI-ECON-FLOWS-008`: GM world-generation suggestions

- suggest specialties, sources, demand centers, routes, and recipes;
- do not automatically make every suggestion canonical.

### `NOAI-ECON-FLOWS-009`: bounded NPC merchant/caravan intents

- react to structured shortage and opportunity signals;
- no unconstrained full trader AI.

## 12. Explicit non-goals for Slice 001

Do not implement:

- full NPC trader AI;
- animated logistics UI;
- multi-stage supply chains;
- automatic generation of every local specialty;
- player construction UI;
- raids, sabotage, or blockades;
- site purification;
- facility condition;
- state migration;
- a rewrite of commerce or price logic;
- version or release work;
- `CHANGELOG` or `walkthrough.md` updates;
- the full test suite or soak runs.

## Appendix A: implementation handoff prompt

```text
Model recommendation: GPT-5.6 Terra
Reasoning level: Medium

Repository:
C:\AI\text-adventure-vsce

Implement only:
NOAI-ECON-FLOWS-001: deterministic production/demand/direct-flow backbone

Before planning verification, follow `docs/DEVELOPMENT_VERIFICATION_POLICY.md`.
Do not escalate beyond its risk tier without a concrete reason.

Read:
- `AGENTS.md`
- `docs/DEVELOPMENT_VERIFICATION_POLICY.md`
- `docs/ECONOMY_LOGISTICS_ARCHITECTURE.md`
- `src/livingWorldTypes.ts`
- `src/commerceCore.ts`
- `src/worldSimCommerceCore.ts`
- `src/worldKitTickCore.ts`
- `src/livingWorldForgeCore.ts`
- `scripts/test_economy_profile.js`
- `scripts/run_all_tests.js`

Create:
- `src/economyFlowCore.ts`
- `scripts/test_economy_flow_core.js`

Edit only to register the focused unit test:
- `scripts/run_all_tests.js`

If implementation requires other production files, stop and report why. Do not expand scope.

Implement a pure function:

    computeEconomyFlowTick(input: EconomyFlowTickInput): EconomyFlowTickResult

Use the Slice-001 model and algorithm defined in
`docs/ECONOMY_LOGISTICS_ARCHITECTURE.md`.

Required behavior:
- arbitrary existing commodity ids are supported;
- aggregate production by node and commodity;
- allocate same-tick production over valid direct routes by route-capacity ratio;
- never export existing market stock;
- fulfill demand only at uniquely market-backed nodes;
- return stable route summaries, node summaries, market stock deltas, and diagnostics;
- never mutate inputs;
- never modify stock or priceIndex directly;
- return no NaN, Infinity, negative flow, or negative resulting stock;
- clamp baseRisk to [0, 1], but do not let risk reduce volume;
- use stable id ordering independent of input array order;
- use no filesystem, VS Code API, time, randomness, persistence, or LLM calls.

Do not implement:
- economyProfile multipliers on explicit production;
- site potential;
- facility condition;
- processing;
- multi-hop routes;
- intermediate inventory;
- route disruption;
- NPC or player actions;
- forge parsing;
- WorldState changes;
- host or UI wiring;
- price logic;
- stock caps.

Focused tests must cover:
- a custom commodity such as `sakuradite`;
- one source to one market;
- capacity-proportional split across two routes;
- production and route-capacity bounds;
- insertion-order independence;
- demand fulfillment and unmet demand;
- no negative resulting stock;
- local retained production;
- unshipped non-market production;
- risk metadata without flow impact;
- invalid references and invalid numbers;
- deep input immutability;
- unchanged priceIndex;
- stable output ordering.

Verification limit:

    npm run compile
    node scripts/test_economy_flow_core.js

Run each at most once unless code changes after a concrete failure.

Do not run:
- `npm test`
- unit/simulation suites
- NOAI soak commands
- full-suite or release verification

Do not add dependencies, create a branch, bump version, update CHANGELOG, or create
walkthrough.md.

The worktree may contain unrelated user changes. Preserve them exactly.
Stop before commit and push.

Report:
- changed files;
- implementation summary;
- commands run;
- compile result;
- focused-test result;
- remaining issues or assumptions;
- confirmation that no commit or push was performed.
```
