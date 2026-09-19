import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { parseWorldForge, type WorldForge } from './worldForgeCore';
import { parseVehicleStateDocument, projectVehicleStateDocumentMechanical, rebuildVehicleStateDocumentWithMechanical } from './vehicleStateDocumentCore';
import { evaluateNavigation, type NavigationRoute } from './waterNavigationCore';
import { applyVehicleOps } from './vehicleOpsCore';
import { commitWaterNavigation, navigationDigest, navigationReceiptExists, recoverWaterNavigation, type NavigationWrite } from './waterNavigationStore';
import { buildCartographyLayoutSpec, buildCartographyPinPositions } from './cartographyLayoutCore';
import { applyFogOnLocationVisit, buildFogPayload, normalizeFogWorldState } from './fogOfWarCore';
import { resolveGameStatePersistPlan } from './stateManagerCore';
import { mergeGameStateForPersist } from './workspaceStateQueueCore';
import type { GameStateWorld } from './types/GameState';
import type { WaterPoint } from './waterwayCore';

interface Quote { root: string; digest: string; destination: string; vehicleId?: string; shortcut: boolean; expires: number; route: NavigationRoute }
const quotes = new Map<string, Quote>();
function snapshot(root: string) {
    recoverWaterNavigation(root);
    const forgeText = fs.readFileSync(path.join(root, 'world_forge.json'), 'utf8');
    const gameText = fs.readFileSync(path.join(root, 'game_state.json'), 'utf8');
    const fleetPath = path.join(root, 'vehicle_state.json');
    const fleetText = fs.existsSync(fleetPath) ? fs.readFileSync(fleetPath, 'utf8') : '';
    const forge = parseWorldForge(JSON.parse(forgeText));
    if (!forge?.geography.waterways) throw Error('この世界には保存された水系がありません。');
    const game = JSON.parse(gameText) as Record<string, unknown>;
    const world = game.world as GameStateWorld | undefined;
    const origin = world?.currentLocationId;
    if (!origin) throw Error('現在地がありません。');
    const fleetDocument = fleetText ? parseVehicleStateDocument(JSON.parse(fleetText)) : undefined;
    if (fleetDocument && fleetDocument.kind !== 'valid_v1' && fleetDocument.kind !== 'valid_v2') throw Error('車両情報を読めません。');
    const document = fleetDocument && 'document' in fleetDocument ? fleetDocument.document : undefined;
    const fleet = document ? projectVehicleStateDocumentMechanical(document) : undefined;
    const fog = buildFogPayload(normalizeFogWorldState(world, forge, origin), forge);
    return { forgeText, gameText, fleetText, forge, game, world: world!, origin, document, fleet, fog,
        digest: navigationDigest(JSON.stringify([path.resolve(root), forgeText, gameText, fleetText])) };
}

/** Coordinates and names beyond discovered regions never enter the webview. */
export function buildNavigationView(root: string, forge: WorldForge, discovered: readonly string[]) {
    const w = forge.geography.waterways;
    if (!w) return null;
    const spec = buildCartographyLayoutSpec(forge), known = new Set(discovered);
    const visiblePoint = (p: WaterPoint) => {
        let best = Infinity, region = '';
        for (const r of spec.regions) { const d = Math.hypot(p.x - r.x, p.y - r.y) / Math.max(1, r.radius); if (d < best) { best = d; region = r.id; } }
        return known.has(region);
    };
    const visibleLine = (points: WaterPoint[]) => points.every((p, i) => {
        if (!visiblePoint(p)) return false;
        if (!i) return true;
        const a = points[i - 1], steps = Math.ceil(Math.hypot(p.x - a.x, p.y - a.y) / 7);
        for (let k = 1; k < steps; k++) if (!visiblePoint({ x: a.x + (p.x - a.x) * k / steps, y: a.y + (p.y - a.y) * k / steps })) return false;
        return true;
    });
    const knownLocations = new Set(forge.geography.locations.filter(l => known.has(l.regionId || "")).map(l => l.id));
    const nodes = new Map(w.nodes.map(n => [n.id, n]));
    const edges = w.edges.filter(e => known.has(nodes.get(e.from)!.regionId) && known.has(nodes.get(e.to)!.regionId) && visibleLine(e.points));
    const edgeIds = new Set(edges.map(e => e.id));
    const roads = w.roads.filter(r => knownLocations.has(r.from) && knownLocations.has(r.to) && visibleLine(r.points));
    const crossings = w.crossings.filter(c => edgeIds.has(c.waterEdgeId) && visiblePoint(c));
    const s = snapshot(root);
    return { worldKey: navigationDigest(s.forgeText), stateKey: s.digest, rivers: edges.filter(e => !['coastal', 'ocean'].includes(e.kind)), roads, crossings,
        visibleEdgeIds: [...edgeIds, ...roads.map(r => r.id)],
        seaRows: w.seaRows.map((row, y) => [...row].map((v, x) => visiblePoint({ x: x * 1000 / 127, y: y * 1000 / 127 }) ? v : '0').join('')),
        destinations: forge.geography.locations.filter(l => knownLocations.has(l.id)).map(l => ({ id: l.id, name: l.name })),
        pins: buildCartographyPinPositions(forge).filter(p => knownLocations.has(p.locationId)),
        vehicles: (s.fleet?.vehicles || []).filter(v => ['player', 'party'].includes(v.owner.type)).map(v => ({ id: v.id, name: v.name, waterProfile: v.waterProfile, hp: v.durability.hp, locationId: v.locationId })) };
}

