# Vehicle System Design - Mobile Assets / Conveyances

Status: design + gate-ready contract. No implementation in this document.

Track: optional system, default OFF.

This document defines LoreRelay's common rules for vehicles, mounts, ships,
war machines, mobile bases, and fantasy equivalents such as walking golems.

The user-facing word can be "vehicles" or "乗り物". The internal design term is
**Mobile Asset** because the same rules should cover:

- post-apocalyptic cars, bikes, tanks, and armored trucks;
- Metal Max-like combat vehicles;
- fantasy wagons, horses, boats, airships, and mobile golems;
- sci-fi rovers, mechs, shuttles, and cargo craft;
- trade ships, caravan wagons, and faction-owned transports.

This document does not authorize copying code, schemas, vehicle names, data,
art, prose, or combat rules from Metal Max, Kenshi, Dwarf Fortress, Cataclysm:
Dark Days Ahead, Caves of Qud, RimWorld, Star Wars, or any other reference.
Use only high-level design patterns.

## 0. Goal

Vehicle System adds a durable, portable asset ledger that can affect travel,
cargo, trade, combat posture, access restrictions, and settlement docking.

Core rule:

> Vehicles are strategic story assets, not a real-time driving simulator.

The system should answer:

- Who owns this vehicle?
- Where is it parked, docked, anchored, stabled, or deployed?
- How many people can it carry?
- How much cargo can it hold?
- Can it carry or deploy smaller vehicles, robots, boats, shuttles, or mounts?
- What terrain or routes can it use?
- What places can it enter, and where must it be left outside?
- How much protection, firepower, mobility, and fuel/range does it provide?
- What modules or upgrades does it have?

The system should not answer with physics-level detail:

- exact wheel traction;
- projectile ballistics;
- real-time pathfinding;
- per-tile vehicle movement;
- full interior 3D maps;
- full vehicle crafting simulation.

## 1. Canonical Files

### 1.1 `vehicle_state.json` v1

Recommended independent ledger:

```ts
type VehicleState = {
  version: 1;
  vehicles: VehicleEntry[];
  activeVehicleId?: string;
  updatedTurn?: number;
  warnings?: string[];
};
```

Reasoning:

- do not embed vehicles directly in `game_state.json`;
- do not embed vehicles in `world_state.json`;
- do not overload `settlement_state.json`;
- keep vehicle writes narrow and auditable, similar to campaign resources and
  settlement ledgers.

### 1.2 `VehicleEntry`

```ts
type VehicleEntry = {
  id: string;
  name: string;
  kind: VehicleKind;
  owner: VehicleOwner;
  status: VehicleStatus;

  locationId?: string;
  parkedAt?: VehicleParking;

  capacity: VehicleCapacity;
  access: VehicleAccessProfile;
  mobility: VehicleMobility;
  durability: VehicleDurability;
  combat?: VehicleCombatProfile;
  resources?: VehicleResources;
  modules?: VehicleModule[];
  hangar?: VehicleHangarProfile;
  carriedByVehicleId?: string;
  cargo?: VehicleCargoItem[];
  crew?: VehicleCrewAssignment[];
  notes?: VehicleNote[];
  tags?: string[];
};
```

Closed unions should be used wherever possible.

```ts
type VehicleKind =
  | 'beast'
  | 'wagon'
  | 'cart'
  | 'car'
  | 'bike'
  | 'truck'
  | 'armored_vehicle'
  | 'mech'
  | 'golem'
  | 'boat'
  | 'ship'
  | 'airship'
  | 'shuttle'
  | 'mobile_base'
  | 'other';

type VehicleStatus =
  | 'available'
  | 'parked'
  | 'docked'
  | 'stabled'
  | 'deployed'
  | 'damaged'
  | 'disabled'
  | 'lost';

type VehicleOwner = {
  type: 'player' | 'party' | 'npc' | 'faction' | 'settlement' | 'unknown';
  id?: string;
};
```

## 2. Common Rule Model

### 2.1 Capacity

