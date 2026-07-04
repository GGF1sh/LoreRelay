#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const bridgePath = path.join(root, 'out', 'settlementDioramaBridge.js');
const viewPath = path.join(root, 'out', 'settlementViewCore.js');
const rulesSrcPath = path.join(root, 'src', 'gameRules.ts');
const settlementCorePath = path.join(root, 'out', 'settlementCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [bridgePath, viewPath, rulesSrcPath, settlementCorePath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing - run npm run compile first`);
        process.exit(1);
    }
}

const {
    settlementDioramaEnabled,
    buildWorkspaceSettlementDiorama,
    resolveDioramaThemeFromOvermap,
} = require(bridgePath);
const { buildSettlementViewSnapshot } = require(viewPath);
const { parseSettlementState } = require(settlementCorePath);
const gameRulesSrc = fs.readFileSync(rulesSrcPath, 'utf8');

const baseState = parseSettlementState({
    version: 1,
    settlementId: 'scrapbound_hub',
    name: 'Scrapbound Enclave',
    morale: 55,
    safety: 40,
    stocks: [{ id: 'food', amount: 5 }],
    structures: [{ id: 'market_hall', name: 'Market Hall', status: 'intact', layerId: 'z0' }],
    residents: [],
    visitors: [],
    merchants: [],
    incidents: [],
});

const baseView = baseState
    ? buildSettlementViewSnapshot({ state: baseState, selectedLayerId: 'z0' })
    : undefined;

if (!baseView) {
    fail('fixture view should build');
    process.exit(1);
}

{
    if (settlementDioramaEnabled(undefined)) {
        fail('undefined rules should not enable diorama');
    } else if (settlementDioramaEnabled({ enableSettlementMode: true })) {
        fail('settlement on alone should not enable diorama');
    } else if (settlementDioramaEnabled({ enableSettlementDiorama: true })) {
        fail('diorama on alone should not enable without settlement mode');
    } else if (!settlementDioramaEnabled({ enableSettlementMode: true, enableSettlementDiorama: true })) {
        fail('both flags should enable diorama');
    } else {
        ok('settlementDioramaEnabled respects dual gate');
    }
}

{
    if (!/enableSettlementDiorama:\s*false/.test(gameRulesSrc)) {
        fail('DEFAULT_GAME_RULES should define enableSettlementDiorama: false');
    } else {
        ok('gameRules default enableSettlementDiorama is false');
    }
}

{
    const off = buildWorkspaceSettlementDiorama(baseView, { enableSettlementMode: true, enableSettlementDiorama: false });
    if (off !== undefined) {
        fail('flag off should not build diorama snapshot');
    } else {
        ok('flag off yields undefined');
    }
}

{
    const snap = buildWorkspaceSettlementDiorama(baseView, {
        enableSettlementMode: true,
        enableSettlementDiorama: true,
    });
    if (!snap || !snap.blocks.length) {
        fail('dual flag on should build diorama with blocks');
    } else if (snap.version !== 1) {
        fail(`diorama version should be 1: ${snap.version}`);
    } else {
        ok('dual flag on builds diorama from settlementView');
    }
}

{
    const themed = buildWorkspaceSettlementDiorama(baseView, {
        enableSettlementMode: true,
        enableSettlementDiorama: true,
    }, { theme: resolveDioramaThemeFromOvermap('postapoc') });
    if (!themed || themed.palette.theme !== 'postapoc') {
        fail(`postapoc theme mapping failed: ${themed?.palette?.theme}`);
    } else {
        ok('overmap theme maps to diorama palette theme');
    }
}

{
    const viewClone = JSON.parse(JSON.stringify(baseView));
    buildWorkspaceSettlementDiorama(viewClone, {
        enableSettlementMode: true,
        enableSettlementDiorama: true,
    });
    if (JSON.stringify(viewClone) !== JSON.stringify(baseView)) {
        fail('bridge must not mutate settlementView input');
    } else {
        ok('settlementView input is not mutated');
    }
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed`);
    process.exit(1);
}
console.log('\nAll settlement diorama bridge tests passed');