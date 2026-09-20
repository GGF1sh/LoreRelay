#!/usr/bin/env node
/**
 * Unit tests for npcBridgeCore.ts (Living World — v1.4 hardening).
 */
const { applyEventsToNpcRegistry, extractHighlightRegionIds } = require('../out/npcBridgeCore');
const { makeWorldChangeEvent } = require('../out/worldEventLogCore');

let failed = 0;

function fail(msg) {
    console.error(`FAIL: ${msg}`);
    failed++;
}

function ok(msg) {
    console.log(`OK: ${msg}`);
}

const FORGE = {
    geography: {
        regions: [{ id: 'deep', name: 'Deep', type: 'dungeon' }],
        locations: [
            { id: 'chamber', name: 'Chamber', type: 'dungeon', regionId: 'deep' },
        ],
    },
    factions: [{ id: 'undead', name: 'Undead', type: 'hostile' }],
};

const REGISTRY = {
    format: 'lorerelay-npc-registry/1.0',
    npcs: {
        guard_a: {
            name: 'Guard A',
            factionId: 'undead',
            locationId: 'chamber',
            disposition: { playerTrust: 50, playerRomance: 0, playerFear: 0, mood: 'neutral', lastInteractionTurn: 0 },
            needs: [],
            memories: [],
            personalityTraits: [],
            dialogueHints: {},
        },
        guard_b: {
            name: 'Guard B',
            factionId: 'undead',
            locationId: 'chamber',
            disposition: { playerTrust: 50, playerRomance: 0, playerFear: 0, mood: 'neutral', lastInteractionTurn: 0 },
            needs: [],
            memories: [],
            personalityTraits: [],
            dialogueHints: {},
        },
    },
};

// Food crisis applies material need to faction NPCs
{
    const event = makeWorldChangeEvent({
        worldTurn: 3,
        category: 'resource',
        severity: 'warning',
        factionId: 'undead',
        message: 'Food depleted',
        idSuffix: 'undead_food',
    });
    const { registry, updatedIds } = applyEventsToNpcRegistry([event], REGISTRY, FORGE);
    if (updatedIds.length !== 2) {
        fail(`expected 2 updated NPCs, got ${updatedIds.length}`);
    } else {
        ok('food crisis updates all faction NPCs');
    }
    const need = registry.npcs.guard_a.needs.find((n) => n.type === 'material');
    if (!need || need.urgency !== 75) {
        fail('food crisis need urgency should be 75');
    } else {
        ok('food crisis need urgency 75');
    }
}

// Repeated food events upsert — not duplicate needs
{
    const event1 = makeWorldChangeEvent({
        worldTurn: 4,
        category: 'resource',
        severity: 'warning',
        factionId: 'undead',
        message: 'Food depleted again',
        idSuffix: 'undead_food_2',
    });
    const event2 = makeWorldChangeEvent({
        worldTurn: 5,
        category: 'resource',
        severity: 'warning',
        factionId: 'undead',
        message: 'Still no food',
        idSuffix: 'undead_food_3',
    });
    let reg = REGISTRY;
    reg = applyEventsToNpcRegistry([event1], reg, FORGE).registry;
    reg = applyEventsToNpcRegistry([event2], reg, FORGE).registry;
    const materialNeeds = reg.npcs.guard_a.needs.filter((n) => n.type === 'material');
    if (materialNeeds.length !== 1) {
        fail(`expected 1 material need after upsert, got ${materialNeeds.length}`);
    } else if (materialNeeds[0].urgency !== 95) {
        fail(`expected urgency 95 after second crisis, got ${materialNeeds[0].urgency}`);
    } else {
        ok('repeated food crises upsert same need (urgency 95)');
    }
}

// Region danger applies safety need to NPCs in region
{
    const event = makeWorldChangeEvent({
        worldTurn: 6,
        category: 'region',
        severity: 'warning',
        regionId: 'deep',
        mapHighlight: true,
        message: 'Danger rising',
        idSuffix: 'deep_danger',
    });
    const { registry, updatedIds } = applyEventsToNpcRegistry([event], REGISTRY, FORGE);
    if (updatedIds.length !== 2) {
        fail(`expected 2 NPCs with safety need, got ${updatedIds.length}`);
    } else {
        ok('region danger updates NPCs in region');
    }
    const need = registry.npcs.guard_a.needs.find((n) => n.type === 'emotional');
    if (!need || need.urgency !== 60) {
        fail('safety need urgency should be 60');
    } else {
        ok('safety need urgency 60');
    }
}

// extractHighlightRegionIds
{
    const events = [
        makeWorldChangeEvent({ worldTurn: 1, category: 'region', severity: 'info', regionId: 'deep', mapHighlight: true, message: 'x' }),
        makeWorldChangeEvent({ worldTurn: 1, category: 'faction', severity: 'info', message: 'y' }),
    ];
    const ids = extractHighlightRegionIds(events);
    if (!ids.has('deep') || ids.size !== 1) {
        fail('extractHighlightRegionIds should return deep only');
    } else {
        ok('extractHighlightRegionIds filters mapHighlight regions');
    }
}

// Input registry is not mutated
{
    const cloneBefore = JSON.stringify(REGISTRY);
    const event = makeWorldChangeEvent({
        worldTurn: 7,
        category: 'resource',
        severity: 'warning',
        factionId: 'undead',
        message: 'Food',
        idSuffix: 'f',
    });
    applyEventsToNpcRegistry([event], REGISTRY, FORGE);
    if (JSON.stringify(REGISTRY) !== cloneBefore) {
        fail('applyEventsToNpcRegistry must not mutate input registry');
    } else {
        ok('input registry not mutated');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('All npc bridge tests passed.');