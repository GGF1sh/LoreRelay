# GENRE-WORLD-PRESET-001 — Genre World Preset Design Gate

> Task ID: GENRE-WORLD-PRESET-001
> Revision: 2 (Integrator gate on PR #72 applied — see [Revision History](#revision-history))
> Status: Design confirmed — implementation gated, see verdict
> Base: `0bbce28f2bb1ac72af75374871a427562d2d83f2` (main, version 1.84.30)
> Branch: `docs/GENRE-WORLD-PRESET-001-GATE`
> Date: 2026-07-31 JST
> Scope: design document only. No production code, no version bump, no tests run.
> Depends on: [BIOME-MAP-SUBSTRATE-001](BIOME-MAP-SUBSTRATE-001.md) — **design merged (PR #71), production not implemented.** See [Dependency on the Geographic Substrate](#dependency-on-the-geographic-substrate)
> Verdict: **GENRE_WORLD_PRESET_001_DESIGN_CONFIRMED** + **SLICE_1_READY_TO_IMPLEMENT** (substrate-independent scope only) — see [Go / No-Go Decision](#go--no-go-decision)
> Board: track state in [AI Review Backlog](../AI_REVIEW_BACKLOG.md); this record is not a lane state.

## Revision History

| Rev | Change |
| --- | --- |
| 1 | Initial design gate |
| 2 | Integrator gate applied: substrate dependency removed from Slice 1; full-file byte identity replaced with canonical-content parity; `guarantee` allocator split into two explicit paths preserving RNG consumption order; reveal-mode production wiring moved out of Slice 1; `habitat` colony preset demoted to a registry example |

---

## Problem

BIOME-MAP-SUBSTRATE-001 settled, *as a design contract*, what a world is; none of it is
implemented yet. This lane settles what decides **which kind of world gets generated** — genre-shaped region mixes, terrain tendency,
hydrology tendency, and the provenance needed to reproduce or re-roll a world.

The naive framing is "add a preset system". That framing is wrong here, and the reason is
the central finding of this gate:

**Genre presets already exist. They are just not an artifact.**

Genre-keyed generation tables are already implemented — region type weights, hazard rules,
biome overrides, name tables — but they are hardcoded inside generator functions, keyed by a
free-text `theme` string, with silent `?? default` fallbacks, and **the resolved genre is
never recorded**. Meanwhile at least four different genre vocabularies exist in the
repository and none of them agree.

So the real problem is not "we have no presets". It is:

1. **The preset is not a first-class artifact**, so it cannot be versioned, reproduced,
   re-rolled with, or extended without editing generator internals.
2. **Genre identity is resolved repeatedly, independently, from free text**, in at least five
   places, using three incompatible vocabularies.
3. **Nothing is recorded**, so "re-roll with the same preset" is not expressible: after
   generation, the world does not know which preset made it.

### Correction to a claim made during the previous lane

During BIOME-MAP-SUBSTRATE-001 it was stated in chat that the current generator "cannot
express a ratio" because `GENERATED_BIOME_OVERRIDES` is a type→biome override map. That was
based on an incomplete read and is **wrong**.

Ratios are already expressible and already implemented:
`REGION_TYPE_WEIGHTS_BY_THEME` (`src/worldForgeGeneratorCore.ts:366-377`) is a per-theme
weighted table over `RegionType`, sampled with `pickWeighted()`. Cyberpunk is already
`urban 5 / other 3 / wilderness 1 / ruins 1`.

This changes the shape of this lane substantially. It is **not** "invent a ratio mechanism".
It is **extract an existing table into a declared, versioned artifact, and record which one
was used**. The real gaps in the existing ratio mechanism are covered in
[Composition Ratios](#composition-ratios).

---

## Goals

1. Make a genre preset a declared, versioned, addressable artifact.
2. Resolve genre identity **once**, at generation time, and record the result.
3. Make `presetId + presetVersion + worldSeed` sufficient to reproduce a world.
4. Make re-roll (same preset, new seed) and reproduction (same everything) both expressible.
5. Separate what the player is *shown* at start from what is *generated*.
6. Fix the multi-vocabulary drift by removing the need for repeated resolution — design only.
7. Leave a hook for district composition without implementing it.

Non-goals for this lane: city/district generation itself, the start-screen UI, and any
change to the geographic substrate settled by PR #71.

---

## Existing Preset and Theme Seams

Verified against `0bbce28`.

### Generation input today

```ts
// src/worldForgeGeneratorCore.ts:20-26
interface WorldForgeGeneratorInput {
    worldSeed: string;
    theme: string;        // free text, used directly as a table key
    regionCount: number;  // 3–12
    factionCount: number; // 2–6
    npcCount: number;     // 2–20
}
```

Entry point: `handleGenerateWorldForge()` (`src/extension.ts:1458-1497`) normalizes the seed
and theme, clamps the counts, prompts before overwriting `world_forge.json` (with a `.bak`),
then calls `generateAndSaveWorldForge()`. On overwrite it also runs
`resetWorldStateFromForge()` (`:1512`) — the existing re-roll safety mechanism.

### Genre-keyed tables that already behave as presets

| Table | File | Keyed by | What it decides |
| --- | --- | --- | --- |
| `REGION_TYPE_WEIGHTS_BY_THEME` | `worldForgeGeneratorCore.ts:366-377` | theme | **region composition ratio** |
| `GENERATED_BIOME_OVERRIDES` | `worldForgeGeneratorCore.ts:261` | theme | type→biome override |
| `HAZARD_RULES_BY_THEME` | `worldForgeGeneratorCore.ts:282-322` | theme | hazard kind + probability per biome |
| `REGION_NAME_PARTS` | `worldForgeGeneratorCore.ts:90-120+` | theme | naming vocabulary |
| `LOCATION_TYPE_BY_REGION` | `worldForgeGeneratorCore.ts:444-453` | region type | location mix (genre-independent) |

Every lookup is `TABLE[theme] ?? TABLE.default`. A theme key that does not match **silently
produces the default world** with no warning.

### Four genre vocabularies, none agreeing

| # | Vocabulary | Values | Style |
| --- | --- | --- | --- |
| 1 | `GENESIS_GENRES` (`rulesProfileCore.ts:6-14`) | fantasy, post_apocalypse, cyberpunk, sci_fi, eastern, horror, modern | snake_case, 7 |
| 2 | Generator theme keys (`worldForgeGeneratorCore.ts`) | dungeon-crawler, dark-fantasy, cyberpunk, post-apocalyptic, zombie-apocalypse, scifi, steampunk, cosmic-horror, oriental-fantasy, default | kebab-case, 9+ |
| 3 | `OvermapThemeKey` (`tileOvermapCore.ts:227-236`) | cyberpunk, postapoc, zombie, scifi, steampunk, horror, oriental, modern, fantasy | compressed, 9 |
| 4 | Cartography theme style (`cartographyThemeStyles.ts:22-27`) | via `normalizeThemeKey()` | separate impl |

Only `cyberpunk` and `steampunk` are spelled identically across all four. `zombie` exists in
vocabularies 2 and 3 but **not** in `GENESIS_GENRES`. `modern` exists in 1 and 3 but not 2.

### At least five independent resolution paths

`resolveOvermapThemeKey()` (`tileOvermapCore.ts:242`) · `normalizeThemeKey()` +
`resolveCartographyThemeStyle()` (`cartographyThemeStyles.ts:22,27`) ·
`inferCampaignKitIdFromTheme()` (`campaignKitCore.ts:448`) · direct `TABLE[theme] ?? default`
lookups in `worldForgeGeneratorCore` · plus theme-consuming call sites in `transportCore.ts:143`
and `settlementDioramaCore.ts`.

The drift risk recorded as blocker 3 of the previous gate was described as "two
implementations". **The verified count is higher** — at least five resolution paths over four
vocabularies. The remedy in [Theme Resolver Unification](#theme-resolver-unification) is
sized for the real number.

### Existing precedent worth copying

`resolveRulesProfile()` (`rulesProfileCore.ts:457`) already produces a `RulesProfileResult`
with a derived composite `profileId` built by joining the normalized answers (`:471-474`).
That is the same problem shape as `presetId`, already solved once in this repository, and the
preset design should not invent a different convention.

---

## Authority Split

Three categories, not two. Conflating the third with either of the others is what makes
"re-roll with the same preset" impossible today.

| Category | What it is | Where it lives | Canonical? |
| --- | --- | --- | --- |
| **Preset** | Generation *input*: tendencies, ratios, densities | Preset registry (code/data, versioned) | No — an input |
| **World** | The generated result: regions, connections, hydrology | `world_forge.json` | **Yes** |
| **Provenance** | Which input produced this world | `WorldForgeMeta` | No — a record, not a fact about the world |

Rules:

- A preset never appears in gameplay logic. Nothing at runtime asks "what genre is this
  world"; it asks the world.
- The generated `world_forge.json` remains canonical even if its preset is later changed,
  re-versioned, or deleted.
- Provenance is written once at generation and is never used to re-derive geography.

---

## Dependency on the Geographic Substrate

BIOME-MAP-SUBSTRATE-001 is **design-merged, not implemented**. Verified on `0bbce28`:

- `WorldForgeMeta` (`src/worldForgeCore.ts:12-18`) contains only
  `worldName`, `worldSeed`, `theme`, `generatedAt`, `generationMethod`.
- `mapArchetype` and `hydrologyMode` appear in **zero** files under `src/`.
- `HydrologyFeature` and `RegionConnection` do not exist as types.

Revision 1 wrote a preset schema that referenced those types as if they were available. They
are not. Two ways out were available:

| Option | Effect |
| --- | --- |
| A. Implement preset Slice 1 after substrate production Slice 1 | Serializes two lanes; preset work blocked on unrelated schema work |
| **B. Remove the substrate dependency from preset Slice 1** | **Selected.** Preset registry, resolution and provenance need no geographic types |

**Decision: Option B.** The substrate-dependent fields are moved to Preset Slice 2, which is
gated on substrate production Slice 1. Preset Slice 1 carries no geographic capability field
at all, which keeps it a pure behaviour-preserving extraction with no cross-lane blocking.

| Preset field | Slice | Gate |
| --- | --- | --- |
| `presetId`, `presetVersion`, `label`, `status` | 1 | none |
| `regionComposition`, `biomeOverrides`, `hazardRules`, `nameParts` | 1 | none |
| `terrainTendency` | 1 | none (composition bias only) |
| `districtProfileId` | 1 | stored, uninterpreted |
| `mapArchetype`, `hydrologyMode` | **2** | substrate production Slice 1 |
| `hydrologyDensity`, `crossingDensity` | **2** | substrate production Slice 1 |

---

## Preset Schema

Reuses existing shapes wherever one exists, so the first implementation is largely a **move**,
not a rewrite. Fields marked **(S2)** are Preset Slice 2 and are specified here but not
implemented until the substrate lands.

```ts
interface GenreWorldPreset {
    presetId: string;            // stable machine id, kebab-case
    presetVersion: number;       // integer; frozen once published
    label: string;               // human-facing, localizable
    status: 'published' | 'example';   // 'example' is registry-only, never selectable
    // --- composition ---
    regionComposition: RegionCompositionRule;
    terrainTendency: 'flat' | 'rolling' | 'mountainous';
    // --- reuse of existing tables ---
    biomeOverrides?: Partial<Record<RegionType, RegionBiome>>;  // existing shape
    hazardRules?: Array<{ hazard: RegionHazard; biomes: RegionBiome[]; chance: number }>;
    nameParts?: [string[], string[]];                            // existing shape
    // --- forward hook, not interpreted in this lane ---
    districtProfileId?: string;

    // --- (S2) substrate capability; requires BIOME-MAP-SUBSTRATE production Slice 1 ---
    // mapArchetype?: MapArchetype;
    // hydrologyMode?: 'natural' | 'artificial' | 'none';
    // hydrologyDensity?: HydrologyDensityRule;   // ignored when hydrologyMode is 'none'
    // crossingDensity?: CrossingDensityRule;
}
```

| Field | Required | Authored/Generated | AI-writable | Notes |
| --- | --- | --- | --- | --- |
| `presetId` | yes | authored | no | Stable; never renamed. Retiring a preset means marking it, not deleting the id |
| `presetVersion` | yes | authored | no | Integer, frozen once published |
| `status` | yes | authored | no | `example` entries exist to exercise the schema; they are never offered for generation |
| `regionComposition` | yes | authored | no | See below |
| `terrainTendency` | yes | authored | no | Composition bias only — see [Terrain Tendency](#terrain-tendency) |
| `districtProfileId` | optional | authored | no | **Stored and validated only.** Interpreted by the settlement lane |
| `mapArchetype` / `hydrologyMode` **(S2)** | — | authored | no | Written into `WorldForgeMeta` at generation, once those meta fields exist |
| `hydrologyDensity` / `crossingDensity` **(S2)** | — | authored | no | Schema defined here; gated on the substrate |

### `presetId` is not a genre

A preset is a *world recipe*, a genre is a *tone*. One genre maps to several presets
(`cyberpunk-sprawl`, `cyberpunk-arcology`), and some presets are not genres at all
(`orbital-colony-cylinder`). Adopting `GENESIS_GENRES` as the preset vocabulary would be
wrong for three verified reasons: it has no `zombie`, it has no room for archetype variants,
and it is already used for a different purpose (rules patching, campaign kit, style prompt).

**Decision: `presetId` is a new vocabulary owned by the preset registry.** All four existing
vocabularies become *mappings into it*, not competitors.

Naming convention: `<family>-<variant>`, kebab-case — e.g. `fantasy-temperate`,
`cyberpunk-sprawl`, `postapoc-wasteland`, `zombie-suburban`, `orbital-colony-cylinder`.

---

## Composition Ratios

Slice 1 moves `REGION_TYPE_WEIGHTS_BY_THEME` into `GenreWorldPreset.regionComposition`
unchanged in meaning. But the existing mechanism has a defect that a declared preset makes
visible and should fix:

**Independent weighted sampling does not honour a ratio at small counts.** Each region is
drawn independently with `pickWeighted()` (`worldForgeGeneratorCore.ts:385`). With the
shipped cyberpunk weights (`urban 5 / other 3 / wilderness 1 / ruins 1`) and the default
`regionCount` of 5, a run can legitimately produce **zero urban regions**. A preset that
advertises "a dense corporate sprawl" and generates five wildernesses is not a preset failure
the player can diagnose — it reads as a broken game.

```ts
interface RegionCompositionRule {
    weights: Array<[RegionType, number]>;   // existing shape, preserved
    /** Minimum realized counts, applied before weighted fill. Sum must be <= min regionCount (3). */
    guarantee?: Array<[RegionType, number]>;
}
```

### Two explicit paths — the allocator does not "degrade"

Revision 1 claimed a largest-remainder allocator would "degrade to today's behaviour when
`guarantee` is absent". **That is not achievable and the claim is withdrawn.**

The existing generator calls `pickWeighted()` once per region *inside* the region loop
(`worldForgeGeneratorCore.ts:385`), and every subsequent draw in that same iteration — biome
inference, `placeRegionOnMap()` jitter, `dangerLevel`, `assignGeneratedHazard()` — consumes
the **same PRNG stream** (`:386-402`). Replacing per-region sampling with an up-front quota
allocation changes how many values are drawn and in what order, so every downstream draw
shifts. Identical region-type counts would still yield different names, positions, danger
levels and hazards.

Therefore the two behaviours are **two separate code paths**, selected by the presence of
`guarantee`:

| `guarantee` | Path | RNG behaviour |
| --- | --- | --- |
| absent | **Legacy path, untouched.** The existing per-region `pickWeighted()` loop | Identical draw order and count to `0bbce28` |
| present | New quota allocator: satisfy `guarantee` in declaration order, fill the rest by largest-remainder over `weights` | Deliberately different stream; not comparable to the legacy path |

Consequences that must be stated in the implementation lane rather than discovered:

- No preset migrated in Slice 1 may declare `guarantee`. All migrated presets take the legacy
  path, which is what makes "zero generated worlds change" true.
- Adding `guarantee` to an existing preset is a **breaking change to that preset** and
  requires a `presetVersion` bump, because the same seed will produce a different world.
- The `guarantee` sum is capped at the minimum `regionCount` (3) so a preset can never make
  generation unsatisfiable.

---

## Terrain Tendency

`flat | rolling | mountainous`. Be precise about what this can and cannot do in Slice 1.

BIOME-MAP-SUBSTRATE-001 **deferred the `terrainForm` axis** — there is no elevation or
landform model in the schema. So `terrainTendency` cannot express terrain directly. What it
can do today:

1. Bias `regionComposition` (more/fewer `mountains` region type).
2. Bias `placeRegionOnMap()`, which already nudges mountain regions toward the top of the map
   (`worldForgeGeneratorCore.ts:350-352`).

That is a **composition and layout bias, not a terrain model**, and the field must be
documented as such so a later lane does not assume elevation data exists behind it. When
`terrainForm` is eventually introduced, `terrainTendency` becomes its generation input and
the meaning tightens without a rename.

`flat` is the load-bearing value: it is what makes an orbital colony read as flat, by
excluding `mountains` from composition entirely rather than by modelling elevation.

---

## Hydrology and Feature Density (Slice 2)

**Not implemented in Preset Slice 1.** Every field in this section depends on
`hydrologyMode`, `HydrologyFeature` and `RegionConnection`, none of which exist in production
(see [Dependency on the Geographic Substrate](#dependency-on-the-geographic-substrate)). The
specification is recorded here so the substrate lane knows what will consume it.

Gated by `hydrologyMode` from the substrate gate. The preset sets the mode; the mode decides
whether the density fields mean anything.

```ts
interface HydrologyDensityRule {
    river: number;   // 0..1, expected fraction of regions touched by a river
    lake: number;    // 0..1
    coast: 'none' | 'edge' | 'dominant';
}
interface CrossingDensityRule {
    /** Relative weights for how a route crossing a water feature is realized. */
    bridge: number;
    ford: number;
    ferry: number;
    blocked: number;
}
```

| `hydrologyMode` | Density fields | Generated kinds |
| --- | --- | --- |
| `natural` | honoured | `river`, `lake`, `coast`, `spring` |
| `artificial` | honoured | `canal`, reservoir-as-`lake`; **no natural watershed, no `spring`** |
| `none` | **must be absent**; present ⇒ validation error | none |

The `none` case is a validation constraint inherited directly from PR #71, not a new rule.
A preset declaring `hydrologyMode: 'none'` alongside a `hydrologyDensity` block is
self-contradictory and must fail preset validation at load, not silently at generation.

`crossingDensity.blocked` exists so a zombie or post-apocalyptic preset can generate
impassable crossings at world creation — the static case. Bridges destroyed *during play*
remain world state, per the substrate gate.

### Worked example — orbital colony (documentation only)

**This preset is not shipped.** It exists in this document to demonstrate that a flat,
artificially-watered, mountain-free world is expressible without special-casing. It depends
on the `habitat` archetype, which BIOME-MAP-SUBSTRATE-001 lists as *deferred* — the archetype
does not exist even in the substrate's own Slice 1.

If it is later added to the registry, it must carry `status: 'example'` so it can never be
selected for generation. Revision 1 proposed a `draft` status that could ship; that is
withdrawn.

```
presetId:        orbital-colony-cylinder
mapArchetype:    habitat
hydrologyMode:   artificial
terrainTendency: flat
regionComposition.weights: urban 4 / other 3 / wilderness 2   (no mountains, no ocean)
hydrologyDensity: { river: 0.0, lake: 0.2, coast: 'none' }    // reservoirs, no rivers
crossingDensity:  { bridge: 3, ford: 0, ferry: 0, blocked: 1 }
```

**Dependency chain, stated honestly:** the colony preset needs `hydrologyMode`, which needs
substrate production Slice 1, which itself defers `habitat`. Two unbuilt layers sit under
this example. It stays documentation until both land.

---

## Provenance and Reproducibility

Written into `WorldForgeMeta` at generation. Additive and optional, exactly like the
substrate fields.

```ts
interface WorldGenProvenance {
    presetId: string;
    presetVersion: number;
    worldSeed: string;                 // already exists as meta.worldSeed
    resolvedFrom: 'explicit' | 'genre' | 'theme-keyword' | 'default';
    generatedAt: string;               // already exists
}
```

`resolvedFrom` is not decoration: it records whether the preset was chosen deliberately or
inferred from free text, which is exactly the information needed to decide whether a legacy
world can be trusted to re-roll consistently.

### `presetVersion` policy (adopted)

- Preset definitions are **frozen per version**. A published `(presetId, presetVersion)` pair
  is immutable. Changing tendencies means publishing a new version.
- Identical `presetId + presetVersion + worldSeed + counts` ⇒ identical **canonical content**
  (defined below). Not identical bytes.
- If the recorded version is not present in the registry, the build **must not silently
  substitute another version**. It degrades to *reproduction unavailable*.
- Degraded state is non-blocking: the existing world remains fully playable and its
  `world_forge.json` remains canonical. Only regeneration-with-reproduction is unavailable.
- The degraded state must be visible (a warning), never inferred by the player from a world
  that quietly changed.

The counts (`regionCount`, `factionCount`, `npcCount`) are part of the reproduction key and
must be recorded with the provenance, otherwise the guarantee is false. They are currently
clamped in `extension.ts:1471-1473` and not persisted anywhere.

### Canonical content parity — the comparison rule

Revision 1 required a `world_forge.json` "identical byte for byte". **That is impossible and
the requirement is withdrawn**, for two independent reasons:

1. The generator stamps `generatedAt: new Date().toISOString()`
   (`worldForgeGeneratorCore.ts:734`). Two runs from the same seed already differ today.
2. Slice 1 *adds* provenance to `meta`, so a post-change file cannot equal a pre-change file
   by construction.

Comparison is therefore defined over a projection, not the file:

```ts
/** The generated world, excluding non-reproducible and bookkeeping metadata. */
canonicalContentOf(forge) = {
    geography: forge.geography,   // regions, connections, locations
    factions:  forge.factions,
    npcs:      forge.npcs,
    lore:      forge.lore,
    meta: { worldName, worldSeed, theme, generationMethod },   // note: no generatedAt
}
```

| Field | Comparison rule |
| --- | --- |
| `geography`, `factions`, `npcs`, `lore` | **Must match exactly.** This is the reproduction guarantee |
| `meta.worldName / worldSeed / theme / generationMethod` | Must match exactly |
| `meta.generatedAt` | **Excluded.** Non-deterministic by construction |
| Provenance fields | **Excluded from parity, asserted separately.** A migration test compares canonical content across the change *and* asserts provenance equals the expected preset/version/counts |
| Key order, whitespace, trailing newline | Not part of the comparison; compare parsed structures, not text |

Making `generatedAt` deterministic was considered and rejected: it is a genuine wall-clock
record of when a world was made, useful to the player and to support, and seeding it from the
world seed would make two different sessions claim the same creation time. Excluding it from
the parity projection is the honest fix.

---

## Reroll

Two distinct operations that must not be conflated in the eventual UI:

| Operation | Inputs | Result |
| --- | --- | --- |
| **Reproduce** | same preset + version + seed + counts | identical canonical content (`generatedAt` will differ) |
| **Re-roll** | same preset + version, **new seed** | different world, same tendencies |

Both are generation-input changes. Neither needs a schema beyond provenance.

Existing machinery that must be reused, not rebuilt:

- Overwrite confirmation and `.bak` backup — `extension.ts:1475-1484`.
- `resetWorldStateFromForge(forge, isOverwrite)` — `extension.ts:1512`. **A re-roll must run
  this**, or the new world inherits the previous world's state and fog, which would surface
  as regions being pre-discovered in a world the player has never seen.

Slice 1 obligation: nothing derived from a preset may be persisted outside
`world_forge.json` and world state, so that a re-roll cannot leave an orphan behind.

---

## Reveal Mode (design only — production wiring is a separate lane)

**Not in Preset Slice 1.** Revision 1 put the fog wiring in Slice 1 while also claiming Slice 1
changes no behaviour. Those are contradictory: `hidden` / `summary` / `full` change what the
player sees on turn one, which is a player-visible behaviour change by definition. The design
below stands; the implementation belongs to a setup/reveal lane that owns the start screen.

```ts
type InitialRevealMode = 'full' | 'summary' | 'hidden';
```

| Mode | Meaning |
| --- | --- |
| `full` | Whole map visible from the start |
| `summary` | Region names and count visible; contents, locations and hydrology hidden |
| `hidden` | Nothing beyond the starting region (7DtD-style) |

**This is a play setting, not a generation input.** It belongs with game rules, not in
`world_forge.json`, for two reasons: it is per-playthrough, and putting it in the world file
would make two saves of the same world differ in the file that is supposed to be the
immutable world definition.

Hard requirement, and the reason the *design* is fixed in this lane rather than the UI lane:

> Changing `initialRevealMode` must not change the canonical content of the generated
> `world_forge.json`. Reveal mode selects a **starting fog state**, it does not select a world.

That constraint is a property of the preset/provenance model, so it is settled here even
though the wiring ships elsewhere.

It maps onto the existing `fogOfWarCore` visibility model (`discovered` / `rumored` /
`unknown`) — `full` marks all regions discovered, `hidden` marks only the starting region,
`summary` uses the existing `rumored` tier. No new visibility concept is needed.

The `summary` mode additionally depends on the hydrology fog-filtering rule established in
PR #71: a river spanning a hidden region must not leak that region through the summary.

---

## Theme Resolver Unification

**Design fixed here; the code integration is a separate lane. This branch changes no code.**

### The insight

The instinct is "merge the five keyword matchers into one". That is the wrong fix — it keeps
free-text resolution on the hot path forever and leaves every consumer able to disagree.

**The right fix is to resolve once, at generation time, and persist the result.** After
`presetId` is recorded in provenance, downstream consumers stop resolving anything: they map
`presetId → their own presentation key`, which is a total function over a known finite set,
not a keyword heuristic. Free-text keyword matching survives only as a **legacy fallback for
worlds generated before provenance existed**, in exactly one place.

### Responsibility and placement of the single resolver

New pure module `src/genreWorldPresetCore.ts` (no vscode, no fs, no webview — matching the
`*Core.ts` convention):

| Responsibility | Notes |
| --- | --- |
| Own the preset registry | Frozen per `(presetId, presetVersion)` |
| `resolvePresetId(input)` | Returns `{ presetId, presetVersion, resolvedFrom }` |
| `getPreset(presetId, presetVersion)` | Returns the frozen definition or `undefined` (never a substitute) |
| Own the legacy keyword table | The **only** place free text is interpreted |
| Own `presetId → presentation key` maps | For overmap theme, cartography style, campaign kit |

What it must **not** own: rules patching (`rulesProfileCore`), map projection
(`cartographyLayoutCore`, `tileOvermapCore`), or any gameplay logic.

### Resolution priority

1. **Explicit `presetId`** (machine id, from the setup flow or a scenario pack) — always wins.
2. **`GenesisGenre` → default `presetId`** mapping, when the setup wizard supplied a genre.
3. **`meta.theme` free-text keyword match** — legacy path only.
4. **Built-in default preset** — and this case is *recorded* as `resolvedFrom: 'default'`
   rather than silently applied, which is the current behaviour's main defect.

### Migration procedure

1. Land `genreWorldPresetCore.ts` with the registry, resolution and `presetId → key` maps.
   Populate it by **moving** the existing tables verbatim, one preset per existing theme key.
   No behaviour change; existing theme strings resolve to the preset that carries their old
   table.
2. Write provenance at generation. Still no consumer change.
3. Switch consumers one at a time to `meta.presetId` with keyword fallback:
   `tileOvermapCore` → `cartographyThemeStyles` → `campaignKitCore` → remaining call sites.
   Each switch is independently revertible.
4. Once every consumer reads `presetId` first, the per-module keyword matchers are dead code
   and can be deleted in a final cleanup commit.

Steps 1–2 are Slice 1. Steps 3–4 are the separate integration lane.

### Backward compatibility of the resolver change

- Worlds without provenance keep working: consumers fall back to keyword matching on
  `meta.theme`, which is today's exact behaviour.
- Existing theme strings must resolve to a preset producing the **same** tables they use
  today; a behaviour-preserving move is a hard requirement, testable by generating with a
  fixed seed before and after and diffing.
- `meta.theme` is **not** removed or repurposed. It stays free text, and it stays the input
  to AI narration and image prompts (`imagePromptHint` at `worldForgeGeneratorCore.ts:397`,
  `protagonistBootstrap.ts:108`). Presets are machine identity; `theme` is authorial flavour.
  Both persist, with different jobs.

---

## Backward Compatibility

| Concern | Resolution |
| --- | --- |
| Old `world_forge.json` without provenance | Parses unchanged; `resolvedFrom` treated as unknown, keyword fallback applies |
| New `world_forge.json` read by an older build | Provenance is an unknown key on `meta`; ignored |
| Existing theme strings | Must produce identical **canonical content** after the table move — seed-fixed parity test, `generatedAt` and provenance excluded |
| `GENESIS_GENRES` | Unchanged. Gains a genre→presetId default map; no value added or renamed |
| `meta.theme` | Unchanged, still free text, still used for narration and image prompts |
| Retired presets | Ids are never deleted or reused; a retired preset keeps its frozen versions readable |
| Counts not currently persisted | Adding them to provenance is additive; absent counts mean "reproduction unavailable" |

No migration script. Nothing is removed or renamed in Slice 1.

---

## Minimal Slice

Slice 1 has **no dependency on the geographic substrate** and can start immediately.

**In:**

1. `src/genreWorldPresetCore.ts` — `GenreWorldPreset` type, frozen registry,
   `resolvePresetId()`, `getPreset()`, legacy keyword table, `presetId → presentation key` maps.
2. Registry populated by **moving** the four existing theme-keyed tables verbatim, one preset
   per existing theme key. Behaviour-preserving. No migrated preset declares `guarantee`.
3. `RegionCompositionRule.guarantee` + quota allocator as a **second, opt-in path**. The legacy
   `pickWeighted()` loop is left untouched and remains the path for every shipped preset.
4. Provenance (`presetId`, `presetVersion`, `resolvedFrom`, counts) written into
   `WorldForgeMeta` at generation.
5. `canonicalContentOf()` projection + the seed-fixed parity test that guards items 2–4.
6. Preset validation: `guarantee` sum capped at 3; `status: 'example'` entries rejected for
   generation; `districtProfileId` validated as a string but not interpreted.

**Out of Slice 1:**

- Anything requiring `mapArchetype`, `hydrologyMode`, `HydrologyFeature` or `RegionConnection`
  — those types do not exist. Preset Slice 2, gated on substrate production Slice 1.
- `InitialRevealMode` production wiring — separate setup/reveal lane. Design fixed here.
- Switching downstream consumers to `presetId` (steps 3–4 of the migration) — separate lane.
- Deleting any existing keyword matcher.
- Any shipped preset that declares `guarantee`.
- The orbital-colony preset in any form other than this document.
- District composition interpretation.
- Start-screen UI for preset choice, re-roll, or reveal mode.
- `terrainForm` or any other normalized axis deferred by PR #71.

Item 2 is the load-bearing constraint: **Slice 1 must not change the canonical content of a
single generated world.** It makes the existing implicit presets explicit and recorded. Every
behavioural change — `guarantee`, reveal mode, consumer migration — is a later, separately
reviewable lane.

---

## Out of Scope

City/district generation · reveal-mode production wiring · start-screen and setup UI ·
preset authoring UI · procedural art ·
climate simulation · river erosion or discharge · settlement economy integration · encounter
placement · new map archetypes · normalized region axes (`terrainForm` / `habitation` /
`landUse` / `integrity`) · scenario-pack format changes · localization of preset labels ·
`rulesProfileCore` behaviour changes.

---

## Failure / Overdesign Analysis

| Failure mode | Mitigation |
| --- | --- |
| Creating a fifth genre vocabulary that competes with the four existing ones | `presetId` is explicitly the *target* of mappings from all four; none is deleted or redefined |
| Preset becomes a second source of truth about the world | Three-category authority split; presets never consulted at runtime, only at generation |
| "Re-roll with same preset" silently produces a different world | Frozen versions + explicit degradation; never substitute a version |
| Advertised ratio not realized at small region counts | `guarantee` + largest-remainder allocator; verified defect in today's independent sampling |
| Reveal mode leaking into generation | Explicit canonical-content parity requirement; reveal mode stored in game rules, not `world_forge.json` |
| Re-roll leaving stale fog or world state | Reuse of the existing `resetWorldStateFromForge()` path made an explicit obligation |
| Behaviour changing during a "refactor" slice | Slice 1 is a verbatim table move with a seed-fixed before/after diff test |
| Merging keyword matchers and calling it unification | Rejected — resolve-once-and-persist; keyword matching survives only as a legacy fallback in one module |
| District hook growing into district generation | `districtProfileId` is stored and validated but explicitly uninterpreted; blocker retained |
| Presets designed around an archetype that does not exist yet | Colony preset is documentation only; `status: 'example'` if ever registered |
| `terrainTendency` implying an elevation model | Documented as a composition/layout bias only, with the tightening path named |
| Silent default on an unknown preset | `resolvedFrom: 'default'` is recorded; the current silent `?? default` is called out as the defect being fixed |
| **Designing against types that do not exist** | Rev 1 wrote a schema over `mapArchetype`/`hydrologyMode`, which are design-only. Slice 1 now has zero substrate dependency; substrate fields are explicitly Slice 2 |
| **Assuming a refactor can preserve an RNG stream** | Rev 1 assumed a quota allocator degrades to per-region sampling. It cannot — downstream draws shift. Two explicit paths, legacy untouched |
| **Requiring byte identity of a file that contains a timestamp** | Rev 1 required byte identity while the generator stamps `new Date()`. Replaced with a `canonicalContentOf()` projection and an explicit exclusion list |
| **Calling a slice behaviour-preserving while wiring a visible change into it** | Rev 1 put reveal-mode fog wiring in a "zero behaviour change" slice. Wiring moved out |

---

## Acceptance Criteria

Review-testable unless marked. No tests are run in this gate.

Slice 1 scope unless marked **(S2)** (substrate-gated) or **(design)** (fixed here, verified
by the lane that implements it).

1. `presetId` is a distinct vocabulary from `GENESIS_GENRES`, `OvermapThemeKey`, and the
   generator theme keys, and the mapping from each into `presetId` is documented.
2. *(machine)* `canonicalContentOf()` is implemented as specified, excluding `generatedAt` and
   provenance, and comparing parsed structures rather than file text.
3. *(machine)* For every existing generator theme key, generating with a fixed seed and fixed
   counts produces **canonical content** equal to the pre-change output on `0bbce28`.
4. *(machine)* The same run asserts provenance separately: `presetId`, `presetVersion`,
   `resolvedFrom` and all three counts equal the expected values.
5. *(machine)* No preset in the shipped registry declares `guarantee`; a test asserts this, so
   every shipped preset takes the legacy sampling path.
6. *(machine)* With `guarantee` absent, generation calls the unmodified `pickWeighted()` loop
   and consumes the PRNG in the same order and count as `0bbce28`.
7. *(machine)* With `guarantee` present, the quota allocator honours it at the minimum region
   count (3); the guarantee sum is rejected if it exceeds 3.
8. *(machine)* A published `(presetId, presetVersion)` pair is immutable: registry entries are
   frozen and a mutation attempt fails at build or load.
9. *(machine)* Identical `presetId + presetVersion + worldSeed + counts` produces identical
   canonical content.
10. *(machine)* A world whose recorded `presetVersion` is absent from the registry loads and
    plays normally, reports reproduction as unavailable, and is **never** regenerated against a
    different version.
11. *(machine)* `resolvedFrom: 'default'` is recorded rather than applied silently.
12. *(machine)* A preset with `status: 'example'` is rejected as a generation input.
13. *(machine)* Legacy worlds with no provenance resolve via keyword fallback and behave
    exactly as on `0bbce28`.
14. *(machine)* A re-roll runs the existing world-state reset path; no region discovered in the
    previous world is discovered in the new one.
15. `meta.theme` remains free text and remains the input to narration and image prompts;
    no consumer of it is removed in Slice 1.
16. `districtProfileId` is validated as a string and is read by no generation logic.
17. Slice 1 references no type that does not exist on `0bbce28`; `mapArchetype`,
    `hydrologyMode`, `HydrologyFeature` and `RegionConnection` appear nowhere in its diff.
18. Slice 1 changes the canonical content of zero generated worlds; every behavioural change is
    deferred to a named later lane.
19. **(S2)** A preset declaring `hydrologyMode: 'none'` together with any hydrology or crossing
    density field fails preset validation at load.
20. **(design)** Changing `initialRevealMode` produces identical canonical content for the same
    preset, version, seed and counts.
21. **(design)** `initialRevealMode: 'hidden'` yields exactly one `discovered` region at start;
    `'summary'` yields region names via the existing `rumored` tier without exposing locations
    or hydrology.

---

## Suggested Touch Set

Estimated for the Slice 1 implementation lane. Not touched by this gate.

| File | Expected change |
| --- | --- |
| `src/genreWorldPresetCore.ts` | **New.** Registry, resolution, legacy keyword table, presentation maps, `canonicalContentOf()` |
| `src/worldForgeGeneratorCore.ts` | Tables moved out; opt-in quota allocator alongside the untouched `pickWeighted()` loop; accept a resolved preset instead of a raw theme key |
| `src/worldForgeCore.ts` | Provenance fields on `WorldForgeMeta` + parse/validate |
| `src/extension.ts` | Pass preset + counts through `handleGenerateWorldForge`; record provenance |
| `src/rulesProfileCore.ts` | Genre → default `presetId` map only; no behaviour change |
| `scripts/test_world_forge_generator_core.js` (or equivalent) | Seed-fixed canonical-content parity; provenance assertions; allocator; validation cases |
| `docs/ai-tasks/GENRE-WORLD-PRESET-001.md` | This document |
| `src/gameRulesCore.ts`, `src/fogOfWarCore.ts` | **Not in Slice 1** — reveal-mode wiring is the setup/reveal lane |
| `src/tileOvermapCore.ts`, `src/cartographyThemeStyles.ts`, `src/campaignKitCore.ts` | **Not in Slice 1** — consumer switch is the integration lane |

---

## Go / No-Go Decision

Two separate verdicts, because the design and its implementability have different gates.

### Design: `GENRE_WORLD_PRESET_001_DESIGN_CONFIRMED`

The whole design in this document is settled and may be treated as the contract for the
lanes below — including the parts that cannot be built yet (hydrology density, crossing
density, reveal mode, the colony archetype). Recording them here is the point of a gate.

### Implementation

| Scope | Verdict | Gate |
| --- | --- | --- |
| **Preset Slice 1** (registry, resolution, provenance, canonical-content parity, opt-in allocator) | **READY_TO_IMPLEMENT** | none — no substrate dependency |
| Preset Slice 2 (`mapArchetype`, `hydrologyMode`, hydrology/crossing density) | **BLOCKED** | BIOME-MAP-SUBSTRATE-001 production Slice 1 |
| Reveal-mode wiring | **DEFERRED** | setup/reveal lane |
| Consumer migration to `presetId` (migration steps 3–4) | **DEFERRED** | integration lane |
| District composition | **DEFERRED** | settlement lane |

Preset Slice 1 is safe for its size because it is a **canonical-content-preserving
extraction**: the presets already exist as hardcoded tables, and moving them into a declared
registry plus recording which one ran changes no generated world. The one behavioural
addition, the `guarantee` allocator, is a second code path that no shipped preset uses.

### Unresolved blockers

1. **Preset Slice 2 is blocked on substrate production Slice 1.** Its design is fixed, but
   `mapArchetype`, `hydrologyMode`, `HydrologyFeature` and `RegionConnection` do not exist in
   `src/`. Nothing in Preset Slice 1 may reference them.
2. **District composition stays a separate lane.** `districtProfileId` is a hook only. The
   cyberpunk district mix (residential / industrial / corporate / slum / transit) needs the
   `habitation` and `landUse` axes that PR #71 deferred for lack of a consumer — that
   settlement lane is the consumer, and it should claim those axes.
3. **Generation counts are not currently persisted anywhere.** Reproduction is false without
   them, so provenance must carry them. This is additive, but it means a world generated
   before this change can never be reproduced exactly — only re-rolled.
