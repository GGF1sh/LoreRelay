// F4 Travel Encounter: deterministic travel events from worldSeed + route + hazard (no vscode/fs).

import type { Region, RegionHazard } from './worldForgeCore';
import { hashStringToSeed } from './tileOvermapCore';

export type EncounterDensity = 'low' | 'medium' | 'high';
export type EncounterSeverity = 'flavor' | 'notable';

export const MAX_TRAVEL_ENCOUNTER_LINES = 5;
export const MAX_REGION_PATH_HOPS = 24;

export interface EncounterSeed {
    worldSeed: string;
    fromRegionId: string;
    toRegionId: string;
    dayIndex: number;
    regionId: string;
}

export interface TravelEncounter {
    day: number;
    regionId: string;
    regionName?: string;
    hazard?: RegionHazard;
    severity: EncounterSeverity;
    text: string;
    templateId: string;
}

export interface TravelRouteInput {
    worldSeed: string;
    regions: Region[];
    fromRegionId: string;
    toRegionId: string;
    travelDays: number;
    density?: EncounterDensity;
    regionNames?: Record<string, string>;
}

const DENSITY_RATES: Record<EncounterDensity, { flavor: number; notable: number }> = {
    low: { flavor: 0.22, notable: 0.08 },
    medium: { flavor: 0.32, notable: 0.16 },
    high: { flavor: 0.42, notable: 0.24 }
};

type HazardEncounterTable = Record<
    RegionHazard,
    { flavor: string[]; notable: string[] }
>;

const HAZARD_ENCOUNTER_TABLE: HazardEncounterTable = {
    radiation: {
        flavor: ['Low static crackles on worn dosimeters as you cross {region}.'],
        notable: ['A radiation spike near {region} forces a cautious, costly detour.']
    },
    toxic: {
        flavor: ['Acid rain patters on cloaks while skirting the margins of {region}.'],
        notable: ['Toxic fumes rise from {region}; the party masks up and loses half a day.']
    },
    infested: {
        flavor: ['Distant skittering follows the caravan along the edge of {region}.'],
        notable: ['Swarm signs block the main road through {region}; you cut a rough bypass.']
    },
    quarantine: {
        flavor: ['Checkpoint fires burn outside {region}; papers are checked in silence.'],
        notable: ['Quarantine militia turns the party back from {region} until a bribe clears the way.']
    },
    anomaly: {
        flavor: ['Clocks drift and compasses twitch while passing {region}.'],
        notable: ['A reality shear near {region} leaves gear humming and nerves frayed.']
    },
    haunted: {
        flavor: ['Mist and old prayers cling to the trail through {region}.'],
        notable: ['Unquiet dead harass the night camp on the border of {region}.']
    },
    storm: {
        flavor: ['Gale winds scour the route near {region} but pass without injury.'],
        notable: ['A sudden storm over {region} scatters supplies and delays the march.']
    },
    corrupted: {
        flavor: ['Warped flora and ash-colored soil mark the approach to {region}.'],
        notable: ['Corruption surges along the path through {region}; something watches from the blight.']
    }
};

const GENERIC_ENCOUNTER_TABLE = {
    flavor: [
        'The road through {region} is long but uneventful.',
        'Travelers trade rumors at a wayside fire near {region}.'
    ],
    notable: [
        'A broken bridge near {region} costs extra time and careful footing.',
        'Refugees warn of trouble ahead as you leave the outskirts of {region}.'
    ]
};

function deterministicUnitFloat(key: string): number {
    return hashStringToSeed(key) / 4294967295;
}

function buildEncounterKey(seed: EncounterSeed, suffix: string, density: EncounterDensity): string {
    return [
        seed.worldSeed,
        'travel',
        density,
        seed.fromRegionId,
        seed.toRegionId,
        `day${seed.dayIndex}`,
        seed.regionId,
        suffix
    ].join('|');
}

function regionLabel(regionId: string, regionNames?: Record<string, string>, regionsById?: Map<string, Region>): string {
    return regionNames?.[regionId]
        ?? regionsById?.get(regionId)?.name
        ?? regionId;
}

function pickTemplate(
    hazard: RegionHazard | undefined,
    severity: EncounterSeverity,
    regionLabelText: string,
    variantIndex: number
): { text: string; templateId: string } {
    const table = hazard ? HAZARD_ENCOUNTER_TABLE[hazard] : GENERIC_ENCOUNTER_TABLE;
    const pool = table[severity];
    const template = pool[variantIndex % pool.length];
    const text = template.replace(/\{region\}/g, regionLabelText);
    const prefix = hazard ?? 'generic';
    return {
        text,
        templateId: `${prefix}.${severity}.${variantIndex % pool.length}`
    };
}

