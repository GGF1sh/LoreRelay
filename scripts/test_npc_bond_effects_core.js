#!/usr/bin/env node
'use strict';

// Standalone test for src/npcBondEffectsCore.ts (+ introduction boost in npcRelationshipCore).
// Compiles only the two self-contained cores to a temp dir (independent of repo build state).

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const root = path.join(__dirname, '..');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lw3-bfx-'));

function resolveTsc() {
    const local = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
    if (fs.existsSync(local)) { return [process.execPath, [local]]; }
    return ['npx', ['tsc']];
}
const [cmd, baseArgs] = resolveTsc();
const args = baseArgs.concat([
    path.join(root, 'src', 'npcRelationshipCore.ts'),
    path.join(root, 'src', 'npcBondEffectsCore.ts'),
    '--outDir', outDir, '--module', 'commonjs', '--target', 'ES2020', '--strict', '--skipLibCheck',
]);
const useShell = cmd === 'npx' && process.platform === 'win32';
const compiled = spawnSync(cmd, args, { stdio: 'inherit', shell: useShell });
if (compiled.status !== 0) {
    console.error('FAIL: cores did not compile');
    process.exit(1);
}

const fx = require(path.join(outDir, 'npcBondEffectsCore.js'));
const rel = require(path.join(outDir, 'npcRelationshipCore.js'));
const {
    applyBondMarketEffects, ALLY_TRADE_STOCK_BONUS, ENEMY_FRICTION_PRICE_BUMP, ALLY_TRADE_MAX_STOCK,
} = fx;
const { pairKey, applyIntroductionTrustBoost, INTRODUCTION_TRUST_PENALTY } = rel;

let failed = 0;
function ok(m) { console.log(`OK: ${m}`); }
function fail(m) { console.error(`FAIL: ${m}`); failed++; }
function eq(a, e, m) { if (a === e) { ok(m); } else { fail(`${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(e)})`); } }

const registry = {
    npc_elda: { name: 'Elda', locationId: 'elda_shop', factionId: 'faction_merchants', playerTrust: 80 },
    npc_marcus: { name: 'Marcus', locationId: 'north_farm', factionId: 'faction_smiths', playerTrust: 30 },
    npc_rurik: { name: 'Rurik', locationId: 'south_port', factionId: 'faction_smiths' },
};
const markets = [
    { locationId: 'elda_shop', commodityIds: ['wheat', 'steel'] },
    { locationId: 'north_farm', commodityIds: ['wheat'] },
    { locationId: 'south_port', commodityIds: ['wheat', 'steel'] },
];
function freshMarketState() {
    return {
        elda_shop: { wheat: { stock: 30, priceIndex: 1.0 }, steel: { stock: 10, priceIndex: 1.2 } },
        north_farm: { wheat: { stock: 50, priceIndex: 0.8 } },
        south_port: { wheat: { stock: 20, priceIndex: 1.1 }, steel: { stock: 5, priceIndex: 1.5 } },
    };
}

// 1. 盟友(75) Elda×Marcus — 共通商品 wheat の在庫が両市場で +1
{
    const relationships = {}; relationships[pairKey('npc_elda', 'npc_marcus')] = 75;
    const res = applyBondMarketEffects({
        relationships, registry, positions: {}, worldTurn: 5, markets, marketState: freshMarketState(),
    });
    eq(res.marketState.elda_shop.wheat.stock, 30 + ALLY_TRADE_STOCK_BONUS, 'ally trade boosts wheat at elda_shop');
    eq(res.marketState.north_farm.wheat.stock, 50 + ALLY_TRADE_STOCK_BONUS, 'ally trade boosts wheat at north_farm');
    eq(res.marketState.elda_shop.steel.stock, 10, 'non-shared commodity untouched');
    eq(res.effects.length, 1, 'one effect recorded');
    eq(res.effects[0].type, 'ally_trade', 'effect type ally_trade');
}

