import type { WorldForge, WorldLocation } from './worldForgeCore';
import { inferRegionBiomeFromType } from './worldForgeCore';
import type { RegionWorldState, FactionWorldState } from './worldStateCore';

const FACTION_TYPE_ICON: Record<string, string> = {
    hostile: '💀',
    neutral: '⚖️',
    friendly: '🤝',
    'player-faction': '⭐'
};

const MAX_REGIONS = 20;
const MAX_LOCS_PER_REGION = 10;
const MAX_ORPHAN_LOCS = 10;
const MAX_FACTIONS = 5;
const MAX_FACTION_LOC_EDGES = 30;

// Biome icons shown in region subgraph labels
const BIOME_ICON: Record<string, string> = {
    forest: '🌲', desert: '🏜️', mountain: '⛰️', sea: '🌊', coast: '🏖️',
    city: '🏙️', plains: '🌾', swamp: '🌿', wasteland: '💀', ruins: '🏚️',
    dungeon: '🕳️', underground: '⛏️', snow: '❄️', volcanic: '🌋', other: '📍',
};

// Subgraph background style per biome (dark tints for dark VSCode themes)
const BIOME_SUBGRAPH_STYLE: Record<string, string> = {
    forest:      'fill:#0d1e0d,stroke:#2d5a2d',
    desert:      'fill:#1e1600,stroke:#6a4a10',
    mountain:    'fill:#141414,stroke:#4a4a4a',
    sea:         'fill:#050d1e,stroke:#1a3a5a',
    coast:       'fill:#0d141e,stroke:#2a4a5a',
    city:        'fill:#0d0d16,stroke:#2a2a5a',
    plains:      'fill:#141e05,stroke:#4a5a14',
    swamp:       'fill:#05140d,stroke:#14401a',
    wasteland:   'fill:#140d05,stroke:#401a08',
    ruins:       'fill:#141008,stroke:#3a2e14',
    dungeon:     'fill:#0d0505,stroke:#2a1010',
    underground: 'fill:#05050d,stroke:#14143a',
    snow:        'fill:#0d1420,stroke:#3a4a5a',
    volcanic:    'fill:#140500,stroke:#5a1800',
    other:       'fill:#0d0d0d,stroke:#2a2a2a',
};

// Node fill/stroke/text color per biome (used as classDef)
const BIOME_NODE_CLASSDEF: Record<string, string> = {
    forest:      'fill:#1a3a1a,stroke:#4a8a4a,color:#c0e8c0',
    desert:      'fill:#3a2a0a,stroke:#9a7a30,color:#f0d890',
    mountain:    'fill:#252525,stroke:#7a7a7a,color:#d0d0d0',
    sea:         'fill:#0a1a3a,stroke:#3a6a9a,color:#a0c8e8',
    coast:       'fill:#1a2a3a,stroke:#4a7a9a,color:#a0c0d0',
    city:        'fill:#1a1a2a,stroke:#5a5a9a,color:#b0b0e8',
    plains:      'fill:#2a3a0a,stroke:#7a9a2a,color:#d0e890',
    swamp:       'fill:#0a2a1a,stroke:#2a6a3a,color:#90c890',
    wasteland:   'fill:#2a1a0a,stroke:#6a3a1a,color:#b08858',
    ruins:       'fill:#2a2010,stroke:#6a5a2a,color:#c0a870',
    dungeon:     'fill:#1a0a0a,stroke:#5a2a2a,color:#d88888',
    underground: 'fill:#0a0a1a,stroke:#3a3a5a,color:#8888b8',
    snow:        'fill:#1a2a3a,stroke:#7a9aba,color:#e0e8f8',
    volcanic:    'fill:#2a0a00,stroke:#9a3000,color:#f09050',
    other:       'fill:#1a1a1a,stroke:#5a5a5a,color:#b0b0b0',
};

const LOCATION_TYPE_ICON: Record<string, string> = {
    settlement: '🏘️',
    dungeon: '🕳️',
    landmark: '🗿',
    ruins: '🏚️',
    wilderness: '🌲',
    other: '📍'
};

function escapeId(id: string): string {
    return id.replace(/[^a-zA-Z0-9_]/g, '_');
}