```ts
type VehicleCapacity = {
  crewRequired: number;
  crewCapacity: number;
  passengerCapacity: number;
  cargoCapacity: number;
  currentCargoLoad?: number;
};
```

Rules:

- all values are clamped small integers;
- `crewRequired` can be `0` for beasts, autopilots, magic golems, or simple
  carts;
- `passengerCapacity` excludes required crew unless explicitly documented
  otherwise;
- cargo units are abstract; they are not kilograms unless a scenario pack says
  so.

### 2.2 Mobility and Range

```ts
type VehicleMobility = {
  speedBand: 'slow' | 'normal' | 'fast' | 'very_fast';
  rangeBand: 'local' | 'regional' | 'long' | 'very_long';
  terrainTags: VehicleTerrainTag[];
  routeTags?: VehicleRouteTag[];
};

type VehicleTerrainTag =
  | 'road'
  | 'offroad'
  | 'rail'
  | 'water'
  | 'deep_water'
  | 'air'
  | 'space'
  | 'underground'
  | 'urban'
  | 'wilderness'
  | 'mountain'
  | 'swamp'
  | 'desert'
  | 'snow'
  | 'lava'
  | 'magical';

type VehicleRouteTag =
  | 'road_required'
  | 'dock_required'
  | 'stable_required'
  | 'hangar_required'
  | 'landing_zone_required'
  | 'rail_required'
  | 'deep_channel_required'
  | 'wide_gate_required';
```

### 2.3 Fuel / Feed / Power

```ts
type VehicleResources = {
  powerType: 'none' | 'fuel' | 'feed' | 'battery' | 'mana' | 'steam' | 'wind' | 'crew' | 'reactor';
  current?: number;
  max?: number;
  consumptionBand?: 'low' | 'normal' | 'high';
};
```

Rules:

- if `powerType` is `none`, ignore current/max;
- resource values are abstract and capped;
- exact fuel economy is not simulated in V1;
- GM may narrate scarcity, but persistence requires future `vehicleOps`.

### 2.4 Durability

```ts
type VehicleDurability = {
  hp: number;
  maxHp: number;
  armorBand: 'none' | 'light' | 'medium' | 'heavy' | 'fortified';
  condition: 'pristine' | 'worn' | 'damaged' | 'critical' | 'disabled';
};
```

### 2.5 Combat Profile

```ts
type VehicleCombatProfile = {
  combatPower: number;
  defensePower: number;
  threatBand: 'none' | 'light' | 'armed' | 'heavy' | 'siege';
  roles?: VehicleCombatRole[];
};

type VehicleCombatRole =
  | 'transport'
  | 'scout'
  | 'cargo'
  | 'escort'
  | 'artillery'
  | 'siege'
  | 'anti_beast'
  | 'anti_vehicle'
  | 'support'
  | 'mobile_base';
```

Rules:

- combat values are abstract modifiers for GM/context and future deterministic
  checks;
- no tactical combat grid in V1;
- no ballistic simulation;
- no per-weapon ammo accounting unless a scenario pack adds it later.

### 2.6 Modules

```ts
type VehicleModule = {
  id: string;
  slot: VehicleModuleSlot;
  name: string;
  condition?: 'ok' | 'worn' | 'damaged' | 'disabled';
  effects?: string[];
  tags?: string[];
};

type VehicleModuleSlot =
  | 'engine'
  | 'weapon'
  | 'armor'
  | 'cargo'
  | 'sensor'
  | 'utility'
  | 'comfort'
  | 'navigation'
  | 'life_support'
  | 'magic_core'
  | 'other';
```

V1 may parse modules but should not implement full installation/removal
persistence unless a later gate approves `vehicleOps.install_module`.

### 2.7 Fleet and Carrier / Hangar Rules

The player or a faction may own multiple vehicles. A vehicle may also carry
smaller vehicles.

Examples:

- a battleship carries mechs;
- an aircraft carrier carries planes or shuttles;
- a trade ship carries rowboats;
- a mobile base carries bikes and scout cars;
- a caravan includes several wagons and riding animals;
- a fantasy walking fortress carries small golems.