/** BFS shortest path over region.connectedTo (undirected). */
export function findRegionPath(
    regions: Region[],
    fromRegionId: string,
    toRegionId: string,
    maxHops: number = MAX_REGION_PATH_HOPS
): string[] | undefined {
    if (!fromRegionId || !toRegionId) { return undefined; }
    if (fromRegionId === toRegionId) { return [fromRegionId]; }

    const byId = new Map(regions.map((r) => [r.id, r]));
    if (!byId.has(fromRegionId) || !byId.has(toRegionId)) { return undefined; }

    const adj = new Map<string, Set<string>>();
    for (const region of regions) {
        if (!adj.has(region.id)) { adj.set(region.id, new Set()); }
        for (const target of region.connectedTo ?? []) {
            if (!byId.has(target)) { continue; }
            adj.get(region.id)!.add(target);
            if (!adj.has(target)) { adj.set(target, new Set()); }
            adj.get(target)!.add(region.id);
        }
    }

    const queue: string[] = [fromRegionId];
    const prev = new Map<string, string | null>([[fromRegionId, null]]);
    let hops = 0;
    while (queue.length > 0 && hops <= maxHops) {
        const levelSize = queue.length;
        for (let i = 0; i < levelSize; i++) {
            const cur = queue.shift()!;
            if (cur === toRegionId) {
                const path: string[] = [];
                let node: string | null = toRegionId;
                while (node) {
                    path.unshift(node);
                    node = prev.get(node) ?? null;
                }
                return path;
            }
            for (const next of adj.get(cur) ?? []) {
                if (prev.has(next)) { continue; }
                prev.set(next, cur);
                queue.push(next);
            }
        }
        hops++;
    }
    return undefined;
}

/** Map travel day (1-based) to a region along the path. */
export function regionIdForTravelDay(path: string[], dayIndex: number, totalDays: number): string {
    if (path.length === 0) { return ''; }
    if (path.length === 1 || totalDays <= 1) { return path[0]; }
    const t = (dayIndex - 1) / Math.max(1, totalDays - 1);
    const idx = Math.min(path.length - 1, Math.round(t * (path.length - 1)));
    return path[idx];
}

export function rollTravelEncounters(input: TravelRouteInput): TravelEncounter[] {
    const days = Math.max(1, Math.min(100, Math.floor(input.travelDays)));
    const density = input.density ?? 'medium';
    const rates = DENSITY_RATES[density] ?? DENSITY_RATES.medium;
    const path = findRegionPath(input.regions, input.fromRegionId, input.toRegionId);
    if (!path?.length) { return []; }

    const regionsById = new Map(input.regions.map((r) => [r.id, r]));
    const encounters: TravelEncounter[] = [];

    for (let day = 1; day <= days; day++) {
        const regionId = regionIdForTravelDay(path, day, days);
        const seed: EncounterSeed = {
            worldSeed: input.worldSeed,
            fromRegionId: input.fromRegionId,
            toRegionId: input.toRegionId,
            dayIndex: day,
            regionId
        };
        const roll = deterministicUnitFloat(buildEncounterKey(seed, 'roll', density));
        let severity: EncounterSeverity | undefined;
        if (roll < rates.notable) {
            severity = 'notable';
        } else if (roll < rates.notable + rates.flavor) {
            severity = 'flavor';
        } else {
            continue;
        }

        const variant = Math.floor(deterministicUnitFloat(buildEncounterKey(seed, 'variant', density)) * 1000);
        const label = regionLabel(regionId, input.regionNames, regionsById);
        const hazard = regionsById.get(regionId)?.hazard;
        const picked = pickTemplate(hazard, severity, label, variant);
        encounters.push({
            day,
            regionId,
            regionName: label,
            hazard,
            severity,
            text: picked.text,
            templateId: picked.templateId
        });
    }

    return encounters;
}

export function buildTravelEncounterPromptLines(
    encounters: TravelEncounter[],
    maxLines: number = MAX_TRAVEL_ENCOUNTER_LINES,
    formatLine?: (enc: TravelEncounter) => string
): string {
    if (!encounters.length) { return ''; }
    const cap = Math.max(1, Math.min(MAX_TRAVEL_ENCOUNTER_LINES, Math.floor(maxLines)));
    const lines = [`[Travel — Encounters]`];
    for (const enc of encounters.slice(0, cap)) {
        const body = (formatLine ? formatLine(enc) : enc.text).trim();
        if (!body) { continue; }
        lines.push(`Day ${enc.day}: ${body}`);
    }
    if (lines.length <= 1) { return ''; }
    lines.push('(Weave these beats into travel narration; do not invent contradictory events.)');
    return lines.join('\n');
}