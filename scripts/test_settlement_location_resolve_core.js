#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'settlementLocationResolveCore.js');

let failed = 0;
let cases = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); cases++; }
function check(c, m) { if (c) ok(m); else fail(m); }

if (!fs.existsSync(corePath)) {
    fail('out/settlementLocationResolveCore.js missing — run npm run compile');
    process.exit(1);
}

const {
    resolveFixedSettlementFromFacts,
    resolveMobileBaseSettlementFromFacts,
    mapPathValidationCode,
} = require(corePath);

const catalog = new Set(['loc_sapphire_port', 'loc_mistgrove']);

function baseState(over = {}) {
    return {
        version: 1,
        settlementId: 'set_port',
        name: 'Sapphire Port',
        locationId: 'loc_sapphire_port',
        stocks: [],
        structures: [],
        residents: [],
        visitors: [],
        merchants: [],
        incidents: [],
        ...over,
    };
}

function baseLayout(over = {}) {
    return {
        version: 1,
        settlementId: 'set_port',
        layers: ['z0'],
        zones: [],
        markers: [],
        ...over,
    };
}

function fixedFacts(over = {}) {
    return {
        requestedLocationId: 'loc_sapphire_port',
        forgeLocationIds: catalog,
        activeMobileBaseSettlementId: 'mb_deck',
        scopedStatePath: 'W/settlements/loc_sapphire_port/settlement_state.json',
        scopedLayoutPath: 'W/settlements/loc_sapphire_port/settlement_layout.json',
        scopedState: { status: 'missing' },
        scopedLayout: { status: 'missing' },
        scopedAnyFileExists: false,
        legacyStatePath: 'W/settlement_state.json',
        legacyLayoutPath: 'W/settlement_layout.json',
        legacyState: { status: 'missing' },
        legacyLayout: { status: 'missing' },
        legacyAnyFileExists: false,
        ...over,
    };
}

// mapPathValidationCode
check(mapPathValidationCode('unknown_location') === 'unknown_location', 'map: preserve unknown_location');
check(mapPathValidationCode('empty') === 'invalid_location_id', 'map: syntax → invalid_location_id');

// Fixed scoped success
{
    const r = resolveFixedSettlementFromFacts(fixedFacts({
        scopedState: { status: 'ok', value: baseState() },
        scopedLayout: { status: 'ok', value: baseLayout() },
        scopedAnyFileExists: true,
    }));
    check(r.ok && r.source === 'fixed_scoped' && r.state.settlementId === 'set_port' && r.layout, 'fixed scoped success');
}

// Fixed state-only
{
    const r = resolveFixedSettlementFromFacts(fixedFacts({
        scopedState: { status: 'ok', value: baseState() },
        scopedLayout: { status: 'missing' },
        scopedAnyFileExists: true,
    }));
    check(r.ok && r.source === 'fixed_scoped' && !r.layout, 'fixed state-only success');
}

// Two-city isolation (pure facts)
{
    const a = resolveFixedSettlementFromFacts(fixedFacts({
        requestedLocationId: 'loc_sapphire_port',
        scopedState: { status: 'ok', value: baseState({ settlementId: 'set_port', locationId: 'loc_sapphire_port', name: 'Port' }) },
        scopedAnyFileExists: true,
        scopedStatePath: 'W/settlements/loc_sapphire_port/settlement_state.json',
    }));
    const b = resolveFixedSettlementFromFacts(fixedFacts({
        requestedLocationId: 'loc_mistgrove',
        scopedState: {
            status: 'ok',
            value: baseState({ settlementId: 'set_grove', locationId: 'loc_mistgrove', name: 'Grove' }),
        },
        scopedAnyFileExists: true,
        scopedStatePath: 'W/settlements/loc_mistgrove/settlement_state.json',
        scopedLayoutPath: 'W/settlements/loc_mistgrove/settlement_layout.json',
    }));
    check(
        a.ok && b.ok && a.state.settlementId !== b.state.settlementId
        && a.statePath !== b.statePath,
        'two-city isolation pure'
    );
}

