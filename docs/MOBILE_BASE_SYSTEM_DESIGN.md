# Mobile Base System Design - Moving Settlements

Status: design + gate-ready contract. No implementation in this document.

Track: optional extension of Vehicle System + Settlement Mode, default OFF.

This document defines LoreRelay's support for **moving bases**:

- Space Haven-like ships;
- giant tank / landship party homes;
- trade caravans;
- armored trains;
- fantasy mobile golems;
- airships;
- nomad camps;
- post-apocalyptic convoy bases.

The internal term is **Mobile Base**. A caravan is treated as a related but
slightly different subtype: **Mobile Community**. It is not one vehicle; it is a
moving party/social unit that may contain vehicles, mounts, guards, traders,
pilgrims, refugees, hirelings, and followers.

This is not a separate game engine. It is a bridge between:

- `vehicle_state.json` - movement, access, fuel, durability, cargo;
- `settlement_state.json` - residents, facilities, stocks, incidents, projects;
- `settlement_layout.json` - optional internal rooms/decks/zones;
- Campaign Kit - travel, expeditions, discoveries, return loop;
- Settlement Mode views - Canvas/isometric/diorama projections.

This document does not authorize copying code, schemas, data, names, maps,
ship layouts, vehicle designs, combat systems, prose, or art from Space Haven,
Fuga: Melodies of Steel, Metal Max, Kenshi, Dwarf Fortress, Cataclysm: Dark
Days Ahead, RimWorld, Caves of Qud, Star Wars, or any other reference. Use only
high-level design patterns.

## 0. Goal

Mobile Base System lets a campaign treat the party's home as something that
moves.

Core rule:

> A mobile base is a vehicle that owns or links to a settlement ledger.

It should support stories like:

- the party lives inside an armored crawler;
- a trade caravan moves from town to town;
- a ship has cabins, cargo hold, infirmary, engine room, and bridge;
- a carrier ship stores mechs, launch boats, shuttles, or scout cars;
- a giant golem carries a workshop and shrine on its back;
- an airship can dock only at towers or open fields;
- the base is powerful but too large to enter dungeons, alleys, caves, or
  sacred interiors.

It should not become:

- a full colony sim;
- a real-time spaceship sim;
- a tactical vehicle combat game;
- a crew job scheduler;
- a freeform room construction editor;
- a full interior pathfinding engine.

## 1. Mental Model

Vehicle System answers:

```text
Can it move? How big is it? What can it carry? Can it enter this place?
```

Settlement Mode answers:

```text
Who lives here? What facilities exist? What resources and incidents exist?
```

Caravan / Mobile Community answers:

```text
Who is traveling with us? Why are they attached to this route? What risk,
trade, rumor, or trouble do they bring?
```

Mobile Base connects them:

```text
This vehicle is also a home/base with facilities, residents, rooms, stocks,
and incidents.
```

Recommended layering:

```text
vehicle_state.json
  VehicleEntry(kind: mobile_base / ship / wagon / mech / golem)
  -> movement, access, fuel, durability, cargo, parking/docking

settlement_state.json
  SettlementState(kind: mobile_base / caravan_camp / ship / airship / crawler)
  -> residents, facilities, stocks, incidents, projects

settlement_layout.json
  optional internal deck/room/zone layout
  -> Canvas/isometric/diorama view
```

The canonical state remains JSON ledgers. Renderers remain replaceable views.

## 1.1 Caravan Is Not Just A Vehicle

A caravan should not be modeled as one big vehicle.

Recommended model:

```text
Caravan / Mobile Community
  -> settlement_state-like social ledger
  -> member groups, followers, guests, guards, merchants, animals
  -> optional vehicle_state fleet links
  -> optional mobile camp layout
```

Vehicle examples inside a caravan:

- lead wagon;
- cargo cart;
- riding beasts;
- scout bike;
- water wagon;
- escort mech;
- supply truck.

People/groups inside a caravan:

- party members;
- hired guards;
- merchants;
- pilgrims;
- refugees;
- traveling artisans;
- faction envoys;
- suspicious strangers;
- temporary followers.

The gameplay hook:

> A caravan is a route with people attached to it.

