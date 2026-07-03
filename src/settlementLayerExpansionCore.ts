// Settlement Mode M4a: bounded in-memory expand_layer (pure, no fs/vscode/DOM).

import {
    MAX_LAYOUT_LAYERS,
    MAX_LAYOUT_MARKERS,
    MAX_LAYOUT_ZONES,
    SETTLEMENT_LAYOUT_VERSION,
    VALID_SETTLEMENT_LAYER_IDS,
    type ExpandLayerOp,
    type SettlementLayerExpansionProfile,
    type SettlementLayerId,
    type SettlementLayoutV1,
    type SettlementMarker,
    type SettlementStateV1,
    type SettlementZone,
} from './settlementCore';
import { hashStringToSeed } from './tileOvermapCore';

export const MAX_EXPANSION_ZONES_PER_OP = 4;
export const MAX_EXPANSION_MARKERS_PER_OP = 4;
export const MAX_EXPANSION_WARNINGS = 16;

export const LAYOUT_V1_KEYS = ['version', 'settlementId', 'layers', 'zones', 'markers'] as const;

export interface SettlementLayoutExpansionContext {
    worldTurn?: number;
    seed?: number;
}

export interface SettlementLayoutExpansionResult {
    layout: SettlementLayoutV1;
    applied: boolean;
    warnings: string[];
}

const LAYER_ORDER: readonly SettlementLayerId[] = VALID_SETTLEMENT_LAYER_IDS;

const PROFILE_DEFAULT_LAYER: Partial<Record<SettlementLayerExpansionProfile, SettlementLayerId>> = {
    cellar: 'z-1',
    waterworks: 'z-1',
    shelter: 'z-1',
    ruins: 'z-2',
    roof: 'z1',
    watchtower: 'z1',
    generic: 'z0',
};

interface ProfileTemplateEntry {
    zones: Array<{ idSuffix: string; label: string }>;
    markers: Array<{ idSuffix: string; label: string }>;
}

const PROFILE_TEMPLATES: Record<SettlementLayerExpansionProfile, ProfileTemplateEntry> = {
    cellar: {
        zones: [{ idSuffix: 'storage', label: 'Storage cellar' }],
        markers: [
            { idSuffix: 'shelter_access', label: 'Shelter access' },
            { idSuffix: 'stair_access', label: 'Stair access' },
        ],
    },
    waterworks: {
        zones: [{ idSuffix: 'water_channel', label: 'Water channel' }],
        markers: [
            { idSuffix: 'pump', label: 'Pump station' },
            { idSuffix: 'sluice', label: 'Sluice gate' },
        ],
    },
    shelter: {
        zones: [{ idSuffix: 'shelter_quarters', label: 'Shelter quarters' }],
        markers: [
            { idSuffix: 'clinic_post', label: 'Clinic post' },
            { idSuffix: 'stockpile', label: 'Emergency stockpile' },
        ],
    },
    ruins: {
        zones: [{ idSuffix: 'ruined_hall', label: 'Ruined hall' }],
        markers: [
            { idSuffix: 'hazard', label: 'Hazard zone' },
            { idSuffix: 'unknown_find', label: 'Unknown find' },
        ],
    },
    roof: {
        zones: [{ idSuffix: 'upper_walkway', label: 'Upper walkway' }],
        markers: [
            { idSuffix: 'signal_post', label: 'Signal post' },
            { idSuffix: 'lookout', label: 'Lookout point' },
        ],
    },
    watchtower: {
        zones: [{ idSuffix: 'watch_platform', label: 'Watch platform' }],
        markers: [{ idSuffix: 'guard_post', label: 'Guard post' }],
    },
    generic: {
        zones: [{ idSuffix: 'access_zone', label: 'Access zone' }],
        markers: [{ idSuffix: 'access_point', label: 'Access point' }],
    },
};

function cloneLayout(layout: SettlementLayoutV1): SettlementLayoutV1 {
    return {
        version: layout.version,
        settlementId: layout.settlementId,
        layers: [...layout.layers],
        zones: layout.zones.map((z) => ({ ...z })),
        markers: layout.markers.map((m) => ({ ...m })),
    };
}

function clampCoord(seed: number, slot: number): { x: number; y: number } {
    const h = hashStringToSeed(`${seed}:coord:${slot}`);
    return {
        x: 2 + (h % 12),
        y: 2 + (Math.floor(h / 12) % 12),
    };
}

function sortLayers(layers: SettlementLayerId[]): SettlementLayerId[] {
    const set = new Set(layers);
    return LAYER_ORDER.filter((id) => set.has(id));
}

export function resolveExpansionProfile(op: ExpandLayerOp): SettlementLayerExpansionProfile {
    return op.profile ?? 'generic';
}

export function deriveExpansionSeed(
    state: SettlementStateV1,
    op: ExpandLayerOp,
    context: SettlementLayoutExpansionContext
): number {
    if (typeof op.seed === 'number' && Number.isFinite(op.seed)) {
        return op.seed >>> 0;
    }
    if (typeof context.seed === 'number' && Number.isFinite(context.seed)) {
        return context.seed >>> 0;
    }
    const profile = resolveExpansionProfile(op);
    return hashStringToSeed(`${state.settlementId}:${op.layerId}:${profile}`);
}

export function createMinimalLayoutShell(state: SettlementStateV1): SettlementLayoutV1 {
    return {
        version: SETTLEMENT_LAYOUT_VERSION,
        settlementId: state.settlementId,
        layers: ['z0'],
        zones: [],
        markers: [],
    };
}