// Scoped failures
check(
    resolveFixedSettlementFromFacts(fixedFacts({
        scopedState: { status: 'missing' },
        scopedLayout: { status: 'ok', value: baseLayout() },
        scopedAnyFileExists: true,
        legacyState: { status: 'ok', value: baseState() },
        legacyAnyFileExists: true,
    })).code === 'incomplete_document_set',
    'scoped layout-only does not fall back to legacy'
);
check(
    resolveFixedSettlementFromFacts(fixedFacts({
        scopedState: { status: 'invalid_parse' },
        scopedAnyFileExists: true,
        legacyState: { status: 'ok', value: baseState() },
        legacyAnyFileExists: true,
    })).code === 'invalid_state',
    'scoped invalid state fail closed'
);
check(
    resolveFixedSettlementFromFacts(fixedFacts({
        scopedState: { status: 'ok', value: baseState({ locationId: 'loc_mistgrove' }) },
        scopedAnyFileExists: true,
    })).code === 'state_location_mismatch',
    'scoped state.locationId mismatch'
);
check(
    resolveFixedSettlementFromFacts(fixedFacts({
        scopedState: { status: 'ok', value: baseState() },
        scopedLayout: { status: 'ok', value: baseLayout({ settlementId: 'other' }) },
        scopedAnyFileExists: true,
    })).code === 'settlement_id_mismatch',
    'scoped layout settlementId mismatch'
);
check(
    resolveFixedSettlementFromFacts(fixedFacts({
        scopedState: { status: 'ok', value: baseState({ settlementId: '' }) },
        scopedAnyFileExists: true,
    })).ok === false,
    'empty settlementId rejected (via non-empty check)'
);

// Note: empty settlementId won't parse from real parser; pure uses value as given.
// Force missing id:
{
    const bad = baseState();
    bad.settlementId = '';
    const r = resolveFixedSettlementFromFacts(fixedFacts({
        scopedState: { status: 'ok', value: bad },
        scopedAnyFileExists: true,
    }));
    check(r.code === 'settlement_id_missing', 'settlement_id_missing');
}

// Legacy fixed success
{
    const r = resolveFixedSettlementFromFacts(fixedFacts({
        legacyState: { status: 'ok', value: baseState() },
        legacyLayout: { status: 'ok', value: baseLayout() },
        legacyAnyFileExists: true,
        activeMobileBaseSettlementId: 'mb_other',
    }));
    check(r.ok && r.source === 'legacy_fixed' && r.legacy === true, 'legacy fixed success');
}

// Legacy fixed rejections
check(
    resolveFixedSettlementFromFacts(fixedFacts({
        legacyState: { status: 'ok', value: baseState({ locationId: undefined }) },
        legacyAnyFileExists: true,
    })).code === 'legacy_unscoped',
    'legacy unscoped'
);
// delete locationId properly
{
    const s = baseState();
    delete s.locationId;
    check(
        resolveFixedSettlementFromFacts(fixedFacts({
            legacyState: { status: 'ok', value: s },
            legacyAnyFileExists: true,
        })).code === 'legacy_unscoped',
        'legacy unscoped deleted locationId'
    );
}
check(
    resolveFixedSettlementFromFacts(fixedFacts({
        legacyState: { status: 'ok', value: baseState({ locationId: 'loc_mistgrove' }) },
        legacyAnyFileExists: true,
    })).code === 'legacy_other_location',
    'legacy other location'
);
check(
    resolveFixedSettlementFromFacts(fixedFacts({
        legacyState: { status: 'ok', value: baseState({ locationId: 'loc_not_in_catalog' }) },
        legacyAnyFileExists: true,
        forgeLocationIds: catalog,
    })).code === 'legacy_unknown_location',
    'legacy unknown location'
);
check(
    resolveFixedSettlementFromFacts(fixedFacts({
        legacyState: { status: 'ok', value: baseState({ settlementId: 'mb_deck' }) },
        legacyAnyFileExists: true,
        activeMobileBaseSettlementId: 'mb_deck',
    })).code === 'legacy_owned_by_mobile_base',
    'legacy owned by mobile base'
);

// Same root cannot satisfy two cities
{
    const factsA = fixedFacts({
        requestedLocationId: 'loc_sapphire_port',
        legacyState: { status: 'ok', value: baseState({ locationId: 'loc_sapphire_port' }) },
        legacyAnyFileExists: true,
    });
    const factsB = fixedFacts({
        requestedLocationId: 'loc_mistgrove',
        legacyState: { status: 'ok', value: baseState({ locationId: 'loc_sapphire_port' }) },
        legacyAnyFileExists: true,
    });
    const a = resolveFixedSettlementFromFacts(factsA);
    const b = resolveFixedSettlementFromFacts(factsB);
    check(a.ok && a.source === 'legacy_fixed', 'legacy ok for matching city');
    check(b.ok === false && b.code === 'legacy_other_location', 'same root rejected for other city');
}

