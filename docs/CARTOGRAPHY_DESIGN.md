# Cartography Design

LoreRelay Cartography adds optional map placement metadata to `world_forge.json` regions.

## Region Fields

```ts
type RegionBiome =
  | 'forest' | 'desert' | 'mountain' | 'sea' | 'coast' | 'city'
  | 'plains' | 'swamp' | 'wasteland' | 'ruins' | 'dungeon'
  | 'underground' | 'snow' | 'volcanic' | 'other';

interface Region {
  id: string;
  name: string;
  type: RegionType;
  x?: number;      // 0..1000, left to right
  y?: number;      // 0..1000, top to bottom
  biome?: RegionBiome;
}
```

`x`, `y`, and `biome` are optional for backward compatibility. The parser rounds and clamps numeric coordinates to `0..1000`, ignores non-number coordinates, and falls back from unknown biome values to a biome inferred from `Region.type`.

## LLM System Prompt

Use this when asking an LLM to generate `world_forge.json` with cartography metadata:

```text
You are generating a world_forge.json file for LoreRelay, an AI text adventure engine.

Generate a coherent world map using Region coordinates and biomes.

Coordinate system:
- Each Region should include integer x and y coordinates.
- x ranges from 0 to 1000. y ranges from 0 to 1000.
- x: 0 is the left edge of the map. x: 1000 is the right edge.
- y: 0 is the top edge of the map. y: 1000 is the bottom edge.
- Coordinates are relative map positions, not real-world units.

Biome rules:
- Each Region should include one biome.
- Allowed biome values are: forest, desert, mountain, sea, coast, city, plains, swamp, wasteland, ruins, dungeon, underground, snow, volcanic, other.
- Use biome values exactly as listed. Do not invent new biome strings.

Spatial consistency rules:
- Regions listed in connectedTo should be reasonably close to each other on the map.
- Avoid placing directly connected regions on opposite sides of the map unless the connection is explicitly magical, oceanic, or long-distance.
- Do not place all regions in one cluster. Spread them naturally across the 0..1000 map.
- Major travel chains should form readable paths across the map.

Biome placement rules:
- sea regions should usually be near map edges or form a large water boundary.
- coast regions and port cities should be near sea regions.
- mountain regions often form chains or barriers.
- forest and plains can sit between cities, ruins, and mountains.
- desert, wasteland, volcanic, ruins, dungeon, and underground regions may have higher dangerLevel.
- city regions should not be isolated; every city should connect to at least one nearby region.
- High dangerLevel regions may be placed toward borders, mountains, ruins, wastelands, dungeons, or isolated frontiers.

Graph consistency:
- connectedTo must reference valid Region ids only.
- If Region A lists Region B in connectedTo, prefer making Region B also list Region A unless the connection is intentionally one-way.
- Adjacent regions should usually be within about 80 to 350 coordinate units of each other.
- Avoid overlapping coordinates. Keep at least 40 units between region centers when possible.

Output rules:
- Output valid JSON only.
- Do not include comments, markdown, or explanations outside the JSON.
- Use integer x and y values only.
```
