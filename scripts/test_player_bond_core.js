#!/usr/bin/env node
'use strict';

// Standalone test for src/playerBondCore.ts (LW3-P player↔NPC bonds).
// Compiles only that one file to a temp dir (repo-build independent).

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const root = path.join(__dirname, '..');
const srcFile = path.join(root, 'src', 'playerBondCore.ts');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lw3-pbond-'));

function resolveTsc() {
    const local = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
    if (fs.existsSync(local)) { return [process.execPath, [local]]; }
    return ['npx', ['tsc']];
}
const [cmd, baseArgs] = resolveTsc();
const args = baseArgs.concat([srcFile, '--outDir', outDir, '--module', 'commonjs', '--target', 'ES2020', '--strict', '--skipLibCheck']);
const useShell = cmd === 'npx' && process.platform === 'win32';
if (spawnSync(cmd, args, { stdio: 'inherit', shell: useShell }).status !== 0) {
    console.error('FAIL: playerBondCore.ts did not compile');
    process.exit(1);
}

const core = require(path.join(outDir, 'playerBondCore.js'));
const {
    detectPlayerBondEvents, listPlayerBondStandings, buildPlayerBondMessage,
    buildPlayerBondGmHint, buildPlayerBondPromptLines, applyPlayerBondTradeAdjustment,
    batchPlayerBondTradeAdjustments, purgeStalePlayerBondMilestones,
    PLAYER_TRUST_COMPANION_MIN, PLAYER_ROMANCE_MIN, PLAYER_TRUST_NEMESIS_MAX, PLAYER_FEAR_MIN,
    BOND_TRADE_ALLY_PCT, BOND_TRADE_MAX_ADJUSTMENT, PLAYER_BOND_GC_IDLE_TURNS,
} = core;

let failed = 0;
function ok(m) { console.log(`OK: ${m}`); }
function fail(m) { console.error(`FAIL: ${m}`); failed++; }
function eq(a, e, m) { if (a === e) { ok(m); } else { fail(`${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(e)})`); } }

// 1. trusted_companion 発火(信頼85)
{
    const reg = { npc_elda: { name: 'Elda', playerTrust: PLAYER_TRUST_COMPANION_MIN } };
    const res = detectPlayerBondEvents({ registry: reg, milestones: {}, worldTurn: 10 });
    if (res.events.some((e) => e.kind === 'trusted_companion')) { ok('trusted_companion fires at 85'); }
    else { fail(`companion (${JSON.stringify(res.events)})`); }
    if ((res.milestones.npc_elda || []).includes('trusted_companion')) { ok('milestone recorded'); }
    else { fail('milestone recorded'); }
}

// 2. romance 発火(恋愛80)
{
    const reg = { npc_elda: { name: 'Elda', playerTrust: 50, playerRomance: PLAYER_ROMANCE_MIN } };
    const res = detectPlayerBondEvents({ registry: reg, milestones: {}, worldTurn: 10 });
    if (res.events.some((e) => e.kind === 'romance')) { ok('romance fires at 80'); }
    else { fail('romance'); }
}

// 3. nemesis 発火(信頼15)
{
    const reg = { npc_x: { name: 'Rurik', playerTrust: PLAYER_TRUST_NEMESIS_MAX } };
    const res = detectPlayerBondEvents({ registry: reg, milestones: {}, worldTurn: 10 });
    if (res.events.some((e) => e.kind === 'nemesis')) { ok('nemesis fires at 15'); }
    else { fail('nemesis'); }
}

// 4. feared 発火(恐怖80)
{
    const reg = { npc_x: { name: 'Rurik', playerTrust: 50, playerFear: PLAYER_FEAR_MIN } };
    const res = detectPlayerBondEvents({ registry: reg, milestones: {}, worldTurn: 10 });
    if (res.events.some((e) => e.kind === 'feared')) { ok('feared fires at 80'); }
    else { fail('feared'); }
}

// 5. 一度きり(記録済みは再発火しない)
{
    const reg = { npc_elda: { name: 'Elda', playerTrust: 90 } };
    const res = detectPlayerBondEvents({ registry: reg, milestones: { npc_elda: ['trusted_companion'] }, worldTurn: 11 });
    eq(res.events.length, 0, 'no refire once reached');
}

// 6. estrangement — 盟友だった相手の信頼が 25 以下に落ちる
{
    const reg = { npc_elda: { name: 'Elda', playerTrust: 20 } };
    const res = detectPlayerBondEvents({ registry: reg, milestones: { npc_elda: ['trusted_companion'] }, worldTurn: 20 });
    if (res.events.some((e) => e.kind === 'estrangement')) { ok('estrangement after fallout'); }
    else { fail('estrangement'); }
}