// Mobile base scoped
{
    const r = resolveMobileBaseSettlementFromFacts({
        activeMobileBaseSettlementId: 'mb_deck',
        scopedStatePath: 'W/settlements/_mobile_base/settlement_state.json',
        scopedLayoutPath: 'W/settlements/_mobile_base/settlement_layout.json',
        scopedState: {
            status: 'ok',
            value: baseState({ settlementId: 'mb_deck', locationId: 'loc_sapphire_port', name: 'Deck' }),
        },
        scopedLayout: { status: 'ok', value: baseLayout({ settlementId: 'mb_deck' }) },
        scopedAnyFileExists: true,
        legacyStatePath: 'W/settlement_state.json',
        legacyLayoutPath: 'W/settlement_layout.json',
        legacyState: { status: 'missing' },
        legacyLayout: { status: 'missing' },
        legacyAnyFileExists: false,
    });
    check(r.ok && r.source === 'mobile_base_scoped', 'mobile base scoped success');
}

// Mobile base legacy
{
    const r = resolveMobileBaseSettlementFromFacts({
        activeMobileBaseSettlementId: 'mb_deck',
        scopedStatePath: 'W/settlements/_mobile_base/settlement_state.json',
        scopedLayoutPath: 'W/settlements/_mobile_base/settlement_layout.json',
        scopedState: { status: 'missing' },
        scopedLayout: { status: 'missing' },
        scopedAnyFileExists: false,
        legacyStatePath: 'W/settlement_state.json',
        legacyLayoutPath: 'W/settlement_layout.json',
        legacyState: {
            status: 'ok',
            value: baseState({ settlementId: 'mb_deck', locationId: 'loc_dock', name: 'Deck' }),
        },
        legacyLayout: { status: 'missing' },
        legacyAnyFileExists: true,
    });
    check(r.ok && r.source === 'legacy_mobile_base' && r.legacy === true, 'mobile base legacy success');
}

// Mobile base: dedicated invalid does not fall back
{
    const r = resolveMobileBaseSettlementFromFacts({
        activeMobileBaseSettlementId: 'mb_deck',
        scopedStatePath: 'p/state.json',
        scopedLayoutPath: 'p/layout.json',
        scopedState: { status: 'invalid_parse' },
        scopedLayout: { status: 'missing' },
        scopedAnyFileExists: true,
        legacyStatePath: 'W/settlement_state.json',
        legacyLayoutPath: 'W/settlement_layout.json',
        legacyState: {
            status: 'ok',
            value: baseState({ settlementId: 'mb_deck', name: 'Deck' }),
        },
        legacyLayout: { status: 'missing' },
        legacyAnyFileExists: true,
    });
    check(r.ok === false && r.code === 'invalid_state', 'MB dedicated invalid no fallback');
}

// Mobile base layout-only scoped
{
    const r = resolveMobileBaseSettlementFromFacts({
        activeMobileBaseSettlementId: 'mb_deck',
        scopedStatePath: 'p/state.json',
        scopedLayoutPath: 'p/layout.json',
        scopedState: { status: 'missing' },
        scopedLayout: { status: 'ok', value: baseLayout({ settlementId: 'mb_deck' }) },
        scopedAnyFileExists: true,
        legacyStatePath: 'W/settlement_state.json',
        legacyLayoutPath: 'W/settlement_layout.json',
        legacyState: { status: 'missing' },
        legacyLayout: { status: 'missing' },
        legacyAnyFileExists: false,
    });
    check(r.code === 'incomplete_document_set', 'MB scoped layout-only incomplete');
}

// not_found
check(
    resolveFixedSettlementFromFacts(fixedFacts()).code === 'not_found',
    'fixed not_found when empty'
);

console.log(`\nCore cases: ${cases}`);
if (failed) {
    console.error(`${failed} failure(s)`);
    process.exit(1);
}
console.log('settlement location resolve core: all passed');
