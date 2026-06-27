import type { WorldForge, WorldLocation } from './worldForgeCore';
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

function buildLocationLabel(loc: WorldLocation, forge: WorldForge, isCurrentLocation: boolean): string {
    const icon = LOCATION_TYPE_ICON[loc.type] ?? '📍';
    let label = `${icon} ${escapeMmdLabel(loc.name)}`;
    if (loc.factionControl) {
        const fc = forge.factions.find((f) => f.id === loc.factionControl);
        if (fc) { label += `\\n${escapeMmdLabel(fc.name)}`; }
    }
    if (loc.population) { label += `\\npop.${loc.population}`; }
    const id = escapeId(loc.id);
    if (isCurrentLocation) {
        return `${id}["★ ${label}"]`;
    }
    return `${id}["${label}"]`;
}

/** world_forge.json (+任意の worldState データ) から Mermaid graph TD を生成する。 */
export function generateWorldMap(
    forge: WorldForge,
    currentLocationId?: string,
    regionStates?: Record<string, RegionWorldState>,
    factionStates?: Record<string, FactionWorldState>
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

    for (const region of forge.geography.regions.slice(0, MAX_REGIONS)) {
        const locs = locationsByRegion.get(region.id) ?? [];
        // ライブ危険度があれば優先して表示
        const liveDanger = regionStates?.[region.id]?.dangerLevel;
        const dangerVal = liveDanger ?? region.dangerLevel;
        const dangerSuffix = dangerVal !== undefined ? ` 危険:${dangerVal}/10` : '';
        lines.push(`  subgraph ${escapeId(region.id)}["${escapeMmdLabel(region.name)}${dangerSuffix}"]`);
        if (locs.length === 0) {
            lines.push(`    ${escapeId(region.id)}_empty[" "]:::phantom`);
        }
        for (const loc of locs) {
            const isCurrent = loc.id === currentLocationId;
            lines.push(`    ${buildLocationLabel(loc, forge, isCurrent)}`);
        }
        lines.push('  end');
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

    lines.push('  classDef faction fill:#2d2d2d,stroke:#888,color:#ddd,font-size:11px');
    lines.push('  classDef phantom fill:none,stroke:none');

    return lines.join('\n');
}
