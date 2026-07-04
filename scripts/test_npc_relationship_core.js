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
    buildRelationshipPromptLines, applyIntroductionTrustBoost,
    reconcileRelationshipGraph, cascadeNpcRemovalFromGraph,
    factionPairKey, getFactionRelation, getFactionCohesion, isConflictEvent,
    canonicalizeAffinityPairMap,
    MAX_AFFINITY, MIN_AFFINITY, CO_LOCATION_STEP, SHARED_CRISIS_STEP,
    FACTION_CONFLICT_STEP, AFFINITY_FRIEND, INTRODUCTION_MIN_AFFINITY,
    FACTION_ALLIED_REP_MIN, FACTION_INTRO_TRUST_DAMPEN, MAX_EFFECTIVE_PLAYER_TRUST,
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

// 1b. canonicalizeAffinityPairMap merges split-brain keys
{
    const out = canonicalizeAffinityPairMap({ 'b|a': 12, 'a|b': 99 });
    eq(out['a|b'], 99, 'canonicalizeAffinityPairMap last-wins on collision');
    eq(Object.keys(out).length, 1, 'canonicalizeAffinityPairMap single canonical key');
}

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

// 7. 派閥動態 — 紛争イベント時、個人ペアではなく「派閥そのもの」の関係が動く
{
    const res = evolveRelationships({
        registry,
        positions: { npc_elda: { locationId: 'a', arrivesTurn: 1 }, npc_marcus: { locationId: 'b', arrivesTurn: 1 } },
        relationships: {},
        worldTurn: 5,
        stepEvents: [{
            worldTurn: 5,
            category: 'conflict',
            severity: 'critical',
            message: '国境で紛争が勃発',
            factionId: 'faction_merchants',
            targetFactionId: 'faction_smiths',
        }],
    });
    // 個人の relationships には faction dynamics は一切書き込まれない(N^2回避の核心)
    eq(getAffinity(res.relationships, 'npc_elda', 'npc_marcus'), 0, 'faction conflict does not touch personal affinity');
    eq(getAffinity(res.relationships, 'npc_marcus', 'npc_far'), 0, 'faction kinship does not touch personal affinity');
    // 代わりに派閥レベルの関係が動く
    const fr = getFactionRelation(res.factionRelationships, 'faction_merchants', 'faction_smiths');
    if (fr <= FACTION_CONFLICT_STEP) { ok('faction conflict sours cross-faction (faction-level)'); }
    else { fail(`faction conflict faction-level (got ${fr})`); }
    const fc = getFactionCohesion(res.factionCohesion, 'faction_smiths');
    if (fc > 0) { ok('faction kinship bonds same-faction (faction-level)'); }
    else { fail(`faction kinship faction-level (got ${fc})`); }
    // 変化イベントも派閥レベルで1件ずつ(NPCペア単位ではない)
    const conflictChange = res.factionChanges.find((c) => c.reason === 'faction_conflict');
    const kinshipChange = res.factionChanges.find((c) => c.reason === 'faction_kinship');
    if (conflictChange && kinshipChange) { ok('factionChanges records both conflict and kinship'); }
    else { fail(`factionChanges (got ${JSON.stringify(res.factionChanges)})`); }
}

// 7b. 派閥動態の計算量は派閥数(F)にのみ依存する — NPC数(N)が増えても
// 派閥数が同じなら factionChanges の件数は変わらない(O(N^2)に戻っていないことの確認)。
{
    const many = {};
    // 500人だが所属は3派閥のみ、かつ全員同じ場所(同席で個人peerも生成されるが、
    // ここで見たいのは派閥レベルの出力サイズが N に連動しないこと)。
    for (let i = 0; i < 500; i++) {
        many['npc_' + i] = { name: 'N' + i, locationId: 'far_away_' + i, factionId: 'faction_' + (i % 3) };
    }
    const res = evolveRelationships({
        registry: many, positions: {}, relationships: {}, worldTurn: 1, maxNamedNpcCount: 500,
        stepEvents: [{
            worldTurn: 1,
            category: 'conflict',
            severity: 'critical',
            message: 'war',
            factionId: 'faction_0',
            targetFactionId: 'faction_1',
        }],
    });
    // バインドされた紛争(0 vs 1)のみ → 結束2件 + 敵対1件 = 最大3件。500人/Nには連動しない。
    if (res.factionChanges.length <= 3) {
        ok(`faction dynamics output stays O(F) regardless of N (${res.factionChanges.length} changes for 500 NPCs / 3 factions)`);
    } else {
        fail(`faction dynamics output scaled with N (got ${res.factionChanges.length} changes, want <=3)`);
    }
}