V1 supports the **data shape** and safe prompt summary only. It does not
implement launch/recover persistence.

```ts
type VehicleHangarProfile = {
  bayCapacity: number;
  usedBays?: number;
  maxCarriedSize: VehicleSizeClass;
  allowedKinds?: VehicleKind[];
  launchTags?: VehicleLaunchTag[];
  carriedVehicleIds?: string[];
};

type VehicleLaunchTag =
  | 'ground_ramp'
  | 'dock_crane'
  | 'flight_deck'
  | 'hangar_bay'
  | 'submersible_bay'
  | 'mech_catapult'
  | 'magic_circle'
  | 'external_mount';
```

Rules:

- `VehicleState.vehicles[]` is a fleet, not a single active vehicle.
- `activeVehicleId` is only the current focus/default travel vehicle.
- `hangar.carriedVehicleIds[]` references other `VehicleEntry.id` values.
- child vehicles may set `carriedByVehicleId`.
- no cycles are allowed: a vehicle cannot carry itself, directly or indirectly.
- carried vehicles do not count as physically present at the public location
  unless launched/deployed by a future op.
- carried vehicles still exist as ledger entries and can be damaged/lost by
  story events.
- a carrier can be too large to enter a location while a carried scout vehicle
  can enter.

Prompt examples:

```text
Fleet: 5 vehicles owned by the party. Active: Ashcrawler.
Carrier: Iron Gull carries 2/6 vehicles: scout mech, launch boat.
Access: battleship remains offshore; launch boat can reach the river dock.
```

V1 prompt lines should cap carried vehicle names. Do not dump the full fleet
unless specifically requested.

## 3. Size and Access Rules

Vehicles must have access restrictions. This is the key gameplay rule that
prevents "the tank goes everywhere" from flattening the adventure.

### 3.1 Vehicle Access Profile

```ts
type VehicleAccessProfile = {
  sizeClass: VehicleSizeClass;
  widthClass?: VehicleWidthClass;
  accessTags: VehicleAccessTag[];
  blockedBy?: VehicleAccessBlocker[];
};

type VehicleSizeClass =
  | 'tiny'
  | 'small'
  | 'medium'
  | 'large'
  | 'huge'
  | 'colossal';

type VehicleWidthClass =
  | 'narrow'
  | 'standard'
  | 'wide'
  | 'oversized';

type VehicleAccessTag =
  | 'indoor'
  | 'road'
  | 'offroad'
  | 'narrow_path'
  | 'wide_gate'
  | 'dock'
  | 'harbor'
  | 'stable'
  | 'hangar'
  | 'landing_zone'
  | 'open_field'
  | 'dungeon_entry'
  | 'tunnel'
  | 'stairs'
  | 'bridge'
  | 'shallow_water'
  | 'deep_water'
  | 'airspace'
  | 'spaceport';

type VehicleAccessBlocker =
  | 'stairs'
  | 'ladder'
  | 'narrow_door'
  | 'narrow_tunnel'
  | 'low_ceiling'
  | 'weak_bridge'
  | 'deep_mud'
  | 'dense_forest'
  | 'urban_crowd'
  | 'sacred_no_vehicle'
  | 'anti_vehicle_barrier'
  | 'no_docking'
  | 'no_landing';
```

### 3.2 Location Access Profile

Location/region/scenario packs may expose a compact access profile:

```ts
type LocationVehicleAccess = {
  allowedVehicleSizeMax?: VehicleSizeClass;
  requiredAccessTags?: VehicleAccessTag[];
  blockedVehicleTags?: VehicleAccessBlocker[];
  parkingLocationId?: string;
  notes?: string;
};
```

Rules:

- if a vehicle is too large, it must remain at `parkingLocationId` or the
  nearest safe external location;
- if no parking location exists, return a safe denial reason;
- access checks must be deterministic and pure;
- access denial should produce a GM-friendly reason, not just `false`.

### 3.3 Access Result