// 2. 友好(45)では物流は生まれない(盟友のみ)
{
    const relationships = {}; relationships[pairKey('npc_elda', 'npc_marcus')] = 45;
    const res = applyBondMarketEffects({
        relationships, registry, positions: {}, worldTurn: 5, markets, marketState: freshMarketState(),
    });
    eq(res.effects.length, 0, 'friend (45) does not create trade route');
    eq(res.marketState.elda_shop.wheat.stock, 30, 'stock unchanged for friend');
}

// 3. 敵対(-80) Elda×Rurik — 両市場の全商品の priceIndex が +0.05
{
    const relationships = {}; relationships[pairKey('npc_elda', 'npc_rurik')] = -80;
    const res = applyBondMarketEffects({
        relationships, registry, positions: {}, worldTurn: 5, markets, marketState: freshMarketState(),
    });
    eq(res.marketState.elda_shop.wheat.priceIndex, 1.0 + ENEMY_FRICTION_PRICE_BUMP, 'friction bumps elda wheat');
    eq(res.marketState.south_port.steel.priceIndex, 1.5 + ENEMY_FRICTION_PRICE_BUMP, 'friction bumps port steel');
    eq(res.marketState.north_farm.wheat.priceIndex, 0.8, 'uninvolved market untouched');
    eq(res.effects[0].type, 'enemy_friction', 'effect type enemy_friction');
}

// 4. 移動中(未到着)の NPC は物流に参加できない
{
    const relationships = {}; relationships[pairKey('npc_elda', 'npc_marcus')] = 75;
    const res = applyBondMarketEffects({
        relationships, registry,
        positions: { npc_marcus: { locationId: 'north_farm', arrivesTurn: 99 } },
        worldTurn: 5, markets, marketState: freshMarketState(),
    });
    eq(res.effects.length, 0, 'in-transit ally creates no trade');
}

// 5. 在庫上限クランプ
{
    const relationships = {}; relationships[pairKey('npc_elda', 'npc_marcus')] = 75;
    const state = freshMarketState();
    state.elda_shop.wheat.stock = ALLY_TRADE_MAX_STOCK;
    const res = applyBondMarketEffects({
        relationships, registry, positions: {}, worldTurn: 5, markets, marketState: state,
    });
    eq(res.marketState.elda_shop.wheat.stock, ALLY_TRADE_MAX_STOCK, 'stock capped at ALLY_TRADE_MAX_STOCK');
}

// 6. 紹介効果 — Elda(80) の盟友 Marcus(30) は実効 55 に、introducedBy 付き
{
    const relationships = {}; relationships[pairKey('npc_elda', 'npc_marcus')] = 75;
    const boosted = applyIntroductionTrustBoost(registry, relationships);
    eq(boosted.npc_marcus.playerTrust, 80 - INTRODUCTION_TRUST_PENALTY, 'introduction lifts Marcus trust to 55');
    eq(boosted.npc_marcus.introducedBy, 'npc_elda', 'introducedBy recorded');
    eq(boosted.npc_elda.playerTrust, 80, 'introducer unchanged (55 < 80)');
}

// 7. 紹介は盟友のみ(友好45では伝播しない) & 元より低い紹介は無視
{
    const relationships = {}; relationships[pairKey('npc_elda', 'npc_marcus')] = 45;
    const boosted = applyIntroductionTrustBoost(registry, relationships);
    eq(boosted.npc_marcus.playerTrust, 30, 'friend-level bond does not introduce');
    eq(boosted.npc_marcus.introducedBy, undefined, 'no introducedBy for friend');
}

// 8. 元 registry は不変(純関数)
{
    const relationships = {}; relationships[pairKey('npc_elda', 'npc_marcus')] = 75;
    applyIntroductionTrustBoost(registry, relationships);
    eq(registry.npc_marcus.playerTrust, 30, 'input registry not mutated');
}

try { fs.rmSync(outDir, { recursive: true, force: true }); } catch (_) { /* noop */ }

if (failed > 0) { console.error(`\n${failed} failing`); process.exit(1); }
console.log('\nAll npc bond effects core tests passed.');