That makes it different from a tank, ship, or mech. The interesting part is not
only movement capacity; it is the social wake the journey creates.

### Travel Announcement / Joiners

Caravans can support a future "travel announcement" mechanic:

```ts
type CaravanTravelNotice = {
  id: string;
  fromLocationId: string;
  toLocationId: string;
  departureTurn?: number;
  routeTags?: string[];
  riskBand: 'safe' | 'normal' | 'dangerous' | 'desperate';
  reputation?: number;
  capacityHint?: 'few' | 'some' | 'many';
};

type CaravanJoinerCandidate = {
  id: string;
  kind: 'merchant' | 'guard' | 'pilgrim' | 'refugee' | 'traveler' | 'artisan' | 'passenger' | 'shipper' | 'spy' | 'other';
  label: string;
  motive: string;
  benefit?: string;
  risk?: string;
  untilLocationId?: string;
  headcount?: number;
};
```

Future behavior:

- announcing a route may attract joiner candidates;
- safer/reputable caravans attract merchants and pilgrims;
- dangerous/desperate routes attract guards, smugglers, spies, or refugees;
- accepting joiners can add trade, rumors, quests, protection, consumption, or
  incidents;
- named NPCs can be represented individually;
- minor followers can be represented as mob headcounts, not full NPC records;
- this should be deterministic and capped, not open-ended NPC generation.

MB1 should not implement this. It belongs to a later Caravan/Travel gate.

### Transport Contracts / Passenger Requests

Transport-capable mobile communities can receive requests while staying at a
settlement, port, dock, station, or roadside hub.

Examples:

- carry medicine to the next town;
- transport grain, scrap, ore, letters, relics, livestock, or fuel;
- escort refugees to a safer settlement;
- take paying passengers to the next port;
- move a faction envoy discreetly;
- ship fragile cargo that creates an incident if damaged;
- carry suspicious cargo that may trigger inspection or ambush.

Recommended contract shape:

```ts
type TransportContract = {
  id: string;
  kind: TransportContractKind;
  fromLocationId: string;
  toLocationId: string;
  requesterId?: string;
  requesterKind?: 'npc' | 'faction' | 'settlement' | 'mob' | 'unknown';
  cargo?: TransportCargoSpec;
  passengers?: TransportPassengerSpec;
  reward?: TransportRewardSpec;
  riskBand: 'low' | 'normal' | 'high' | 'severe';
  deadlineTurn?: number;
  tags?: string[];
  status: 'offered' | 'accepted' | 'in_transit' | 'delivered' | 'failed' | 'expired';
};

type TransportContractKind =
  | 'cargo'
  | 'passenger'
  | 'escort'
  | 'mail'
  | 'medical'
  | 'livestock'
  | 'faction_envoy'
  | 'smuggling'
  | 'emergency_evacuation'
  | 'other';

type TransportCargoSpec = {
  label: string;
  units: number;
  fragile?: boolean;
  suspicious?: boolean;
  refrigerated?: boolean;
  hazardous?: boolean;
};

type TransportPassengerSpec = {
  namedNpcIds?: string[];
  mobCount?: number;
  category?: 'commoners' | 'pilgrims' | 'refugees' | 'guards' | 'merchants' | 'prisoners' | 'other';
};

type TransportRewardSpec = {
  money?: number;
  goods?: string[];
  factionId?: string;
  reputationDelta?: number;
  favor?: string;
};
```

Rules:

- contracts are not ordinary inventory items;
- accepted contracts may consume abstract capacity;
- named passengers may link to NPC Registry;
- mob passengers should remain headcounts unless promoted by the story;
- risky contracts may add inspection, theft, illness, sabotage, or ambush
  events;
- hidden/smuggling details must not leak to remote/replay/Webview before
  discovery.

This should be a later `transport_contracts.json` or campaign ledger slice, not
part of MB1.

### Autonomous Caravans / NPC Trade Routes

Player-owned caravans are not the only moving communities. The world can have
independent caravans, merchant ships, pilgrim groups, faction supply trains, and
raider convoys.

Recommended future actor shape:

