#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const worldPath = path.join(root, 'webview', 'modules', '85-world.js');
const world = fs.readFileSync(worldPath, 'utf8');
const css = fs.readFileSync(path.join(root, 'webview', 'styles', '85-world.css'), 'utf8');
const host = fs.readFileSync(path.join(root, 'src', 'worldView.ts'), 'utf8');
const start = world.indexOf('function hubHeldQty');
const end = world.indexOf('function hubTradeProjectionValue', start);
assert.ok(start >= 0 && end > start, 'trade projection functions not found');
const snippet = world.slice(start, end);
assert.ok(!snippet.includes('postMessage'), 'projection must not post messages');
assert.ok(!snippet.includes('vscode'), 'projection must not depend on VS Code');
const context = { Number, Math };
vm.runInNewContext(snippet, context, { filename: worldPath });

let failed = 0;
function test(name, fn) {
    try {
        fn();
        console.log(`OK: ${name}`);
    } catch (error) {
        failed++;
        console.error(`FAIL: ${name}`);
        console.error(error && error.stack ? error.stack : error);
    }
}

const commerce = {
    credits: 100,
    cargoWeight: 10,
    cargoCapacity: 20,
    cargo: [{ commodityId: 'grain', qty: 3 }],
};
const quote = { commodityId: 'grain', unitPrice: 7, unitWeight: 2, stock: 12 };

test('known capacity: successful buy computes every field truthfully', () => {
    const buy = context.buildHubTradeProjection(commerce, quote, 'buy', 2);
    assert.strictEqual(buy.valid, true);
    assert.strictEqual(buy.total, 14);
    assert.strictEqual(buy.moneyAfter, 86);
    assert.strictEqual(buy.cargoAfter, 14);
    assert.strictEqual(buy.stockAfter, 10);
    assert.strictEqual(buy.heldAfter, 5);
});

test('known capacity: existing reason precedence is unchanged', () => {
    assert.strictEqual(context.buildHubTradeProjection(commerce, quote, 'buy', 6).reasonKey, 'webview.world.actionHubTradeReasonCapacity');
    assert.strictEqual(context.buildHubTradeProjection({ ...commerce, credits: 5 }, quote, 'buy', 1).reasonKey, 'webview.world.actionHubTradeReasonCredits');
    assert.strictEqual(context.buildHubTradeProjection(commerce, { ...quote, stock: 0 }, 'buy', 1).reasonKey, 'webview.world.actionHubTradeReasonStock');
    assert.strictEqual(context.buildHubTradeProjection(commerce, quote, 'sell', 4).reasonKey, 'webview.world.actionHubTradeReasonHeld');
    assert.strictEqual(context.buildHubTradeProjection(commerce, quote, 'buy', 0).reasonKey, 'webview.world.actionHubTradeReasonQuantity');
});

// --- Correction 2: null must never become a truthful-looking zero. ---
// Number(null) === 0 and Number.isFinite(0) === true, so a naive coercion
// silently turns "capacity unknown" into "capacity is exactly zero". Every
// case below pins the fixed, honest behavior for both Buy and Sell.
const capacityCases = [
    { label: 'null', value: null },
    { label: 'undefined', value: undefined },
    { label: 'malformed string', value: 'not-a-number' },
];
for (const { label, value } of capacityCases) {
    test(`unknown cargoCapacity (${label}) buy: capacity is null, not 0, and confirmation is blocked honestly`, () => {
        const c = { ...commerce, cargoCapacity: value };
        const projection = context.buildHubTradeProjection(c, quote, 'buy', 1);
        assert.strictEqual(projection.capacity, null, 'unknown capacity must resolve to null, never 0');
        assert.strictEqual(projection.valid, false);
        assert.strictEqual(projection.reasonKey, 'webview.world.actionHubTradeReasonCapacityUnknown');
        assert.notStrictEqual(projection.reasonKey, 'webview.world.actionHubTradeReasonCapacity',
            'must not claim "capacity exceeded" when capacity is unknown');
    });
    test(`unknown cargoCapacity (${label}) sell: capacity does not gate selling`, () => {
        const c = { ...commerce, cargoCapacity: value };
        const projection = context.buildHubTradeProjection(c, quote, 'sell', 2);
        assert.strictEqual(projection.capacity, null);
        assert.strictEqual(projection.valid, true, 'selling must not be blocked by unknown capacity');
    });
}

test('cargoCapacity zero is a real, distinct, valid numeric capacity (not confused with unknown)', () => {
    const projection = context.buildHubTradeProjection({ ...commerce, cargoCapacity: 0 }, quote, 'buy', 1);
    assert.strictEqual(projection.capacity, 0);
    assert.strictEqual(projection.reasonKey, 'webview.world.actionHubTradeReasonCapacity',
        'zero capacity must behave as "capacity exceeded", never as "unknown"');
});

