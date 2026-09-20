#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'settlementCore.js');
const campaignCorePath = path.join(root, 'out', 'campaignResourcesCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [corePath, campaignCorePath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing - run npm run compile first`);
        process.exit(1);
    }
}

const {
    parseSettlementState,
    parseSettlementLayout,
    parseSettlementOps,
    tickSettlementState,
    buildSettlementPromptBlock,
    settlementModeEnabled,
    emptySettlementState,
    MAX_SETTLEMENT_STOCKS,
    MAX_SETTLEMENT_PROMPT_CHARS,
} = require(corePath);
const {
    parseCampaignResourcesDocument,
    applyCampaignResourceOps,
} = require(campaignCorePath);

{
    const doc = parseSettlementState({
        version: 1,
        settlementId: 'scrapbound_hub',
        name: 'Scrapbound Enclave',
        morale: 150,
        safety: -5,
        stocks: [
            { id: 'food', amount: 12 },
            { id: 'food', amount: 3 },
            { id: 'bad id', amount: 1 },
            { id: 'parts', amount: -2 },
        ],
        visitors: [
            { npcId: 'trader_1', untilWorldTurn: 20, purpose: 'trade' },
            { npcId: 'bad npc', untilWorldTurn: 10 },
        ],
        incidents: [
            { id: 'inc_1', worldTurn: 5, kind: 'shortage', severity: 'warning', resolved: false, text: 'Pump failure' },
        ],
    });
    if (!doc || doc.settlementId !== 'scrapbound_hub') {
        fail(`parse should succeed: ${JSON.stringify(doc)}`);
    } else if (doc.morale !== 100 || doc.safety !== 0) {
        fail(`scores should clamp 0..100: morale=${doc.morale} safety=${doc.safety}`);
    } else if (doc.stocks.length !== 1 || doc.stocks[0].amount !== 3) {
        fail(`duplicate stock ids should collapse to last entry: ${JSON.stringify(doc.stocks)}`);
    } else if (doc.visitors.length !== 1 || doc.visitors[0].npcId !== 'trader_1') {
        fail(`invalid visitor should drop: ${JSON.stringify(doc.visitors)}`);
    } else {
        ok('parseSettlementState clamps scores and filters invalid entries');
    }
}

{
    const many = Array.from({ length: 100 }, (_, i) => ({ id: `s${i}`, amount: i }));
    const doc = parseSettlementState({
        version: 1,
        settlementId: 'cap_test',
        name: 'Cap Test',
        stocks: many,
        structures: many.map((_, i) => ({ id: `b${i}`, name: `B${i}`, status: 'intact' })),
    });
    if (!doc || doc.stocks.length !== MAX_SETTLEMENT_STOCKS) {
        fail(`stocks should cap at ${MAX_SETTLEMENT_STOCKS}: ${doc?.stocks.length}`);
    } else if (doc.structures.length !== 80) {
        fail(`structures should cap at 80: ${doc.structures.length}`);
    } else {
        ok('array caps enforced');
    }
}

{
    if (parseSettlementState({ version: 2, settlementId: 'x', name: 'X', stocks: [] }) !== undefined) {
        fail('unsupported version should reject');
    } else if (parseSettlementState({ version: 1, name: 'X', stocks: [] }) !== undefined) {
        fail('missing settlementId should reject');
    } else {
        ok('version and required field validation');
    }
}

{
    const layout = parseSettlementLayout({
        version: 1,
        settlementId: 'hub',
        layers: ['z0', 'z-1', 'bogus'],
        zones: [{ id: 'market', layerId: 'z0', label: 'Market Row', x: 4, y: 2 }],
        markers: [{ id: 'gate', layerId: 'z0', label: 'Main Gate' }],
    });
    if (!layout || layout.layers.length !== 2) {
        fail(`layout layers should filter invalid: ${JSON.stringify(layout)}`);
    } else if (layout.zones.length !== 1 || layout.markers.length !== 1) {
        fail('layout zones/markers should parse');
    } else {
        ok('parseSettlementLayout contract');
    }
}

{
    const ops = parseSettlementOps([
        { type: 'adjust_stock', stockId: 'food', delta: -2, reason: 'meals' },
        { type: 'set_score', key: 'morale', value: 55 },
        { type: 'bogus_op', stockId: 'food', delta: 1 },
        { type: 'adjust_stock', stockId: 'food', delta: 99999 },
        { type: 'resolve_incident', incidentId: 'inc_1' },
    ]);
    if (ops.length !== 4) {
        fail(`expected 4 valid ops, got ${ops.length}: ${JSON.stringify(ops)}`);
    } else if (ops[0].delta !== -2 || ops[1].value !== 55) {
        fail('valid ops should parse with clamps');
    } else if (ops[2].delta !== 500) {
        fail(`stock delta should clamp to MAX_STOCK_DELTA: ${ops[2].delta}`);
    } else {
        ok('parseSettlementOps rejects unknown ops and clamps values');
    }
}