```ts
type VehicleAccessResult = {
  allowed: boolean;
  reason: VehicleAccessReason;
  parkingLocationId?: string;
  warnings?: string[];
};

type VehicleAccessReason =
  | 'ok'
  | 'vehicle_too_large'
  | 'missing_required_access'
  | 'blocked_by_location'
  | 'wrong_terrain'
  | 'no_parking'
  | 'vehicle_disabled'
  | 'unknown_location';
```

Example:

```json
{
  "allowed": false,
  "reason": "vehicle_too_large",
  "parkingLocationId": "outer_gate",
  "warnings": ["The armored truck must stay outside the bunker entrance."]
}
```

## 4. Prompt Boundary

Vehicles may be summarized for the GM, but the prompt chunk must be compact.

Recommended GM prompt lines:

```text
Vehicle: Rust Wagon (large truck) - parked at Outer Gate.
Capacity: crew 1/2, passengers 4, cargo 18/30.
Condition: worn, HP 42/60, armor medium, fuel low.
Access: cannot enter narrow tunnels, stairs, indoor ruins; nearest parking: Outer Gate.
Modules: cargo rack, spotlight, light turret.
```

Rules:

- include active vehicle and nearby vehicles only;
- cap to 3 vehicles in prompt;
- do not dump cargo lists unless relevant;
- do not include hidden faction vehicle data;
- use qualitative bands for combat/condition if token budget is tight.

## 5. Turn Ops Boundary

Future `turn_result.vehicleOps` should be the only persistent mutation channel.

Initial parser contract:

```ts
type VehicleOp =
  | { type: 'set_active_vehicle'; vehicleId: string }
  | { type: 'move_vehicle'; vehicleId: string; locationId: string; parkingLocationId?: string }
  | { type: 'damage_vehicle'; vehicleId: string; amount: number; reason?: string }
  | { type: 'repair_vehicle'; vehicleId: string; amount: number; resourceCost?: number; reason?: string }
  | { type: 'refuel_vehicle'; vehicleId: string; amount: number; resourceType?: string }
  | { type: 'load_cargo'; vehicleId: string; itemId: string; amount: number }
  | { type: 'unload_cargo'; vehicleId: string; itemId: string; amount: number }
  | { type: 'install_module'; vehicleId: string; module: VehicleModule }
  | { type: 'remove_module'; vehicleId: string; moduleId: string };
```

V1 should parse only if the gate approves. Persistence should wait for a
separate apply gate.

Recommended first persistence slice:

1. `set_active_vehicle`
2. `move_vehicle`
3. `damage_vehicle`
4. `repair_vehicle`
5. `refuel_vehicle`

Cargo, module, launch/recover, and carrier bay operations are more complex and
should be a later slice.

Future carrier ops may include:

```ts
type VehicleCarrierOp =
  | { type: 'launch_vehicle'; carrierId: string; vehicleId: string; locationId?: string }
  | { type: 'recover_vehicle'; carrierId: string; vehicleId: string }
  | { type: 'assign_vehicle_to_carrier'; carrierId: string; vehicleId: string }
  | { type: 'remove_vehicle_from_carrier'; carrierId: string; vehicleId: string };
```

These require a separate apply gate because they touch two vehicle entries and
must prevent cycles, duplicate containment, and impossible size/kind matches.

## 6. Integration Points

### Campaign Kit

Vehicles can:

- modify travel risk;
- unlock route types;
- carry discoveries or cargo;
- define expedition return stakes;
- create salvage/repair quests.

### Settlement Mode

Vehicles can:

- park at gates, yards, docks, stables, hangars;
- appear as settlement markers;
- require fuel/feed/parts from settlement stocks;
- attract merchants, raiders, or faction attention;
- become mobile workshops or mobile bases.

### Commerce

Vehicles can:

- increase cargo capacity;
- reduce trade route cost;
- require maintenance supplies;
- enable caravan/ship trade loops.

### World / Map

Vehicles can:

- be shown as map overlay markers;
- change route availability;
- fail access checks against location constraints;
- remain outside dungeons while the party enters on foot.

