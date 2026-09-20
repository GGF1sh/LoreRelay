# BIOME-MAP-SUBSTRATE-001 — Biome / Terrain / Hydrology / Map Substrate Design Gate

> Task ID: BIOME-MAP-SUBSTRATE-001
> Status: Design gate complete — implementation not started
> Base: `fdca78ecfc1d7735f31833e5d462fc8ad3278a3d` (main, version 1.84.30)
> Branch: `docs/BIOME-MAP-SUBSTRATE-001-GATE`
> Date: 2026-07-31 JST
> Scope: design document only. No enum changes, no schema implementation, no map UI, no tests run.
> Verdict: **BIOME_MAP_SUBSTRATE_001_READY_TO_IMPLEMENT** (Slice 1 only — see [Go / No-Go Decision](#go--no-go-decision))
> Board: track state in [AI Review Backlog](../AI_REVIEW_BACKLOG.md); this record is not a lane state.

---

## Problem

The user wants rivers, bridges, genre-shaped biome mixes, and worlds where the terrestrial
assumptions do not hold at all (orbital colonies, habitats). The naive move — adding
`river`, `farmland`, `industrial`, `suburb`, `hills` to `RegionBiome` — makes an existing
taxonomy problem worse and still does not express a river, because a river is not a
property of one region.

Three separate things are missing, and they are not the same size:

1. **A stated map authority.** The repository already has a region graph, a deterministic
   layout projection, and a tile projection, but no document says which one is canonical.
   Without that statement, the next feature invents a parallel truth.
2. **Concept separation inside the region taxonomy.** `RegionType` and `RegionBiome`
   currently mix ecology, landform, habitation, integrity and site type in two overlapping
   enums, and authored fixture data is already being silently coerced because of it.
3. **Linear / cross-region geography.** Nothing in the schema can express a feature that
   spans regions (a river), and nothing can carry an attribute on a connection between two
   regions (a bridge, ford, ferry, or a blocked crossing).

What is **not** missing, and must not be rebuilt by this lane:

- Deterministic world generation from a seed — `worldForgeGeneratorCore.makePrng(seed)`.
- Genre-keyed generation tables — `GENERATED_BIOME_OVERRIDES`, `HAZARD_RULES_BY_THEME`.
- Genre-keyed map reskins — `resolveOvermapThemeKey` (9 theme keys).
- Progressive world reveal — `fogOfWarCore` (`discovered` / `rumored` / `unknown`).
- A tile map — `tileOvermapCore` (64×64, derived, unpersisted).

The user-facing asks that arrived with this lane ("re-roll the world button", "don't show
the map during setup, 7DtD-style") are therefore **wiring on top of systems that already
exist**, not substrate work. They are routed out of this gate in
[Out of Scope](#out-of-scope) with the seams named.

---

## Goals

Ordered. Later goals must not be paid for in Slice 1.

1. Write down the canonical map authority so no parallel map truth is created.
2. Stop the region taxonomy from degrading further (containment before cleanup).
3. Make a river expressible as a first-class cross-region fact.
4. Make a crossing (bridge / ford / ferry / blocked) expressible as travel metadata that
   references that river, without becoming the river's authority.
5. Make "this world has no water at all" representable as a **declared capability**, not as
   an absent field.
6. Ground AI narration in canonical geography rather than letting the GM invent it.
7. Keep future travel cost, settlement placement, encounter context and resource/climate
   work unblocked — without implementing any of them here.

Explicit non-goal: a pretty rendered world map. The existing tile overmap and cartography
layout are sufficient for this lane, and neither is extended in Slice 1.

---

## Existing Map Authority

Verified against `fdca78e`. This section is the answer to "which one is the truth", and it
is a description of what already exists, not a proposal.

| Artifact | File | Persisted? | Role |
| --- | --- | --- | --- |
| `WorldForge.geography.regions[]` / `locations[]` | `src/worldForgeCore.ts:20-47` | Yes (`world_forge.json`) | **Canonical geography** |
| Region adjacency `Region.connectedTo: string[]` | `src/worldForgeCore.ts:27` | Yes | **Canonical topology** |
| `CartographyLayoutSpec` (x / y / radius / edges, 1000×1000 space) | `src/cartographyLayoutCore.ts:13-37` | No | Deterministic projection |
| `TileOvermap` (64×64 glyph grid) | `src/tileOvermapCore.ts:45-55` | No | Deterministic projection of the projection |
| Fog visibility (`discovered` / `rumored` / `unknown`) | `src/fogOfWarCore.ts:14` | Partly (rumored is derived) | View filter over the graph |

Two facts settle the canonical-representation question without needing a new decision:

- `buildTileOvermap()` is documented and implemented as a pure function of
  `(worldSeed, region layout)`, memoized on forge content, and explicitly *"nothing here is
  persisted to game_state.json and nothing is ever injected into GM prompts"*
  (`src/tileOvermapCore.ts:5-14`, `:206-224`).
- The layout it consumes is itself derived from `WorldForge` via
  `buildCartographyLayoutSpec(forge)` (`src/tileOvermapCore.ts:215`).

**The region graph is already the authority and the tile grid is already a projection.**
This gate ratifies that and forbids reversing it. A tile grid must never become a place
where a geographic fact is authored.

### Existing consumers of the region graph

These are the systems that would be affected by any topology change, and the pool from
which a new axis must find a consumer before it earns production code:

| Consumer | File | Uses |
| --- | --- | --- |
| Deterministic travel plan | `src/deterministicTravelPlanCore.ts:139` | `connectedTo` |
| Transport / routing | `src/transportCore.ts:68,107` | `connectedTo` |
| Travel encounters | `src/travelEncounterCore.ts:137` | `connectedTo` (BFS) |
| Fog of war | `src/fogOfWarCore.ts:54-66` | `connectedTo` |
| Domain turn ops | `src/domainTurnOps.ts:25` | `connectedTo` |
| Market/travel spine adapter | `src/gameplaySpineMarketTravelAdapterCore.ts:211-227` | `connectedTo` |
| Reference inventory | `src/entityReferenceInventoryCore.ts:80-85` | `connectedTo` (id integrity) |
| Cartography layout | `src/cartographyLayoutCore.ts:144` | `connectedTo`, `biome`, `hazard` |
| Tile overmap | `src/tileOvermapCore.ts:129-201` | `biome`, `hazard`, edges |
| Hazard generation | `src/worldForgeGeneratorCore.ts:261-324` | `biome`, `theme` |
| GM prompt grounding | `src/inWorldPromptBuilderCore.ts` | `biome` |

Note the shape of this list: **`biome` has exactly three consumer classes today** — map
projection, hazard generation, and narration grounding. Nothing consumes biome for travel
cost, settlement placement, or encounter selection. That constrains what Slice 1 may
legitimately add.

---

## Existing Taxonomy Conflict

`src/worldForgeCore.ts:5-6` declares two overlapping enums:

```ts
RegionType  = wilderness | urban | dungeon | ruins | ocean | mountains | forest | other      // 8
RegionBiome = forest | desert | mountain | sea | coast | city | plains | swamp
            | wasteland | ruins | dungeon | underground | snow | volcanic | other            // 15
```

They are not independent: `inferRegionBiomeFromType()` (`:153-164`) derives one from the
other, and six values collide outright (`forest`, `dungeon`, `ruins`, `mountains`/`mountain`,
`ocean`/`sea`, `urban`/`city`).

`RegionBiome` mixes at least six different kinds of statement:

| Value | What it actually asserts |
| --- | --- |
| `forest`, `desert`, `plains`, `swamp`, `snow` | ecological biome |
| `mountain`, `coast`, `underground`, `volcanic` | landform / terrain |
| `sea` | water body / travel domain |
| `city` | habitation density |
| `ruins` | structural integrity |
| `dungeon` | site type |
| `wasteland` | degraded land use (ecology + integrity + hazard, conflated) |
| `other` | escape hatch |

### This is already causing silent data loss

`parseRegion()` (`src/worldForgeCore.ts:175`) coerces any unrecognized `type` to `'other'`
with no warning. The shipped fixture `scripts/create_living_trade_world.js:595-603` authors:

```js
{ id: 'reg_coast',    type: 'coast',    biome: 'coast'    }
{ id: 'reg_delta',    type: 'swamp',    biome: 'swamp'    }
{ id: 'reg_highland', type: 'mountain', biome: 'mountain' }
{ id: 'reg_steppe',   type: 'desert',   biome: 'desert'   }
{ id: 'reg_isles',    type: 'sea',      biome: 'sea'      }
```

None of `coast`, `swamp`, `mountain`, `desert`, `sea` is a valid `RegionType`. Every one of
those regions parses as `type: 'other'`. The fixture author was treating `type` as a second
biome slot — which is exactly what the enum overlap invites.

There is a second-order failure in the same function: if `biome` is invalid it falls back to
`inferRegionBiomeFromType(region.type)` (`:190-193`), and if `type` was itself coerced to
`'other'`, the biome silently becomes `'other'` too. A single typo can erase a region's
geography with no diagnostic.

### Cost of growing the enum

`RegionBiome` is the key of at least two exhaustive `Record` types plus several switch/set
sites. Every added value is a coordinated multi-file change:

- `VALID_REGION_BIOMES` — `src/worldForgeCore.ts:143`
- `inferRegionBiomeFromType()` — `src/worldForgeCore.ts:153`
- `TILE_BIOME_CODES: Record<RegionBiome, string>` — `src/tileOvermapCore.ts:25` (and the
  single-char code must stay unique and legible; 15 codes are in use)
- `BIOME_LAYOUT_RGB: Record<RegionBiome, [number, number, number]>` — `src/cartographyLayoutCore.ts:67`
- `regionRadiusForBiome()` — `src/cartographyLayoutCore.ts:111`
- webview base glyph table + `TILE_OVERMAP_THEME_OVERRIDES` per-theme partial overrides —
  `webview/modules/86-tile-overmap.js:315+` (9 theme keys; overrides are partial, so a new
  code degrades gracefully to the base table rather than breaking every theme)

TypeScript makes the host sites compile-checked, so a missed site is caught — but the
*semantic* cost (which glyph, which colour, which radius, which hazard rules) is manual for
every value, in every theme that cares.

### Decision

**Do not add values to `RegionBiome` in Slice 1.** Containment first. The reclassification of
the candidates from the exploration pass is recorded here so the next lane does not
re-litigate it:

| Candidate | Correct axis | Slice 1 verdict |
| --- | --- | --- |
| `tundra` | ecological biome | Legitimate biome value, but deferred — no consumer need |
| `jungle`, `savanna` | ecological biome, or moisture-derived | Deferred; prefer deriving from a moisture axis over two more enum values |
| `hills` | terrain form | Not a biome. Deferred with the terrain axis |
| `badlands` | terrain form (erosional), not ecology | Not a biome. Deferred |
| `farmland` | land use | Not a biome. Deferred |
| `industrial` | land use | Not a biome. Deferred |
| `suburb` | habitation density | Not a biome. Deferred |
| `river` | linear hydrology feature | Not a biome and not a region. See [Hydrology Authority](#hydrology-authority) |

---

## Normalized Axes

The axes below are the target decomposition. Listing them is not authorizing them.

| Axis | Example values | Consumer today? |
| --- | --- | --- |
| `environmentBiome` | forest / desert / plains / swamp / tundra / snow | **Yes** — map projection, hazard rules, GM grounding |
| `terrainForm` | flat / hills / mountain / coast / ocean / underground | No |
| `habitation` | wild / rural / suburban / urban / dense | No |
| `landUse` | agricultural / residential / industrial / military / none | No |
| `integrity` | intact / damaged / ruined / overgrown | No |
| `hazards` | existing `RegionHazard` (8 values) | **Yes** — generation + tile scatter |
| `siteType` | dungeon / ruins-site / settlement / landmark | Partly — overlaps `LocationType` |

Only `environmentBiome` and `hazards` have real consumers, and both already exist in some
form. `habitation` and `integrity` are the most promising future axes — they carry most of
the genre difference between cyberpunk, post-apocalypse and zombie settings — but per the
Integrator constraint, **"will be useful later" does not authorize production code**. They
are recorded here and deferred until a settlement-placement, travel-cost, or
encounter-selection lane needs them, at which point that lane owns them.

### Migration strategy comparison

| Option | Description | Verdict |
| --- | --- | --- |
| **A. Redefine and keep both enums** | Rewrite `RegionType`/`RegionBiome` into clean disjoint sets | **Rejected for Slice 1.** Breaking change across 11 consumers, all fixtures, and every saved `world_forge.json`, for zero player-visible gain |
| **B. Normalized axes as authority, enums as compat projection** | Add `RegionProfile` axes; derive `biome` from them for old consumers | **Correct end state, wrong first step.** Requires all axes at once to be coherent, and none of them has a consumer yet |
| **C. Keep enums, add narrowly, document the conflict** | Freeze `RegionBiome` growth, add only the genuinely new concept (hydrology), record the axis map for a later lane | **Selected for Slice 1** |

Option C is chosen because the *new* thing the user asked for (rivers and bridges) is
orthogonal to the taxonomy problem. Fixing the taxonomy is not a prerequisite for shipping
hydrology, and coupling them would turn a small additive change into a repo-wide migration.

Option B remains the stated target. The path from C to B is: introduce an axis only when a
consumer lane needs it, derive `biome` from the axes as a compat projection at that point,
and retire `RegionType` last.

---

## Map Archetypes

An archetype is a **capability declaration**, not a biome list. Its job is to say which rules
apply at all, so that a world can be internally consistent without special-casing.

| Archetype | Hydrology | Coast | Elevation | Biome model | Slice 1 |
| --- | --- | --- | --- | --- | --- |
| `terrestrial` | `natural` | yes | yes | full | **Supported** |
| `orbital` (station / void / ship) | `none` | no | no | not applicable | **Schema-only** (the no-hydrology reference case) |
| `habitat` (rotating colony, arcology, sealed dome) | `artificial` | rarely | flat by construction | artificial zoning | Deferred |
| `subterranean` | `natural` (aquifer / underground river) | no | vertical only | limited | Deferred |
| `oceanic` (ocean-dominant / archipelago) | `natural` | dominant | seafloor only | limited | Deferred |
| `skyland` (floating islands) | `natural` but discontinuous | edge-only | yes | full | Deferred |

Slice 1 supports exactly two: `terrestrial` fully, and `orbital` as a schema conformance
case whose only purpose is to prove that a hydrology-free world is representable without
special-casing. Everything else is a deferred value of the same field.

The user's Gundam-colony example lands on `habitat`: flat by construction, no mountain
range, but *with* water — engineered water. That is precisely why `hydrologyMode` needs
three positive values and not a boolean.

---

## Canonical Representation

Comparison of the candidate canonical forms, evaluated against a text adventure that
already ships a working travel/fog/encounter stack:

| Candidate | Verdict |
| --- | --- |
| **Region graph (nodes + typed edges)** | **Selected.** It is already the authority (`connectedTo` drives travel, fog, encounters, transport). Choosing anything else means migrating 7 consumers for no gameplay gain |
| Tile grid (square) | **Rejected as authority.** Already exists as a projection and is explicitly unpersisted. Promoting it to truth would force per-tile authoring, break the 20-region layout cap, and put geography in a structure the GM prompt is explicitly forbidden to see |
| Hex grid | **Rejected.** All the costs of a tile grid, plus a coordinate migration, for a rendering nicety in a text-first game |
| Region graph + local submaps | **Deferred, not rejected.** The natural home for settlement interiors and dungeon floors; `docs/SETTLEMENT_MULTI_LOCATION_ARCHITECTURE.md` already occupies part of this space. Out of scope here |
| Tag-only location network | **Rejected.** Weaker than what already exists; loses the adjacency the travel planner depends on |

**Canonical: region graph. Everything spatial is a deterministic projection of it.** The
layout spec assigns coordinates; the tile overmap rasterizes; both are recomputed, never
authored.

Hydrology follows the same rule: a river is stored as an **ordered path over region ids**,
never as a polyline or a set of tiles. Geometry for a river, if ever rendered, is derived by
the same projection layer that already places regions — so it can never drift from the
canonical fact.

---

## Minimal Schema

Additive only. Every field is optional. A world_forge with none of them behaves exactly as
it does today.

### `WorldForgeMeta` additions

| Field | Required | Authored/Generated | AI-writable | Notes |
| --- | --- | --- | --- | --- |
| `mapArchetype` | optional | either | no | Absent ⇒ `terrestrial` for legacy compat |
| `hydrologyMode` | optional | either | no | `natural` \| `artificial` \| `none`; absent ⇒ `unspecified` |

### `HydrologyFeature` — new, world-level (`geography.hydrology[]`)

| Field | Required | Notes |
| --- | --- | --- |
| `id` | yes | Stable id, same id rules as regions |
| `kind` | yes | `river` \| `stream` \| `lake` \| `coast` \| `spring` \| `canal` |
| `name` | optional | Player-visible label; may be absent for minor features |
| `regionIds` | yes | **Ordered** for flowing kinds (upstream → downstream), unordered set for `lake`/`coast` |
| `flowsIntoId` | optional | Another `HydrologyFeature.id` (tributary → river → lake/sea). Must not cycle |
| `authored` | optional | `true` when hand-written; generated features omit it |

Deliberately absent: discharge, width, seasonality, watershed id, erosion state, elevation
profile. Those are simulation inputs, and this lane does not simulate.

### `RegionConnection` — new, world-level (`geography.connections[]`)

This is an **annotation layer over existing adjacency**, not a second adjacency list.

| Field | Required | Notes |
| --- | --- | --- |
| `fromId` / `toId` | yes | Must already be adjacent via `connectedTo`; entries that are not are dropped at parse |
| `crossesHydrologyId` | optional | `HydrologyFeature.id` this route crosses |
| `crossing` | optional | `none` \| `ford` \| `bridge` \| `ferry` \| `tunnel` |

Deliberately absent: travel cost, danger modifier, capacity, and **crossing condition**.
Cost and danger belong to the travel/encounter lanes. Condition is mutable — see below.

### Not in `world_forge`

`world_forge.json` is static canonical geography; per-run mutable state lives in world state.
`worldStateCore` already carries per-region mutable state (`RegionWorldState`, consumed by
`fogOfWarCore`). **A destroyed bridge is world state, not world forge.** Putting
`crossingState: intact | damaged | destroyed` into the forge would make a re-roll erase
player-caused change, and would make two saves of the same world diverge in a file that is
supposed to be the immutable world definition. Exact field placement in `worldStateCore` is
to be confirmed at implementation time — it was not read in this gate.

---

## Backward Compatibility

| Concern | Resolution |
| --- | --- |
| Old `world_forge.json` without new fields | Parses unchanged. `mapArchetype` absent ⇒ `terrestrial`; `hydrologyMode` absent ⇒ `unspecified` |
| New `world_forge.json` read by an older build | All new fields are unknown keys; existing parsers ignore unknown keys. Degrades to today's behaviour, not an error |
| `connectedTo` | Unchanged and still canonical for topology. `connections[]` may only annotate pairs that already exist there |
| Existing consumers | Unaffected. Removing `hydrology[]` and `connections[]` from any world must leave travel plans, fog, layout and tile output byte-identical |
| `TILE_BIOME_CODES` / `BIOME_LAYOUT_RGB` | Untouched in Slice 1 — no new biome values |
| Tile overmap memo key | Keyed on `JSON.stringify(spec.regions/edges)` (`src/tileOvermapCore.ts:217`). If hydrology ever reaches the layout spec, the memo key must include it or the grid will go stale |
| Fixtures with invalid `type` | Out of scope to fix here, but recorded: `scripts/create_living_trade_world.js:595-603` silently parses to `type: 'other'`. Fixing it is a separate small task, not a substrate change |

No migration script is needed for Slice 1, because nothing is removed or renamed.

---

## Hydrology Authority

The rule, stated once:

```text
HydrologyFeature          = the canonical fact that a body of water exists and where it runs
RegionConnection.crossing = how one travel route interacts with it
```

A river is authored/generated once, spans many regions in order, may flow into another
feature, and survives independently of any route. A crossing is metadata on a route and
references the river by id; deleting every crossing does not delete the river.

This directly answers "why not just put `crossing` on the edge and stop there": an edge-only
model cannot express a river that no road crosses, cannot say which regions are riparian
(settlement placement, fishing, flood risk), cannot say a tributary joins a main river, and
duplicates the same river's identity across every edge that touches it.

### Representing "no water"

An absent optional field cannot distinguish four different situations, so the capability is
declared separately from the data:

| Situation | Encoding |
| --- | --- |
| Water is not applicable to this kind of world (orbital, void) | `hydrologyMode: 'none'` |
| Water applies, and this world genuinely has none | `hydrologyMode: 'natural'` + `hydrology: []` (explicit empty array) |
| Water applies, not generated yet | `hydrologyMode: 'natural'` + `hydrology` absent |
| Legacy world, nothing known | `hydrologyMode` absent ⇒ `unspecified` |

`hydrologyMode: 'none'` is a **validation constraint**, not a hint: a world declaring `none`
that also declares a `HydrologyFeature` is contradictory and must be normalized (features
dropped) with the contradiction surfaced. This is the mechanism that makes "there are no
rivers in space" a schema property rather than a special case scattered through consumers.

`artificial` exists so a rotating colony or an arcology can have canals, reservoirs and
irrigation without claiming a natural watershed — the same `HydrologyFeature` shapes, a
different provenance for generation and narration.

### Fog interaction — a real constraint, not a nicety

`fogOfWarCore` classifies regions as `discovered` / `rumored` / `unknown`. A
`HydrologyFeature` spans regions, so a single river will routinely touch discovered and
unknown regions at once. **Hydrology must be fog-filtered on the way out**, per region, in
both the player-visible payload and the GM prompt. Without that rule, the first river
implementation leaks unexplored geography — which would directly undermine the
hidden-world-at-setup mode the user asked for.

---

## Crossing / Travel Projection

| Property | Value |
| --- | --- |
| Authority | No. `crossing` is metadata; the river is the fact |
| Storage | `geography.connections[]`, annotating existing `connectedTo` pairs |
| Values | `none` \| `ford` \| `bridge` \| `ferry` \| `tunnel` |
| Mutable condition | **Not here** — world state (see [Minimal Schema](#minimal-schema)) |
| Travel cost effect | **Not in Slice 1.** `deterministicTravelPlanCore` and `transportCore` are untouched |
| Encounter effect | **Not in Slice 1** |

Why `crossing` earns a place in Slice 1 while travel cost does not: the crossing is the piece
of information a *narrator* needs ("the road east reaches the Ashford bridge") and it is the
anchor future lanes will attach to (a destroyed bridge, a toll, a quarantine checkpoint, a
ford that floods). Its cost effect is a travel-lane decision, made by the travel lane, with
the travel lane's tests.

---

## Determinism and Generation

Existing behaviour that Slice 1 must preserve:

- `worldForgeGeneratorCore` seeds a PRNG from `worldSeed` (`:21`, `:48`) and derives biome
  and hazard from `(theme, type)` tables (`:261-320`).
- `buildTileOvermap()` derives its seed from `meta.worldSeed ?? meta.worldName`
  (`src/tileOvermapCore.ts:216`) and memoizes on forge content (`:217-223`).

Requirements added by this lane:

1. Generated hydrology is a function of `(worldSeed, region graph, mapArchetype)` and is
   written into `world_forge.json` alongside the regions it references — one artifact, one
   re-roll unit.
2. Generation must respect `hydrologyMode`. Under `none` the generator emits nothing; under
   `artificial` it emits engineered kinds (`canal`, reservoir-as-`lake`) rather than natural
   watersheds.
3. Authored features are preserved across regeneration only if the regions they reference
   still exist; a re-roll that replaces the region graph replaces its hydrology too. There is
   no partial merge in Slice 1.
4. No hydrology data may be persisted anywhere except `world_forge.json`, so that a re-roll
   cannot leave an orphan river in a save.

### Re-roll and hidden-world modes (user asks, routed)

Both requested behaviours already have their machinery:

- **"Re-roll the world" button at setup** — the generator is already seed-deterministic; a
  re-roll is a new seed plus a regenerate call. The tile overmap needs no invalidation logic
  because it memoizes on forge content. This is a **setup-UI lane**, not substrate.
- **"Don't reveal the world at setup" (7DtD-style)** — `fogOfWarCore` already provides
  `discovered` / `rumored` / `unknown`. This is a **default-visibility + setup-UI decision**,
  not substrate.

The only substrate obligation to either is requirement 4 above plus the fog-filtering rule
in [Hydrology Authority](#hydrology-authority).

### Genre biome mixes (user ask, routed)

The seam already exists and is **not** in the canonical layer:
`GENERATED_BIOME_OVERRIDES` and `HAZARD_RULES_BY_THEME` (`worldForgeGeneratorCore.ts:261-320`)
are keyed by theme and map `RegionType → RegionBiome`. A "40% urban / 30% industrial /
20% wasteland" cyberpunk mix is a **generation-input profile** that belongs there, upstream
of the canonical world. It is a separate lane. Two notes for whoever takes it:

- The current override table maps type→biome; it cannot express a *ratio*. Adding a
  distribution is a generator change, not a schema change.
- Theme keywords are resolved **twice, independently** — `resolveOvermapThemeKey()`
  (`tileOvermapCore.ts:242`) and cartography theme resolution, with the drift acknowledged
  in the comment at `tileOvermapCore.ts:240-241`. A genre-preset lane should unify them
  first or it will inherit two divergent notions of "cyberpunk".

---

## Minimal Slice

Slice 1 is deliberately smaller than the exploration suggested.

**In:**

1. `mapArchetype` on `WorldForgeMeta` — `terrestrial` supported, `orbital` accepted as the
   no-hydrology conformance case, other values reserved.
2. `hydrologyMode` on `WorldForgeMeta` — `natural` / `artificial` / `none`, absent ⇒ `unspecified`.
3. `HydrologyFeature[]` at `geography.hydrology[]` — `river`, `lake`, `coast` kinds only.
4. `RegionConnection[]` at `geography.connections[]` — `crossesHydrologyId` + `crossing`.
5. Parse, validate and normalize all of the above, including the `hydrologyMode: 'none'`
   contradiction rule and the "connection must match existing adjacency" rule.
6. **One real consumer:** hydrology and crossing facts in GM prompt grounding
   (`inWorldPromptBuilderCore`, which already injects `biome`), fog-filtered per region.

**Out of Slice 1, explicitly:**

- No new `RegionBiome` values. Zero.
- No `terrainForm` / `habitation` / `landUse` / `integrity` axes.
- No travel cost or encounter changes.
- No tile-overmap or cartography rendering of rivers.
- No generator emission of hydrology (schema and consumers first; generation in Slice 2).
- No settlement placement rules.

Item 6 is not optional garnish. Without one real consumer this is a decorative schema —
the exact failure the gate is supposed to prevent. GM grounding is chosen because it is the
cheapest genuine consumer, it needs no new UI, and narration grounding is a stated product
goal.

---

## Out of Scope

Pretty rendered world map · procedural art · full climate simulation · tectonics · river
erosion or discharge simulation · watershed derivation · pathfinding engine changes ·
minimap · 3D rendering · star-system generation · settlement economy integration ·
encounter placement implementation · settlement interiors and submaps
(`docs/SETTLEMENT_MULTI_LOCATION_ARCHITECTURE.md` owns that space) · genre biome-ratio
presets (own lane) · setup-screen re-roll UI (own lane) · default fog visibility at setup
(own lane) · fixing the `RegionType` coercion in existing fixtures (own small task).

---

## Failure / Overdesign Analysis

| Failure mode | Mitigation in this design |
| --- | --- |
| Unifying every archetype at once and collapsing | Two archetypes in Slice 1; the rest are reserved values of one field |
| Mandatory hydrology breaking space/orbital worlds | `hydrologyMode` is a declared capability with `none` as a validation constraint, not an empty field |
| Committing to a tile grid too early | Tile grid explicitly demoted to a projection; already unpersisted, and this gate forbids authoring into it |
| AI overwriting geographic facts | Every new field is non-AI-writable; hydrology enters the GM prompt as read-only grounding, in the same direction `biome` already flows |
| `biome` vs `terrain` responsibility collision | Already real (`RegionType`/`RegionBiome` overlap, verified fixture coercion). Slice 1 contains it by freezing `RegionBiome` growth; Option B is the recorded target |
| Designing ahead for a future map UI | No rendering work in Slice 1; hydrology geometry is deliberately *not* stored, so no rendering decision is pre-committed |
| Decorative schema no system uses | Slice 1 requires GM-grounding as a consumer; a schema-only slice is rejected |
| A parallel truth beside `world_state` | Static geography in `world_forge`, mutable crossing condition in world state, explicitly separated |
| A parallel adjacency beside `connectedTo` | `connections[]` may only annotate pairs already in `connectedTo`; non-matching entries are dropped at parse |
| River geometry drifting from region facts | Rivers are region-id paths; any geometry is a derived projection, like the layout and tile grid already are |
| Fog leak via cross-region rivers | Explicit per-region fog filtering rule on hydrology output |
| Enum growth quietly breaking themes | Enum growth cost documented; webview theme overrides are partial and degrade to the base table |

---

## Acceptance Criteria

Review-testable unless marked. No tests are run in this gate.

1. This document names the canonical map authority and every projection, each with a
   file:line citation.
2. Slice 1 adds **zero** new values to `RegionBiome` and `RegionType`.
3. The schema distinguishes all four hydrology situations (not-applicable / known-empty /
   not-yet-generated / legacy-unknown) without overloading one optional field.
4. *(machine)* A world with `hydrologyMode: 'none'` declaring any `HydrologyFeature` is
   normalized to no features, and the contradiction is reported.
5. *(machine)* Every `crossesHydrologyId` resolves to an existing `HydrologyFeature.id`;
   dangling references are dropped at parse.
6. *(machine)* Every `connections[]` entry references a pair already adjacent in
   `connectedTo`; non-matching entries are dropped. No new adjacency can be introduced
   through `connections[]`.
7. *(machine)* `flowsIntoId` chains are acyclic; a cycle is rejected at parse.
8. *(machine)* A world_forge with `hydrology` and `connections` removed produces byte-identical
   travel plans, fog output, cartography layout and tile overmap versus before the change.
9. *(machine)* Legacy `world_forge.json` files with none of the new fields parse without error
   and yield the same tile overmap as on `fdca78e`.
10. Mutable crossing condition (bridge destroyed) is not stored in `world_forge.json`.
11. *(machine)* Hydrology facts for regions at fog visibility `unknown` appear in neither the
    player-visible payload nor GM prompt text.
12. *(machine)* `buildTileOvermap()` remains a pure function of forge content and seed, and
    remains unpersisted; if hydrology reaches the layout spec, the memo key includes it.
13. *(machine)* Re-rolling the world seed leaves no hydrology data from the previous roll
    anywhere in the save.
14. *(machine)* `TILE_BIOME_CODES`, `BIOME_LAYOUT_RGB` and every other exhaustive
    `Record<RegionBiome, …>` are unchanged by Slice 1.
15. Slice 1 ships at least one consumer that reads the new data (GM prompt grounding); a
    schema-only implementation fails this gate.

---

## Suggested Touch Set

Estimated for the Slice 1 implementation lane. Not touched by this gate.

| File | Expected change |
| --- | --- |
| `src/worldForgeCore.ts` | `mapArchetype`, `hydrologyMode`, `HydrologyFeature`, `RegionConnection` types + parse/validate |
| `src/inWorldPromptBuilderCore.ts` | Fog-filtered hydrology/crossing grounding lines |
| `src/fogOfWarCore.ts` | Per-region hydrology filtering helper |
| `src/worldStateCore.ts` | (Slice 2) mutable crossing condition — placement to be confirmed |
| `src/entityReferenceInventoryCore.ts` | Id integrity for hydrology and connection references |
| `src/worldForgeGeneratorCore.ts` | (Slice 2) hydrology generation honouring `hydrologyMode` |
| `src/cartographyLayoutCore.ts`, `src/tileOvermapCore.ts` | (Slice 3, rendering) untouched in Slice 1 |
| `scripts/test_world_forge_core.js` (or equivalent) | Parse/normalize/contradiction cases |
| `scripts/test_tile_overmap_core.js` | Regression: unchanged output with new fields absent |
| `docs/ai-tasks/BIOME-MAP-SUBSTRATE-001.md` | This document |

---

## Go / No-Go Decision

**BIOME_MAP_SUBSTRATE_001_READY_TO_IMPLEMENT** — for Slice 1 as scoped above, and nothing
beyond it.

The slice is additive, optional-only, touches no existing consumer's behaviour, requires no
migration, and carries one real consumer so it is not decorative. The taxonomy cleanup
(Option B) and every new axis remain **DEFERRED** until a lane with an actual consumer
claims them.

### Unresolved blockers

1. **No consumer exists for `habitation` / `integrity` / `landUse`.** These carry most of the
   cross-genre difference the user is interested in, but authorizing them now would ship
   fields nothing reads. Unblocked by a settlement-placement or travel-cost lane, whichever
   comes first.
2. **Mutable crossing state placement is unverified.** `worldStateCore.RegionWorldState` was
   not read in this gate (exploration budget). Slice 2 must confirm the field's home before
   implementing bridge destruction.
3. **Two independent theme resolvers can drift.** `resolveOvermapThemeKey()` and cartography
   theme resolution match keywords separately (acknowledged at `tileOvermapCore.ts:240-241`).
   This does not block Slice 1, but it does block a coherent genre-preset lane.