```ts
type MobileRouteActor = {
  id: string;
  kind: 'caravan' | 'merchant_ship' | 'supply_train' | 'pilgrim_group' | 'refugee_column' | 'raider_convoy' | 'faction_patrol' | 'other';
  ownerKind: 'faction' | 'settlement' | 'npc' | 'independent' | 'unknown';
  ownerId?: string;
  route: string[];
  currentLocationId?: string;
  nextLocationId?: string;
  etaTurn?: number;
  visibleToPlayer?: boolean;
  tradeTags?: string[];
  riskBand?: 'low' | 'normal' | 'high' | 'severe';
  status: 'rumored' | 'traveling' | 'stopped' | 'arrived' | 'missing' | 'destroyed';
};
```

Rules:

- autonomous actors belong to Living World / World State, not the player's
  vehicle ledger;
- they should be summarized as rumors/market pressure unless directly met;
- movement should be coarse turn/tick based, not pathfinding;
- they can generate encounters, market changes, escort contracts, rescue
  hooks, or faction incidents;
- hidden routes and cargo should respect Fog of War.

This is a future Living World / Commerce integration, not MB1.

## 2. Data Contract

### 2.1 Vehicle Link

Extend `VehicleEntry` in a future Vehicle System slice:

```ts
type VehicleEntry = {
  // existing Vehicle V1 fields...
  mobileBase?: MobileBaseLink;
};

type MobileBaseLink = {
  settlementId: string;
  mode: MobileBaseMode;
  layoutProfile: MobileBaseLayoutProfile;
  homeLocationId?: string;
  dockedAtLocationId?: string;
  interiorAccess?: MobileBaseInteriorAccess;
};
```

Closed unions:

```ts
type MobileBaseMode =
  | 'crawler'
  | 'landship'
  | 'caravan'
  | 'mobile_community'
  | 'ship'
  | 'airship'
  | 'train'
  | 'spacecraft'
  | 'walking_golem'
  | 'nomad_camp'
  | 'other';

type MobileBaseLayoutProfile =
  | 'compact'
  | 'deck'
  | 'caravan'
  | 'camp'
  | 'crawler'
  | 'train'
  | 'ship'
  | 'airship'
  | 'spacecraft'
  | 'golem';

type MobileBaseInteriorAccess =
  | 'open'
  | 'crew_only'
  | 'party_only'
  | 'locked'
  | 'damaged'
  | 'unsafe';
```

Rules:

- `mobileBase.settlementId` points to a settlement ledger entry/file.
- The vehicle controls movement and access.
- The settlement controls internal life, facilities, incidents, residents, and
  projects.
- Neither side should duplicate the other's state.

### 2.2 Settlement Kind

Future `SettlementKind` may include:

```ts
type SettlementKind =
  | 'mobile_base'
  | 'caravan_camp'
  | 'ship'
  | 'airship'
  | 'crawler'
  | 'train'
  | 'spacecraft'
  | 'walking_golem';
```

If the existing union remains narrower, use `kind: 'other'` plus tags until a
gate approves widening.

### 2.3 Facilities

Mobile bases should use settlement buildings/zones/facilities, not bespoke
room systems in V1.

Recommended facility tags:

```ts
type MobileBaseFacilityKind =
  | 'bridge'
  | 'engine'
  | 'cargo_hold'
  | 'quarters'
  | 'galley'
  | 'infirmary'
  | 'workshop'
  | 'armory'
  | 'sensor'
  | 'hangar'
  | 'stable'
  | 'greenhouse'
  | 'shrine'
  | 'market_stall'
  | 'external_deck'
  | 'damaged_section';
```

Map these onto existing `SettlementZoneType` where possible:

| Mobile facility | Settlement zone fallback |
|---|---|
| bridge | `gate` / `other` |
| engine | `workshop` |
| cargo_hold | `stockpile` |
| quarters | `quarters` |
| galley | `quarters` / `other` |
| infirmary | `clinic` |
| workshop | `workshop` |
| armory | `barracks` |
| hangar/stable | `other` |
| market_stall | `market` |
| shrine | `shrine` |
| damaged_section | `hazard` / `ruins` |

## 3. Access and Docking

Mobile bases must obey both exterior access and interior access.

### 3.1 Exterior Access

