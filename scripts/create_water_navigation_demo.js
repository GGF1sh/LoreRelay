#!/usr/bin/env node
'use strict';
// Creates a NEW, isolated teaching scenario. Never overwrites an adventure.
const fs = require('fs'), path = require('path');
const { generateWorldForge } = require('../out/worldForgeGeneratorCore');
const { parseWorldForge } = require('../out/worldForgeCore');
const { buildCartographyPinPositions } = require('../out/cartographyLayoutCore');
const { parseVehicleState } = require('../out/vehicleCore');
const destination = path.resolve(process.argv[2] || '');
if (!process.argv[2] || (fs.existsSync(destination) && fs.readdirSync(destination).length)) throw Error('Specify a new or empty demo directory. Existing data is never replaced.');
fs.mkdirSync(destination, { recursive: true });
const write = (name, data) => fs.writeFileSync(path.join(destination, name), JSON.stringify(data, null, 2), { flag: 'wx' });
const generated = generateWorldForge({ worldSeed: 'waterways-family-20260914', theme: 'fantasy', regionCount: 8, factionCount: 2, npcCount: 2 }).forge;
write('generated-world-reference.json', generated);
const forge = JSON.parse(JSON.stringify(generated));
forge.meta.worldName = '川から海へ — 航路の体験用世界';
const places = [
    ['creek', '山あいの支流', 210, 190, 'forest'], ['port', '川船の船着き場', 350, 350, 'plains'],
    ['delta', '大河の河口', 500, 500, 'coast'], ['coast', '近海の港', 650, 650, 'coast'],
    ['island', '外海の島港', 870, 810, 'sea'], ['bridge_w', '橋の西岸', 320, 430, 'forest'],
    ['bridge_e', '橋の東岸', 570, 430, 'plains'], ['ferry_w', '渡し場の西岸', 430, 575, 'plains'],
    ['ferry_e', '渡し場の東岸', 760, 575, 'coast'],
];
forge.geography = { regions: places.map(([id, name, x, y, biome]) => ({ id: 'r_' + id, name, x, y, biome, type: 'wilderness', connectedTo: [] })),
    locations: places.map(([id, name]) => ({ id, name, type: 'settlement', regionId: 'r_' + id, services: ['river_landing'], vehicleAccess: { allowedVehicleSizeMax: 'colossal' } })) };
// Anchor the reference locations to explicit demo coordinates through the normal pin calculation.
const firstPins = buildCartographyPinPositions(forge);
places.forEach(([id, , x, y]) => { const p = firstPins.find(p => p.locationId === id), r = forge.geography.regions.find(r => r.id === 'r_' + id); r.x += x - p.leftPct * 10; r.y += y - p.topPct * 10; });
const pins = buildCartographyPinPositions(forge);
const nodes = ['creek', 'port', 'delta', 'coast', 'island'].map(id => { const p = pins.find(p => p.locationId === id); return { id: 'n_' + id, regionId: 'r_' + id, x: p.leftPct * 10, y: p.topPct * 10, kind: id === 'island' ? 'sea' : 'junction' }; });
nodes.push({ id: 'n_detour', regionId: 'r_delta', x: 310, y: 790, kind: 'junction' }, { id: 'n_bay', regionId: 'r_coast', x: 920, y: 620, kind: 'sea' });
const edges = [];
function edge(id, from, to, kind, width, depth, middle = []) {
    const a = nodes.find(n => n.id === 'n_' + from), b = nodes.find(n => n.id === 'n_' + to), points = [a, ...middle, b].map(p => ({ x: p.x, y: p.y }));
    edges.push({ id, from: a.id, to: b.id, kind, width, depth, points, length: points.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - points[i].x, p.y - points[i].y), 0) });
}
edge('stream', 'creek', 'port', 'stream', 1, 1);
edge('shallow_major', 'port', 'delta', 'major', 3, 1);
edge('safe_delta_1', 'delta', 'detour', 'major', 3, 2);
edge('safe_delta_2', 'detour', 'coast', 'major', 3, 2);
edge('coastal_shortcut', 'delta', 'coast', 'coastal', 3, 3);
edge('open_sea_shortcut', 'coast', 'island', 'ocean', 3, 3);
edge('coastal_detour_1', 'coast', 'bay', 'coastal', 3, 3);
edge('coastal_detour_2', 'bay', 'island', 'coastal', 3, 3);
const crossings = [{ id: 'low_bridge', waterEdgeId: 'shallow_major', kind: 'bridge', x: 430, y: 430, clearance: 2, maxWidth: 2, maxLoad: 2, maxVehicleSize: 4 },
    { id: 'harbor_ferry', waterEdgeId: 'coastal_shortcut', kind: 'ferry', x: 575, y: 575, clearance: 3, maxWidth: 3, maxLoad: 3, maxVehicleSize: 2 }];
