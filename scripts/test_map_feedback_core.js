#!/usr/bin/env node
'use strict';

const {
    classifyDangerTier,
    resolveFactionTint,
    mergeRegionDangerLevel,
    mergeRegionControllingFaction,
    buildRegionHighlightMeta,
    buildRegionMapFeedback,
} = require('../out/mapFeedbackCore');
const { makeWorldChangeEvent } = require('../out/worldEventLogCore');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

// classifyDangerTier
{
    if (classifyDangerTier(undefined) !== 'none') { fail('undefined danger'); }
    else if (classifyDangerTier(2) !== 'low') { fail('danger 2 = low'); }
    else if (classifyDangerTier(5) !== 'medium') { fail('danger 5 = medium'); }
    else if (classifyDangerTier(9) !== 'high') { fail('danger 9 = high'); }
    else { ok('classifyDangerTier'); }
}

// mergeRegionDangerLevel — overlay > sim > forge
{
    const forge = {
        geography: { regions: [{ id: 'r1', name: 'R1', type: 'other', dangerLevel: 2 }], locations: [] },
        factions: [],
        loreHistory: [],
        initialNpcs: [],
        meta: { worldName: 'T' },
    };
    const sim = { r1: { dangerLevel: 6 } };
    const overlay = { r1: { dangerLevel: 8 } };
    if (mergeRegionDangerLevel('r1', forge, sim, overlay) !== 8) { fail('overlay wins'); }
    else if (mergeRegionDangerLevel('r1', forge, sim) !== 6) { fail('sim over forge'); }
    else if (mergeRegionDangerLevel('r1', forge) !== 2) { fail('forge fallback'); }
    else { ok('mergeRegionDangerLevel'); }
}

// buildRegionHighlightMeta — highest severity wins
{
    const events = [
        makeWorldChangeEvent({ worldTurn: 1, category: 'region', regionId: 'r1', mapHighlight: true, severity: 'info', message: 'a' }),
        makeWorldChangeEvent({ worldTurn: 1, category: 'region', regionId: 'r1', mapHighlight: true, severity: 'critical', message: 'b' }),
    ];
    const meta = buildRegionHighlightMeta(events);
    if (meta.get('r1')?.severity !== 'critical') { fail('highlight severity'); }
    else { ok('buildRegionHighlightMeta'); }
}

// buildRegionMapFeedback — FoW gates danger/faction/highlight
{
    const forge = {
        meta: { worldName: 'T' },
        geography: {
            regions: [
                { id: 'seen', name: 'Seen', type: 'other', dangerLevel: 8 },
                { id: 'rumor', name: 'Rumor', type: 'other', connectedTo: ['seen'] },
                { id: 'hidden', name: 'Hidden', type: 'other' },
            ],
            locations: [],
        },
        factions: [{ id: 'f1', name: 'F1', type: 'hostile' }],
        loreHistory: [],
        initialNpcs: [],
    };
    const fog = { discoveredRegionIds: ['seen'], rumoredRegionIds: ['rumor'], visitedLocationIds: [] };
    const sim = { seen: { controllingFaction: 'f1', dangerLevel: 8 } };
    const events = [
        makeWorldChangeEvent({ worldTurn: 2, category: 'region', regionId: 'seen', mapHighlight: true, severity: 'warning', message: 'fire' }),
        makeWorldChangeEvent({ worldTurn: 2, category: 'region', regionId: 'hidden', mapHighlight: true, severity: 'critical', message: 'leak' }),
    ];
    const rows = buildRegionMapFeedback(forge, fog, events, sim);
    const seen = rows.find((r) => r.regionId === 'seen');
    const rumor = rows.find((r) => r.regionId === 'rumor');
    const hidden = rows.find((r) => r.regionId === 'hidden');
    if (!seen || seen.dangerTier !== 'high' || !seen.mapHighlight) { fail('seen feedback'); }
    else if (seen.factionTint !== 'hostile') { fail('seen faction tint'); }
    else if (rumor?.dangerTier !== 'none' || rumor?.mapHighlight) { fail('rumored suppressed'); }
    else if (hidden?.mapHighlight) { fail('unknown highlight suppressed'); }
    else { ok('buildRegionMapFeedback FoW gating'); }
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed.`);
    process.exit(1);
}
console.log('\nAll mapFeedbackCore tests passed.');