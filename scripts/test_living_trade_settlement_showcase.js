#!/usr/bin/env node
'use strict';

/**
 * SETTLEMENT-MULTI-LOCATION-001-SHOWCASE
 * Semantic distinctness of six Living Trade fixed settlements.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const root = path.join(__dirname, '..');
const { createLivingTradeWorld, buildFixedCitySettlements } = require('./create_living_trade_world');
const { parseSettlementState, parseSettlementLayout } = require('../out/settlementCore');
const { buildSettlementViewSnapshot } = require('../out/settlementViewCore');

let failed = 0;
let cases = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); cases++; }
function check(c, m) { if (c) ok(m); else fail(m); }

const CITIES = [
    'loc_sapphire_port',
    'loc_reedmarket',
    'loc_mistgrove',
    'loc_ironspire',
    'loc_glass_oasis',
    'loc_watchkeep',
];

const EXPECTED_IDS = {
    loc_sapphire_port: 'set_sapphire_port',
    loc_reedmarket: 'set_reedmarket',
    loc_mistgrove: 'set_mistgrove',
    loc_ironspire: 'set_ironspire',
    loc_glass_oasis: 'set_glass_oasis',
    loc_watchkeep: 'set_watchkeep',
};

for (const p of [
    path.join(root, 'out', 'settlementCore.js'),
    path.join(root, 'out', 'settlementViewCore.js'),
]) {
    if (!fs.existsSync(p)) {
        fail(`${path.relative(root, p)} missing — run npm run compile`);
        process.exit(1);
    }
}

function tileHistogram(view) {
    const h = {};
    for (const t of view.tiles || []) {
        h[t.code] = (h[t.code] || 0) + 1;
    }
    return h;
}

function bbox(view) {
    const tiles = view.tiles || [];
    if (!tiles.length) return { w: 0, h: 0, minX: 0, minY: 0, maxX: 0, maxY: 0 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const t of tiles) {
        minX = Math.min(minX, t.x);
        minY = Math.min(minY, t.y);
        maxX = Math.max(maxX, t.x);
        maxY = Math.max(maxY, t.y);
    }
    return { minX, minY, maxX, maxY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function tileSequence(view) {
    return (view.tiles || [])
        .map((t) => `${t.z}:${t.x},${t.y}:${t.code}`)
        .sort()
        .join('|');
}

function signature(view, state, layout) {
    const hist = tileHistogram(view);
    const box = bbox(view);
    const layers = (view.layers || []).map((l) => l.id || l).sort();
    return {
        settlementId: view.settlementId,
        layers,
        layerCount: layers.length,
        tileCount: (view.tiles || []).length,
        markerCount: (view.markers || []).length,
        structureCount: (state.structures || []).length,
        water: hist.water || 0,
        wall: hist.wall || 0,
        market: hist.market || 0,
        workshop: hist.workshop || 0,
        stockpile: hist.stockpile || 0,
        quarters: hist.quarters || 0,
        gate: hist.gate || 0,
        barracks: hist.barracks || 0,
        histKey: JSON.stringify(hist),
        boxKey: `${box.w}x${box.h}@${box.minX},${box.minY}`,
        density: (view.tiles || []).length / Math.max(1, box.w * box.h),
        seqHash: crypto.createHash('sha256').update(tileSequence(view)).digest('hex').slice(0, 16),
        layoutZoneCount: (layout.zones || []).length,
    };
}

// --- In-memory city docs ---
const built = buildFixedCitySettlements();
check(Object.keys(built).sort().join(',') === CITIES.slice().sort().join(','), 'buildFixedCitySettlements has six cities');

const views = {};
const sigs = {};

for (const locId of CITIES) {
    const docs = built[locId];
    const state = parseSettlementState(docs.state);
    const layout = parseSettlementLayout(docs.layout);
    check(Boolean(state), `${locId} state parses`);
    check(Boolean(layout), `${locId} layout parses`);
    if (!state || !layout) continue;
    check(state.locationId === locId, `${locId} state.locationId match`);
    check(state.settlementId === EXPECTED_IDS[locId], `${locId} settlementId stable`);
    check(layout.settlementId === state.settlementId, `${locId} layout ownership match`);
    const view = buildSettlementViewSnapshot({ state, layout, selectedLayerId: 'z0' });
    check(Boolean(view), `${locId} settlementView builds`);
    views[locId] = view;
    sigs[locId] = signature(view, state, layout);

    // Ironspire multi-layer check via layout + optional z1 view
    if (locId === 'loc_ironspire') {
        check(layout.layers.includes('z0') && layout.layers.includes('z1'), 'Ironspire has z0 and z1');
        const viewZ1 = buildSettlementViewSnapshot({ state, layout, selectedLayerId: 'z1' });
        check(Boolean(viewZ1) && (viewZ1.tiles || []).length > 0, 'Ironspire z1 has tiles');
        const z0codes = new Set((view.tiles || []).map((t) => `${t.x},${t.y}`));
        const z1codes = new Set((viewZ1.tiles || []).map((t) => `${t.x},${t.y}`));
        check(viewZ1.layerId === 'z1', 'Ironspire z1 layer selected');
        // Layer contents differ
        check(JSON.stringify([...(view.tiles || [])].map((t) => t.code).sort())
            !== JSON.stringify([...(viewZ1.tiles || [])].map((t) => t.code).sort())
            || z0codes.size !== z1codes.size,
            'Ironspire layer contents differ');
    }
}

// Unique settlement IDs
const ids = CITIES.map((c) => sigs[c]?.settlementId).filter(Boolean);
check(new Set(ids).size === 6, 'all six settlement IDs unique');

// Unique sequences / signatures
const seqs = CITIES.map((c) => sigs[c]?.seqHash).filter(Boolean);
check(new Set(seqs).size === 6, 'all six tile sequence hashes unique');
const histKeys = CITIES.map((c) => sigs[c]?.histKey).filter(Boolean);
check(new Set(histKeys).size >= 5, `at least five distinct tile-code histograms (got ${new Set(histKeys).size})`);
const boxes = CITIES.map((c) => `${sigs[c]?.boxKey}|${(sigs[c]?.density || 0).toFixed(2)}`);
check(new Set(boxes).size >= 3, `at least three density/bbox profiles (got ${new Set(boxes).size})`);

// Archetype checks
const mist = sigs.loc_mistgrove;
const port = sigs.loc_sapphire_port;
const reed = sigs.loc_reedmarket;
const watch = sigs.loc_watchkeep;
const oasis = sigs.loc_glass_oasis;
const iron = sigs.loc_ironspire;

check(mist && mist.wall === 0 && mist.gate === 0, 'Mistgrove has no wall/gate tiles');
check(watch && port && reed && mist && watch.wall >= port.wall && watch.wall >= reed.wall && watch.wall >= mist.wall
    && watch.wall >= (oasis?.wall || 0) && watch.wall >= (iron?.wall || 0),
    'Watchkeep has highest wall emphasis');
check(reed && mist && watch && reed.water > mist.water && reed.water > watch.water,
    'Reedmarket water > Mistgrove and Watchkeep');
check(port && port.market >= 4 && (port.market + port.workshop + port.stockpile) >= 6,
    'Sapphire Port dense market/workshop/stockpile composition');
check(iron && iron.layerCount >= 1 && built.loc_ironspire.layout.layers.length >= 2,
    'Ironspire multi-layer layout');

// Glass Oasis radial vs Reedmarket branching: compare center concentration vs spread
function centerMass(view) {
    const tiles = view.tiles || [];
    if (!tiles.length) return { cx: 0, cy: 0, spread: 0 };
    let sx = 0, sy = 0;
    for (const t of tiles) { sx += t.x; sy += t.y; }
    const cx = sx / tiles.length;
    const cy = sy / tiles.length;
    let varSum = 0;
    for (const t of tiles) {
        varSum += (t.x - cx) ** 2 + (t.y - cy) ** 2;
    }
    return { cx, cy, variance: varSum / tiles.length };
}
const oasisMass = centerMass(views.loc_glass_oasis);
const reedMass = centerMass(views.loc_reedmarket);
check(Math.abs(oasisMass.cx - reedMass.cx) > 0.2 || Math.abs(oasisMass.variance - reedMass.variance) > 0.5
    || oasis.histKey !== reed.histKey,
    'Glass Oasis arrangement distinct from Reedmarket');

// Regeneration byte determinism
const tmpA = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-live-a-'));
const tmpB = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-live-b-'));
createLivingTradeWorld(tmpA);
createLivingTradeWorld(tmpB);
for (const locId of CITIES) {
    for (const file of ['settlement_state.json', 'settlement_layout.json']) {
        const a = fs.readFileSync(path.join(tmpA, '05-living-trade-world', 'settlements', locId, file));
        const b = fs.readFileSync(path.join(tmpB, '05-living-trade-world', 'settlements', locId, file));
        check(a.equals(b), `deterministic ${locId}/${file}`);
    }
}

// No fixed-city docs outside validated location directories
const settlementsRoot = path.join(tmpA, '05-living-trade-world', 'settlements');
const foundDirs = fs.readdirSync(settlementsRoot).filter((n) => {
    return fs.statSync(path.join(settlementsRoot, n)).isDirectory();
});
check(foundDirs.every((d) => CITIES.includes(d)), 'only six validated location directories under settlements/');
check(foundDirs.length === 6, 'exactly six settlement directories');

// Root MB not used as fixed city id
const rootState = JSON.parse(fs.readFileSync(path.join(tmpA, '05-living-trade-world', 'settlement_state.json'), 'utf8'));
check(rootState.settlementId === 'mb_sapphire_barge', 'root remains Mobile Base singleton');
for (const locId of CITIES) {
    check(sigs[locId].settlementId !== 'mb_sapphire_barge', `${locId} not Mobile Base id`);
}

// Log summary table
console.log('\nSemantic signatures:');
for (const locId of CITIES) {
    const s = sigs[locId];
    console.log(JSON.stringify({
        locId,
        settlementId: s.settlementId,
        tiles: s.tileCount,
        water: s.water,
        wall: s.wall,
        market: s.market,
        workshop: s.workshop,
        stockpile: s.stockpile,
        box: s.boxKey,
        density: Number(s.density.toFixed(3)),
        seq: s.seqHash,
    }));
}

try {
    fs.rmSync(tmpA, { recursive: true, force: true });
    fs.rmSync(tmpB, { recursive: true, force: true });
} catch { /* ignore */ }

if (failed > 0) {
    console.error(`\nliving trade settlement showcase: ${failed} failed (${cases} passed)`);
    process.exit(1);
}
console.log(`\nLiving trade settlement showcase cases: ${cases}`);
console.log('living trade settlement showcase: all passed');
