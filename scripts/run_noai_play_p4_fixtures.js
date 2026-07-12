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
        loadGameRules: () => ({ enableCommerce: true, enableWorldForge: true }),
        isWorldForgeEnabled: () => true,
        loadWorldForge: () => forge,
        loadWorldForgeDocument: () => rawForge,
        loadWorldState: () => world,
        getGameStatePath: () => gamePath,
        commitGameState: (next) => {
            if (options.throwWrite) throw new Error('writer threw');
            if (options.failWrite) return { ok: false, action: 'skip', reason: ['fixture failure'] };
            fs.writeFileSync(gamePath, JSON.stringify(next, null, 2));
            return { ok: true, action: 'write' };
        },
        readStateRevision: () => 1,
    };
    return { dir, gamePath, deps, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }), get world() { return world; }, set world(next) { world = next; } };
}

function readLocation(gamePath) {
    return JSON.parse(fs.readFileSync(gamePath, 'utf8')).world.currentLocationId;
}

const fixtures = [];
const executedIds = [];

async function runFixture(id, runFn) {
    const evidence = await runFn();
    fixtures.push({ id, isolated: true, resettable: true, temporaryWorkspaceOnly: true, deterministic: true, evidence });
    executedIds.push(id);
}

async function main() {
    // 1. successful_market_travel
    await runFixture('successful_market_travel', async () => {
        const h = createHarness();
        try {
            const receipt = executeMarketTravel('travel_success', 'south_port', true, h.deps);
            assert.equal(receipt.persisted, true);
            assert.equal(receipt.elapsedWorldTurns, 0);
            assert.deepEqual(receipt.origin, { id: 'north_farm', name: 'North Farm' });
            assert.deepEqual(receipt.destination, { id: 'south_port', name: 'South Port' });
            assert.equal(readLocation(h.gamePath), 'south_port');
            const gameData = JSON.parse(fs.readFileSync(h.gamePath, 'utf8'));
            assert.equal(gameData.world.currentLocationId, 'south_port');
            return { origin: 'north_farm', destination: 'south_port', elapsedWorldTurns: 0, persisted: true };
        } finally { h.cleanup(); }
    });

    // 2. same_location_rejection
    await runFixture('same_location_rejection', async () => {
        const h = createHarness();
        try {
            const result = executeMarketTravel('travel_same', 'north_farm', true, h.deps);
            assert.equal(result.code, 'SAME_LOCATION');
            assert.equal(readLocation(h.gamePath), 'north_farm');
            return { code: 'SAME_LOCATION', mutated: false };
        } finally { h.cleanup(); }
    });

    // 3. unknown_destination_rejection
    await runFixture('unknown_destination_rejection', async () => {
        const h = createHarness();
        try {
            const result = executeMarketTravel('travel_unknown', 'missing_market', true, h.deps);
            assert.equal(result.code, 'UNKNOWN_DESTINATION');
            assert.equal(readLocation(h.gamePath), 'north_farm');
            return { code: 'UNKNOWN_DESTINATION', mutated: false };
        } finally { h.cleanup(); }
    });

    // 4. duplicate_request_travel
    await runFixture('duplicate_request_travel', async () => {
        const gate = createMarketTravelRequestGate(2);
        let executions = 0;
        const p1 = gate.run('ws1', 'travel_001', async () => { executions++; return { type: 'marketTravelResult', requestId: 'travel_001', ok: true, origin: { id: 'north_farm' }, destination: { id: 'south_port' } }; });
        const p2 = gate.run('ws1', 'travel_001', async () => { executions++; return { type: 'marketTravelResult', requestId: 'travel_001', ok: true, origin: { id: 'north_farm' }, destination: { id: 'elda_shop' } }; });
        const r1 = await p1;
        const r2 = await p2;
        assert.equal(executions, 1);
        assert.deepEqual(r1, r2);
        assert.equal(r2.destination.id, 'south_port'); // second one did not claim elda_shop
        return { executions, replayMovedAgain: false };
    });

    // 5. cross_action_travel_contention
    await runFixture('cross_action_travel_contention', async () => {
        const shared = createDeterministicWorkspaceMutationGate();
        const hold = deferred();
        const p4Hold = deferred();
        
        const p2Mut = shared.run('same', { actionKind: 'shopkeeper_trade', requestId: 'p2' }, async () => { await hold.promise; return { ok: true }; });
        const p4A = await shared.run('same', { actionKind: 'market_travel', requestId: 'p4a' }, async () => { return { ok: true }; });
        assert.equal(p4A.code, WORLD_MUTATION_IN_PROGRESS);

        hold.resolve();
        await p2Mut;
        
        const hold3 = deferred();
        const p3Mut = shared.run('same', { actionKind: 'end_day', requestId: 'p3' }, async () => { await hold3.promise; return { ok: true }; });
        const p4B = await shared.run('same', { actionKind: 'market_travel', requestId: 'p4b' }, async () => { return { ok: true }; });
        assert.equal(p4B.code, WORLD_MUTATION_IN_PROGRESS);
        
        hold3.resolve();
        await p3Mut;
        
        const hold4 = deferred();
        const p4Mut = shared.run('same', { actionKind: 'market_travel', requestId: 'p4' }, async () => { await hold4.promise; return { ok: true }; });
        const p2B = await shared.run('same', { actionKind: 'shopkeeper_trade', requestId: 'p2b' }, async () => { return { ok: true }; });
        assert.equal(p2B.code, WORLD_MUTATION_IN_PROGRESS);
        const p3B = await shared.run('same', { actionKind: 'end_day', requestId: 'p3b' }, async () => { return { ok: true }; });
        assert.equal(p3B.code, WORLD_MUTATION_IN_PROGRESS);
        
        // other workspace can proceed
        const other = await shared.run('other', { actionKind: 'market_travel', requestId: 'other' }, async () => { return { ok: true }; });
        assert.equal(other.status, 'completed');
        
        hold4.resolve();
        await p4Mut;

        return { sameWorkspaceLoser: WORLD_MUTATION_IN_PROGRESS, maxSameWorkspaceProtectedMutationCount: 1, crossWorkspaceConcurrent: true };
    });

    // 6. travel_persistence_failure
    await runFixture('travel_persistence_failure', async () => {
        const h = createHarness({ failWrite: true });
        try {
            const shared = createDeterministicWorkspaceMutationGate();
            const resultMutation = await shared.run('same', { actionKind: 'market_travel', requestId: 'p_fail' }, async () => {
                const res = executeMarketTravel('travel_fail', 'south_port', true, h.deps);
                return res;
            });
            assert.equal(resultMutation.status, 'completed'); // gate wrapper completed
            assert.equal(resultMutation.value.code, 'PERSIST_FAILED');
            assert.equal(resultMutation.value.ok, false);
            assert.equal(readLocation(h.gamePath), 'north_farm'); // unchanged
            const next = await shared.run('same', { actionKind: 'market_travel', requestId: 'p_next' }, async () => { return { ok: true }; });
            assert.equal(next.status, 'completed'); // gate released
            return { code: 'PERSIST_FAILED', gateReleased: true, successReported: false };
        } finally { h.cleanup(); }
    });

    // 7. travel_reload_persistence
    await runFixture('travel_reload_persistence', async () => {
        const h = createHarness();
        try {
            const receipt = executeMarketTravel('travel_reload', 'south_port', true, h.deps);
            assert.equal(receipt.persisted, true);
            // clear in-memory mock game state (simulate close/reload)
            h.deps.loadWorldState = () => ({ worldTurn: 7, factions: {}, regions: {}, recentChanges: [], markets: {} }); // no current location in world state
            const reloadedData = JSON.parse(fs.readFileSync(h.gamePath, 'utf8'));
            assert.equal(reloadedData.world.currentLocationId, 'south_port'); // destination remains authoritative after reload
            return { reloadedLocationId: 'south_port', retainedAfterClose: true };
        } finally { h.cleanup(); }
    });

    console.log(JSON.stringify({ fixtures: executedIds, count: fixtures.length, tempWorkspaceCleaned: true }));
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
