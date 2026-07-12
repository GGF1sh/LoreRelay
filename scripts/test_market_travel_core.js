#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const root = path.join(__dirname, '..');
const out = path.join(root, 'out');
const travelPath = path.join(out, 'deterministicMarketTravel.js');
const gatePath = path.join(out, 'marketTravelRequestGate.js');
const sharedPath = path.join(out, 'deterministicWorkspaceMutationGate.js');
for (const file of [travelPath, gatePath, sharedPath]) assert(fs.existsSync(file), `${file} missing; run compile`);

const originalLoad = Module._load;
Module._load = function(request) {
    if (request === 'vscode') {
        return {
            workspace: { workspaceFolders: [], getConfiguration: () => ({ get: (_key, fallback) => fallback }) },
            window: {}, Uri: { file: (value) => ({ fsPath: value }) },
        };
    }
    return originalLoad.apply(this, arguments);
};
const { previewMarketTravel, executeMarketTravel } = require(travelPath);
const { createMarketTravelRequestGate } = require(gatePath);
const { createDeterministicWorkspaceMutationGate, WORLD_MUTATION_IN_PROGRESS } = require(sharedPath);
Module._load = originalLoad;

function deferred() {
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    return { promise, resolve };
}

function createHarness(options = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'noai-play-p4-'));
    const gamePath = path.join(dir, 'game_state.json');
    const game = options.game || { entries: [], world: { currentLocationId: 'north_farm' }, commerce: { credits: 100, food: 8, cargo: [], transportId: 'wagon' } };
    fs.writeFileSync(gamePath, JSON.stringify(game, null, 2));
    let world = options.world === undefined
        ? { worldTurn: 7, factions: {}, regions: {}, recentChanges: [], markets: { north_farm: { wheat: { stock: 10, priceIndex: 1 } }, south_port: { spice: { stock: 6, priceIndex: 1.1 } } } }
        : options.world;
    const calls = { gameWrites: 0, worldReads: 0, sim: 0, marketRecovery: 0, ai: 0 };
    const forge = {
        format: 'lorerelay-world-forge/1.0',
        meta: { worldName: 'Fixture' },
        geography: {
            regions: [{ id: 'r_north', name: 'North', type: 'other' }, { id: 'r_south', name: 'South', type: 'other' }],
            locations: [
                { id: 'north_farm', name: 'North Farm', type: 'settlement', regionId: 'r_north' },
                { id: 'south_port', name: 'South Port', type: 'settlement', regionId: 'r_south' },
                { id: 'elda_shop', name: 'Elda Shop', type: 'settlement', regionId: 'r_north' },
                { id: 'no_market', name: 'No Market', type: 'settlement', regionId: 'r_south' },
            ],
        },
        factions: [],
        loreHistory: [],
        initialNpcs: [],
    };
    const rawForge = {
        ...forge,
        commerce: {
            commodities: [
                { id: 'wheat', name: 'Wheat', basePrice: 2, weight: 1 },
                { id: 'spice', name: 'Spice', basePrice: 9, weight: 0.2 },
            ],
            markets: [
                { locationId: 'north_farm', commodityIds: ['wheat'] },
                { locationId: 'south_port', commodityIds: ['spice'] },
                { locationId: 'elda_shop', commodityIds: ['wheat', 'spice'] },
            ],
            transportKinds: [{ id: 'wagon', name: 'Wagon', capacity: 50, speed: 1 }],
        },
    };
    const deps = {
        loadGameRules: () => ({ enableCommerce: options.commerceOff ? false : true, enableWorldForge: true }),
        isWorldForgeEnabled: () => !options.noForge,
        loadWorldForge: () => options.noForge ? undefined : forge,
        loadWorldForgeDocument: () => options.noForge ? undefined : rawForge,
        loadWorldState: () => { calls.worldReads++; return world; },
        getGameStatePath: () => gamePath,
        commitGameState: (next) => {
            calls.gameWrites++;
            if (options.throwWrite) throw new Error('writer threw');
            if (options.failWrite) return { ok: false, action: 'skip', reason: ['fixture failure'] };
            fs.writeFileSync(gamePath, JSON.stringify(next, null, 2));
            return { ok: true, action: 'write' };
        },
        readStateRevision: () => 1,
    };
    return { dir, gamePath, deps, calls, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }), get world() { return world; }, set world(next) { world = next; } };
}