{
    const base = emptySettlementState('hub', 'Hub');
    base.stocks = [{ id: 'food', amount: 5 }, { id: 'water', amount: 3 }];
    base.morale = 40;
    base.visitors = [{ npcId: 'v1', untilWorldTurn: 10 }];
    base.merchants = [{ npcId: 'm1', untilWorldTurn: 8, wares: ['parts'] }];
    base.incidents = [{
        id: 'i1', worldTurn: 1, kind: 'info', severity: 'info', resolved: true, text: 'old note',
    }];

    const ticked = tickSettlementState(base, {
        worldTurn: 20,
        stockConsumption: [{ stockId: 'food', amount: 2 }, { stockId: 'water', amount: 1 }],
    });

    if (ticked.stocks.find((s) => s.id === 'food')?.amount !== 3) {
        fail(`food should be 3 after tick: ${JSON.stringify(ticked.stocks)}`);
    } else if (ticked.visitors.length !== 0 || ticked.merchants.length !== 0) {
        fail('visitors/merchants should expire when untilWorldTurn <= worldTurn');
    } else if (ticked.incidents.length !== 0) {
        fail('resolved info incidents older than 14 turns should drop');
    } else if (ticked.morale !== 40) {
        fail(`morale should not decay while food remains - got ${ticked.morale}`);
    } else {
        ok('tickSettlementState consumes stocks and expires entities deterministically');
    }
}

{
    const outOfFood = tickSettlementState({
        ...emptySettlementState('hub', 'Hub'),
        stocks: [{ id: 'food', amount: 0 }],
        morale: 50,
        worldTurn: 3,
    }, { worldTurn: 4, stockConsumption: [] });
    if (outOfFood.morale !== 48) {
        fail(`morale should drop when food is OUT: ${outOfFood.morale}`);
    } else if (!outOfFood.stocks.find((s) => s.id === 'food' && s.amount === 0)) {
        fail('food entry should remain at 0 for OUT semantics');
    } else {
        ok('tick applies morale pressure when food is OUT');
    }
}

{
    const depleted = tickSettlementState({
        ...emptySettlementState('hub', 'Hub'),
        stocks: [{ id: 'food', amount: 1 }],
        morale: 50,
    }, {
        worldTurn: 2,
        stockConsumption: [{ stockId: 'food', amount: 1 }],
    });
    const food = depleted.stocks.find((s) => s.id === 'food');
    if (!food || food.amount !== 0) {
        fail(`food should remain at 0 after last unit consumed: ${JSON.stringify(depleted.stocks)}`);
    } else {
        ok('last stock unit consumed leaves zero entry');
    }
}

{
    const state = {
        ...emptySettlementState('hub', 'Hub'),
        stocks: [{ id: 'food', amount: 4 }],
        structures: [{ id: 'w1', name: 'Workshop', status: 'damaged' }],
        visitors: [{ npcId: 'npc_trader', untilWorldTurn: 30 }],
        incidents: [{ id: 'i2', worldTurn: 2, kind: 'attack', severity: 'critical', resolved: false, text: 'Raiders probed the wall' }],
    };
    const off = buildSettlementPromptBlock(state, false);
    const on = buildSettlementPromptBlock(state, true);
    if (off !== '') {
        fail('prompt block should be empty when disabled');
    } else if (!on.includes('[Settlement]') || !on.includes('Workshop') || !on.includes('Raiders')) {
        fail(`prompt block should summarize settlement: ${on.slice(0, 200)}`);
    } else if (!on.includes('no automatic sync')) {
        fail('prompt should warn about campaign_resources separation');
    } else if (on.length > MAX_SETTLEMENT_PROMPT_CHARS) {
        fail(`prompt should be bounded: ${on.length}`);
    } else if (settlementModeEnabled({ enableSettlementMode: false })) {
        fail('settlementModeEnabled should be false when flag off');
    } else if (!settlementModeEnabled({ enableSettlementMode: true })) {
        fail('settlementModeEnabled should be true when flag on');
    } else {
        ok('buildSettlementPromptBlock gated and bounded');
    }
}

{
    const campaignBefore = { version: 1, quantities: { food: 10, water: 8 } };
    const settlement = tickSettlementState({
        ...emptySettlementState('hub', 'Hub'),
        stocks: [{ id: 'food', amount: 20 }],
    }, { worldTurn: 1, stockConsumption: [{ stockId: 'food', amount: 5 }] });
    const campaignAfter = applyCampaignResourceOps(campaignBefore, [
        { op: 'delta', resourceId: 'food', amount: -3 },
    ]);
    if (settlement.stocks[0].amount !== 15) {
        fail('settlement tick should only touch settlement stocks');
    } else if (campaignAfter.quantities.food !== 7) {
        fail('campaign resources are independent ledger');
    } else if (parseCampaignResourcesDocument(campaignAfter).quantities.water !== 8) {
        fail('settlement tick must not mirror campaign resources');
    } else {
        ok('settlement stocks do not mutate campaign_resources');
    }
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed.`);
    process.exit(1);
}
console.log('settlement core: all tests passed.');