Use Vehicle System access:

- `sizeClass`
- `widthClass`
- `terrainTags`
- `accessTags`
- `blockedBy`
- `LocationVehicleAccess`

Examples:

- Giant tank cannot enter a forest shrine; it parks at `outer_gate`.
- Trade ship cannot leave deep water without `dock`.
- Airship needs `landing_zone` or `hangar`.
- Walking golem can cross rough terrain but cannot enter low-ceiling tunnels.

### 3.2 Dock / Park / Anchor / Stable

```ts
type MobileBaseDockingState = {
  mode: 'moving' | 'parked' | 'docked' | 'anchored' | 'stabled' | 'landed' | 'in_orbit' | 'disabled';
  locationId?: string;
  parkingLocationId?: string;
  accessWarning?: string;
};
```

Rules:

- docking state belongs to the vehicle side;
- settlement incidents may reference docking problems, but should not own the
  vehicle location;
- if access is denied, use safe fallback parking/docking location when present.

### 3.3 Interior Access

The party can enter the mobile base interior if:

- vehicle is not lost;
- interior access is not locked/damaged/unsafe, unless story permits;
- the base is nearby, docked, or parked at the party's current location.

V1 should not simulate crew moving room to room.

### 3.4 Hangar / Vehicle Bay

Mobile bases may carry smaller vehicles through the Vehicle System hangar
contract.

Examples:

- battleship -> mechs / landing craft;
- airship -> scout gliders;
- landship -> bikes / armored scout car;
- space carrier -> shuttle / rover;
- caravan -> carts / riding beasts;
- walking golem -> small utility golems.

Rules:

- hangar ownership belongs to `vehicle_state.json`;
- interior facilities may show a hangar/deck/garage zone in
  `settlement_layout.json`;
- launch/recover persistence is not part of MB1;
- carried vehicles must still pass fleet validation;
- a carried vehicle may enter a place the mobile base cannot, if access rules
  allow it;
- prompt summaries should mention only a capped number of carried vehicles.

## 4. Resource Model

Mobile bases combine vehicle resources and settlement stocks.

Vehicle resources:

- fuel;
- feed;
- battery;
- mana;
- reactor;
- durability;
- armor.

Settlement stocks:

- food;
- water;
- parts;
- medicine;
- ammo;
- trade goods;
- morale/security abstractions.

Boundary rule:

> Movement consumes vehicle resources. Living aboard consumes settlement stocks.

Avoid automatic dual-write in early phases. If a travel tick consumes both
fuel and food, it should be a later apply-gated operation.

## 5. Prompt Boundary

Prompt chunk should be compact:

```text
[Mobile Base]
Base: The Ashcrawler (huge landship), parked at Outer Gate.
Access: cannot enter narrow streets, shrines, tunnels, stairs.
Interior: bridge, engine room damaged, cargo hold, quarters, infirmary.
Hangar: carries 2/4 vehicles: scout bike, utility golem.
Stocks: food low, parts 6, medicine 1.
Vehicle: HP 64/90, armor heavy, fuel low, combat heavy.
Current concern: engine room repairs stalled; raiders may notice its smoke trail.
```

Rules:

- include at most one active mobile base in prompt;
- include only top 3 facilities/problems;
- include only a capped number of carried vehicle names;
- no full room list when not relevant;
- no raw layout/tile grid;
- no full cargo dump;
- no hidden rooms unless already exposed by settlement view;
- if token budget is tight, vehicle access warning beats flavor.

## 6. Turn Ops Boundary

Do not add persistence in the first design slice.

Future ops may split into:

```ts
type MobileBaseOp =
  | { type: 'link_vehicle_settlement'; vehicleId: string; settlementId: string }
  | { type: 'dock_mobile_base'; vehicleId: string; locationId: string; parkingLocationId?: string }
  | { type: 'undock_mobile_base'; vehicleId: string }
  | { type: 'set_mobile_base_mode'; vehicleId: string; mode: MobileBaseMode }
  | { type: 'mark_facility_damaged'; settlementId: string; facilityId: string; reason?: string }
  | { type: 'repair_facility'; settlementId: string; facilityId: string; progressDelta: number };
```