// 7c. recentChanges に紛争が残っていても stepEvents が空なら派閥動態は再適用しない
{
    const res = evolveRelationships({
        registry,
        positions: {},
        relationships: {},
        worldTurn: 10,
        recentChanges: [{
            id: 'wce_5_conflict_border',
            worldTurn: 5,
            category: 'conflict',
            severity: 'critical',
            message: '国境で紛争が勃発',
            factionId: 'faction_merchants',
            targetFactionId: 'faction_smiths',
        }],
        stepEvents: [],
    });
    eq(res.factionChanges.length, 0, 'recentChanges alone does not re-apply faction conflict');
    eq(getFactionRelation(res.factionRelationships, 'faction_merchants', 'faction_smiths'), 0, 'no stale recentChanges faction drift');
}

// 7d. A-B 戦争で C-D は変化しない
{
    const fourFactionRegistry = {
        npc_a: { name: 'A', locationId: 'x', factionId: 'faction_a' },
        npc_b: { name: 'B', locationId: 'y', factionId: 'faction_b' },
        npc_c: { name: 'C', locationId: 'z', factionId: 'faction_c' },
        npc_d: { name: 'D', locationId: 'w', factionId: 'faction_d' },
    };
    const res = evolveRelationships({
        registry: fourFactionRegistry,
        positions: {},
        relationships: {},
        worldTurn: 3,
        stepEvents: [{
            id: 'wce_3_conflict_ab',
            worldTurn: 3,
            category: 'conflict',
            message: 'war between A and B',
            factionId: 'faction_a',
            targetFactionId: 'faction_b',
        }],
    });
    const ab = getFactionRelation(res.factionRelationships, 'faction_a', 'faction_b');
    const cd = getFactionRelation(res.factionRelationships, 'faction_c', 'faction_d');
    if (ab <= FACTION_CONFLICT_STEP) { ok('A-B conflict sours bound pair'); }
    else { fail(`A-B conflict (got ${ab})`); }
    eq(cd, 0, 'C-D unaffected by A-B war');
}

// 7e. critical な地域危険度イベントは紛争扱いしない
{
    const regionCritical = {
        worldTurn: 8,
        category: 'region',
        severity: 'critical',
        message: 'Dark Moor: danger rising (9/10)',
        factionId: 'faction_merchants',
        targetFactionId: 'faction_smiths',
    };
    if (!isConflictEvent(regionCritical)) { ok('region critical alone is not conflict'); }
    else { fail('region critical should not be conflict'); }
    const res = evolveRelationships({
        registry,
        positions: {},
        relationships: {},
        worldTurn: 8,
        stepEvents: [regionCritical],
    });
    eq(res.factionChanges.length, 0, 'region critical does not trigger faction dynamics');
}

// 7f. 同一 eventId は stepEvents 内でも1回だけ作用
{
    const conflictEv = {
        id: 'wce_4_conflict_dup',
        worldTurn: 4,
        category: 'conflict',
        message: 'raid',
        factionId: 'faction_merchants',
        targetFactionId: 'faction_smiths',
    };
    const res = evolveRelationships({
        registry,
        positions: {},
        relationships: {},
        worldTurn: 4,
        stepEvents: [conflictEv, conflictEv],
    });
    const conflictChanges = res.factionChanges.filter((c) => c.reason === 'faction_conflict');
    eq(conflictChanges.length, 1, 'duplicate eventId applies faction conflict once');
}