// 7. estrangement は履歴なしには出ない
{
    const reg = { npc_elda: { name: 'Elda', playerTrust: 20 } };
    const res = detectPlayerBondEvents({ registry: reg, milestones: {}, worldTurn: 20 });
    if (!res.events.some((e) => e.kind === 'estrangement')) { ok('no estrangement without prior bond'); }
    else { fail('estrangement without history'); }
}

// 8. 欠損 disposition は既定(trust 50 / romance 0 / fear 0)で扱い、誤発火しない
{
    const reg = { npc_elda: { name: 'Elda' } };
    const res = detectPlayerBondEvents({ registry: reg, milestones: {}, worldTurn: 10 });
    eq(res.events.length, 0, 'missing disposition -> no false milestone');
}

// 9. listPlayerBondStandings — 反転優先で1つに畳む
{
    const reg = { npc_elda: { name: 'Elda' }, npc_x: { name: 'Rurik' } };
    const ms = { npc_elda: ['trusted_companion', 'estrangement'], npc_x: ['nemesis'] };
    const standings = listPlayerBondStandings(reg, ms);
    const elda = standings.find((s) => s.npcId === 'npc_elda');
    eq(elda && elda.kind, 'estrangement', 'estrangement wins over companion in standing');
    eq(standings.length, 2, 'two standings');
}

// 10. メッセージ & gmHint
{
    const msg = buildPlayerBondMessage({ npcId: 'npc_elda', name: 'Elda', kind: 'trusted_companion', worldTurn: 1 });
    if (msg.includes('Elda') && msg.includes('盟友')) { ok('message renders (second person)'); }
    else { fail(`message (${msg})`); }
    const hint = buildPlayerBondGmHint('romance');
    if (/never state numeric/.test(hint) && /Interpret/.test(hint)) { ok('gmHint no-numbers + romance neutral'); }
    else { fail('gmHint'); }
}

// 11. buildPlayerBondPromptLines — ★ は新規転機のみ
{
    const reg = { npc_elda: { name: 'Elda' }, npc_x: { name: 'Rurik' } };
    const ms = { npc_elda: ['trusted_companion'], npc_x: ['nemesis'] };
    const fresh = [{ npcId: 'npc_elda', name: 'Elda', kind: 'trusted_companion', worldTurn: 5 }];
    const lines = buildPlayerBondPromptLines(reg, ms, fresh);
    const eldaLine = lines.find((l) => l.includes('Elda'));
    const rurikLine = lines.find((l) => l.includes('Rurik'));
    if (eldaLine && eldaLine.startsWith('★')) { ok('fresh milestone marked with star'); }
    else { fail(`star mark (${JSON.stringify(lines)})`); }
    if (rurikLine && !rurikLine.startsWith('★')) { ok('existing standing not starred'); }
    else { fail('non-fresh star'); }
}

// 12. 1tick の発火上限
{
    const reg = {};
    for (let i = 0; i < 10; i++) { reg['n' + i] = { name: 'N' + i, playerTrust: 90 }; }
    const res = detectPlayerBondEvents({ registry: reg, milestones: {}, worldTurn: 1 });
    if (res.events.length <= 6) { ok('per-tick event cap respected'); }
    else { fail(`event cap (${res.events.length})`); }
}

// --- LW3-P2: 絆の交易波及 ---

const TRADE_REG = { npc_elda: { name: 'Elda' }, npc_rurik: { name: 'Rurik' } };

// 13. 盟友が同席する市場: 純支出100 → +10 還元
{
    const adj = applyPlayerBondTradeAdjustment({
        milestones: { npc_elda: ['trusted_companion'] },
        registry: TRADE_REG,
        npcAtLocation: { npc_elda: 'elda_shop' },
        locationId: 'elda_shop',
        creditsDelta: -100,
    });
    eq(adj.adjustment, 100 * BOND_TRADE_ALLY_PCT / 100, 'ally favor rebates 10% of spend');
    eq(adj.reason, 'ally_favor', 'reason ally_favor');
    eq(adj.npcName, 'Elda', 'ally name resolved');
}

// 14. 敵対が同席: 純収入200 → -20 上乗せ(不利)
{
    const adj = applyPlayerBondTradeAdjustment({
        milestones: { npc_rurik: ['nemesis'] },
        registry: TRADE_REG,
        npcAtLocation: { npc_rurik: 'south_port' },
        locationId: 'south_port',
        creditsDelta: 200,
    });
    eq(adj.adjustment, -20, 'nemesis markup costs 10%');
    eq(adj.reason, 'nemesis_markup', 'reason nemesis_markup');
}

