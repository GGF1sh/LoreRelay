import type { WorldForge } from './worldForgeCore';
import { canVehicleAccessLocation, type VehicleEntry } from './vehicleCore';
import { WaterHeap, type WaterEdge, type WaterRoad, type WaterPoint } from './waterwayCore';

export interface NavigationRoute {
    status: 'blocked' | 'risky' | 'safe';
    reasons: string[];
    edgeIds: string[];
    points: WaterPoint[][];
    distance: number;
    damage: number;
    hpBefore?: number;
    hpAfter?: number;
}
export interface NavigationEvaluation { preferred: NavigationRoute; shortcut?: NavigationRoute }
const sizeOrder = ['tiny', 'small', 'medium', 'large', 'huge', 'colossal'];
const rangeDistance: Record<string, number> = { local: 250, regional: 750, long: 2000, very_long: Infinity };
const blocked = (...reasons: string[]): NavigationRoute => ({ status: 'blocked', reasons, edgeIds: [], points: [], distance: 0, damage: 0 });

/** All movement modes use the stored graph; a ferry crossing never silently boards a boat. */
export function evaluateNavigation(forge: WorldForge, origin: string, destination: string, vehicle?: VehicleEntry): NavigationEvaluation {
    const w = forge.geography.waterways;
    const dest = forge.geography.locations.find(l => l.id === destination);
    const fail = (reason: string): NavigationEvaluation => ({ preferred: blocked(reason) });
    if (!w || !origin || origin === destination || !dest || !forge.geography.locations.some(l => l.id === origin)) return fail('無効な出発地・目的地・水系です。');
    const boat = !!vehicle && (['boat', 'ship'].includes(vehicle.kind) || !!vehicle.waterProfile);
    if (vehicle) {
        if (vehicle.carriedByVehicleId || ['disabled', 'lost'].includes(vehicle.status) || vehicle.durability.condition === 'disabled' || vehicle.durability.hp <= 0) return fail('この車両は航行・移動できません。');
        if (!boat && ['airship', 'shuttle'].includes(vehicle.kind)) return fail('この画面は水上・陸上経路用です。航空・宇宙航路は今回の対象外です。');
        if ((vehicle.locationId || vehicle.parkedAt?.locationId) !== origin) return fail('車両が出発地にありません。');
        const access = canVehicleAccessLocation(vehicle, dest.vehicleAccess);
        if (!access.allowed) return fail('目的地への車両アクセス不可: ' + access.reason);
        if (boat && !vehicle.waterProfile) return fail('航行性能未設定。船幅・喫水・船高・耐航区分を設定してください。');
    }
    const start = boat ? w.ports[origin] : origin, end = boat ? w.ports[destination] : destination;
    if (!start || !end) return fail('出発地または目的地に水系への接続点がありません。');
    const edges: (WaterEdge | WaterRoad)[] = boat ? w.edges : w.roads;
    const adjacency = new Map<string, { edge: WaterEdge | WaterRoad; to: string; hazard: boolean }[]>();
    const barriers = new Set<string>();
    const crossingsByEdge = new Map<string, typeof w.crossings>();
    const crossingsById = new Map(w.crossings.map(c => [c.id, c]));
    for (const c of w.crossings) crossingsByEdge.set(c.waterEdgeId, [...(crossingsByEdge.get(c.waterEdgeId) || []), c]);
    for (const edge of [...edges].sort((a, b) => a.id.localeCompare(b.id, 'en'))) {
        let reason = '', hazard = false;
        if (boat) {
            const e = edge as WaterEdge, p = vehicle!.waterProfile!;
            if (p.width > e.width) reason = '川幅不足';
            else if (p.draft > e.depth) reason = '水深不足';
            else if ((crossingsByEdge.get(e.id) || []).some(c => c.kind === 'bridge' && p.airDraft > c.clearance)) reason = '橋の桁下高不足';
            const severity = (e.kind === 'ocean' ? 2 : e.kind === 'coastal' ? 1 : 0) - p.seaworthiness;
            if (severity > 1) reason = '耐航性が2段階不足';
            hazard = severity === 1;
        } else {
            for (const id of (edge as WaterRoad).crossingIds) {
                const c = crossingsById.get(id);
                if (!c) { reason = '渡河地点が無効'; break; }
                if (!vehicle) continue;
                if (c.kind === 'ferry' && sizeOrder.indexOf(vehicle.access.sizeClass) > c.maxVehicleSize) reason = '渡し船の車両サイズ制限';
                if (c.kind === 'bridge') {
                    const p = vehicle.crossingProfile;
                    if (!p) reason = '橋の通行性能（幅・荷重）未設定';
                    else if (p.width > c.maxWidth || p.load > c.maxLoad) reason = '橋の幅・荷重制限';
                }
            }
        }
        if (reason) { barriers.add(`${edge.id}: ${reason}`); continue; }
        for (const [a, b] of [[edge.from, edge.to], [edge.to, edge.from]]) adjacency.set(a, [...(adjacency.get(a) || []), { edge, to: b, hazard }]);
    }
    const limit = vehicle ? rangeDistance[vehicle.mobility.rangeBand] ?? 0 : Infinity;
    const unitDamage = vehicle ? Math.ceil(vehicle.durability.maxHp * .05) : 0;
    const maxHp = vehicle?.durability.hp ?? Infinity;
    type Label = { node: string; hazard: boolean; damage: number; distance: number; prev?: number; edge?: WaterEdge | WaterRoad; dead?: boolean };
    const labels: Label[] = [{ node: start, hazard: false, damage: 0, distance: 0 }];
    const frontiers = new Map<string, number[]>([[start + '|0', [0]]]);
    const heap = new WaterHeap(); heap.push(0, 0);
    const arrivals: number[] = [];
    let item;
    // Retain non-dominated damage/distance labels: a safe detour may exceed range while a shorter risky route fits.
    while ((item = heap.pop())) {
        const current = labels[item.id];
        if (current.dead) continue;
        if (current.node === end) { arrivals.push(item.id); continue; }
        for (const step of adjacency.get(current.node) || []) {
            const distance = current.distance + step.edge.length;
            // Raster sea links form one continuous hazardous stretch. Subdivision must not multiply damage.
            const damage = current.damage + (step.hazard && !current.hazard ? unitDamage : 0);
            if (distance > limit || damage >= maxHp) continue;
            const key = step.to + '|' + Number(step.hazard), existing = frontiers.get(key) || [];
            if (existing.some(i => !labels[i].dead && labels[i].damage <= damage && labels[i].distance <= distance)) continue;
            for (const i of existing) if (labels[i].damage >= damage && labels[i].distance >= distance) labels[i].dead = true;
            const id = labels.length;
            labels.push({ node: step.to, hazard: step.hazard, damage, distance, prev: item.id, edge: step.edge });
            frontiers.set(key, [...existing.filter(i => !labels[i].dead), id]); heap.push(id, distance);
        }
    }
    const candidates = arrivals.filter(i => !labels[i].dead);
    if (!candidates.length) return { preferred: blocked('通れる経路がありません（接続・航続範囲・予告損傷を確認）。', ...[...barriers].slice(0, 8)) };
    const route = (i: number): NavigationRoute => {
        const last = labels[i], path: (WaterEdge | WaterRoad)[] = [];
        while (labels[i].prev !== undefined) { path.unshift(labels[i].edge!); i = labels[i].prev!; }
        return { status: last.damage ? 'risky' : 'safe', reasons: last.damage ? ['耐航性不足の連続海域を通ります。予告損傷への確認が必要です。'] : [], edgeIds: path.map(e => e.id), points: path.map(e => e.points), distance: last.distance, damage: last.damage,
            ...(vehicle ? { hpBefore: vehicle.durability.hp, hpAfter: vehicle.durability.hp - last.damage } : {}) };
    };
    candidates.sort((a, b) => labels[a].damage - labels[b].damage || labels[a].distance - labels[b].distance || a - b);
    const preferred = route(candidates[0]);
    candidates.sort((a, b) => labels[a].distance - labels[b].distance || labels[a].damage - labels[b].damage || a - b);
    const shortest = route(candidates[0]);
    return { preferred, ...(shortest.distance < preferred.distance && shortest.damage > preferred.damage ? { shortcut: shortest } : {}) };
}