function prepare(root: string, destination: string, vehicleId: string | undefined, shortcut: boolean) {
    const s = snapshot(root);
    if (!s.forge.geography.locations.some(l => l.id === destination && s.fog.discoveredRegionIds.includes(l.regionId || ""))) throw Error('未発見の目的地は選択できません。');
    const vehicle = vehicleId ? s.fleet?.vehicles.find(v => v.id === vehicleId && ['player', 'party'].includes(v.owner.type)) : undefined;
    if (vehicleId && !vehicle) throw Error('操作できない車両です。');
    const evaluation = evaluateNavigation(s.forge, s.origin, destination, vehicle);
    const route = shortcut ? evaluation.shortcut : evaluation.preferred;
    if (!route) throw Error('選択した近道はありません。');
    return { s, vehicle, evaluation, route };
}

export function handleWaterNavigation(root: string, message: Record<string, unknown>, post: (value: unknown) => void): boolean {
    try {
        for (const [key, value] of quotes) if (value.expires < Date.now()) quotes.delete(key);
        if (message.action === 'preview') {
            if (quotes.size > 64) quotes.delete(quotes.keys().next().value!);
            const destination = typeof message.destination === 'string' ? message.destination : '';
            const vehicleId = typeof message.vehicleId === 'string' && message.vehicleId ? message.vehicleId : undefined;
            const shortcut = message.shortcut === true;
            const { s, route, evaluation } = prepare(root, destination, vehicleId, shortcut);
            const view = buildNavigationView(root, s.forge, s.fog.discoveredRegionIds)!;
            const visible = new Set(view.visibleEdgeIds);
            const masked = { ...route, points: route.points.filter((_, i) => visible.has(route.edgeIds[i])), edgeIds: route.edgeIds.filter(id => visible.has(id)),
                reasons: route.status === 'blocked' ? route.reasons.filter((reason, i) => i === 0 || [...visible].some(id => reason.startsWith(id + ':'))) : route.reasons };
            const id = randomUUID();
            if (route.status !== 'blocked') quotes.set(id, { root: path.resolve(root), digest: s.digest, destination, vehicleId, shortcut, expires: Date.now() + 15 * 60000, route });
            post({ type: 'waterNavigationResult', requestId: message.requestId, ok: true, quoteId: route.status === 'blocked' ? null : id, route: masked, hasShortcut: !!evaluation.shortcut });
            return false;
        }
        if (message.action === 'cancel') { if (typeof message.quoteId === 'string' && quotes.get(message.quoteId)?.root === path.resolve(root)) quotes.delete(message.quoteId); return false; }
        if (message.action !== 'depart' || typeof message.quoteId !== 'string') throw Error('不明な航路操作です。');
        recoverWaterNavigation(root);
        if (navigationReceiptExists(root, message.quoteId)) { post({ type: 'waterNavigationResult', ok: true, completed: true, replayed: true }); return true; }
        const q = quotes.get(message.quoteId);
        if (!q || q.root !== path.resolve(root) || q.expires < Date.now()) throw Error('航路確認が期限切れです。再確認してください。');
        const { s, vehicle, route } = prepare(root, q.destination, q.vehicleId, q.shortcut);
        if (s.digest !== q.digest || JSON.stringify(route) !== JSON.stringify(q.route)) { quotes.delete(message.quoteId); throw Error('現在地・船・世界の状態が変わりました。航路を再確認してください。'); }
        if (route.status === 'blocked' || route.damage && message.confirmDamage !== true) throw Error('予告損傷の明示的な確認が必要です。');
        const next = { ...s.game, world: applyFogOnLocationVisit({ ...s.world, currentLocationId: q.destination }, s.forge, q.destination),
            status: { ...(s.game.status as object || {}), location: s.forge.geography.locations.find(l => l.id === q.destination)!.name } };
        const plan = resolveGameStatePersistPlan(mergeGameStateForPersist(s.game, next), 'strict');
        if (plan.action !== 'write') throw Error('現在のセーブは航行を保存できる形式ではありません: ' + plan.reason);
        const writes: NavigationWrite[] = [{ name: 'game_state.json', before: s.gameText, after: JSON.stringify(plan.payload, null, 2) }];
        if (s.document && s.fleet) {
            const damaged = vehicle && route.damage ? applyVehicleOps(s.fleet, [{ type: 'damage_vehicle', vehicleId: vehicle.id, amount: route.damage, reason: 'Host-confirmed water navigation' }])! : s.fleet;
            const fleet = { ...damaged, activeVehicleId: q.vehicleId };
            if (vehicle) fleet.vehicles = fleet.vehicles.map(v => v.id !== vehicle.id ? v : {
                ...v, locationId: q.destination, parkedAt: undefined,
                // Arrival moves the linked base's dock in the same journalled vehicle write.
                ...(v.mobileBase ? { mobileBase: { ...v.mobileBase, dockedAtLocationId: q.destination } } : {}),
            });
            writes.push({ name: 'vehicle_state.json', before: s.fleetText, after: JSON.stringify(rebuildVehicleStateDocumentWithMechanical(s.document, fleet), null, 2) });
        }
        commitWaterNavigation(root, navigationDigest(s.forgeText), message.quoteId, writes);
        quotes.delete(message.quoteId);
        post({ type: 'waterNavigationResult', ok: true, completed: true, summary: `到着しました。距離 ${Math.round(route.distance)} / 船体損傷 ${route.damage}` });
        return true;
    } catch (e) { post({ type: 'waterNavigationResult', requestId: message.requestId, ok: false, error: e instanceof Error ? e.message : String(e) }); return false; }
}
