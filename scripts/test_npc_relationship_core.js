#!/usr/bin/env node
'use strict';

// Standalone test for src/npcRelationshipCore.ts (LW3 NPC-to-NPC relationships).
// Self-contained: compiles ONLY that one file to a temp dir, so it does not depend
// on the rest of the repo's build state (safe under concurrent multi-agent edits).

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const root = path.join(__dirname, '..');
const srcFile = path.join(root, 'src', 'npcRelationshipCore.ts');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lw3-rel-'));

function resolveTsc() {
    const local = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
    if (fs.existsSync(local)) { return [process.execPath, [local]]; }
    return ['npx', ['tsc']]; // fallback
}

const [cmd, baseArgs] = resolveTsc();
const args = baseArgs.concat([
    srcFile,
    '--outDir', outDir,
    '--module', 'commonjs',
    '--target', 'ES2020',
    '--strict',
    '--skipLibCheck',
]);
// Only the `npx` fallback needs a shell; running node directly must not (paths with spaces).
const useShell = cmd === 'npx' && process.platform === 'win32';
const compiled = spawnSync(cmd, args, { stdio: 'inherit', shell: useShell });
if (compiled.status !== 0) {
    console.error('FAIL: npcRelationshipCore.ts did not compile');
    process.exit(1);
}

const core = require(path.join(outDir, 'npcRelationshipCore.js'));
const {
    pairKey, getAffinity, describeRelationship, evolveRelationships,
    parseRelationshipOps, applyRelationshipOps, listNotableRelationships,
    buildRelationshipPromptLines,
    MAX_AFFINITY, MIN_AFFINITY, CO_LOCATION_STEP, SHARED_CRISIS_STEP,
    FACTION_CONFLICT_STEP, AFFINITY_FRIEND,
} = core;

let failed = 0;
function ok(m) { console.log(`OK: ${m}`); }
function fail(m) { console.error(`FAIL: ${m}`); failed++; }
function eq(actual, expected, m) {
    if (actual === expected) { ok(m); } else { fail(`${m} (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`); }
}

// fixture: Elda(merchants)/Marcus(smiths) 同じ elda_shop に居る
const registry = {
    npc_elda: { name: 'Elda', locationId: 'elda_shop', factionId: 'faction_merchants' },
    npc_marcus: { name: 'Marcus', locationId: 'elda_shop', factionId: 'faction_smiths' },
    npc_far: { name: 'Rurik', locationId: 'south_port', factionId: 'faction_smiths' },
};

// 1. pairKey は順序非依存
eq(pairKey('b', 'a'), pairKey('a', 'b'), 'pairKey canonical');

// 2. getAffinity 既定 0 / self 0
eq(getAffinity({}, 'x', 'y'), 0, 'getAffinity default 0');
eq(getAffinity({ 'x|y': 50 }, 'y', 'x'), 50, 'getAffinity order-independent read');
eq(getAffinity({ 'x|x': 99 }, 'x', 'x'), 0, 'getAffinity self is 0');

// 3. describeRelationship 閾値
eq(describeRelationship(80), 'ally', 'label ally');
eq(describeRelationship(40), 'friend', 'label friend');
eq(describeRelationship(0), 'neutral', 'label neutral');
eq(describeRelationship(-40), 'rival', 'label rival');
eq(describeRelationship(-80), 'enemy', 'label enemy');

// 4. 同席 — Elda と Marcus は同じ場所 → +CO_LOCATION_STEP、遠方の Rurik とは無し
{
    const res = evolveRelationships({
        registry,
        positions: {}, // 全員 registry の初期位置
        relationships: {},
        worldTurn: 5,
    });
    const em = getAffinity(res.relationships, 'npc_elda', 'npc_marcus');
    eq(em, CO_LOCATION_STEP, 'co-location raises Elda-Marcus');
    eq(getAffinity(res.relationships, 'npc_elda', 'npc_far'), 0, 'no co-location with distant Rurik');
    if (res.changes.length >= 1 && res.changes[0].reason === 'co_location') { ok('co-location change reason'); }
    else { fail('co-location change reason'); }
}

// 5. 移動中(arrivesTurn > worldTurn)は不在扱い → 同席カウントしない
{
    const res = evolveRelationships({
        registry,
        positions: { npc_marcus: { locationId: 'elda_shop', arrivesTurn: 20 } }, // まだ到着してない
        relationships: {},
        worldTurn: 5,
    });
    eq(getAffinity(res.relationships, 'npc_elda', 'npc_marcus'), 0, 'in-transit NPC not co-located');
}

// 6. 共通の危機 — 同 reason で動いた2人は結束
{
    const res = evolveRelationships({
        registry,
        positions: { npc_elda: { locationId: 'north_farm', arrivesTurn: 3 }, npc_marcus: { locationId: 'south_port', arrivesTurn: 3 } },
        relationships: {},
        worldTurn: 5,
        agencyMoves: [
            { npcId: 'npc_elda', reason: 'food_crisis_buy_wheat' },
            { npcId: 'npc_marcus', reason: 'food_crisis_buy_wheat' },
        ],
    });
    const em = getAffinity(res.relationships, 'npc_elda', 'npc_marcus');
    if (em >= SHARED_CRISIS_STEP) { ok('shared crisis bonds allies'); }
    else { fail(`shared crisis bond (got ${em})`); }
}

