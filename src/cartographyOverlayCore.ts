import { createHash } from 'crypto';
import type { WorldForge } from './worldForgeCore';
import type { CartographyPinPosition, CartographyRegionLabel, CartographyRouteEdge } from './cartographyLayoutCore';

export interface CartographyOverlay {
    pins: Record<string, { leftPct: number; topPct: number }>;
    regions: Record<string, { leftPct: number; topPct: number }>;
    showLabels: boolean;
    showRoutes: boolean;
}

export function cartographyWorldKey(forge: WorldForge): string {
    return createHash('sha256').update(JSON.stringify([forge.meta.worldSeed, forge.meta.generatedAt,
        forge.geography.regions.map(r => [r.id, r.x, r.y, r.connectedTo]),
        forge.geography.locations.map(l => [l.id, l.regionId])])).digest('hex');
}

export function validateCartographyOverlay(raw: unknown, forge: WorldForge): CartographyOverlay {
    const obj = raw as CartographyOverlay;
    if (!obj || typeof obj !== 'object' || typeof obj.showLabels !== 'boolean' || typeof obj.showRoutes !== 'boolean') {
        throw new Error('Invalid map overlay');
    }
    const read = (value: unknown, ids: Set<string>) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid map positions');
        const result: CartographyOverlay['pins'] = Object.create(null);
        if (Object.keys(value).length > ids.size) throw new Error('Too many map positions');
        for (const [id, point] of Object.entries(value)) {
            if (!ids.has(id) || !point || typeof point !== 'object'
                || !Number.isFinite(point.leftPct) || !Number.isFinite(point.topPct)
                || point.leftPct < 0 || point.leftPct > 100 || point.topPct < 0 || point.topPct > 100) {
                throw new Error('Invalid map position');
            }
            result[id] = { leftPct: point.leftPct, topPct: point.topPct };
        }
        return result;
    };
    return { pins: read(obj.pins, new Set(forge.geography.locations.map(l => l.id))),
        regions: read(obj.regions, new Set(forge.geography.regions.map(r => r.id))),
        showLabels: obj.showLabels, showRoutes: obj.showRoutes };
}

export function applyCartographyOverlay(pins: CartographyPinPosition[], labels: CartographyRegionLabel[],
    edges: CartographyRouteEdge[], overlay: CartographyOverlay) {
    return {
        pins: pins.map(p => ({ ...p, ...overlay.pins[p.locationId] })),
        labels: labels.map(r => ({ ...r, ...overlay.regions[r.regionId] })),
        edges: edges.map(e => {
            const a = overlay.regions[e.fromRegionId], b = overlay.regions[e.toRegionId];
            return { ...e, ...(a ? { x1Pct: a.leftPct, y1Pct: a.topPct } : {}),
                ...(b ? { x2Pct: b.leftPct, y2Pct: b.topPct } : {}) };
        }),
    };
}
