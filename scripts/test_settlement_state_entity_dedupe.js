#!/usr/bin/env node
'use strict';

/**
 * Settlement state entity dedupe — structures/residents/visitors/merchants/incidents
 * normalize to last-wins on parse (ChatGPT review follow-up).
 */

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const settlementCorePath = path.join(root, 'out', 'settlementCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!fs.existsSync(settlementCorePath)) {
    fail('out/settlementCore.js missing — run npm run compile first');
    process.exit(1);
}

const { parseSettlementState } = require(settlementCorePath);

{
    const state = parseSettlementState({
        version: 1,
        settlementId: 'hub',
        name: 'Hub',
        stocks: [],
        structures: [
            { id: 'hall', name: 'Old Hall', status: 'damaged', layerId: 'z0' },
            { id: 'hall', name: 'New Hall', status: 'intact', layerId: 'z0', note: 'Rebuilt' },
        ],
        residents: [],
        visitors: [],
        merchants: [],
        incidents: [],
    });
    if (!state || state.structures.length !== 1) {
        fail(`duplicate structure ids should collapse: ${JSON.stringify(state?.structures)}`);
    } else if (state.structures[0].name !== 'New Hall' || state.structures[0].note !== 'Rebuilt') {
        fail('structure dedupe should use last-wins');
    } else {
        ok('structure ids dedupe with last-wins');
    }
}

{
    const state = parseSettlementState({
        version: 1,
        settlementId: 'hub',
        name: 'Hub',
        stocks: [],
        structures: [],
        residents: [
            { npcId: 'guard_a', role: 'scout' },
            { npcId: 'guard_a', role: 'captain' },
        ],
        visitors: [
            { npcId: 'trader_x', untilWorldTurn: 10, purpose: 'scout' },
            { npcId: 'trader_x', untilWorldTurn: 20, purpose: 'trade' },
        ],
        merchants: [
            { npcId: 'vendor_y', untilWorldTurn: 5, wares: ['food'] },
            { npcId: 'vendor_y', untilWorldTurn: 15, wares: ['parts', 'water'] },
        ],
        incidents: [],
    });
    if (!state) {
        fail('state should parse');
    } else if (state.residents.length !== 1 || state.residents[0].role !== 'captain') {
        fail(`resident npcId dedupe failed: ${JSON.stringify(state.residents)}`);
    } else if (state.visitors.length !== 1 || state.visitors[0].untilWorldTurn !== 20) {
        fail(`visitor npcId dedupe failed: ${JSON.stringify(state.visitors)}`);
    } else if (state.merchants.length !== 1 || state.merchants[0].wares.join(',') !== 'parts,water') {
        fail(`merchant npcId dedupe failed: ${JSON.stringify(state.merchants)}`);
    } else {
        ok('resident/visitor/merchant npcId dedupe with last-wins');
    }
}

{
    const state = parseSettlementState({
        version: 1,
        settlementId: 'hub',
        name: 'Hub',
        stocks: [],
        structures: [],
        residents: [],
        visitors: [],
        merchants: [],
        incidents: [
            {
                id: 'inc_1',
                worldTurn: 3,
                kind: 'shortage',
                severity: 'info',
                resolved: false,
                text: 'First report',
            },
            {
                id: 'inc_1',
                worldTurn: 4,
                kind: 'shortage',
                severity: 'warning',
                resolved: false,
                text: 'Updated report',
            },
        ],
    });
    if (!state || state.incidents.length !== 1) {
        fail(`duplicate incident ids should collapse: ${JSON.stringify(state?.incidents)}`);
    } else if (state.incidents[0].text !== 'Updated report' || state.incidents[0].severity !== 'warning') {
        fail('incident dedupe should use last-wins');
    } else {
        ok('incident ids dedupe with last-wins');
    }
}

{
    const state = parseSettlementState({
        version: 1,
        settlementId: 'hub',
        name: 'Hub',
        stocks: [
            { id: 'food', amount: 1 },
            { id: 'food', amount: 0 },
        ],
        structures: [],
        residents: [],
        visitors: [],
        merchants: [],
        incidents: [],
    });
    const food = state?.stocks.find((s) => s.id === 'food');
    if (!food || food.amount !== 0) {
        fail(`stock dedupe should still last-wins to 0: ${JSON.stringify(state?.stocks)}`);
    } else {
        ok('stock dedupe unchanged (last-wins)');
    }
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed.`);
    process.exit(1);
}
console.log('settlement state entity dedupe: all tests passed.');