function readLocation(gamePath) {
    return JSON.parse(fs.readFileSync(gamePath, 'utf8')).world.currentLocationId;
}

async function testRequestGate() {
    const gate = createMarketTravelRequestGate(2);
    let count = 0; const hold = deferred();
    const first = gate.run('ws', 'travel_001', async () => { count++; await hold.promise; return { type: 'marketTravelResult', requestId: 'travel_001', ok: true }; });
    const duplicate = gate.run('ws', 'travel_001', async () => { throw new Error('must coalesce'); });
    const busy = await gate.run('ws', 'travel_002', async () => { throw new Error('must not run'); });
    assert.equal(busy.failure.code, 'BUSY');
    assert.deepEqual(await gate.run('ws', 'travel_002', async () => { throw new Error('busy replay must not run'); }), busy);
    hold.resolve();
    assert.deepEqual(await duplicate, await first);
    assert.equal(count, 1);
    assert.deepEqual(await gate.run('ws', 'travel_001', async () => { throw new Error('must not replay'); }), { type: 'marketTravelResult', requestId: 'travel_001', ok: true });
    await gate.run('ws', 'travel_003', async () => ({ type: 'marketTravelResult', requestId: 'travel_003', ok: true }));
    await gate.run('ws', 'travel_004', async () => ({ type: 'marketTravelResult', requestId: 'travel_004', ok: true }));
    const evicted = await gate.run('ws', 'travel_001', async () => ({ type: 'marketTravelResult', requestId: 'travel_001', ok: true, evicted: true }));
    assert.equal(evicted.evicted, true, 'completed cache is bounded');
}

async function testSharedContention() {
    const shared = createDeterministicWorkspaceMutationGate();
    const p4Gate = createMarketTravelRequestGate(32);
    const hold = deferred(); const entered = deferred();
    const p4 = p4Gate.run('same', 'travel_owner', async () => {
        const mutation = await shared.run('same', { actionKind: 'market_travel', requestId: 'travel_owner' }, async () => {
            entered.resolve(); await hold.promise; return { ok: true };
        });
        return mutation.status === 'completed'
            ? { type: 'marketTravelResult', requestId: 'travel_owner', ok: true }
            : { type: 'marketTravelResult', requestId: 'travel_owner', ok: false, failure: { code: mutation.code } };
    });
    await entered.promise;
    const p2 = await shared.run('same', { actionKind: 'shopkeeper_trade', requestId: 'p2_busy' }, async () => { throw new Error('must not execute'); });
    const p3 = await shared.run('same', { actionKind: 'end_day', requestId: 'p3_busy' }, async () => { throw new Error('must not execute'); });
    assert.equal(p2.status, 'busy'); assert.equal(p2.code, WORLD_MUTATION_IN_PROGRESS);
    assert.equal(p3.status, 'busy'); assert.equal(p3.code, WORLD_MUTATION_IN_PROGRESS);
    const other = await shared.run('other', { actionKind: 'shopkeeper_trade', requestId: 'p2_other' }, async () => ({ ok: true }));
    assert.equal(other.status, 'completed');
    hold.resolve(); assert.equal((await p4).ok, true);
    const afterThrow = await shared.run('same', { actionKind: 'market_travel', requestId: 'travel_throw' }, async () => { throw new Error('boom'); });
    assert.equal(afterThrow.status, 'failed');
    const released = await shared.run('same', { actionKind: 'end_day', requestId: 'p3_after_throw' }, async () => ({ ok: true }));
    assert.equal(released.status, 'completed');
}

