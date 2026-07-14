#!/usr/bin/env node
'use strict';

// Genre fix (§3, GENRE-AWARE-EVENTS-AND-ECONOMY-PROFILE-001 slice B1):
// economy shocks resolve their target commodity by role, not by the hard-coded
// agrarian ids wheat/steel. Untagged worlds keep the legacy id behavior.

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'worldSimCommerceCore.js');
const forgePath = path.join(root, 'out', 'livingWorldForgeCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [corePath, forgePath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing - run npm run compile first`);
        process.exit(1);
    }
}

const {
    applyWorldEventsToMarkets,
    resolveShockTargetCommodityIds,
    buildCommercePriceBumpTraceEntries,
    FOOD_CRISIS_PRICE_BUMP,
    STEEL_IMPROVEMENT_STOCK,
} = require(corePath);
const { parseCommerceForge } = require(forgePath);

const foodEvent = { worldTurn: 1, category: 'resource', severity: 'warning', message: 'food ran out' };
const steelEvent = { worldTurn: 1, category: 'resource', severity: 'info', message: 'steel forge boom' };

// 1. resolveShockTargetCommodityIds — role wins, else legacy fallback, guarded.
{
    const roleForge = {
        commodities: [
            { id: 'rations', name: 'Rations', basePrice: 5, weight: 1, role: 'staple' },
            { id: 'parts', name: 'Parts', basePrice: 8, weight: 1, role: 'material' },
        ],
        markets: [],
        transportKinds: [],
    };
    const legacyForge = {
        commodities: [{ id: 'wheat', name: 'Wheat', basePrice: 10, weight: 1 }],
        markets: [],
        transportKinds: [],
    };
    const stapleTagged = resolveShockTargetCommodityIds(roleForge, 'staple', 'wheat');
    const materialTagged = resolveShockTargetCommodityIds(roleForge, 'material', 'steel');
    const stapleLegacy = resolveShockTargetCommodityIds(legacyForge, 'staple', 'wheat');
    const guarded = resolveShockTargetCommodityIds({ markets: [] }, 'staple', 'wheat');

    if (JSON.stringify(stapleTagged) !== JSON.stringify(['rations'])) {
        fail(`staple should resolve to role-tagged commodity: ${JSON.stringify(stapleTagged)}`);
    } else if (JSON.stringify(materialTagged) !== JSON.stringify(['parts'])) {
        fail(`material should resolve to role-tagged commodity: ${JSON.stringify(materialTagged)}`);
    } else if (JSON.stringify(stapleLegacy) !== JSON.stringify(['wheat'])) {
        fail(`untagged world should fall back to legacy id: ${JSON.stringify(stapleLegacy)}`);
    } else if (JSON.stringify(guarded) !== JSON.stringify(['wheat'])) {
        fail(`missing commodities array must not throw and falls back to legacy: ${JSON.stringify(guarded)}`);
    } else {
        ok('resolveShockTargetCommodityIds: role tags win, legacy id fallback, guarded');
    }
}

// 2. Legacy agrarian world is unchanged (regression guard for trade-routes).
{
    const forge = {
        commodities: [
            { id: 'wheat', name: 'Wheat', basePrice: 10, weight: 1 },
            { id: 'steel', name: 'Steel', basePrice: 40, weight: 2 },
        ],
        markets: [{ locationId: 'town', commodityIds: ['wheat', 'steel'] }],
        transportKinds: [],
    };
    const markets = { town: { wheat: { stock: 20, priceIndex: 1 }, steel: { stock: 5, priceIndex: 1 } } };
    const res = applyWorldEventsToMarkets(forge, markets, [foodEvent, steelEvent]);
    const wheat = res.markets.town.wheat;
    const steel = res.markets.town.steel;
    if (Math.abs(wheat.priceIndex - (1 + FOOD_CRISIS_PRICE_BUMP)) > 1e-9) {
        fail(`legacy wheat price bump broken: ${wheat.priceIndex}`);
    } else if (steel.stock !== 5 + STEEL_IMPROVEMENT_STOCK) {
        fail(`legacy steel restock broken: ${steel.stock}`);
    } else if (res.applied !== 2) {
        fail(`applied count wrong for legacy world: ${res.applied}`);
    } else {
        ok('legacy wheat/steel world unchanged (no role tags)');
    }
}