// 7g. ペア未バインドの conflict は派閥動態を起こさない(意図的な breaking change)
{
    const unbound = {
        worldTurn: 5,
        category: 'conflict',
        message: 'war somewhere',
    };
    if (!isConflictEvent(unbound)) { fail('unbound conflict should match isConflictEvent'); }
    const res = evolveRelationships({
        registry,
        positions: {},
        relationships: {},
        worldTurn: 5,
        stepEvents: [unbound],
    });
    eq(res.factionChanges.length, 0, 'unbound conflict has no faction effect');
}

// 7h. id なしの同一 conflict も stepEvents 内で1回だけ作用
{
    const conflictEv = {
        worldTurn: 6,
        category: 'conflict',
        message: 'raid',
        factionId: 'faction_merchants',
        targetFactionId: 'faction_smiths',
    };
    const res = evolveRelationships({
        registry,
        positions: {},
        relationships: {},
        worldTurn: 6,
        stepEvents: [conflictEv, conflictEv],
    });
    const conflictChanges = res.factionChanges.filter((c) => c.reason === 'faction_conflict');
    eq(conflictChanges.length, 1, 'duplicate id-less conflict applies faction conflict once');
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

// 14. reconcileRelationshipGraph drops dangling NPC refs
{
    const pruned = reconcileRelationshipGraph({
        'npc_elda|npc_marcus': 40,
        'npc_elda|npc_ghost': 20,
    }, registry);
    eq(getAffinity(pruned, 'npc_elda', 'npc_marcus'), 40, 'reconcile keeps valid pair');
    eq(getAffinity(pruned, 'npc_elda', 'npc_ghost'), 0, 'reconcile drops unknown NPC');
}

// 15. cascadeNpcRemovalFromGraph removes all edges for removed NPC
{
    const farKey = pairKey('npc_marcus', 'npc_far');
    const pruned = cascadeNpcRemovalFromGraph({
        [pairKey('npc_elda', 'npc_marcus')]: 40,
        [farKey]: -10,
    }, 'npc_elda');
    eq(Object.keys(pruned).length, 1, 'cascade keeps unrelated pair');
    eq(getAffinity(pruned, 'npc_marcus', 'npc_far'), -10, 'cascade preserves other edges');
}

// 16. faction rep dampens introduction trust stacking
{
    const rels = {};
    rels[pairKey('npc_elda', 'npc_marcus')] = INTRODUCTION_MIN_AFFINITY;
    const reg = {
        npc_elda: { name: 'Elda', playerTrust: 85, factionId: 'faction_merchants' },
        npc_marcus: { name: 'Marcus', playerTrust: 30, factionId: 'faction_smiths' },
    };
    const boosted = applyIntroductionTrustBoost(reg, rels, { faction_smiths: FACTION_ALLIED_REP_MIN });
    const marcusTrust = boosted.npc_marcus.playerTrust;
    const rawIntro = 85 - 25; // ally trust minus INTRODUCTION_TRUST_PENALTY
    const expectedCap = 30 + Math.round((rawIntro - 30) * FACTION_INTRO_TRUST_DAMPEN);
    if (marcusTrust === expectedCap && marcusTrust <= MAX_EFFECTIVE_PLAYER_TRUST) {
        ok('faction allied rep dampens intro trust');
    } else {
        fail(`faction dampen (got ${marcusTrust}, want ${expectedCap})`);
    }
}

// 17. maxNamedNpcCount raises the cap beyond the legacy 10 (game_rules.maxNamedNpcCount)
{
    const big = {};
    for (let i = 0; i < 15; i++) { big['npc_' + i] = { name: 'N' + i, locationId: 'hub' }; }
    const res = evolveRelationships({
        registry: big, positions: {}, relationships: {}, worldTurn: 1, maxNamedNpcCount: 20,
    });
    const involves15th = Object.keys(res.relationships).some((k) => k.split('|').includes('npc_14'));
    if (involves15th) { ok('maxNamedNpcCount=20 includes 15th NPC'); }
    else { fail('15th NPC excluded despite maxNamedNpcCount=20'); }
}

// 18. co-location grouping is scoped per-location (no cross-location pairs), even at larger N
{
    const many = {};
    // 3 locations x 8 npcs = 24 named NPCs, above the legacy 10.
    for (let loc = 0; loc < 3; loc++) {
        for (let i = 0; i < 8; i++) { many[`npc_l${loc}_${i}`] = { name: `L${loc}N${i}`, locationId: `loc${loc}` }; }
    }
    const res = evolveRelationships({
        registry: many, positions: {}, relationships: {}, worldTurn: 1, maxNamedNpcCount: 24,
    });
    const pairs = Object.keys(res.relationships);
    const crossLocation = pairs.some((k) => {
        const [a, b] = k.split('|');
        return a.slice(0, 6) !== b.slice(0, 6); // "npc_l0" prefix differs -> different location
    });
    const sameLocationPairCount = pairs.length;
    // per location: C(8,2) = 28 pairs, x3 locations = 84
    if (!crossLocation && sameLocationPairCount === 84) {
        ok('co-location grouping only bonds same-location pairs (84 pairs across 3 locations)');
    } else {
        fail(`co-location grouping (crossLocation=${crossLocation}, pairs=${sameLocationPairCount}, want 84)`);
    }
}

// 19. applyRelationshipOps / listNotableRelationships / reconcileRelationshipGraph honor maxNamedNpcCount
{
    const big = {};
    for (let i = 0; i < 12; i++) { big['npc_' + i] = { name: 'N' + i }; }
    const ops = [{ a: 'npc_0', b: 'npc_11', delta: 50, reason: 'manual' }];
    const withDefault = applyRelationshipOps({}, ops, big);
    eq(getAffinity(withDefault, 'npc_0', 'npc_11'), 0, 'applyRelationshipOps default cap (10) excludes npc_11');
    const withRaisedCap = applyRelationshipOps({}, ops, big, 12);
    eq(getAffinity(withRaisedCap, 'npc_0', 'npc_11'), 50, 'applyRelationshipOps maxNamedNpcCount=12 includes npc_11');

    const rels = { [pairKey('npc_0', 'npc_11')]: 80 };
    const notableDefault = listNotableRelationships(rels, big, 8);
    eq(notableDefault.length, 0, 'listNotableRelationships default cap excludes npc_11 pair');
    const notableRaised = listNotableRelationships(rels, big, 8, 12);
    eq(notableRaised.length, 1, 'listNotableRelationships maxNamedNpcCount=12 includes npc_11 pair');

    const reconciledDefault = reconcileRelationshipGraph(rels, big);
    eq(Object.keys(reconciledDefault).length, 0, 'reconcileRelationshipGraph default cap drops npc_11 pair');
    const reconciledRaised = reconcileRelationshipGraph(rels, big, 12);
    eq(Object.keys(reconciledRaised).length, 1, 'reconcileRelationshipGraph maxNamedNpcCount=12 keeps npc_11 pair');
}

// 20. listNotableRelationships blends faction context (personal + faction modifier),
// but only for pairs that already have a personal relationship entry (bounded, no O(N^2)).
{
    const reg = {
        npc_a: { name: 'A', factionId: 'faction_x' },
        npc_b: { name: 'B', factionId: 'faction_y' },
    };
    const rels = { [pairKey('npc_a', 'npc_b')]: 10 }; // personal alone: neutral (below AFFINITY_FRIEND)
    const withoutFaction = listNotableRelationships(rels, reg, 8, 10);
    eq(withoutFaction.length, 0, 'sanity: personal-only affinity (10) is neutral, not notable');

    const factionRelationships = { [factionPairKey('faction_x', 'faction_y')]: -90 }; // factions at war
    const withFaction = listNotableRelationships(rels, reg, 8, 10, factionRelationships, {});
    eq(withFaction.length, 1, 'faction hostility surfaces the pair as notable');
    eq(withFaction[0].affinity, -80, 'effective affinity = personal(10) + faction(-90) = -80');
    eq(withFaction[0].label, 'enemy', 'listNotableRelationships blends faction hostility into effective label');
}

// cleanup
try { fs.rmSync(outDir, { recursive: true, force: true }); } catch (_) { /* noop */ }

if (failed > 0) { console.error(`\n${failed} failing`); process.exit(1); }
console.log('\nAll npc relationship core tests passed.');