async function main() {
    {
        const h = createHarness();
        try {
            const before = fs.readFileSync(h.gamePath, 'utf8');
            const preview = previewMarketTravel(undefined, h.deps);
            assert.equal(preview.ok, true);
            assert.deepEqual(preview.destinations.map((d) => d.id), ['south_port', 'elda_shop']);
            assert.equal(preview.elapsedWorldTurns, 0);
            assert.equal(h.calls.gameWrites, 0);
            assert.equal(fs.readFileSync(h.gamePath, 'utf8'), before, 'preview purity');
            assert.equal(previewMarketTravel('north_farm', h.deps).code, 'SAME_LOCATION');
            assert.equal(previewMarketTravel('missing_market', h.deps).code, 'UNKNOWN_DESTINATION');
            const selected = previewMarketTravel('south_port', h.deps);
            assert.equal(selected.destination.name, 'South Port');
            assert.equal(selected.reachabilityBasis, 'known_market_location');
        } finally { h.cleanup(); }
    }
    {
        const h = createHarness();
        try {
            const unconfirmed = executeMarketTravel('travel_unconfirmed', 'south_port', false, h.deps);
            assert.equal(unconfirmed.code, 'CONFIRMATION_REQUIRED');
            assert.equal(readLocation(h.gamePath), 'north_farm');
            const receipt = executeMarketTravel('travel_success', 'south_port', true, h.deps);
            assert.equal(receipt.persisted, true);
            assert.equal(receipt.elapsedWorldTurns, 0);
            assert.deepEqual(receipt.origin, { id: 'north_farm', name: 'North Farm' });
            assert.deepEqual(receipt.destination, { id: 'south_port', name: 'South Port' });
            assert.equal(readLocation(h.gamePath), 'south_port');
            assert.equal(h.world.worldTurn, 7);
            assert.equal(h.calls.sim, 0); assert.equal(h.calls.marketRecovery, 0); assert.equal(h.calls.ai, 0);
        } finally { h.cleanup(); }
    }
    for (const opts of [{ failWrite: true }, { throwWrite: true }]) {
        const h = createHarness(opts);
        try {
            const result = executeMarketTravel('travel_fail', 'south_port', true, h.deps);
            assert.equal(result.ok, false);
            assert.equal(result.code, 'PERSIST_FAILED');
            assert.equal(readLocation(h.gamePath), 'north_farm');
        } finally { h.cleanup(); }
    }
    {
        const h = createHarness();
        try {
            h.deps.commitGameState = (next) => {
                h.calls.gameWrites++;
                fs.writeFileSync(h.gamePath, JSON.stringify({ ...next, world: { currentLocationId: 'north_farm' } }));
                return { ok: true, action: 'write' };
            };
            const result = executeMarketTravel('travel_verify', 'south_port', true, h.deps);
            assert.equal(result.code, 'VERIFY_FAILED');
        } finally { h.cleanup(); }
    }
    await testRequestGate();
    await testSharedContention();

    const source = fs.readFileSync(path.join(root, 'src', 'deterministicMarketTravel.ts'), 'utf8');
    assert(!/import .*?(Relay|agentic|gmBridge|imageGeneration|narration|ComfyUI|worldSim|emergentSimulator)/i.test(source), 'P4 core must not import AI/simulation paths');
    const ui = fs.readFileSync(path.join(root, 'webview', 'modules', '85-world.js'), 'utf8');
    const bundle = fs.readFileSync(path.join(root, 'webview', 'script.js'), 'utf8');
    assert(ui.includes('marketTravelCommit') && ui.includes("failure.code === 'WORLD_MUTATION_IN_PROGRESS'"));
    assert(bundle.includes('marketTravelCommit') && bundle.includes('譌・↓蜃ｺ繧・'), 'shipped bundle lacks P4 UI');
    console.log('market travel core tests passed.');
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
