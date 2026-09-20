#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const bridgeCorePath = path.join(root, 'out', 'mapOverlayBridgeCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!fs.existsSync(bridgeCorePath)) {
    fail('out/mapOverlayBridgeCore.js missing - run npm run compile first');
    process.exit(1);
}

const { buildMapOverlayFromContext } = require(bridgeCorePath);

const forge = {
    format: 'lorerelay-world-forge/1.0',
    meta: { worldName: 'Test', theme: 'test', worldSeed: 'seed-1' },
    geography: {
        regions: [{ id: 'r_hub', name: 'Hub', type: 'urban', x: 400, y: 500, connectedTo: [] }],
        locations: [{ id: 'hub_market', name: 'Market', regionId: 'r_hub', type: 'settlement' }],
    },
    factions: [{ id: 'faction_a', name: 'Traders', type: 'friendly' }],
};

const baseCtx = {
    forge,
    fog: { discoveredRegionIds: ['r_hub'], rumoredRegionIds: [] },
    gameRules: {
        enableNpcAgency: true,
        enableNpcRegistry: true,
        enableSettlementMode: false,
        enableCampaignKit: false,
        enableFactionReputation: true,
    },
    simEnabled: true,
    worldState: {
        worldTurn: 100,
        questHooks: [{
            id: 'q_a',
            title: 'Quest A',
            description: 'First hook',
            source: 'campaign',
            relatedId: 'r_hub',
            status: 'available',
            turnGenerated: 1,
        }],
        npcPositions: { npc_a: { locationId: 'hub_market', regionId: 'r_hub' } },
        regions: { r_hub: { controllingFaction: 'faction_a' } },
        factions: { faction_a: { reputation: 0 } },
    },
    registry: { npcs: { npc_a: { name: 'Traveler', locationId: 'hub_market', disposition: { mood: 'neutral', playerTrust: 50 } } } },
    settlementState: undefined,
    campaignKitActive: false,
    discoveryLedger: undefined,
    knownNpcIds: new Set(['npc_a']),
};

{
    const snapA = buildMapOverlayFromContext(baseCtx);
    const snapB = buildMapOverlayFromContext(baseCtx);
    if (JSON.stringify(snapA) !== JSON.stringify(snapB)) {
        fail('same context should produce identical overlay snapshots');
    } else {
        ok('buildMapOverlayFromContext is deterministic');
    }
}

{
    const snapTurn100 = buildMapOverlayFromContext(baseCtx);
    const snapTurn101 = buildMapOverlayFromContext({
        ...baseCtx,
        worldState: {
            ...baseCtx.worldState,
            worldTurn: 101,
            questHooks: [{
                id: 'q_b',
                title: 'Quest B',
                description: 'Second hook',
                source: 'campaign',
                relatedId: 'r_hub',
                status: 'available',
                turnGenerated: 2,
            }],
        },
    });
    if (JSON.stringify(snapTurn100) === JSON.stringify(snapTurn101)) {
        fail('overlay should reflect worldState changes when context differs');
    } else {
        ok('overlay reflects injected worldState snapshot');
    }
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed`);
    process.exit(1);
}
console.log('\nAll map overlay context coherence tests passed');