const roads = [['bridge_w', 'bridge_e', 'low_bridge'], ['ferry_w', 'ferry_e', 'harbor_ferry']].map(([from, to, crossing], i) => {
    const a = pins.find(p => p.locationId === from), b = pins.find(p => p.locationId === to);
    const points = [a, b].map(p => ({ x: p.leftPct * 10, y: p.topPct * 10 }));
    return { id: 'road_' + i, from, to, points, crossingIds: [crossing], length: Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y) };
});
forge.geography.waterways = { version: 1, seed: generated.meta.worldSeed, resolution: 128, nodes, edges, crossings, roads,
    ports: Object.fromEntries(['creek', 'port', 'delta', 'coast', 'island'].map(id => [id, 'n_' + id])),
    seaRows: Array.from({ length: 128 }, (_, y) => Array.from({ length: 128 }, (_, x) => x > 96 && y > 88 ? '2' : x + y > 156 ? '1' : '0').join('')) };
forge.factions = []; forge.initialNpcs = []; forge.loreHistory = [];
parseWorldForge(forge);
const vessel = (id, name, size, width, draft, airDraft, seaworthiness, locationId = 'port') => ({ id, name, kind: 'boat', owner: { type: 'player' }, status: 'docked', locationId, access: { sizeClass: size }, mobility: { rangeBand: 'very_long', terrainTags: ['water'] }, durability: { hp: 100, maxHp: 100, armorBand: 'none', condition: 'pristine' }, waterProfile: { width, draft, airDraft, seaworthiness } });
const fleet = parseVehicleState({ version: 1, activeVehicleId: 'riverboat', vehicles: [
    vessel('smallboat', '小舟 — 狭い支流に入れる', 'small', 1, 1, 1, 0),
    vessel('riverboat', '川船 — 内水用・近海では損傷', 'medium', 2, 1, 2, 0),
    vessel('shallow_barge', '大型の浅喫水船 — 浅い大河を通れる', 'huge', 3, 1, 2, 1),
    vessel('tall_ship', '帆の高い船 — 低い橋を通れない', 'large', 2, 1, 3, 1),
    vessel('ocean_ship', '外洋船 — 外海に対応', 'huge', 3, 2, 3, 2, 'coast'),
    vessel('coastal_ship', '近海船 — 外海は危険な近道', 'large', 2, 2, 2, 1, 'coast'),
] });
write('world_forge.json', forge); write('vehicle_state.json', fleet);
write('game_state.json', { schemaVersion: 1, entries: [{ id: 'demo_start', role: 'gm', sender: 'Demo', content: '水系・船・橋・渡し場を試す専用世界です。外部AIは接続していません。ワールド → 航路・渡河を開いてください。' }], options: [], status: { location: '川船の船着き場' }, world: { currentLocationId: 'port', discoveredRegionIds: forge.geography.regions.map(r => r.id), visitedLocationIds: ['port'] } });
write('game_rules.json', { enableWorldForge: true, enableVehicleSystem: true, enableEmergentSimulation: false, enableCommerce: false, enableNpcRegistry: false, enableNpcAgency: false, backgroundSimulation: false });
write('demo-manifest.json', { version: 1, kind: 'synthetic-water-navigation-demo', codeVersion: require('../package.json').version, seed: generated.meta.worldSeed, generatedReference: 'generated-world-reference.json', notes: 'Fresh generated reference retained. Controlled navigation graph is an authored test scenario; all regions intentionally revealed. No existing adventure copied or modified.' });
console.log(destination);