export function isValidExpandLayerId(layerId: string): layerId is SettlementLayerId {
    return (VALID_SETTLEMENT_LAYER_IDS as readonly string[]).includes(layerId);
}

function buildProfileZones(
    layerId: SettlementLayerId,
    profile: SettlementLayerExpansionProfile,
    seed: number,
    existingIds: ReadonlySet<string>
): SettlementZone[] {
    const template = PROFILE_TEMPLATES[profile];
    const zones: SettlementZone[] = [];
    for (let i = 0; i < template.zones.length && zones.length < MAX_EXPANSION_ZONES_PER_OP; i++) {
        const entry = template.zones[i];
        const baseId = `exp_${layerId}_${profile}_${entry.idSuffix}`;
        let id = baseId;
        let suffix = 0;
        while (existingIds.has(id) || zones.some((z) => z.id === id)) {
            suffix += 1;
            id = `${baseId}_${suffix}`;
        }
        const coords = clampCoord(seed, i);
        zones.push({
            id,
            layerId,
            label: entry.label,
            x: coords.x,
            y: coords.y,
        });
    }
    return zones;
}

function buildProfileMarkers(
    layerId: SettlementLayerId,
    profile: SettlementLayerExpansionProfile,
    seed: number,
    state: SettlementStateV1,
    existingIds: ReadonlySet<string>
): SettlementMarker[] {
    const template = PROFILE_TEMPLATES[profile];
    const markers: SettlementMarker[] = [];
    let slot = MAX_EXPANSION_ZONES_PER_OP;

    const addMarker = (idSuffix: string, label: string) => {
        if (markers.length >= MAX_EXPANSION_MARKERS_PER_OP) { return; }
        const baseId = `exp_${layerId}_${profile}_${idSuffix}`;
        let id = baseId;
        let suffix = 0;
        while (existingIds.has(id) || markers.some((m) => m.id === id)) {
            suffix += 1;
            id = `${baseId}_${suffix}`;
        }
        const coords = clampCoord(seed, slot);
        slot += 1;
        markers.push({ id, layerId, label, x: coords.x, y: coords.y });
    };

    for (const entry of template.markers) {
        addMarker(entry.idSuffix, entry.label);
    }

    if (profile === 'waterworks' && (state.safety ?? 100) < 40) {
        addMarker('hazard', 'Water hazard');
    }

    return markers;
}

export function pickLayoutV1Keys(layout: SettlementLayoutV1): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of LAYOUT_V1_KEYS) {
        if (Object.prototype.hasOwnProperty.call(layout, key)) {
            out[key] = layout[key as keyof SettlementLayoutV1];
        }
    }
    return out;
}

export function applyExpandLayerToLayout(
    layout: SettlementLayoutV1 | undefined,
    state: SettlementStateV1,
    op: ExpandLayerOp,
    context: SettlementLayoutExpansionContext = {}
): SettlementLayoutExpansionResult {
    const warnings: string[] = [];

    if (!isValidExpandLayerId(op.layerId)) {
        const base = layout && layout.settlementId === state.settlementId
            ? cloneLayout(layout)
            : createMinimalLayoutShell(state);
        return {
            layout: base,
            applied: false,
            warnings: ['invalid_layer_id'],
        };
    }

    let working = layout && layout.settlementId === state.settlementId
        ? cloneLayout(layout)
        : undefined;

    if (layout && layout.settlementId !== state.settlementId) {
        warnings.push('layout_settlement_mismatch');
    }
    if (!working) {
        working = createMinimalLayoutShell(state);
        if (!layout) {
            warnings.push('layout_shell_created');
        }
    }

    const layerId = op.layerId;
    if (working.layers.includes(layerId)) {
        return {
            layout: working,
            applied: false,
            warnings: [...warnings, 'layer_already_exists'].slice(0, MAX_EXPANSION_WARNINGS),
        };
    }

    if (working.layers.length >= MAX_LAYOUT_LAYERS) {
        return {
            layout: working,
            applied: false,
            warnings: [...warnings, 'layer_cap_reached'].slice(0, MAX_EXPANSION_WARNINGS),
        };
    }

    const profile = resolveExpansionProfile(op);
    const profileDefault = PROFILE_DEFAULT_LAYER[profile];
    if (profileDefault && profileDefault !== layerId) {
        warnings.push('profile_layer_mismatch');
    }

    const seed = deriveExpansionSeed(state, op, context);
    const existingZoneIds = new Set(working.zones.map((z) => z.id));
    const existingMarkerIds = new Set(working.markers.map((m) => m.id));

    const newZones = buildProfileZones(layerId, profile, seed, existingZoneIds);
    const newMarkers = buildProfileMarkers(layerId, profile, seed, state, existingMarkerIds);

    const zonesBefore = working.zones.length;
    const markersBefore = working.markers.length;
    working.zones = [...working.zones, ...newZones].slice(0, MAX_LAYOUT_ZONES);
    working.markers = [...working.markers, ...newMarkers].slice(0, MAX_LAYOUT_MARKERS);
    working.layers = sortLayers([...working.layers, layerId]);

    if (working.zones.length < zonesBefore + newZones.length) {
        warnings.push('zone_cap_reached');
    }
    if (working.markers.length < markersBefore + newMarkers.length) {
        warnings.push('marker_cap_reached');
    }

    return {
        layout: working,
        applied: true,
        warnings: warnings.slice(0, MAX_EXPANSION_WARNINGS),
    };
}