function escapeMmdLabel(text: string): string {
    return text
        .replace(/["[\](){}|<>;#%\n\\]/g, ' ')
        .replace(/--/g, '- ')
        .trim()
        .slice(0, 40);
}

function buildLocationLabel(loc: WorldLocation, forge: WorldForge, isCurrentLocation: boolean, biomeClass?: string): string {
    const icon = LOCATION_TYPE_ICON[loc.type] ?? '📍';
    let label = `${icon} ${escapeMmdLabel(loc.name)}`;
    if (loc.factionControl) {
        const fc = forge.factions.find((f) => f.id === loc.factionControl);
        if (fc) { label += `\\n${escapeMmdLabel(fc.name)}`; }
    }
    if (loc.population) { label += `\\npop.${loc.population}`; }
    const id = escapeId(loc.id);
    const cls = biomeClass ? `:::${biomeClass}` : '';
    if (isCurrentLocation) {
        return `${id}["★ ${label}"]${cls}`;
    }
    return `${id}["${label}"]${cls}`;
}

/** world_forge.json (+任意の worldState データ) から Mermaid graph TD を生成する。 */
export function generateWorldMap(
    forge: WorldForge,
    currentLocationId?: string,
    regionStates?: Record<string, RegionWorldState>,
    factionStates?: Record<string, FactionWorldState>,
    highlightRegionIds?: ReadonlySet<string>
): string {
    const lines: string[] = ['graph TD'];

    const locationsByRegion = new Map<string, WorldLocation[]>();
    const orphanLocations: WorldLocation[] = [];
    const renderedLocationIds = new Set<string>();

    for (const loc of forge.geography.locations) {
        if (loc.regionId) {
            const arr = locationsByRegion.get(loc.regionId) ?? [];
            if (arr.length < MAX_LOCS_PER_REGION) {
                arr.push(loc);
                renderedLocationIds.add(loc.id);
            }
            locationsByRegion.set(loc.regionId, arr);
        } else {
            if (orphanLocations.length < MAX_ORPHAN_LOCS) {
                orphanLocations.push(loc);
                renderedLocationIds.add(loc.id);
            }
        }
    }

    const subgraphStyleLines: string[] = [];

    for (const region of forge.geography.regions.slice(0, MAX_REGIONS)) {
        const locs = locationsByRegion.get(region.id) ?? [];
        // ライブ危険度があれば優先して表示
        const liveDanger = regionStates?.[region.id]?.dangerLevel;
        const dangerVal = liveDanger ?? region.dangerLevel;
        const dangerSuffix = dangerVal !== undefined ? ` 危険:${dangerVal}/10` : '';
        const fireTag = highlightRegionIds?.has(region.id) ? ' 🔥' : '';
        const biome = region.biome ?? inferRegionBiomeFromType(region.type);
        const biomeIcon = BIOME_ICON[biome] ?? '📍';
        const biomeClass = `biome_${biome}`;
        lines.push(`  subgraph ${escapeId(region.id)}["${biomeIcon} ${escapeMmdLabel(region.name)}${dangerSuffix}${fireTag}"]`);
        if (locs.length === 0) {
            lines.push(`    ${escapeId(region.id)}_empty[" "]:::phantom`);
        }
        for (const loc of locs) {
            const isCurrent = loc.id === currentLocationId;
            lines.push(`    ${buildLocationLabel(loc, forge, isCurrent, biomeClass)}`);
        }
        lines.push('  end');
        const subgraphStyle = BIOME_SUBGRAPH_STYLE[biome];
        if (subgraphStyle) {
            subgraphStyleLines.push(`  style ${escapeId(region.id)} ${subgraphStyle}`);
        }
    }

    for (const loc of orphanLocations) {
        const isCurrent = loc.id === currentLocationId;
        lines.push(`  ${buildLocationLabel(loc, forge, isCurrent)}`);
    }

    const renderedRegionIds = new Set(forge.geography.regions.slice(0, MAX_REGIONS).map((r) => r.id));
    for (const region of forge.geography.regions.slice(0, MAX_REGIONS)) {
        if (region.connectedTo) {
            for (const targetId of region.connectedTo) {
                if (renderedRegionIds.has(targetId)) {
                    lines.push(`  ${escapeId(region.id)} --> ${escapeId(targetId)}`);
                }
            }
        }
    }

    const renderedFactionIds = new Set<string>();
    for (const faction of forge.factions.slice(0, MAX_FACTIONS)) {
        const icon = FACTION_TYPE_ICON[faction.type] ?? '❓';
        const livePower = factionStates?.[faction.id]?.power;
        const displayPower = livePower ?? faction.power;
        const powerLabel = displayPower !== undefined ? ` ⚡${Math.round(displayPower)}` : '';
        const fId = `faction_${escapeId(faction.id)}`;
        lines.push(`  ${fId}(("${icon}${escapeMmdLabel(faction.name)}${powerLabel}")):::faction`);
        renderedFactionIds.add(faction.id);

        let factionLocEdges = 0;
        for (const loc of forge.geography.locations) {
            if (loc.factionControl !== faction.id || !renderedLocationIds.has(loc.id)) {
                continue;
            }
            if (factionLocEdges >= MAX_FACTION_LOC_EDGES) {
                break;
            }
            lines.push(`  ${fId} -.-> ${escapeId(loc.id)}`);
            factionLocEdges++;
        }

        if (faction.enemies) {
            for (const enemyId of faction.enemies) {
                if (renderedFactionIds.has(enemyId)) {
                    lines.push(`  ${fId} -.-x faction_${escapeId(enemyId)}`);
                }
            }
        }
    }

    // Subgraph background colors (emitted after edges so Mermaid picks them up)
    for (const s of subgraphStyleLines) {
        lines.push(s);
    }
    // Node classDefs for each biome
    for (const [biome, def] of Object.entries(BIOME_NODE_CLASSDEF)) {
        lines.push(`  classDef biome_${biome} ${def}`);
    }
    lines.push('  classDef faction fill:#2d2d2d,stroke:#888,color:#ddd,font-size:11px');
    lines.push('  classDef phantom fill:none,stroke:none');

    return lines.join('\n');
}