Gate rule:

- vehicle movement/docking should write only `vehicle_state.json`;
- facility/stock/project changes should write only `settlement_state.json`;
- any operation that touches both ledgers needs a cross-ledger apply gate.

## 7. View Strategy

### 7.1 Settlement View Reuse

Mobile base interiors should reuse Settlement Mode snapshots:

- deck layout;
- train cars;
- crawler rooms;
- caravan wagons as zones;
- ship compartments;
- golem back-platform zones.

Do not create a new renderer for V1.

### 7.2 Canvas / Diorama

Existing Settlement Mode views can display mobile bases:

- M3 Canvas: deck/room layer;
- M5 Diorama: low-poly model of internal zones.

Initial renderer should be read-only.

### 7.3 World Map

World map can show the mobile base as a marker:

- parked;
- docked;
- moving;
- disabled;
- caravan route.

This belongs to future map overlay integration, not V1.

## 8. Feature Flags

Recommended flags:

```json
{
  "enableVehicleSystem": false,
  "enableMobileBaseSystem": false
}
```

Rules:

- `enableMobileBaseSystem` requires `enableVehicleSystem`;
- if Settlement Mode integration is used, it also requires
  `enableSettlementMode`;
- default OFF;
- no prompt chunk while OFF;
- no ops apply while OFF.

## 9. Implementation Phases

### MB1 - Pure Link Contract

Goal:

- define `MobileBaseLink`;
- validate a vehicle-to-settlement link;
- summarize a mobile base from already-parsed vehicle + settlement data;
- no file I/O;
- no ops;
- no Webview.

Files:

- `src/mobileBaseCore.ts`
- `scripts/test_mobile_base_core.js`

Core functions:

```ts
parseMobileBaseLink(input: unknown): MobileBaseLink | undefined;
validateMobileBaseLink(vehicleState, settlementState): MobileBaseLinkResult;
buildMobileBasePromptLines(vehicle, settlement, options?): string[];
```

### MB2 - Optional I/O / Prompt Injection Gate

After Vehicle V1 and MB1 pass:

- decide how to read vehicle + settlement together;
- decide prompt budget;
- decide feature flags;
- decide missing-ledger behavior.

### MB3 - Docking / Travel Apply Gate

Approve narrow persistence only:

- dock/undock;
- move parked base;
- consume vehicle fuel only.

Do not approve stock consumption + fuel consumption together until
cross-ledger failure policy is explicit.

### MB4 - Read-only UI

Read-only panel:

- active mobile base card;
- location/docking state;
- access warning;
- rooms/facilities;
- stocks;
- crew/passengers;
- condition/fuel.

No direct writes.

### MB5 - Mobile Base View Mode

Reuse Settlement Mode:

- Canvas deck view;
- diorama if enabled;
- no new canonical state.

## 10. Tests

MB1 required tests:

- invalid link returns undefined or safe result;
- vehicle without mobileBase is not a mobile base;
- link fails if settlementId mismatches/missing;
- link succeeds for valid vehicle + settlement;
- prompt lines are bounded;
- prompt includes access warning when oversized/restricted;
- prompt includes only capped facility/problem lines;
- no raw layout/tile grid leaks;
- input objects are not mutated;
- mobile base mode/layout profile closed unions normalize safely.

## 11. Non-Goals

- No crew job scheduler.
- No full ship/base simulator.
- No real-time travel.
- No tactical vehicle combat.
- No full interior pathfinding.
- No room construction editor.
- No direct Webview writes.
- No cross-ledger writes without a later gate.
- No new renderer in MB1.
- No copying from reference games.

## 12. AI Division

Recommended order:

1. **Codex/ChatGPT**: gate this design and approve MB1 pure link core only.
2. **Grok/Codex**: implement `mobileBaseCore.ts` + tests.
3. **Codex/ChatGPT**: review MB1 implementation.
4. **Grok/Codex**: V2 I/O/prompt injection only after gate.
5. **Claude**: read-only UI after the core contracts pass.
6. **Gemini**: scenario examples and README wording.

Key instruction:

> A mobile base is a vehicle with a settlement ledger attached. It is not a
> second colony sim.