// 7. 派閥動態 — 紛争イベント時、異派閥は険悪化
{
    const res = evolveRelationships({
        registry,
        positions: { npc_elda: { locationId: 'a', arrivesTurn: 1 }, npc_marcus: { locationId: 'b', arrivesTurn: 1 } },
        relationships: {},
        worldTurn: 5,
        recentChanges: [{ worldTurn: 5, category: 'conflict', severity: 'critical', message: '国境で紛争が勃発' }],
    });
    const em = getAffinity(res.relationships, 'npc_elda', 'npc_marcus');
    if (em <= FACTION_CONFLICT_STEP) { ok('faction conflict sours cross-faction'); }
    else { fail(`faction conflict (got ${em})`); }
    // 同派閥(Marcus-Rurik 両方 smiths, ただし別location)は結束(正)
    const mr = getAffinity(res.relationships, 'npc_marcus', 'npc_far');
    if (mr > 0) { ok('faction kinship bonds same-faction'); }
    else { fail(`faction kinship (got ${mr})`); }
}

// 8. clamp — 上限に張り付いたら実変化なし → change を出さない(黙る)
{
    const res = evolveRelationships({
        registry,
        positions: {},
        relationships: { 'npc_elda|npc_marcus': MAX_AFFINITY },
        worldTurn: 5,
    });
    eq(getAffinity(res.relationships, 'npc_elda', 'npc_marcus'), MAX_AFFINITY, 'clamp at MAX');
    eq(res.changes.length, 0, 'no change emitted when pinned at MAX');
}

// 9. ≤10 clamp — 11人でも先頭10人のみ
{
    const big = {};
    for (let i = 0; i < 11; i++) { big['npc_' + i] = { name: 'N' + i, locationId: 'hub' }; }
    const res = evolveRelationships({ registry: big, positions: {}, relationships: {}, worldTurn: 1 });
    // 11人目(npc_10)を含むペアは生成されない
    const involvesEleventh = Object.keys(res.relationships).some((k) => k.split('|').includes('npc_10'));
    if (!involvesEleventh) { ok('11th NPC excluded (≤10 clamp)'); }
    else { fail('11th NPC leaked past clamp'); }
}

// 10. parseRelationshipOps — 不正弾き & clamp
{
    const ops = parseRelationshipOps([
        { a: 'npc_elda', b: 'npc_marcus', delta: 15 },
        { a: 'x', b: 'x', delta: 5 },       // self → 除外
        { a: 'onlyone', delta: 3 },          // b 欠落 → 除外
        { a: 'p', b: 'q', delta: 9999 },     // clamp
        { a: 'r', b: 's', delta: 0 },        // 0 → 除外
    ]);
    eq(ops.length, 2, 'parseRelationshipOps filters invalid');
    const clamped = ops.find((o) => o.a === 'p');
    if (clamped && clamped.delta === MAX_AFFINITY) { ok('parseRelationshipOps clamps delta'); }
    else { fail('parseRelationshipOps clamp'); }
}

// 11. applyRelationshipOps — registry 外ペアは無視
{
    const map = applyRelationshipOps({}, [
        { a: 'npc_elda', b: 'npc_marcus', delta: 40 },
        { a: 'ghost', b: 'npc_elda', delta: 40 }, // ghost は registry 外 → 無視
    ], registry);
    eq(getAffinity(map, 'npc_elda', 'npc_marcus'), 40, 'applyRelationshipOps applies valid');
    eq(getAffinity(map, 'ghost', 'npc_elda'), 0, 'applyRelationshipOps skips unknown npc');
}

// 12. listNotableRelationships — neutral 除外・|affinity| 降順
{
    const notable = listNotableRelationships({
        'npc_elda|npc_marcus': 45,
        'npc_elda|npc_far': 5, // neutral → 除外
        'npc_marcus|npc_far': -80,
    }, registry);
    eq(notable.length, 2, 'listNotable excludes neutral');
    eq(notable[0].label, 'enemy', 'listNotable sorts by |affinity| (enemy -80 first)');
}

// 13. buildRelationshipPromptLines — 行が出る & maxLines 尊重
{
    const notable = listNotableRelationships({ 'npc_elda|npc_marcus': 45 }, registry);
    const lines = buildRelationshipPromptLines(notable, [], registry, 8);
    if (lines.length === 1 && lines[0].includes('Elda') && lines[0].includes('Marcus')) { ok('buildRelationshipPromptLines'); }
    else { fail(`buildRelationshipPromptLines (${JSON.stringify(lines)})`); }
}

// cleanup
try { fs.rmSync(outDir, { recursive: true, force: true }); } catch (_) { /* noop */ }

if (failed > 0) { console.error(`\n${failed} failing`); process.exit(1); }
console.log('\nAll npc relationship core tests passed.');
