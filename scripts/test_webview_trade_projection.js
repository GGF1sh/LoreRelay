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

const commerce = {
    credits: 100,
    cargoWeight: 10,
    cargoCapacity: 20,
    cargo: [{ commodityId: 'grain', qty: 3 }],
};
const quote = { commodityId: 'grain', unitPrice: 7, unitWeight: 2, stock: 12 };
const buy = context.buildHubTradeProjection(commerce, quote, 'buy', 2);
assert.strictEqual(buy.valid, true);
assert.strictEqual(buy.total, 14);
assert.strictEqual(buy.moneyAfter, 86);
assert.strictEqual(buy.cargoAfter, 14);
assert.strictEqual(buy.stockAfter, 10);
assert.strictEqual(buy.heldAfter, 5);

assert.strictEqual(context.buildHubTradeProjection(commerce, quote, 'buy', 6).reasonKey, 'webview.world.actionHubTradeReasonCapacity');
assert.strictEqual(context.buildHubTradeProjection({ ...commerce, credits: 5 }, quote, 'buy', 1).reasonKey, 'webview.world.actionHubTradeReasonCredits');
assert.strictEqual(context.buildHubTradeProjection(commerce, { ...quote, stock: 0 }, 'buy', 1).reasonKey, 'webview.world.actionHubTradeReasonStock');
assert.strictEqual(context.buildHubTradeProjection(commerce, quote, 'sell', 4).reasonKey, 'webview.world.actionHubTradeReasonHeld');
assert.strictEqual(context.buildHubTradeProjection(commerce, quote, 'buy', 0).reasonKey, 'webview.world.actionHubTradeReasonQuantity');

for (const field of ['unit', 'total', 'money', 'cargo', 'capacity', 'stock', 'held']) {
    assert.ok(world.includes(`data-trade-value="${field}"`), `missing projection field ${field}`);
}
assert.ok(world.includes('shopkeeper-disabled-reason'));
assert.ok(css.includes('.player-action-hub__projection-grid'));
assert.ok(css.includes('@media (max-width: 430px)'));
assert.ok(host.includes('cargoWeight: forge ? cargoWeight(forge, cargo) : null'));
assert.ok(host.includes('transportCapacity(forge, transportId)'));
assert.ok(host.includes('unitWeight: commodityById.get(quote.commodityId)?.weight ?? 0'));

const requiredKeys = [
    'webview.world.actionHubTradeProjection',
    'webview.world.actionHubTradeMoneyAfter',
    'webview.world.actionHubTradeCargoAfter',
    'webview.world.actionHubTradeReasonStock',
    'webview.world.actionHubTradeReasonCredits',
    'webview.world.actionHubTradeReasonCapacity',
    'webview.world.actionHubTradeReasonHeld',
];
for (const locale of ['en', 'ja', 'zh-CN', 'zh-TW']) {
    const messages = JSON.parse(fs.readFileSync(path.join(root, 'locales', `${locale}.json`), 'utf8'));
    requiredKeys.forEach((key) => assert.ok(messages[key], `${locale} missing ${key}`));
}

console.log('trade projection: all tests passed');