test('positive cargoCapacity behaves as before', () => {
    const projection = context.buildHubTradeProjection(commerce, quote, 'buy', 2);
    assert.strictEqual(projection.capacity, 20);
    assert.strictEqual(projection.valid, true);
});

const cargoWeightCases = [
    { label: 'null', value: null },
    { label: 'undefined', value: undefined },
    { label: 'malformed string', value: 'lots' },
];
for (const { label, value } of cargoWeightCases) {
    test(`unknown weight with known capacity (${label}): no invented "after" figure, confirmation blocked`, () => {
        const c = { ...commerce, cargoWeight: value, cargoCapacity: 20 };
        const buy = context.buildHubTradeProjection(c, quote, 'buy', 1);
        assert.strictEqual(buy.cargoBefore, null);
        assert.strictEqual(buy.cargoAfter, null, 'must not invent a cargo-after figure from an unknown baseline');
        assert.strictEqual(buy.valid, false);
        assert.strictEqual(buy.reasonKey, 'webview.world.actionHubTradeReasonCargoUnknown');
        const sell = context.buildHubTradeProjection(c, quote, 'sell', 1);
        assert.strictEqual(sell.cargoAfter, null);
        assert.strictEqual(sell.valid, false);
        assert.strictEqual(sell.reasonKey, 'webview.world.actionHubTradeReasonCargoUnknown');
    });
}

test('known weight with unknown capacity: distinct reason from unknown weight', () => {
    const c = { ...commerce, cargoWeight: 10, cargoCapacity: null };
    const buy = context.buildHubTradeProjection(c, quote, 'buy', 1);
    assert.strictEqual(buy.cargoAfter, 12, 'a known weight can still compute a truthful after-figure');
    assert.strictEqual(buy.reasonKey, 'webview.world.actionHubTradeReasonCapacityUnknown');
});

test('unknown capacity + unknown weight: the more fundamental (weight) reason wins', () => {
    const c = { ...commerce, cargoWeight: null, cargoCapacity: null };
    const buy = context.buildHubTradeProjection(c, quote, 'buy', 1);
    assert.strictEqual(buy.reasonKey, 'webview.world.actionHubTradeReasonCargoUnknown');
});

test('the projection is a pure computation: it cannot execute or post a transaction', () => {
    assert.ok(!snippet.includes('postMessage'));
    assert.ok(!snippet.includes('vscode.postMessage'));
    // Calling the same pure function twice with identical inputs must not
    // mutate any shared state (no side effect a "confirm" could piggyback on).
    const before = JSON.stringify(commerce);
    context.buildHubTradeProjection(commerce, quote, 'buy', 5);
    context.buildHubTradeProjection(commerce, quote, 'sell', 5);
    assert.strictEqual(JSON.stringify(commerce), before, 'projection must never mutate the commerce object it was given');
});

for (const field of ['unit', 'total', 'money', 'cargo', 'capacity', 'stock', 'held']) {
    test(`projection field "${field}" is rendered in the DOM template`, () => {
        assert.ok(world.includes(`data-trade-value="${field}"`), `missing projection field ${field}`);
    });
}
test('disabled-reason element and unknown-value CSS/host wiring are present', () => {
    assert.ok(world.includes('shopkeeper-disabled-reason'));
    assert.ok(css.includes('.player-action-hub__projection-grid'));
    assert.ok(css.includes('@media (max-width: 430px)'));
    assert.ok(host.includes('cargoWeight: forge ? cargoWeight(forge, cargo) : null'));
    assert.ok(host.includes('transportCapacity(forge, transportId)'));
    assert.ok(host.includes('unitWeight: commodityById.get(quote.commodityId)?.weight ?? 0'));
});

test('locale completeness for every projection and unknown-state key', () => {
    const requiredKeys = [
        'webview.world.actionHubTradeProjection',
        'webview.world.actionHubTradeMoneyAfter',
        'webview.world.actionHubTradeCargoAfter',
        'webview.world.actionHubTradeReasonStock',
        'webview.world.actionHubTradeReasonCredits',
        'webview.world.actionHubTradeReasonCapacity',
        'webview.world.actionHubTradeReasonCapacityUnknown',
        'webview.world.actionHubTradeReasonCargoUnknown',
        'webview.world.actionHubTradeReasonHeld',
        'webview.world.actionHubTradeUnknown',
    ];
    for (const locale of ['en', 'ja', 'zh-CN', 'zh-TW']) {
        const messages = JSON.parse(fs.readFileSync(path.join(root, 'locales', `${locale}.json`), 'utf8'));
        requiredKeys.forEach((key) => assert.ok(messages[key], `${locale} missing ${key}`));
    }
});

if (failed > 0) {
    console.error(`${failed} trade projection test(s) failed`);
    process.exit(1);
}
console.log('trade projection: all tests passed');