// 3. Non-agrarian world receives the shock on its own role-tagged vocabulary.
//    A commodity literally named `wheat` present but not role-tagged is NOT the
//    staple here — role tags take precedence, so the shock lands on `rations`.
{
    const forge = parseCommerceForge({
        commodities: [
            { id: 'rations', name: 'Nutripaste', basePrice: 5, weight: 1, role: 'staple' },
            { id: 'parts', name: 'Salvaged Parts', basePrice: 8, weight: 1, role: 'material' },
            { id: 'wheat', name: 'Decorative Wheat', basePrice: 3, weight: 1 },
        ],
        markets: [{ locationId: 'wastes', commodityIds: ['rations', 'parts', 'wheat'] }],
    });
    if (!forge) {
        fail('parseCommerceForge returned undefined for role-tagged forge');
    } else if (forge.commodities.find((c) => c.id === 'rations').role !== 'staple') {
        fail('parseCommerceForge dropped valid role tag');
    } else {
        const markets = {
            wastes: {
                rations: { stock: 20, priceIndex: 1 },
                parts: { stock: 5, priceIndex: 1 },
                wheat: { stock: 20, priceIndex: 1 },
            },
        };
        const res = applyWorldEventsToMarkets(forge, markets, [foodEvent, steelEvent]);
        const rations = res.markets.wastes.rations;
        const parts = res.markets.wastes.parts;
        const wheat = res.markets.wastes.wheat;
        if (Math.abs(rations.priceIndex - (1 + FOOD_CRISIS_PRICE_BUMP)) > 1e-9) {
            fail(`food crisis should raise the role=staple commodity price: ${rations.priceIndex}`);
        } else if (parts.stock !== 5 + STEEL_IMPROVEMENT_STOCK) {
            fail(`smithing shock should restock the role=material commodity: ${parts.stock}`);
        } else if (wheat.priceIndex !== 1) {
            fail(`untagged 'wheat' must be ignored when a staple is tagged: ${wheat.priceIndex}`);
        } else {
            ok('non-agrarian world routes shocks onto its role-tagged commodities');
        }
    }
}

// 4. parseCommerceForge rejects an invalid role string (keeps commodity, drops role).
{
    const forge = parseCommerceForge({
        commodities: [{ id: 'goo', name: 'Goo', basePrice: 2, weight: 1, role: 'bogus' }],
        markets: [{ locationId: 'lab', commodityIds: ['goo'] }],
    });
    const goo = forge && forge.commodities.find((c) => c.id === 'goo');
    if (!goo) {
        fail('parseCommerceForge should keep a commodity with an invalid role');
    } else if (goo.role !== undefined) {
        fail(`invalid role should be dropped, got: ${goo.role}`);
    } else {
        ok('parseCommerceForge drops invalid role but keeps the commodity');
    }
}

// 5. Trace generalizes to the resolved commodity id (no hard-coded 'wheat').
{
    const forge = {
        commodities: [{ id: 'rations', name: 'Rations', basePrice: 5, weight: 1, role: 'staple' }],
        markets: [{ locationId: 'wastes' }],
    };
    const before = { wastes: { rations: { priceIndex: 1.0 } } };
    const after = { wastes: { rations: { priceIndex: 1.35 } } };
    const entries = buildCommercePriceBumpTraceEntries('run1', 7, forge, before, after, [foodEvent]);
    if (entries.length !== 1 || !entries[0].traceId.includes('rations') || entries[0].decision !== 'bump_rations') {
        fail(`trace should reference the resolved commodity id: ${JSON.stringify(entries)}`);
    } else {
        ok('buildCommercePriceBumpTraceEntries traces the role-resolved commodity');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('economy shock commodity role: all tests passed.');
