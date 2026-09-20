import type { WorldForge } from './worldForgeCore';
import { buildCartographyLayoutSpec, buildCartographyPinPositions } from './cartographyLayoutCore';
export type WaterBand = 1 | 2 | 3;
export interface WaterPoint {
    x: number;
    y: number;
}
export interface WaterNode extends WaterPoint {
    id: string;
    regionId: string;
    kind: 'junction' | 'mouth' | 'lake' | 'sea';
}
export interface WaterEdge {
    id: string;
    from: string;
    to: string;
    points: WaterPoint[];
    kind: 'stream' | 'river' | 'major' | 'coastal' | 'ocean';
    width: WaterBand;
    depth: WaterBand;
    length: number;
}
export interface WaterCrossing extends WaterPoint {
    id: string;
    waterEdgeId: string;
    kind: 'bridge' | 'ferry';
    clearance: WaterBand;
    maxWidth: WaterBand;
    maxLoad: WaterBand;
    maxVehicleSize: number;
}
export interface WaterRoad {
    id: string;
    from: string;
    to: string;
    points: WaterPoint[];
    crossingIds: string[];
    length: number;
}
export interface Waterways {
    version: 1;
    seed: string;
    resolution: 128;
    nodes: WaterNode[];
    edges: WaterEdge[];
    crossings: WaterCrossing[];
    roads: WaterRoad[];
    ports: Record<string, string>;
    seaRows: string[];
}
export interface VesselProfile {
    width: WaterBand;
    draft: WaterBand;
    airDraft: WaterBand;
    seaworthiness: 0 | 1 | 2;
}
/** Stable priority queue: insertion order breaks equal-priority ties deterministically. */
export class WaterHeap {
    private a: {
        key: number;
        id: number;
    }[] = [];
    push(id: number, key: number): void { const v = { id, key }; let i = this.a.length; this.a.push(v); while (i) {
        const p = (i - 1) >> 1;
        if (this.a[p].key < key || this.a[p].key === key && this.a[p].id <= id)
            break;
        this.a[i] = this.a[p];
        i = p;
    } this.a[i] = v; }
    pop(): {
        key: number;
        id: number;
    } | undefined { const first = this.a[0], v = this.a.pop(); if (!this.a.length || !v)
        return first; let i = 0; while (i * 2 + 1 < this.a.length) {
        let c = i * 2 + 1;
        if (c + 1 < this.a.length && (this.a[c + 1].key < this.a[c].key || this.a[c + 1].key === this.a[c].key && this.a[c + 1].id < this.a[c].id))
            c++;
        if (this.a[c].key > v.key || this.a[c].key === v.key && this.a[c].id >= v.id)
            break;
        this.a[i] = this.a[c];
        i = c;
    } this.a[i] = v; return first; }
}
function seedNumber(s: string): number { let h = 2166136261; for (const c of s)
    h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
const distance = (a: WaterPoint, b: WaterPoint) => Math.hypot(a.x - b.x, a.y - b.y);
function intersection(a: WaterPoint, b: WaterPoint, c: WaterPoint, d: WaterPoint): WaterPoint | undefined {
    const x = b.x - a.x, y = b.y - a.y, u = d.x - c.x, v = d.y - c.y, den = x * v - y * u;
    if (Math.abs(den) < 1e-9)
        return;
    const t = ((c.x - a.x) * v - (c.y - a.y) * u) / den, s = ((c.x - a.x) * y - (c.y - a.y) * x) / den;
    if (t >= 0 && t <= 1 && s >= 0 && s <= 1)
        return { x: a.x + t * x, y: a.y + t * y };
}
/** Generation-time only: priority flood supplies an acyclic drainage forest. */
export function generateWaterways(forge: WorldForge): Waterways {
    const N = 128, total = N * N, seed = String(forge.meta.worldSeed || forge.meta.worldName), hash = seedNumber(seed);
    const spec = buildCartographyLayoutSpec(forge), h = new Float64Array(total), sea = new Uint8Array(total), owner = new Int16Array(total);
    const point = (i: number): WaterPoint => ({ x: (i % N) * 1000 / (N - 1), y: Math.floor(i / N) * 1000 / (N - 1) });
    const around = (i: number) => { const x = i % N, y = Math.floor(i / N), r: number[] = []; for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
            if ((dx || dy) && x + dx >= 0 && x + dx < N && y + dy >= 0 && y + dy < N)
                r.push(i + dy * N + dx); return r; };
    for (let i = 0; i < total; i++) {
        const p = point(i);
        let best = Infinity, oi = 0;
        spec.regions.forEach((r, j) => { const d = distance(p, r) / Math.max(1, r.radius); if (d < best) {
            best = d;
            oi = j;
        } });
        owner[i] = oi;
        const biome = spec.regions[oi]?.biome || 'plains', edge = Math.min(i % N, N - 1 - i % N, Math.floor(i / N), N - 1 - Math.floor(i / N));
        sea[i] = biome === 'sea' || biome === 'coast' && edge < 12 ? 1 : 0;
        const base = biome === 'mountain' || biome === 'volcanic' ? 80 : biome === 'coast' ? 5 : biome === 'snow' ? 45 : 25;
        const noise = ((Math.imul(i + 1, 374761393) ^ hash) >>> 0) / 4294967296;
        h[i] = sea[i] ? 0 : base + Math.sin((p.x + hash % 91) / 140) * 9 + Math.cos(p.y / 170) * 7 + noise * 3;
    }
    const parent = new Int32Array(total).fill(-1), seen = new Uint8Array(total), order: number[] = [], heap = new WaterHeap();
    for (let i = 0; i < total; i++)
        if (sea[i]) {
            seen[i] = 1;
            heap.push(i, h[i]);
        }
    let lake = -1;
    if (!seen.some(Boolean)) {
        lake = 0;
        for (let i = 1; i < total; i++)
            if (h[i] < h[lake])
                lake = i;
        seen[lake] = 1;
        heap.push(lake, h[lake]);
    }
    let item;
    while ((item = heap.pop())) {
        const i = item.id;
        order.push(i);
        for (const j of around(i))
            if (!seen[j]) {
                seen[j] = 1;
                parent[j] = i;
                h[j] = Math.max(h[j], h[i] + 0.000001);
                heap.push(j, h[j]);
            }
    }
    const accumulation = new Uint32Array(total).fill(1);
    for (let k = order.length - 1; k >= 0; k--) {
        const i = order[k];
        if (parent[i] >= 0)
            accumulation[parent[i]] += accumulation[i];
    }
    const selected = (i: number) => i >= 0 && !sea[i] && i !== lake && accumulation[i] >= 24;
    const incoming = new Uint8Array(total);
    for (let i = 0; i < total; i++)
        if (selected(i) && parent[i] >= 0)
            incoming[parent[i]]++;
    const nodes: WaterNode[] = [], edges: WaterEdge[] = [], nodeMap = new Map<number, string>();
    const node = (i: number) => { let id = nodeMap.get(i); if (!id) {
        id = 'water-' + i;
        nodeMap.set(i, id);
        nodes.push({ id, ...point(i), regionId: spec.regions[owner[i]]?.id || '', kind: sea[i] ? 'sea' : i === lake ? 'lake' : incoming[i] > 1 ? 'junction' : 'mouth' });
    } return id; };
    for (let i = 0; i < total; i++)
        if (selected(i) && incoming[i] !== 1) {
            let j = i;
            const points = [point(j)];
            do {
                j = parent[j];
                if (j < 0)
                    break;
                points.push(point(j));
            } while (selected(j) && incoming[j] === 1);
            if (j < 0 || points.length < 2)
                continue;
            const amount = accumulation[parent[i] >= 0 ? parent[i] : i], band: WaterBand = amount >= 512 ? 3 : amount >= 128 ? 2 : 1;
            edges.push({ id: 'river-' + i, from: node(i), to: node(j), points, kind: band === 3 ? 'major' : band === 2 ? 'river' : 'stream', width: band, depth: ((hash + i) % 7 === 0 ? 1 : band) as WaterBand, length: points.slice(1).reduce((n, p, k) => n + distance(p, points[k]), 0) });
        }
    // Sea cells carry both authoritative coverage and traversable connections, never land shortcuts.
    const seaDistance = new Int16Array(total).fill(999), queue: number[] = [];
    for (let i = 0; i < total; i++)
        if (!sea[i]) {
            seaDistance[i] = 0;
            queue.push(i);
        }
    for (let k = 0; k < queue.length; k++)
        for (const j of around(queue[k]))
            if (seaDistance[j] > seaDistance[queue[k]] + 1) {
                seaDistance[j] = seaDistance[queue[k]] + 1;
                queue.push(j);
            }
    for (let i = 0; i < total; i++)
        if (sea[i]) {
            node(i);
            for (const j of [i % N < N - 1 ? i + 1 : -1, i + N < total ? i + N : -1])
                if (j >= 0 && sea[j])
                    edges.push({ id: `sea-${i}-${j}`, from: node(i), to: node(j), points: [point(i), point(j)], kind: Math.max(seaDistance[i], seaDistance[j]) > 8 ? 'ocean' : 'coastal', width: 3, depth: 3, length: distance(point(i), point(j)) });
        }
    const pins = buildCartographyPinPositions(forge), ports: Record<string, string> = {};
    for (const pin of pins) {
        const loc = forge.geography.locations.find(l => l.id === pin.locationId)!;
        const p = { x: pin.leftPct * 10, y: pin.topPct * 10 };
        let nearest: WaterNode | undefined, best = Infinity;
        for (const n of nodes) {
            const d = distance(p, n);
            if (d < best) {
                best = d;
                nearest = n;
            }
        }
        if (nearest && (best < 75 || ((loc.services || []).some(s => /port|dock|harbor|船|港/.test(s)) && best < 150)))
            ports[loc.id] = nearest.id;
    }
    const roads: WaterRoad[] = [], crossings: WaterCrossing[] = [], pairs = new Set<string>();
    const addRoad = (from: string, to: string) => {
        if (from === to)
            return;
        const ids = [from, to].sort(), key = ids.join('|');
        if (pairs.has(key))
            return;
        pairs.add(key);
        const a = pins.find(p => p.locationId === ids[0]), b = pins.find(p => p.locationId === ids[1]);
        if (!a || !b)
            return;
        const points = [{ x: a.leftPct * 10, y: a.topPct * 10 }, { x: b.leftPct * 10, y: b.topPct * 10 }], road: WaterRoad = { id: 'road-' + roads.length, from: ids[0], to: ids[1], points, crossingIds: [], length: distance(points[0], points[1]) };
        // Do not invent a land road across sea. River intersections become explicit crossing records.
        for (let k = 0; k <= 100; k++) {
            const p = { x: points[0].x + (points[1].x - points[0].x) * k / 100, y: points[0].y + (points[1].y - points[0].y) * k / 100 };
            if (sea[Math.round(p.y / 1000 * (N - 1)) * N + Math.round(p.x / 1000 * (N - 1))])
                return;
        }
        for (const e of edges)
            if (!e.id.startsWith('sea-'))
                for (let k = 1; k < e.points.length; k++) {
                    const hit = intersection(points[0], points[1], e.points[k - 1], e.points[k]);
                    if (hit && !crossings.some(c => road.crossingIds.includes(c.id) && distance(c, hit) < 2)) {
                        const c: WaterCrossing = { id: `crossing-${crossings.length}`, waterEdgeId: e.id, ...hit, kind: e.width === 3 ? 'ferry' : 'bridge', clearance: e.width === 1 ? 2 : 3, maxWidth: 3, maxLoad: 3, maxVehicleSize: e.width === 3 ? 3 : 4 };
                        crossings.push(c);
                        road.crossingIds.push(c.id);
                    }
                }
        roads.push(road);
    };
    for (const r of spec.regions) {
        const ls = forge.geography.locations.filter(l => l.regionId === r.id);
        for (let i = 1; i < ls.length; i++)
            addRoad(ls[0].id, ls[i].id);
    }
    for (const e of spec.edges) {
        const a = forge.geography.locations.find(l => l.regionId === e.fromId), b = forge.geography.locations.find(l => l.regionId === e.toId);
        if (a && b)
            addRoad(a.id, b.id);
    }
    return { version: 1, seed, resolution: 128, nodes, edges, crossings, roads, ports, seaRows: Array.from({ length: N }, (_, y) => Array.from({ length: N }, (_, x) => sea[y * N + x] ? (seaDistance[y * N + x] > 8 ? '2' : '1') : '0').join('')) };
}
/** Persisted graph validation: malformed defined waterways fail closed, never disappear. */
export function parseWaterways(raw: unknown, validLocationIds?: ReadonlySet<string>, validRegionIds?: ReadonlySet<string>): Waterways | undefined {
    if (raw === undefined)
        return undefined;
    const w = raw as Waterways, plain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
    if (!plain(w) || w.version !== 1 || typeof w.seed !== 'string' || w.resolution !== 128 || !Array.isArray(w.nodes) || !Array.isArray(w.edges) || !Array.isArray(w.roads) || !Array.isArray(w.crossings) || w.nodes.length > 20000 || w.edges.length > 40000 || w.roads.length > 1000 || w.crossings.length > 10000)
        throw Error('Invalid waterways');
    const point = (p: unknown) => plain(p) && Number.isFinite(p.x) && Number.isFinite(p.y) && typeof p.x === 'number' && p.x >= 0 && p.x <= 1000 && typeof p.y === 'number' && p.y >= 0 && p.y <= 1000;
    const same = (a: WaterPoint, b: WaterPoint) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;
    const ids = new Set<string>();
    for (const n of w.nodes) {
        if (!plain(n) || typeof n.id !== 'string' || ids.has(n.id) || !point(n) || typeof n.regionId !== 'string' || !['junction', 'mouth', 'lake', 'sea'].includes(n.kind) || (validRegionIds && !validRegionIds.has(n.regionId)))
            throw Error('Invalid water node');
        ids.add(n.id);
    }
    const nodeById = new Map(w.nodes.map(n => [n.id, n]));
    const edgeIds = new Set<string>();
    for (const e of w.edges) {
        if (!plain(e) || typeof e.id !== 'string' || edgeIds.has(e.id) || e.from === e.to || !ids.has(e.from) || !ids.has(e.to) || !['stream', 'river', 'major', 'coastal', 'ocean'].includes(e.kind) || ![e.width, e.depth].every(v => [1, 2, 3].includes(v)) || !Number.isFinite(e.length) || e.length <= 0 || !Array.isArray(e.points) || e.points.length < 2 || e.points.length > 16384 || !e.points.every(point) || !same(e.points[0], nodeById.get(e.from)!) || !same(e.points[e.points.length - 1], nodeById.get(e.to)!))
            throw Error('Invalid water edge');
        edgeIds.add(e.id);
    }
    if (!plain(w.ports) || Object.entries(w.ports).some(([loc, id]) => typeof loc !== 'string' || typeof id !== 'string' || !ids.has(id) || (validLocationIds && !validLocationIds.has(loc))) || !Array.isArray(w.seaRows) || w.seaRows.length !== 128 || w.seaRows.some(r => typeof r !== 'string' || !/^[012]{128}$/.test(r)))
        throw Error('Invalid water ports/grid');
    const crossingIds = new Set<string>();
    for (const c of w.crossings)
        if (!plain(c) || typeof c.id !== 'string' || crossingIds.has(c.id) || !point(c) || !edgeIds.has(c.waterEdgeId) || !['bridge', 'ferry'].includes(c.kind) || ![c.clearance, c.maxWidth, c.maxLoad].every(v => [1, 2, 3].includes(v)) || !Number.isInteger(c.maxVehicleSize) || c.maxVehicleSize < 0 || c.maxVehicleSize > 5)
            throw Error('Invalid crossing');
        else
            crossingIds.add(c.id);
    const roadIds = new Set<string>();
    for (const r of w.roads)
        if (!plain(r) || typeof r.id !== 'string' || roadIds.has(r.id) || typeof r.from !== 'string' || typeof r.to !== 'string' || r.from === r.to || (validLocationIds ? (!validLocationIds.has(r.from) || !validLocationIds.has(r.to)) : false) || !Number.isFinite(r.length) || r.length <= 0 || !Array.isArray(r.crossingIds) || r.crossingIds.some(id => typeof id !== 'string' || !crossingIds.has(id)) || !Array.isArray(r.points) || r.points.length < 2 || !r.points.every(point))
            throw Error('Invalid road');
        else
            roadIds.add(r.id);
    // A directed river cycle is invalid; sea links are navigable both ways and excluded.
    const incoming = new Map<string, number>(), out = new Map<string, string[]>();
    for (const e of w.edges)
        if (!['coastal', 'ocean'].includes(e.kind)) {
            incoming.set(e.to, (incoming.get(e.to) || 0) + 1);
            out.set(e.from, [...(out.get(e.from) || []), e.to]);
        }
    const queue = w.nodes.filter(n => !incoming.get(n.id)).map(n => n.id);
    for (let i = 0; i < queue.length; i++)
        for (const to of out.get(queue[i]) || []) {
            incoming.set(to, incoming.get(to)! - 1);
            if (incoming.get(to) === 0)
                queue.push(to);
        }
    if ([...incoming.values()].some(v => v > 0))
        throw Error('Cyclic rivers');
    return w;
}
