# Idea Note — AI World Dressing / Content Pass

Date: 2026-07-07 JST
Status: IDEA NOTE

## Problem

Current World Forge generation is deterministic and theme-table driven.

It can create valid regions, locations, factions, NPCs, and history, but names are assembled from fixed tables and commerce examples remain generic.

This is useful for deterministic structure, but weak for world-specific flavor.

## Product idea

After deterministic world structure exists, optionally run a read-only AI authoring pass that proposes world-specific display content.

```text
Deterministic World Forge
→ stable IDs / geography / factions / markets / numbers
→ AI World Dressing proposal
→ validation
→ user preview / accept
→ save display content
```

AI should not own prices, stock, market authority, IDs, or simulation state.

## Good first scope

Use existing world context:

- world name and theme;
- regions and biomes;
- faction names and goals;
- lore history;
- market locations;
- existing commodity IDs and mechanics.

Generate only display-facing content such as:

- world-appropriate commodity names;
- regional specialty names;
- shop / inn / workshop names;
- transport display names;
- short item flavor descriptions;
- optional local aliases.

Example:

```text
canonical id: wheat
mechanics: unchanged

AI proposal:
name: Moon-ear Wheat
local alias: Silvergrain
origin: northern terrace farms
```

## Important distinction

### Rename existing commodities

Low-risk.

Keep:

- `id`;
- `basePrice`;
- `weight`;
- market assignment;
- stock / price simulation.

Change only display-facing content.

### Add new specialties

Higher-risk.

A genuinely new specialty requires real mechanics:

- stable ID;
- base price;
- weight;
- producing / buying markets;
- stock target;
- event semantics if relevant.

Therefore v0 should prefer world-specific names and aliases for existing commodities before generating new mechanical commodities.

## Current schema limitation

`CommodityDef` currently contains only:

```text
id
name
basePrice
weight
```

Richer flavor would eventually benefit from optional fields such as:

```text
description
originRegionId
category
tags
localAliases
```

Do not add these before the current Gameplay Slice 1 human playtest unless the test itself proves they are needed.

## Recommended sequencing

```text
1. Run current 30-minute Slice 1 playtest with existing generic content.
2. Record whether the Decision Surface itself creates hesitation.
3. Then test AI World Dressing as a separate presentation/content pass.
4. Compare the same mechanics before and after dressing.
```

This avoids using attractive names to hide a weak decision loop.

## Design rule

```text
AI may name the world.
AI may not secretly rebalance the world.
```

## Future candidate

If the naming pass proves valuable, extend it into an optional authoring workflow:

```text
Generate structure
→ Dress world
→ Preview diff
→ Accept / reject individual proposals
→ Validate references
→ Save
```

This fits LoreRelay's AI-optional direction: deterministic systems remain authoritative while AI contributes meaning, language, and identity where it is strongest.
