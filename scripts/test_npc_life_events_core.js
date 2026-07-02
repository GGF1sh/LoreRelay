#!/usr/bin/env node
'use strict';

// Standalone test for src/npcLifeEventsCore.ts (LW3-L relationship milestones).
// Compiles only the two self-contained cores to a temp dir (repo-build independent).

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const root = path.join(__dirname, '..');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lw3-life-'));

function resolveTsc() {
    const local = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
    if (fs.existsSync(local)) { return [process.execPath, [local]]; }
    return ['npx', ['tsc']];
}
const [cmd, baseArgs] = resolveTsc();
const args = baseArgs.concat([
    path.join(root, 'src', 'npcRelationshipCore.ts'),
    path.join(root, 'src', 'npcLifeEventsCore.ts'),
    '--outDir', outDir, '--module', 'commonjs', '--target', 'ES2020', '--strict', '--skipLibCheck',
]);
const useShell = cmd === 'npx' && process.platform === 'win32';
if (spawnSync(cmd, args, { stdio: 'inherit', shell: useShell }).status !== 0) {
    console.error('FAIL: cores did not compile');
    process.exit(1);
}

const life = require(path.join(outDir, 'npcLifeEventsCore.js'));
const rel = require(path.join(outDir, 'npcRelationshipCore.js'));
const {
    detectLifeEvents, buildLifeEventMessage, buildLifeEventGmHint, listPairMilestones,
    MILESTONE_SWORN_ALLIES_MIN, MILESTONE_INSEPARABLE_MIN, MILESTONE_BITTER_ENEMIES_MAX,
} = life;
const { pairKey } = rel;

let failed = 0;
function ok(m) { console.log(`OK: ${m}`); }
function fail(m) { console.error(`FAIL: ${m}`); failed++; }
function eq(a, e, m) { if (a === e) { ok(m); } else { fail(`${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(e)})`); } }

const registry = {
    npc_elda: { name: 'Elda', factionId: 'faction_merchants' },
    npc_marcus: { name: 'Marcus', factionId: 'faction_smiths' },
    npc_ghost: { name: 'Ghost' },
};
const K = pairKey('npc_elda', 'npc_marcus');

// 1. sworn_allies 発火(85)
{
    const rels = {}; rels[K] = MILESTONE_SWORN_ALLIES_MIN;
    const res = detectLifeEvents({ relationships: rels, milestones: {}, registry, worldTurn: 10 });
    eq(res.events.length, 1, 'one milestone at 85');
    eq(res.events[0].kind, 'sworn_allies', 'kind sworn_allies');
    if (res.milestones[K] && res.milestones[K].includes('sworn_allies')) { ok('milestone recorded'); }
    else { fail('milestone recorded'); }
}

// 2. inseparable 発火(95) — sworn は跨いでいるが深い方だけ1件
{
    const rels = {}; rels[K] = MILESTONE_INSEPARABLE_MIN;
    const res = detectLifeEvents({ relationships: rels, milestones: {}, registry, worldTurn: 10 });
    const kinds = res.events.map((e) => e.kind);
    if (kinds.includes('inseparable') && !kinds.includes('sworn_allies')) { ok('inseparable only (not sworn same tick)'); }
    else { fail(`inseparable gating (got ${JSON.stringify(kinds)})`); }
}

// 3. 一度きり発火 — 既に記録済みなら再発火しない
{
    const rels = {}; rels[K] = 90;
    const prior = {}; prior[K] = ['sworn_allies'];
    const res = detectLifeEvents({ relationships: rels, milestones: prior, registry, worldTurn: 11 });
    eq(res.events.length, 0, 'no refire when already reached');
}

// 4. bitter_enemies 発火(-85)
{
    const rels = {}; rels[K] = MILESTONE_BITTER_ENEMIES_MAX;
    const res = detectLifeEvents({ relationships: rels, milestones: {}, registry, worldTurn: 10 });
    eq(res.events.length, 1, 'bitter enemies fires');
    eq(res.events[0].kind, 'bitter_enemies', 'kind bitter_enemies');
}

// 5. estranged — 契りを交わした二人が 0 未満に割る
{
    const rels = {}; rels[K] = -5;
    const prior = {}; prior[K] = ['sworn_allies'];
    const res = detectLifeEvents({ relationships: rels, milestones: prior, registry, worldTurn: 20 });
    const kinds = res.events.map((e) => e.kind);
    if (kinds.includes('estranged')) { ok('estranged fires after fallout'); }
    else { fail(`estranged (got ${JSON.stringify(kinds)})`); }
}

// 6. estranged は履歴なしには出ない(ただの中立化)
{
    const rels = {}; rels[K] = -5;
    const res = detectLifeEvents({ relationships: rels, milestones: {}, registry, worldTurn: 20 });
    const kinds = res.events.map((e) => e.kind);
    if (!kinds.includes('estranged')) { ok('no estrangement without prior bond'); }
    else { fail('estranged fired without history'); }
}

// 7. reconciled — 宿敵だった二人が +10 まで戻る
{
    const rels = {}; rels[K] = 12;
    const prior = {}; prior[K] = ['bitter_enemies'];
    const res = detectLifeEvents({ relationships: rels, milestones: prior, registry, worldTurn: 30 });
    const kinds = res.events.map((e) => e.kind);
    if (kinds.includes('reconciled')) { ok('reconciled fires after feud'); }
    else { fail(`reconciled (got ${JSON.stringify(kinds)})`); }
}

// 8. registry 外ペアは無視(≤10 clamp 相当 + ghost 片方欠落)
{
    const rels = {}; rels[pairKey('npc_elda', 'stranger')] = 99;
    const res = detectLifeEvents({ relationships: rels, milestones: {}, registry, worldTurn: 10 });
    eq(res.events.length, 0, 'unknown npc pair ignored');
}

// 9. メッセージ & gmHint
{
    const msg = buildLifeEventMessage({ a: 'npc_elda', b: 'npc_marcus', kind: 'inseparable', affinity: 96, worldTurn: 1 }, registry);
    if (msg.includes('Elda') && msg.includes('Marcus') && msg.includes('離れがたい')) { ok('message renders names'); }
    else { fail(`message (${msg})`); }
    const hint = buildLifeEventGmHint('inseparable');
    if (/romance|friendship|kinship/.test(hint) && /never state numeric/.test(hint)) { ok('gmHint is theme-neutral + no numbers'); }
    else { fail('gmHint content'); }
}

// 10. listPairMilestones 共有史
{
    const ms = {}; ms[K] = ['sworn_allies', 'estranged'];
    const list = listPairMilestones(ms, 'npc_marcus', 'npc_elda'); // 逆順でも取れる
    eq(list.length, 2, 'listPairMilestones returns history order-independent');
}

// 11. 1tick の発火上限(4件)
{
    const reg = {};
    const rels = {};
    for (let i = 0; i < 6; i++) { reg['n' + i] = { name: 'N' + i }; }
    // 全ペアを inseparable 級に
    const ids = Object.keys(reg);
    for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) { rels[pairKey(ids[i], ids[j])] = 99; }
    }
    const res = detectLifeEvents({ relationships: rels, milestones: {}, registry: reg, worldTurn: 5 });
    if (res.events.length <= 4) { ok('per-tick event cap respected'); }
    else { fail(`event cap (${res.events.length})`); }
}

try { fs.rmSync(outDir, { recursive: true, force: true }); } catch (_) { /* noop */ }

if (failed > 0) { console.error(`\n${failed} failing`); process.exit(1); }
console.log('\nAll npc life events core tests passed.');
