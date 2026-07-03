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
    buildPlayerBondGmHint, buildPlayerBondPromptLines,
    PLAYER_TRUST_COMPANION_MIN, PLAYER_ROMANCE_MIN, PLAYER_TRUST_NEMESIS_MAX, PLAYER_FEAR_MIN,
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

try { fs.rmSync(outDir, { recursive: true, force: true }); } catch (_) { /* noop */ }

if (failed > 0) { console.error(`\n${failed} failing`); process.exit(1); }
console.log('\nAll player bond core tests passed.');