### In-World Chat / Parlor

Vehicles can be conversation context:

- "We're talking inside the parked truck."
- "The golem waits outside the shrine."
- "The trading boat is moored below the market."

Parlor and In-World Chat should not mutate vehicle state unless future
`vehicleOps` apply is explicitly enabled.

## 7. Feature Flags

Recommended `game_rules.json` flag:

```json
{
  "enableVehicleSystem": false
}
```

Rules:

- default OFF;
- when OFF, do not inject vehicle prompt chunks;
- when OFF, do not apply vehicle ops;
- Webview may hide vehicle panels when OFF;
- existing campaigns must behave unchanged.

## 8. Implementation Phases

### V1 - Pure Core / Ledger Contract

Goal: establish safe parsing, caps, prompt summary, and access checks.

Files:

- `src/vehicleCore.ts`
- `src/vehiclePromptCore.ts`
- `scripts/test_vehicle_core.js`

Scope:

- parse/sanitize `vehicle_state.json`;
- cap vehicles, modules, cargo, notes;
- validate IDs;
- clamp numeric values;
- pure `canVehicleAccessLocation()`;
- pure `buildVehiclePromptLines()`;
- no disk write;
- no Webview;
- no `vehicleOps` persistence.

### V2 - State I/O and Optional Prompt Injection

Files:

- `src/vehicleState.ts`
- `src/gmPromptBuilder.ts` wiring

Scope:

- read optional `vehicle_state.json`;
- inject compact prompt chunk only when `enableVehicleSystem` is true;
- no mutation.

### V3 - Vehicle Ops Apply Gate

Before persistence, run a ChatGPT/Codex gate.

Allowed first ops should be narrow:

- active vehicle;
- movement/parking;
- damage/repair/refuel.

Cargo/module persistence should wait unless specifically approved.

### V4 - Webview Garage / Dock / Stable Panel

Read-only first:

- list vehicles;
- active vehicle card;
- access warnings;
- cargo/passenger bars;
- modules;
- condition/fuel.

No direct disk writes from Webview.

### V5 - Trade / Settlement / Map Integration

After core is stable:

- map overlay marker;
- settlement parking marker;
- trade route modifiers;
- "cannot enter" GM helper text;
- repair/refuel service hooks.

## 9. Tests

V1 required tests:

- empty/missing state parses to empty ledger;
- invalid IDs are rejected or normalized;
- arrays are capped deterministically;
- numbers are clamped;
- closed unions normalize to safe defaults;
- capacity cannot be negative;
- current cargo cannot exceed cargo capacity after sanitize;
- access check allows suitable vehicle/location;
- access check rejects too-large vehicle with parking fallback;
- access check rejects wrong terrain;
- disabled vehicle cannot move/enter;
- carrier hangar references are capped;
- carried vehicle relationships reject self-carry/cycles;
- carried vehicle size cannot exceed carrier `maxCarriedSize`;
- prompt summary caps vehicle count and cargo details;
- prompt summary caps fleet/carried vehicle names;
- prompt summary includes access restriction line for active vehicle;
- input is not mutated.

## 10. Non-Goals

- No real-time driving.
- No pathfinding.
- No tactical vehicle grid combat.
- No full physics.
- No ballistic simulation.
- No full vehicle crafting.
- No full interior map.
- No direct Webview writes.
- No vehicle prompt injection while feature flag is OFF.
- No copying of any reference game's schema or content.

## 11. AI Division

Recommended order:

1. **Codex/ChatGPT**: gate this design and approve V1 pure core only.
2. **Grok/Codex**: implement `vehicleCore.ts` + tests.
3. **Codex/ChatGPT**: review V1 implementation.
4. **Grok/Codex**: add optional I/O and prompt injection after V1 passes.
5. **Claude**: design/read-only Webview panel after V1/V2 are stable.
6. **Gemini**: README wording and scenario examples.

Key instruction for all agents:

> Vehicles are durable campaign assets with access limits. They are not a
> second movement engine.
