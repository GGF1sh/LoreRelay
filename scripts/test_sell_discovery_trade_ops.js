#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const commercePath = path.join(root, 'out', 'commerceCore.js');
const ledgerPath = path.join(root, 'out', 'discoveryLedgerCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [commercePath, ledgerPath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing - run npm run compile first`);
        process.exit(1);
    }
}

const {
    parseTradeOps,
    applyTradeOp,
    applyTradeOps,
    computePerLocationTradeCreditsDelta,
} = require(commercePath);
const {
    validateSellDiscoveryTrade,
    computeSuggestedSellValue,
} = require(ledgerPath);

const forge = {
    commodities: [{ id: 'wheat', name: 'Wheat', basePrice: 10, weight: 1 }],
    markets: [{ locationId: 'hub', commodityIds: ['wheat'], supplyBias: 1 }],
    transportKinds: [{ id: 'wagon', name: 'Wagon', capacity: 20, speed: 1, foodPerDay: 1 }],
};

const commerce = { credits: 100, cargo: [], transportId: 'wagon', food: 10 };
const markets = { hub: { wheat: { stock: 10, priceIndex: 1 } } };

const sellableLedger = {
    version: 1,
    entries: [{
        id: 'relic_a',
        kind: 'material',
        label: 'Strange shard',
        status: 'appraised',
        identifiedLabel: 'Relay housing',
        estValue: 200,
    }],
};
const suggested = computeSuggestedSellValue(sellableLedger.entries[0]);

{
    const ops = parseTradeOps([
        { op: 'sell_discovery', discoveryId: 'relic_a', value: 200 },
        { op: 'sell_discovery', discoveryId: '', value: 50 },
        { op: 'sell_discovery', discoveryId: 'x', value: -1 },
    ]);
    if (ops.length !== 1 || ops[0].value !== 200) {
        fail(`parseTradeOps should keep valid sell_discovery only: ${JSON.stringify(ops)}`);
    } else {
        ok('parseTradeOps filters invalid sell_discovery ops');
    }
}

{
    const err = validateSellDiscoveryTrade('fake_relic', 100, sellableLedger);
    if (!err || !err.includes('Unknown')) {
        fail(`fake discoveryId should be rejected: ${err}`);
    } else {
        ok('validateSellDiscoveryTrade rejects unknown discoveryId');
    }
}

{
    const soldLedger = {
        version: 1,
        entries: [{ ...sellableLedger.entries[0], status: 'sold' }],
    };
    const err = validateSellDiscoveryTrade('relic_a', 200, soldLedger);
    if (!err || !err.includes('sold')) {
        fail(`sold discovery should be rejected: ${err}`);
    } else {
        ok('validateSellDiscoveryTrade rejects already-sold discovery');
    }
}

{
    const unidLedger = {
        version: 1,
        entries: [{ ...sellableLedger.entries[0], status: 'unidentified', estValue: undefined }],
    };
    const err = validateSellDiscoveryTrade('relic_a', 50, unidLedger);
    if (!err || !err.includes('not sellable')) {
        fail(`unidentified discovery should be rejected: ${err}`);
    } else {
        ok('validateSellDiscoveryTrade rejects unidentified discovery');
    }
}

{
    const tooHigh = suggested + Math.ceil(suggested * 0.6);
    const err = validateSellDiscoveryTrade('relic_a', tooHigh, sellableLedger);
    if (!err || !err.includes('outside suggested range')) {
        fail(`value far above suggested should be rejected: ${err}`);
    } else {
        ok('validateSellDiscoveryTrade enforces suggested value tolerance');
    }
}

{
    const fakeResult = applyTradeOp(
        forge,
        markets,
        commerce,
        { op: 'sell_discovery', discoveryId: 'fake_relic', value: 9999 },
        sellableLedger
    );
    if (fakeResult.ok) {
        fail('applyTradeOp must not credit fake discovery sell');
    } else {
        ok('applyTradeOp rejects fake discoveryId without credits');
    }
}

{
    const good = applyTradeOp(
        forge,
        markets,
        commerce,
        { op: 'sell_discovery', discoveryId: 'relic_a', value: suggested },
        sellableLedger
    );
    if (!good.ok || good.commerce.credits !== commerce.credits + suggested) {
        fail(`valid sell_discovery should add credits: ${JSON.stringify(good)}`);
    } else {
        ok('applyTradeOp credits valid sell_discovery');
    }
}

{
    const batch = applyTradeOps(
        forge,
        markets,
        commerce,
        [
            { op: 'sell_discovery', discoveryId: 'fake_relic', value: 500 },
            { op: 'sell_discovery', discoveryId: 'relic_a', value: suggested },
        ],
        sellableLedger
    );
    if (batch.ok || batch.applied !== 0) {
        fail('batch should fail on first invalid sell_discovery without partial apply');
    } else {
        ok('applyTradeOps aborts batch on invalid sell_discovery');
    }
}

{
    const deltas = computePerLocationTradeCreditsDelta(
        forge,
        markets,
        commerce,
        [{ op: 'sell_discovery', discoveryId: 'relic_a', value: suggested }],
        sellableLedger
    );
    if (Object.keys(deltas).length !== 0) {
        fail(`sell_discovery should not affect per-location trade deltas: ${JSON.stringify(deltas)}`);
    } else {
        ok('computePerLocationTradeCreditsDelta skips sell_discovery');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('sell_discovery trade ops: all tests passed.');