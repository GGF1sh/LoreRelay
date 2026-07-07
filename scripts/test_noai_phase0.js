#!/usr/bin/env node
'use strict';

const fs = require('fs');
const Module = require('module');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'out');

let failed = 0;
function ok(msg) { console.log(`OK: ${msg}`); }
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function eq(actual, expected, msg) {
    if (actual === expected) { ok(msg); }
    else { fail(`${msg} (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`); }
}
function assert(condition, msg) {
    if (condition) { ok(msg); }
    else { fail(msg); }
}
function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

const required = [
    'gameRulesCore.js',
    'livingWorldCommercePersist.js',
    'npcBridgeCore.js',
    'worldEventLogCore.js',
];
for (const file of required) {
    if (!fs.existsSync(path.join(out, file))) {
        fail(`${file} missing - run npm run compile`);
        process.exit(1);
    }
}

const gameRules = require(path.join(out, 'gameRulesCore.js'));
const realWorldEventLogCore = require(path.join(out, 'worldEventLogCore.js'));
const { applyEventsToNpcRegistry } = require(path.join(out, 'npcBridgeCore.js'));

function loadPersistWithStubs(stubs) {
    const persistPath = path.join(out, 'livingWorldCommercePersist.js');
    delete require.cache[require.resolve(persistPath)];
    const originalLoad = Module._load;
    Module._load = function patchedLoad(request, parent, isMain) {
        if (Object.prototype.hasOwnProperty.call(stubs, request)) {
            return stubs[request];
        }
        return originalLoad.apply(this, arguments);
    };
    try {
        return require(persistPath);
    } finally {
        Module._load = originalLoad;
    }
}

function createHarness(options = {}) {
    let worldState = clone(options.worldState ?? { worldTurn: 11, recentChanges: [], markets: {} });
    const savedWorldStates = [];
    const persist = loadPersistWithStubs({
        './worldState': {
            loadWorldState() {
                return clone(worldState);
            },
            saveWorldState(next) {
                worldState = clone(next);
                savedWorldStates.push(clone(next));
                return true;
            },
        },
        './stateManager': {
            commitGameState() {
                return { ok: true, action: 'write' };
            },
        },
        './workspaceWriteCircuitBreakerCore': {
            executeCrossFileDualWrite(plan) {
                const gameOk = plan.writeGame();
                const worldOk = plan.writeWorld();
                return {
                    ok: gameOk && worldOk,
                    gameAttempted: plan.gameAttempted,
                    worldAttempted: plan.worldAttempted,
                    gameOk,
                    worldOk,
                };
            },
        },
        './workspaceWriteHealth': {
            recordSplitBrainRisk() {},
        },
        './worldEventLogCore': options.worldEventLogCore ?? realWorldEventLogCore,
    });
    persist.resetCommercePersistForTests();
    return {
        persist,
        savedWorldStates,
        getWorldState() { return clone(worldState); },
    };
}

function draft(draftId, overrides = {}) {
    return {
        draftId,
        op: 'buy',
        marketLocationId: 'elda_shop',
        commodityId: 'wheat',
        qty: 2,
        goldDelta: -20,
        ...overrides,
    };
}

// Core-only policy: default/backward compatible, accepts only the Phase 0 enum.
{
    eq(gameRules.DEFAULT_GAME_RULES.aiParticipationPolicy, 'always', 'default aiParticipationPolicy is always');
    eq(gameRules.normalizeGameRules({ aiParticipationPolicy: 'onDemand' }).aiParticipationPolicy, 'onDemand', 'onDemand policy round-trips through normalizeGameRules');
    const base = { ...gameRules.DEFAULT_GAME_RULES, aiParticipationPolicy: 'simulationOnly' };
    eq(gameRules.normalizeGameRules({ aiParticipationPolicy: 'bogus' }, base).aiParticipationPolicy, 'simulationOnly', 'invalid policy preserves base');
}

// Two identical trades coalesced into one flush produce two distinct events.
{
    const h = createHarness({ worldState: { worldTurn: 17, recentChanges: [], markets: { old: true } } });
    h.persist.scheduleCommercePersist({
        markets: { elda_shop: { wheat: { stock: 8, priceIndex: 1 } } },
        tradeEventDrafts: [draft('trade-draft-a')],
    });
    h.persist.scheduleCommercePersist({
        tradeEventDrafts: [draft('trade-draft-b')],
    });
    h.persist.flushScheduledCommercePersist();
    const events = h.getWorldState().recentChanges ?? [];
    eq(events.length, 2, 'coalesced identical trades create two recentChanges events');
    assert(events[0].id !== events[1].id, 'coalesced identical trades have distinct event ids');
    assert(events.every((event) => event.worldTurn === 17), 'coalesced events use fresh worldTurn at flush');
    assert(events.every((event) => event.category === 'resource' && event.severity === 'info' && event.source === 'player'), 'commerce events use safe resource/info/player contract');
    assert(events.every((event) => event.factionId === undefined), 'commerce events do not set factionId');
}