// 15. 盟友と敵対が両方同席 → 盟友優先
{
    const adj = applyPlayerBondTradeAdjustment({
        milestones: { npc_elda: ['trusted_companion'], npc_rurik: ['nemesis'] },
        registry: TRADE_REG,
        npcAtLocation: { npc_elda: 'hub', npc_rurik: 'hub' },
        locationId: 'hub',
        creditsDelta: -100,
    });
    eq(adj.reason, 'ally_favor', 'ally wins when both present');
}

// 16. 背信した元盟友は還元しない
{
    const adj = applyPlayerBondTradeAdjustment({
        milestones: { npc_elda: ['trusted_companion', 'estrangement'] },
        registry: TRADE_REG,
        npcAtLocation: { npc_elda: 'elda_shop' },
        locationId: 'elda_shop',
        creditsDelta: -100,
    });
    eq(adj.adjustment, 0, 'estranged ally gives no favor');
}

// 17. 別の場所に居る盟友は効かない / delta 0 は無調整 / 上限クランプ
{
    const away = applyPlayerBondTradeAdjustment({
        milestones: { npc_elda: ['trusted_companion'] },
        registry: TRADE_REG,
        npcAtLocation: { npc_elda: 'far_away' },
        locationId: 'elda_shop',
        creditsDelta: -100,
    });
    eq(away.adjustment, 0, 'absent ally gives no favor');
    const zero = applyPlayerBondTradeAdjustment({
        milestones: { npc_elda: ['trusted_companion'] },
        registry: TRADE_REG,
        npcAtLocation: { npc_elda: 'elda_shop' },
        locationId: 'elda_shop',
        creditsDelta: 0,
    });
    eq(zero.adjustment, 0, 'zero delta -> no adjustment');
    const capped = applyPlayerBondTradeAdjustment({
        milestones: { npc_elda: ['trusted_companion'] },
        registry: TRADE_REG,
        npcAtLocation: { npc_elda: 'elda_shop' },
        locationId: 'elda_shop',
        creditsDelta: -999999,
    });
    eq(capped.adjustment, BOND_TRADE_MAX_ADJUSTMENT, 'adjustment capped');
}

// 18. batch: multi-location deltas sum at turn end
{
    const batch = batchPlayerBondTradeAdjustments({
        milestones: { npc_elda: ['trusted_companion'], npc_rurik: ['nemesis'] },
        registry: TRADE_REG,
        npcAtLocation: { npc_elda: 'shop_a', npc_rurik: 'shop_b' },
        locationDeltas: [
            { locationId: 'shop_a', creditsDelta: -100 },
            { locationId: 'shop_b', creditsDelta: 200 },
        ],
    });
    eq(batch.totalAdjustment, 10 + -20, 'batch sums per-location bond adjustments');
    eq(batch.adjustments.length, 2, 'batch records both locations');
}

// 19. batch: opposing flows at same location net to zero -> no adjustment
{
    const batch = batchPlayerBondTradeAdjustments({
        milestones: { npc_elda: ['trusted_companion'] },
        registry: TRADE_REG,
        npcAtLocation: { npc_elda: 'hub' },
        locationDeltas: [{ locationId: 'hub', creditsDelta: 0 }],
    });
    eq(batch.totalAdjustment, 0, 'net-zero location delta yields no bond adjustment');
}

// 20. purgeStalePlayerBondMilestones drops removed NPC keys
{
    const ms = { npc_gone: ['trusted_companion'], npc_elda: ['trusted_companion'] };
    const reg = { npc_elda: { name: 'Elda', playerTrust: 90 } };
    const purged = purgeStalePlayerBondMilestones(ms, reg, 100);
    if (!purged.npc_gone && purged.npc_elda) { ok('purge removes milestones for absent NPCs'); }
    else { fail(`purge absent NPC (${JSON.stringify(purged)})`); }
}

// 21. purge idle neutral empty milestones
{
    const ms = { npc_idle: [] };
    const reg = {
        npc_idle: {
            name: 'Idle',
            playerTrust: 50,
            lastInteractionTurn: 1,
        },
    };
    const purged = purgeStalePlayerBondMilestones(ms, reg, 1 + PLAYER_BOND_GC_IDLE_TURNS + 1);
    if (!purged.npc_idle) { ok('purge idle neutral empty milestone slot'); }
    else { fail('purge idle neutral'); }
}

try { fs.rmSync(outDir, { recursive: true, force: true }); } catch (_) { /* noop */ }

if (failed > 0) { console.error(`\n${failed} failing`); process.exit(1); }
console.log('\nAll player bond core tests passed.');
