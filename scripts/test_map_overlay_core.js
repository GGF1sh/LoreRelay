#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'mapOverlayCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!fs.existsSync(corePath)) {
    fail('out/mapOverlayCore.js missing - run npm run compile first');
    process.exit(1);
}

const {
    buildMapOverlaySnapshot,
    deriveKnownNpcIds,
    deriveSettlementPressureBand,
    OVERLAY_MARKER_KEYS,
    pickOverlayMarkerKeys,
    MAX_OVERLAY_TOTAL,
} = require(corePath);

const forge = {
    format: 'lorerelay-world-forge/1.0',
    meta: { worldName: 'Test', theme: 'test', worldSeed: 'seed-1' },
    geography: {
        regions: [
            { id: 'r_settlement', name: 'Hub', type: 'urban', x: 400, y: 500, connectedTo: ['r_industrial'] },
            { id: 'r_industrial', name: 'Ruins', type: 'ruins', x: 700, y: 420, connectedTo: ['r_settlement'] },
        ],
        locations: [
            { id: 'hub_market', name: 'Market', regionId: 'r_settlement', type: 'settlement' },
            { id: 'factory', name: 'Factory', regionId: 'r_industrial', type: 'ruins' },
        ],
    },
    factions: [
        { id: 'faction_a', name: 'Traders', type: 'friendly' },
        { id: 'faction_b', name: 'Raiders', type: 'hostile' },
    ],
};

const baseInputs = {
    forge,
    fog: { discoveredRegionIds: ['r_settlement'], rumoredRegionIds: ['r_industrial'] },
    enableNpcAgency: true,
    enableNpcRegistry: true,
    enableSettlementMode: true,
    enableCampaignKit: true,
    enableFactionReputation: true,
    worldTurn: 10,
};

{
    const snap = buildMapOverlaySnapshot({
        ...baseInputs,
        fog: { discoveredRegionIds: ['r_settlement'], rumoredRegionIds: [] },
        worldRegions: { r_industrial: { controllingFaction: 'faction_b' } },
    });
    const industrial = snap.markers.filter((m) => m.id.includes('r_industrial'));
    if (industrial.length !== 0) {
        fail(`undiscovered-only region should not emit markers when only rumored parent discovered: ${JSON.stringify(industrial)}`);
    } else {
        ok('undiscovered region emits zero markers');
    }
}

{
    const snap = buildMapOverlaySnapshot({
        ...baseInputs,
        fog: { discoveredRegionIds: [], rumoredRegionIds: ['r_industrial'] },
        worldRegions: { r_industrial: { controllingFaction: 'faction_b' } },
    });
    if (!snap.markers.length) {
        fail('rumored region should emit degraded markers');
    } else if (!snap.markers.every((m) => m.fogVisibility === 'rumored')) {
        fail('rumored markers must use fogVisibility rumored');
    } else if (snap.markers.some((m) => m.label.includes('Raiders'))) {
        fail('rumored faction marker must not expose exact faction name');
    } else if (!snap.markers.every((m) => m.tone === 'unknown' || m.tone === 'neutral' || m.tone === 'hostile')) {
        fail('rumored markers should use unknown tone for faction');
    } else {
        ok('rumored region emits degraded markers');
    }
}

{
    const snap = buildMapOverlaySnapshot({
        ...baseInputs,
        discoveryLedger: {
            version: 1,
            entries: [{
                id: 'find_secret',
                kind: 'lore',
                label: 'Strange idol',
                identifiedLabel: 'Pre-war idol',
                status: 'unidentified',
                siteId: 'hub_market',
                notes: 'hidden notes',
                valueHint: 500,
            }],
        },
    });
    const d = snap.markers.find((m) => m.kind === 'discovery');
    if (!d) {
        fail('discovery marker expected');
    } else if (d.label.includes('idol') || d.label.includes('Pre-war')) {
        fail(`unidentified discovery must not leak label: ${d.label}`);
    } else if (d.detail && (d.detail.includes('500') || d.detail.includes('notes'))) {
        fail('discovery marker must not leak value or notes');
    } else {
        ok('unidentified discovery uses generic label');
    }
}

{
    const registry = {
        format: 'npc-registry/1.0',
        npcs: {
            secret_npc: {
                name: 'Hidden Agent',
                locationId: 'factory',
                disposition: { playerTrust: 0, playerRomance: 0, playerFear: 0, mood: 'neutral', lastInteractionTurn: 0 },
                needs: [],
                memories: [],
            },
            met_npc: {
                name: 'Mira',
                locationId: 'hub_market',
                disposition: { playerTrust: 20, playerRomance: 0, playerFear: 0, mood: 'neutral', lastInteractionTurn: 3 },
                needs: [],
                memories: [],
            },
        },
    };
    const known = deriveKnownNpcIds(registry, ['hub_market']);
    const snap = buildMapOverlaySnapshot({
        ...baseInputs,
        fog: { discoveredRegionIds: ['r_settlement', 'r_industrial'], rumoredRegionIds: [] },
        npcRegistry: registry,
        npcPositions: {
            secret_npc: { locationId: 'factory', arrivesTurn: 5 },
            met_npc: { locationId: 'hub_market', arrivesTurn: 5 },
        },
        knownNpcIds: known,
    });
    const npcMarkers = snap.markers.filter((m) => m.kind === 'npc');
    if (npcMarkers.some((m) => m.id.includes('secret_npc'))) {
        fail('unmet secret NPC must not appear');
    } else if (!npcMarkers.some((m) => m.id.includes('met_npc'))) {
        fail('met NPC should appear');
    } else {
        ok('NPC markers respect acquaintance gate');
    }
}