// Two identical trades in separate flushes within the same worldTurn are not deduped.
{
    const h = createHarness({ worldState: { worldTurn: 23, recentChanges: [], markets: {} } });
    h.persist.scheduleCommercePersist({
        markets: { elda_shop: { wheat: { stock: 6, priceIndex: 1 } } },
        tradeEventDrafts: [draft('trade-draft-c')],
    });
    h.persist.flushScheduledCommercePersist();
    h.persist.scheduleCommercePersist({
        markets: { elda_shop: { wheat: { stock: 5, priceIndex: 1 } } },
        tradeEventDrafts: [draft('trade-draft-d')],
    });
    h.persist.flushScheduledCommercePersist();
    const events = h.getWorldState().recentChanges ?? [];
    eq(events.length, 2, 'separate same-turn identical trades create two events');
    assert(new Set(events.map((event) => event.id)).size === 2, 'separate same-turn events have distinct ids');
}

// Retrying persistence of the same pending draft recomputes the same id and dedupes.
{
    const h = createHarness({ worldState: { worldTurn: 31, recentChanges: [], markets: {} } });
    const sameDraft = draft('trade-draft-retry');
    h.persist.scheduleCommercePersist({
        markets: { elda_shop: { wheat: { stock: 4, priceIndex: 1 } } },
        tradeEventDrafts: [sameDraft],
    });
    h.persist.flushScheduledCommercePersist();
    const firstId = h.getWorldState().recentChanges[0].id;
    h.persist.scheduleCommercePersist({
        markets: { elda_shop: { wheat: { stock: 4, priceIndex: 1 } } },
        tradeEventDrafts: [sameDraft],
    });
    h.persist.flushScheduledCommercePersist();
    const events = h.getWorldState().recentChanges ?? [];
    eq(events.length, 1, 'retrying the same draft does not duplicate recentChanges');
    eq(events[0].id, firstId, 'retrying the same draft preserves event id');
}

// Reordering unrelated drafts does not alter each draft's id.
{
    const h = createHarness();
    const a = draft('trade-draft-order-a', { commodityId: 'wheat' });
    const b = draft('trade-draft-order-b', { commodityId: 'iron' });
    const forward = h.persist.materializeCommerceTradeEventDrafts([a, b], 41);
    const reversed = h.persist.materializeCommerceTradeEventDrafts([b, a], 41);
    const forwardByDraft = new Map([[a.draftId, forward[0].id], [b.draftId, forward[1].id]]);
    const reversedByDraft = new Map([[b.draftId, reversed[0].id], [a.draftId, reversed[1].id]]);
    eq(reversedByDraft.get(a.draftId), forwardByDraft.get(a.draftId), 'reordering preserves draft A event id');
    eq(reversedByDraft.get(b.draftId), forwardByDraft.get(b.draftId), 'reordering preserves draft B event id');
}

// Materialization failure is isolated from the market write.
{
    const warning = console.warn;
    console.warn = () => {};
    try {
        const h = createHarness({
            worldState: { worldTurn: 47, recentChanges: [], markets: { old: true } },
            worldEventLogCore: {
                makeWorldChangeEvent() {
                    throw new Error('synthetic materialization failure');
                },
                mergeRecentChanges: realWorldEventLogCore.mergeRecentChanges,
            },
        });
        h.persist.scheduleCommercePersist({
            markets: { elda_shop: { wheat: { stock: 7, priceIndex: 1 } } },
            tradeEventDrafts: [draft('trade-draft-fail')],
        });
        h.persist.flushScheduledCommercePersist();
        const ws = h.getWorldState();
        eq(ws.markets.elda_shop.wheat.stock, 7, 'market write survives trade event materialization failure');
        eq((ws.recentChanges ?? []).length, 0, 'failed materialization writes no partial commerce event');
    } finally {
        console.warn = warning;
    }
}

// The materialized event is safe for NPC food-crisis bridges.
{
    const h = createHarness();
    const [event] = h.persist.materializeCommerceTradeEventDrafts([draft('trade-draft-npc-safe')], 53);
    const forge = {
        geography: {
            regions: [],
            locations: [{ id: 'elda_shop', name: 'Elda Shop', type: 'town' }],
        },
        factions: [{ id: 'faction_merchants', name: 'Merchants', type: 'guild' }],
    };
    const registry = {
        format: 'lorerelay-npc-registry/1.0',
        npcs: {
            elda: {
                name: 'Elda',
                factionId: 'faction_merchants',
                locationId: 'elda_shop',
                disposition: { playerTrust: 50, playerRomance: 0, playerFear: 0, mood: 'neutral', lastInteractionTurn: 0 },
                needs: [],
                memories: [],
                personalityTraits: [],
                dialogueHints: {},
            },
        },
    };
    const result = applyEventsToNpcRegistry([event], registry, forge);
    eq(result.updatedIds.length, 0, 'commerce resource/info/no-faction event does not trigger NPC food crisis');
}

if (failed > 0) {
    process.exit(1);
}
console.log('NOAI Phase 0: all tests passed.');
