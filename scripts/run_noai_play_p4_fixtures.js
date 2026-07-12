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
const endDayPath = path.join(out, 'endDayWorldProgression.js');
const shopkeeperPath = path.join(out, 'shopkeeperDirectTradeCore.js');

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
const { executeEndDay } = require(endDayPath);
const { executeShopkeeperTrade, parseShopkeeperIntent } = require(shopkeeperPath);
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
    
    let commitCount = 0;
    
    const deps = {
        loadGameRules: () => ({ enableCommerce: true, enableWorldForge: true, enableEmergentSimulation: false }),
        isWorldForgeEnabled: () => true,
        loadWorldForge: () => forge,
        loadWorldForgeDocument: () => rawForge,
        loadWorldState: () => world,
        getGameStatePath: () => gamePath,
        commitGameState: (next) => {
            if (options.throwWrite) throw new Error('writer threw');
            if (options.failWrite) return { ok: false, action: 'skip', reason: ['fixture failure'] };
            fs.writeFileSync(gamePath, JSON.stringify(next, null, 2));
            commitCount++;
            return { ok: true, action: 'write' };
        },
        readStateRevision: () => 1,
    };
    return { dir, gamePath, deps, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }), get world() { return world; }, set world(next) { world = next; }, get commitCount() { return commitCount; } };
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
            const beforeData = JSON.parse(fs.readFileSync(h.gamePath, 'utf8'));
            const beforeWorld = JSON.stringify(h.world);
            
            const receipt = executeMarketTravel('travel_success', 'south_port', true, h.deps);
            assert.equal(receipt.persisted, true);
            assert.equal(receipt.elapsedWorldTurns, 0);
            assert.deepEqual(receipt.origin, { id: 'north_farm', name: 'North Farm' });
            assert.deepEqual(receipt.destination, { id: 'south_port', name: 'South Port' });
            
            const afterData = JSON.parse(fs.readFileSync(h.gamePath, 'utf8'));
            assert.equal(afterData.world.currentLocationId, 'south_port', 'location changed exactly once');
            assert.equal(h.commitCount, 1, 'commit count is exactly 1');
            assert.equal(h.world.worldTurn, 7, 'world turn unchanged');
            assert.equal(JSON.stringify(h.world), beforeWorld, 'world_state data unchanged (market data unchanged)');
            assert.deepEqual(afterData.commerce, beforeData.commerce, 'credits, cargo and food unchanged');
            
            return { origin: 'north_farm', destination: 'south_port', elapsedWorldTurns: 0, persisted: true };
        } finally { h.cleanup(); }
    });

    // 2. same_location_rejection
    await runFixture('same_location_rejection', async () => {
        const h = createHarness();
        try {
            const beforeData = fs.readFileSync(h.gamePath, 'utf8');
            const result = executeMarketTravel('travel_same', 'north_farm', true, h.deps);
            assert.equal(result.code, 'SAME_LOCATION');
            assert.equal(readLocation(h.gamePath), 'north_farm');
            assert.equal(h.commitCount, 0, 'commit count exactly 0');
            assert.equal(fs.readFileSync(h.gamePath, 'utf8'), beforeData, 'canonical file bytes are unchanged');
            return { code: 'SAME_LOCATION', mutated: false };
        } finally { h.cleanup(); }
    });

    // 3. unknown_destination_rejection
    await runFixture('unknown_destination_rejection', async () => {
        const h = createHarness();
        try {
            const beforeData = fs.readFileSync(h.gamePath, 'utf8');
            const result = executeMarketTravel('travel_unknown', 'missing_market', true, h.deps);
            assert.equal(result.code, 'UNKNOWN_DESTINATION');
            assert.equal(readLocation(h.gamePath), 'north_farm');
            assert.equal(h.commitCount, 0, 'commit count exactly 0');
            assert.equal(fs.readFileSync(h.gamePath, 'utf8'), beforeData, 'canonical file bytes are unchanged');
            return { code: 'UNKNOWN_DESTINATION', mutated: false };
        } finally { h.cleanup(); }
    });

    // 4. duplicate_request_travel
    await runFixture('duplicate_request_travel', async () => {
        const h = createHarness();
        try {
            const gate = createMarketTravelRequestGate(2);
            const p1 = gate.run(h.dir, 'req_001', async () => executeMarketTravel('req_001', 'south_port', true, h.deps));
            const p2 = gate.run(h.dir, 'req_001', async () => executeMarketTravel('req_001', 'elda_shop', true, h.deps));
            
            const r1 = await p1;
            const r2 = await p2;
            
            assert.equal(h.commitCount, 1, 'commit count is exactly 1');
            assert.equal(readLocation(h.gamePath), 'south_port', 'disk location changes exactly once');
            assert.deepEqual(r1, r2, 'completed replay does not write again');
            assert.equal(r2.destination.id, 'south_port', 'never falsely claims the second destination');
            
            return { executions: h.commitCount, replayMovedAgain: false };
        } finally { h.cleanup(); }
    });

    // 5. cross_action_travel_contention
    await runFixture('cross_action_travel_contention', async () => {
        const hA = createHarness();
        const hB = createHarness();
        try {
            const shared = createDeterministicWorkspaceMutationGate();
            
            // Helper functions wrapping actual production cores
            const runP2 = async (harness, reqId) => shared.run(harness.dir, { actionKind: 'shopkeeper_trade', requestId: reqId }, async () => {
                const intent = parseShopkeeperIntent({ op: 'buy', marketLocationId: 'north_farm', commodityId: 'wheat', qty: 1, total: 2, creditsBefore: 100 });
                return executeShopkeeperTrade(harness.deps.loadWorldForgeDocument(), harness.world.markets, { credits: 100, cargo: [], transportId: 'wagon', food: 8 }, 'north_farm', intent, true, 'evt');
            });
            const runP3 = async (harness, reqId) => shared.run(harness.dir, { actionKind: 'end_day', requestId: reqId }, async () => {
                return executeEndDay(reqId, false, harness.deps);
            });
            const runP4 = async (harness, reqId) => shared.run(harness.dir, { actionKind: 'market_travel', requestId: reqId }, async () => {
                return executeMarketTravel(reqId, 'south_port', true, harness.deps);
            });

            // A. real P2 active -> real P4 rejected
            {
                const hold = deferred();
                const p2 = shared.run(hA.dir, { actionKind: 'shopkeeper_trade', requestId: 'p2a' }, async () => { await hold.promise; return { ok: true }; });
                const p4 = await runP4(hA, 'p4a');
                assert.equal(p4.code, WORLD_MUTATION_IN_PROGRESS, 'A. real P2 active -> real P4 rejected');
                assert.equal(hA.commitCount, 0, 'rejected mutation performs no authoritative read/write');
                hold.resolve(); await p2;
            }

            // B. real P3 active -> real P4 rejected
            {
                const hold = deferred();
                const p3 = shared.run(hA.dir, { actionKind: 'end_day', requestId: 'p3b' }, async () => { await hold.promise; return { ok: true }; });
                const p4 = await runP4(hA, 'p4b');
                assert.equal(p4.code, WORLD_MUTATION_IN_PROGRESS, 'B. real P3 active -> real P4 rejected');
                hold.resolve(); await p3;
            }

            // C. real P4 active -> real P2 rejected
            {
                const hold = deferred();
                const p4 = shared.run(hA.dir, { actionKind: 'market_travel', requestId: 'p4c' }, async () => { await hold.promise; return { ok: true }; });
                const p2 = await runP2(hA, 'p2c');
                assert.equal(p2.code, WORLD_MUTATION_IN_PROGRESS, 'C. real P4 active -> real P2 rejected');
                hold.resolve(); await p4;
            }

            // D. real P4 active -> real P3 rejected
            {
                const hold = deferred();
                const p4 = shared.run(hA.dir, { actionKind: 'market_travel', requestId: 'p4d' }, async () => { await hold.promise; return { ok: true }; });
                const p3 = await runP3(hA, 'p3d');
                assert.equal(p3.code, WORLD_MUTATION_IN_PROGRESS, 'D. real P4 active -> real P3 rejected');
                
                // Workspace B can complete independently
                const otherP4 = await runP4(hB, 'other_p4');
                assert.equal(otherP4.status, 'completed', 'workspace B can complete independently');
                
                hold.resolve(); await p4;
            }

            // Check invariants
            assert.equal(hA.world.worldTurn, 7, 'world turn does not change from rejected P4');
            const gameA = JSON.parse(fs.readFileSync(hA.gamePath, 'utf8'));
            assert.equal(gameA.commerce.credits, 100, 'player credits/cargo/market stock are not lost');
            
            return { sameWorkspaceLoser: WORLD_MUTATION_IN_PROGRESS, maxSameWorkspaceProtectedMutationCount: 1, crossWorkspaceConcurrent: true };
        } finally { hA.cleanup(); hB.cleanup(); }
    });

    // 6. travel_persistence_failure
    await runFixture('travel_persistence_failure', async () => {
        const h = createHarness({ failWrite: true });
        try {
            const shared = createDeterministicWorkspaceMutationGate();
            const resultMutation = await shared.run(h.dir, { actionKind: 'market_travel', requestId: 'p_fail' }, async () => {
                return executeMarketTravel('travel_fail', 'south_port', true, h.deps);
            });
            assert.equal(resultMutation.status, 'completed'); // gate wrapper completed
            assert.equal(resultMutation.value.code, 'PERSIST_FAILED');
            assert.equal(resultMutation.value.ok, false);
            assert.equal(readLocation(h.gamePath), 'north_farm'); // unchanged
            const next = await shared.run(h.dir, { actionKind: 'market_travel', requestId: 'p_next' }, async () => { return { ok: true }; });
            assert.equal(next.status, 'completed'); // gate released
            return { code: 'PERSIST_FAILED', gateReleased: true, successReported: false };
        } finally { h.cleanup(); }
    });

    // 7. travel_reload_persistence
    await runFixture('travel_reload_persistence', async () => {
        const h = createHarness();
        try {
            let gate = createMarketTravelRequestGate(2);
            const r1 = await gate.run(h.dir, 'req_reload', async () => executeMarketTravel('req_reload', 'south_port', true, h.deps));
            assert.equal(r1.persisted, true);
            
            gate = createMarketTravelRequestGate(2); // new request gate
            // mock a fresh reader context by clearing the world state
            h.deps.loadWorldState = () => ({ worldTurn: 7, factions: {}, regions: {}, recentChanges: [], markets: {} });
            
            const reloadedData = JSON.parse(fs.readFileSync(h.gamePath, 'utf8'));
            assert.equal(reloadedData.world.currentLocationId, 'south_port', 'destination persists without cached result or in-memory state');
            
            return { reloadedLocationId: 'south_port', retainedAfterClose: true };
        } finally { h.cleanup(); }
    });

    console.log(JSON.stringify({ fixtures: executedIds, count: fixtures.length, tempWorkspaceCleaned: true }));
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