{
    const settlement = {
        version: 1,
        settlementId: 'hub',
        name: 'Hub',
        locationId: 'hub_market',
        morale: 15,
        safety: 20,
        stocks: [{ id: 'food', amount: 0 }],
        structures: [],
        residents: [],
        visitors: [],
        merchants: [],
        incidents: [
            { id: 'i1', worldTurn: 1, kind: 'attack', severity: 'critical', resolved: false, text: 'Raiders hit the wall' },
            { id: 'i2', worldTurn: 2, kind: 'shortage', severity: 'warning', resolved: false, text: 'Food gone' },
        ],
    };
    const snap = buildMapOverlaySnapshot({
        ...baseInputs,
        settlementState: settlement,
    });
    const p = snap.markers.find((m) => m.kind === 'settlement_pressure');
    if (!p) {
        fail('settlement pressure marker expected');
    } else if (p.detail && (p.detail.includes('0') || p.detail.includes('food'))) {
        fail('pressure must not expose raw stock numbers');
    } else if (p.label.includes('Raiders') || p.label.includes('Food')) {
        fail('pressure label must be aggregate only');
    } else if (deriveSettlementPressureBand(settlement) !== 'crisis') {
        fail('pressure band should be crisis');
    } else {
        ok('settlement pressure is qualitative only');
    }
}

{
    const snap = buildMapOverlaySnapshot({
        ...baseInputs,
        enableSettlementMode: false,
        enableCampaignKit: false,
        enableNpcAgency: false,
        settlementState: {
            version: 1,
            settlementId: 'hub',
            name: 'Hub',
            locationId: 'hub_market',
            stocks: [{ id: 'food', amount: 1 }],
            structures: [],
            residents: [],
            visitors: [{ npcId: 'trader', untilWorldTurn: 20, purpose: 'trade' }],
            merchants: [{ npcId: 'trader', untilWorldTurn: 20, wares: ['parts'] }],
            incidents: [],
        },
        discoveryLedger: { version: 1, entries: [{ id: 'd1', kind: 'material', label: 'Scrap', status: 'unidentified', siteId: 'hub_market' }] },
        npcRegistry: { format: 'npc-registry/1.0', npcs: { n1: { name: 'N', locationId: 'hub_market', disposition: { playerTrust: 0, playerRomance: 0, playerFear: 0, mood: 'neutral', lastInteractionTurn: 5 }, needs: [], memories: [] } } },
        knownNpcIds: new Set(['n1']),
    });
    const kinds = new Set(snap.markers.map((m) => m.kind));
    if (kinds.has('merchant') || kinds.has('caravan') || kinds.has('settlement_pressure') || kinds.has('discovery') || kinds.has('npc')) {
        fail(`disabled sources should not emit settlement/campaign/npc markers: ${[...kinds].join(',')}`);
    } else {
        ok('feature gates suppress disabled marker kinds');
    }
}

{
    const manyHooks = Array.from({ length: 60 }, (_, i) => ({
        id: `q${i}`,
        title: `Quest ${i}`,
        description: 'd',
        source: 'campaign',
        relatedId: 'r_settlement',
        status: 'available',
        turnGenerated: 1,
    }));
    const snap = buildMapOverlaySnapshot({
        ...baseInputs,
        questHooks: manyHooks,
    });
    if (snap.markers.length > MAX_OVERLAY_TOTAL) {
        fail(`total cap exceeded: ${snap.markers.length}`);
    } else {
        ok('total marker cap enforced');
    }
}

{
    const snapA = buildMapOverlaySnapshot({
        ...baseInputs,
        worldRegions: { r_settlement: { controllingFaction: 'faction_a' } },
        questHooks: [{ id: 'q1', title: 'Salvage run', description: 'd', source: 'campaign', relatedId: 'r_settlement', status: 'available', turnGenerated: 1 }],
    });
    const snapB = buildMapOverlaySnapshot({
        ...baseInputs,
        worldRegions: { r_settlement: { controllingFaction: 'faction_a' } },
        questHooks: [{ id: 'q1', title: 'Salvage run', description: 'd', source: 'campaign', relatedId: 'r_settlement', status: 'available', turnGenerated: 1 }],
    });
    if (JSON.stringify(snapA) !== JSON.stringify(snapB)) {
        fail('snapshot must be deterministic');
    } else {
        ok('deterministic snapshot for same inputs');
    }
}

{
    const snap = buildMapOverlaySnapshot({
        ...baseInputs,
        worldRegions: { r_settlement: { controllingFaction: 'faction_a' } },
    });
    for (const marker of snap.markers) {
        const keys = Object.keys(marker);
        const allowed = new Set(OVERLAY_MARKER_KEYS);
        if (keys.some((k) => !allowed.has(k))) {
            fail(`extra marker keys: ${keys.join(',')}`);
        }
        const picked = pickOverlayMarkerKeys(marker);
        if (Object.keys(picked).some((k) => !allowed.has(k))) {
            fail('pickOverlayMarkerKeys leaked keys');
        }
    }
    ok('marker key allow-list enforced');
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed.`);
    process.exit(1);
}
console.log('map overlay core: all tests passed.');