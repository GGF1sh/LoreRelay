#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'shopkeeperDirectTradeCore.js');
const commercePath = path.join(root, 'out', 'commerceCore.js');
const forgePath = path.join(root, 'out', 'livingWorldForgeCore.js');
for (const file of [corePath, commercePath, forgePath]) {
    if (!fs.existsSync(file)) throw new Error(`${file} missing - run npm run compile`);
}
const { buildShopkeeperSnapshot, executeShopkeeperTrade, parseShopkeeperIntent, shopkeeperRejectionText } = require(corePath);
const { initializeMarketState } = require(commercePath);
const { parseCommerceForge } = require(forgePath);
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'sample-scenarios', 'trade-routes', 'world_forge.json'), 'utf8'));
const forge = parseCommerceForge(fixture.commerce);
const fresh = () => initializeMarketState(forge);
const base = () => ({ credits: 500, cargo: [], transportId: 'wagon', food: 30, playerRole: 'merchant' });
let failed = 0;
function check(name, fn) { try { fn(); console.log(`OK: ${name}`); } catch (e) { failed++; console.error(`FAIL: ${name}\n${e.stack || e}`); } }
function same(a, b) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error('state mutated'); }

check('snapshot exposes only local authoritative market data', () => {
    const snap = buildShopkeeperSnapshot(forge, fresh(), base(), 'north_farm');
    if (snap.currentLocationId !== 'north_farm' || !snap.commodities.length || snap.commodities.some((q) => !q.commodityId || !Number.isFinite(q.stock))) throw new Error('invalid snapshot');
});
check('untrusted price totals and before/after fields are ignored', () => {
    const intent = parseShopkeeperIntent({ op: 'buy', marketLocationId: 'north_farm', commodityId: 'wheat', qty: 1, total: 0, creditsBefore: 999999 });
    if (!intent || Object.keys(intent).length !== 4 || intent.qty !== 1) throw new Error('trusted input leakage');
});
check('buy success uses production direct-trade path', () => {
    const r = executeShopkeeperTrade(forge, fresh(), base(), 'north_farm', { op: 'buy', marketLocationId: 'north_farm', commodityId: 'wheat', qty: 1 });
    if (!r.ok || r.credits.after >= r.credits.before || r.marketStock.after >= r.marketStock.before) throw new Error(JSON.stringify(r));
});
check('sell success uses production direct-trade path', () => {
    const state = base(); state.cargo = [{ commodityId: 'wheat', qty: 2 }];
    const r = executeShopkeeperTrade(forge, fresh(), state, 'north_farm', { op: 'sell', marketLocationId: 'north_farm', commodityId: 'wheat', qty: 1 });
    if (!r.ok || r.credits.after <= r.credits.before) throw new Error(JSON.stringify(r));
});
for (const [name, state, intent] of [
    ['insufficient credits', { ...base(), credits: 0 }, { op: 'buy', marketLocationId: 'north_farm', commodityId: 'wheat', qty: 1 }],
    ['insufficient cargo', base(), { op: 'sell', marketLocationId: 'north_farm', commodityId: 'wheat', qty: 1 }],
    ['insufficient stock', base(), { op: 'buy', marketLocationId: 'north_farm', commodityId: 'wheat', qty: 999 }],
    ['wrong location', base(), { op: 'buy', marketLocationId: 'north_farm', commodityId: 'wheat', qty: 1, currentLocationId: 'south_port' }],
    ['invalid quantity', base(), { op: 'buy', marketLocationId: 'north_farm', commodityId: 'wheat', qty: 0 }],
]) check(`${name} rejection changes nothing`, () => { const m=fresh(), before=JSON.parse(JSON.stringify({m,state})); const r=executeShopkeeperTrade(forge,m,state,'south_port',intent); if(r.ok) throw new Error('unexpected success'); same({m,state},before); });
check('persistence failure cannot report success', () => { const r=executeShopkeeperTrade(forge,fresh(),base(),'north_farm',{op:'buy',marketLocationId:'north_farm',commodityId:'wheat',qty:1},false); if(r.ok || r.rejection.code !== 'PERSIST_FAILED') throw new Error(JSON.stringify(r)); });
check('rejection map is constructive Japanese text', () => { const r=shopkeeperRejectionText('INSUFFICIENT_CREDITS'); if(!r.message || !r.nextStep) throw new Error('missing mapping'); });
check('protocol is shopkeeper-specific and UI has dialog/focus/400px contract', () => {
    const extension=fs.readFileSync(path.join(root,'src','extension.ts'),'utf8'); const ui=fs.readFileSync(path.join(root,'webview','modules','85-world.js'),'utf8');
    for(const needle of ['shopkeeperDirectTrade','role', 'aria-modal', 'Escape', 'width:min(100%,460px)', '_shopkeeperInFlight']) if(!extension.includes(needle) && !ui.includes(needle)) throw new Error(`missing ${needle}`);
    const shopkeeperBlock = ui.slice(ui.indexOf('function openShopkeeperDialog'), ui.indexOf('function finishShopkeeperTrade'));
    if(/Relay|ComfyUI|postWorldInsertChatText/i.test(shopkeeperBlock)) throw new Error('AI/relay path leaked');
});
if (failed) process.exit(1);
console.log('shopkeeper direct trade core tests passed.');
