#!/usr/bin/env node
'use strict';

// LW3 host wiring test: worldState persistence + tick evolution + [Living World — Bonds].

const path = require('path');
const fs = require('fs');
const root = path.join(__dirname, '..');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }
function eq(actual, expected, msg) {
    if (actual === expected) { ok(msg); } else { fail(`${msg} (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`); }
}

const paths = [
    'out/worldStateCore.js',
    'out/livingWorldBridge.js',
    'out/npcRelationshipCore.js',
];
for (const p of paths) {
    if (!fs.existsSync(path.join(root, p))) {
        fail(`${p} missing — run npm run compile`);
        process.exit(1);
    }
}

const { parseWorldState } = require(path.join(root, 'out', 'worldStateCore.js'));
const {
    npcRelationshipsEnabled,
    tickLivingWorldAfterSim,
    buildLivingWorldGmLines,
} = require(path.join(root, 'out', 'livingWorldBridge.js'));
const { getAffinity, pairKey } = require(path.join(root, 'out', 'npcRelationshipCore.js'));

// --- fixtures ---

const RULES_ON = {
    enableRpgMechanics: true, defaultMaxHp: 100, defaultMaxMp: 50, diceDifficulty: 'Normal',
    enableNpcRegistry: true, enableWorldForge: true, enableEmergentSimulation: true,
    enableNpcAgency: true, enableNpcRelationships: true, enableCommerce: false,
};
const RULES_OFF = { ...RULES_ON, enableNpcRelationships: false };

const REGISTRY = {
    npcs: {
        npc_elda: { name: 'Elda', locationId: 'elda_shop', factionId: 'faction_merchants' },
        npc_marcus: { name: 'Marcus', locationId: 'elda_shop', factionId: 'faction_smiths' },
    },
};

const FORGE = {
    geography: {
        locations: [
            { id: 'elda_shop', name: 'エルダの店', regionId: 'r_central' },
            { id: 'south_port', name: '南港', regionId: 'r_south' },
        ],
        regions: [
            { id: 'r_central', name: '中央地方' },
            { id: 'r_south', name: '南部' },
        ],
    },
    factions: [],
};

function freshState(extra) {
    return Object.assign({
        format: 'lorerelay-world-state/1.1',
        worldTurn: 10,
        factions: {},
        regions: {},
        globalEvents: [],
        recentChanges: [],
    }, extra || {});
}

// 1. parseWorldState round-trip: npcRelationships が保存・検証つきで残る
{
    const parsed = parseWorldState({
        worldTurn: 5,
        factions: {},
        npcRelationships: {
            'npc_elda|npc_marcus': 42,
            'bad-key-no-sep': 10,       // 弾く
            'a|b': 9999,                 // clamp → 100
            'c|d': 'not-a-number',       // 弾く
        },
    });
    if (!parsed || !parsed.npcRelationships) { fail('parseWorldState keeps npcRelationships'); }
    else {
        if (parsed.npcRelationships['npc_elda|npc_marcus'] === 42) { ok('parse keeps valid pair'); }
        else { fail('parse keeps valid pair'); }
        if (parsed.npcRelationships['bad-key-no-sep'] === undefined) { ok('parse drops bad key'); }
        else { fail('parse drops bad key'); }
        if (parsed.npcRelationships['a|b'] === 100) { ok('parse clamps to 100'); }
        else { fail(`parse clamps (got ${parsed.npcRelationships['a|b']})`); }
        if (parsed.npcRelationships['c|d'] === undefined) { ok('parse drops non-number'); }
        else { fail('parse drops non-number'); }
    }
}

// 2. gate: Registry+Agency 前提
{
    if (npcRelationshipsEnabled(RULES_ON) === true) { ok('gate ON when all flags'); }
    else { fail('gate ON'); }
    if (npcRelationshipsEnabled({ ...RULES_ON, enableNpcAgency: false }) === false) { ok('gate OFF without agency'); }
    else { fail('gate OFF without agency'); }
    if (npcRelationshipsEnabled(RULES_OFF) === false) { ok('gate OFF when flag false'); }
    else { fail('gate OFF'); }
}

// 3. tick: Elda と Marcus 同席 → affinity が上がり world_state に載る
{
    const state = freshState();
    const out = tickLivingWorldAfterSim(FORGE, state, REGISTRY, RULES_ON, undefined);
    const aff = getAffinity(out.state.npcRelationships || {}, 'npc_elda', 'npc_marcus');
    if (aff > 0) { ok(`tick evolves co-located pair (affinity ${aff})`); }
    else { fail(`tick evolves co-located pair (got ${aff})`); }
}

// 4. tick OFF: npcRelationships に触らない
{
    const state = freshState();
    const out = tickLivingWorldAfterSim(FORGE, state, REGISTRY, RULES_OFF, undefined);
    if (out.state.npcRelationships === undefined) { ok('tick OFF leaves relationships untouched'); }
    else { fail('tick OFF mutated relationships'); }
}

// 5. GM 注入: friend 閾値越えで [Living World — Bonds] が出る
{
    const seed = {};
    seed[pairKey('npc_elda', 'npc_marcus')] = 45;
    const state = freshState({ npcRelationships: seed });
    const injection = buildLivingWorldGmLines(FORGE, state, REGISTRY, RULES_ON, undefined, 'elda_shop');
    if (injection.includes('[Living World — Bonds]')) { ok('Bonds block present'); }
    else { fail(`Bonds block missing (got: ${JSON.stringify(injection)})`); }
    if (injection.includes('Elda') && injection.includes('Marcus') && injection.includes('友好')) {
        ok('Bonds block shows friendly pair with label');
    } else { fail('Bonds pair/label'); }
}

// 6. GM 注入 OFF: Bonds が出ない
{
    const seed = {};
    seed[pairKey('npc_elda', 'npc_marcus')] = 45;
    const state = freshState({ npcRelationships: seed });
    const injection = buildLivingWorldGmLines(FORGE, state, REGISTRY, RULES_OFF, undefined, 'elda_shop');
    if (!injection.includes('Bonds')) { ok('no Bonds when disabled'); }
    else { fail('Bonds leaked when disabled'); }
}

// 7. neutral のみなら Bonds ブロック自体を出さない(ノイズ抑制)
{
    const seed = {};
    seed[pairKey('npc_elda', 'npc_marcus')] = 5; // neutral
    const state = freshState({ npcRelationships: seed, recentChanges: [] });
    // 直近変化キャッシュを空にするため、OFF ルールで一度 tick(何もしない)を挟まず、
    // 変化なし tick を回す: 同席ペアは +3 されるので neutral のまま変化行は出るかもしれない。
    // ここでは「ラベル行(友好/盟友等)が出ない」ことだけを確認する。
    const injection = buildLivingWorldGmLines(FORGE, state, REGISTRY, RULES_ON, undefined, 'elda_shop');
    if (!injection.includes('盟友') && !injection.includes('敵対') && !injection.includes(': 友好')) {
        ok('neutral pair emits no relationship label line');
    } else { fail(`neutral leaked label (got: ${JSON.stringify(injection)})`); }
}

// 8. ラベル遷移(中立→友好)で recentChanges に噂イベントが乗る
{
    const seed = {};
    seed[pairKey('npc_elda', 'npc_marcus')] = 28; // +3 の同席で 31 → friend 閾値30を跨ぐ
    const state = freshState({ npcRelationships: seed });
    tickLivingWorldAfterSim(FORGE, state, REGISTRY, RULES_ON, undefined);
    const bondEvents = (state.recentChanges || []).filter((e) => e.category === 'npc' && /噂/.test(e.message));
    if (bondEvents.length === 1 && bondEvents[0].message.includes('友好')) {
        ok('label transition emits hearsay world event');
    } else {
        fail(`label transition event (got ${JSON.stringify(bondEvents)})`);
    }
    if (bondEvents.length === 1 && bondEvents[0].gmHint && bondEvents[0].npcIds && bondEvents[0].npcIds.length === 2) {
        ok('hearsay event carries gmHint and npcIds');
    } else { fail('hearsay event metadata'); }
}

// 9. ラベルが変わらない変化はイベントを出さない(スパム防止)
{
    const seed = {};
    seed[pairKey('npc_elda', 'npc_marcus')] = 10; // +3 で 13、neutral のまま
    const state = freshState({ npcRelationships: seed });
    tickLivingWorldAfterSim(FORGE, state, REGISTRY, RULES_ON, undefined);
    const bondEvents = (state.recentChanges || []).filter((e) => e.category === 'npc' && /噂/.test(e.message));
    if (bondEvents.length === 0) { ok('no hearsay event without label transition'); }
    else { fail(`unexpected hearsay events: ${bondEvents.length}`); }
}

// 10. LW3-W 紹介効果 — 低信頼(20=unknown)の Marcus が盟友 Elda(100) の紹介で GM whereabouts に現れる
{
    const introRegistry = {
        npcs: {
            npc_elda: { name: 'Elda', locationId: 'elda_shop', factionId: 'faction_merchants', disposition: { playerTrust: 100 } },
            npc_marcus: { name: 'Marcus', locationId: 'elda_shop', factionId: 'faction_smiths', disposition: { playerTrust: 20 } },
        },
    };
    const seedLow = {}; seedLow[pairKey('npc_elda', 'npc_marcus')] = 45; // 友好止まり → 紹介不成立
    const s1 = freshState({ npcRelationships: seedLow });
    const inj1 = buildLivingWorldGmLines(FORGE, s1, introRegistry, RULES_ON, undefined, 'elda_shop');
    const seedAlly = {}; seedAlly[pairKey('npc_elda', 'npc_marcus')] = 75; // 盟友 → 紹介成立(100-25=75 ≥ 70 exact)
    const s2 = freshState({ npcRelationships: seedAlly });
    const inj2 = buildLivingWorldGmLines(FORGE, s2, introRegistry, RULES_ON, undefined, 'elda_shop');
    if (inj1.includes('Marcus: whereabouts unknown')) { ok('friend-level bond: Marcus stays unknown'); }
    else { fail(`expected unknown Marcus (got: ${JSON.stringify(inj1)})`); }
    if (inj2.includes('Marcus: at')) { ok('ally introduction reveals Marcus whereabouts'); }
    else { fail(`expected introduced Marcus (got: ${JSON.stringify(inj2)})`); }
}

// 11. LW3-W 盟友物流 — commerce ON の tick で共有商品の在庫が両市場で増える
{
    const RULES_COMMERCE = { ...RULES_ON, enableCommerce: true };
    const rawForgeDoc = {
        commerce: {
            commodities: [{ id: 'wheat', name: '小麦', basePrice: 10, weight: 1 }],
            markets: [
                { locationId: 'elda_shop', commodityIds: ['wheat'], targetStock: 30 },
                { locationId: 'south_port', commodityIds: ['wheat'], targetStock: 30 },
            ],
            transportKinds: [{ id: 'wagon', name: '馬車', capacity: 20, speed: 1 }],
        },
    };
    const seed = {}; seed[pairKey('npc_elda', 'npc_marcus')] = 75; // 盟友
    const state = freshState({
        npcRelationships: seed,
        npcPositions: { npc_marcus: { locationId: 'south_port', arrivesTurn: 5 } }, // 到着済み(worldTurn 10)
        markets: {
            elda_shop: { wheat: { stock: 30, priceIndex: 1.0 } },
            south_port: { wheat: { stock: 30, priceIndex: 1.0 } },
        },
    });
    tickLivingWorldAfterSim(FORGE, state, REGISTRY, RULES_COMMERCE, rawForgeDoc);
    const eldaStock = state.markets.elda_shop.wheat.stock;
    const portStock = state.markets.south_port.wheat.stock;
    if (eldaStock > 30 && portStock > 30) { ok(`ally trade route boosts both markets (${eldaStock}/${portStock})`); }
    else { fail(`ally trade stock (got ${eldaStock}/${portStock})`); }
}

// 12. LW3-L ライフイベント — inseparable(95)到達で転機イベントが recentChanges に一度だけ乗り、
//     npcMilestones に記録されて再発火しない
{
    const seed = {}; seed[pairKey('npc_elda', 'npc_marcus')] = 95;
    const state = freshState({ npcRelationships: seed });
    tickLivingWorldAfterSim(FORGE, state, REGISTRY, RULES_ON, undefined);
    const lifeEvents = (state.recentChanges || []).filter((e) => e.category === 'npc' && /離れがたい/.test(e.message));
    if (lifeEvents.length === 1) { ok('life event fires on inseparable'); }
    else { fail(`life event (got ${JSON.stringify((state.recentChanges||[]).map(e=>e.message))})`); }
    if (state.npcMilestones && (state.npcMilestones[pairKey('npc_elda','npc_marcus')]||[]).includes('inseparable')) {
        ok('milestone persisted on world_state');
    } else { fail('milestone persisted'); }

    // 2周目: 記録済みなので再発火しない
    state.recentChanges = [];
    tickLivingWorldAfterSim(FORGE, state, REGISTRY, RULES_ON, undefined);
    const again = (state.recentChanges || []).filter((e) => /離れがたい/.test(e.message));
    eq(again.length, 0, 'life event does not refire once reached');
}

// 13. parseWorldState が npcMilestones を検証付きで round-trip
{
    const parsed = parseWorldState({
        worldTurn: 5, factions: {},
        npcMilestones: {
            'npc_elda|npc_marcus': ['sworn_allies', 'bogus_kind', 'inseparable'],
            'bad-key': ['sworn_allies'],
        },
    });
    if (parsed && parsed.npcMilestones && parsed.npcMilestones['npc_elda|npc_marcus']) {
        const kinds = parsed.npcMilestones['npc_elda|npc_marcus'];
        if (kinds.includes('sworn_allies') && kinds.includes('inseparable') && !kinds.includes('bogus_kind')) {
            ok('parse keeps valid milestone kinds, drops bogus');
        } else { fail(`milestone kinds (${JSON.stringify(kinds)})`); }
        if (parsed.npcMilestones['bad-key'] === undefined) { ok('parse drops bad milestone key'); }
        else { fail('parse drops bad milestone key'); }
    } else { fail('parse keeps npcMilestones'); }
}

// 14. LW3-P プレイヤー絆 — disposition 閾値越えで転機発火→永続化→再発火なし→GM [Your Bonds]
{
    const pbRegistry = {
        npcs: {
            npc_elda: {
                name: 'Elda', locationId: 'elda_shop', factionId: 'faction_merchants',
                disposition: { playerTrust: 90, playerRomance: 0, playerFear: 0 },
            },
            npc_marcus: {
                name: 'Marcus', locationId: 'elda_shop', factionId: 'faction_smiths',
                disposition: { playerTrust: 50, playerRomance: 0, playerFear: 0 },
            },
        },
    };
    const state = freshState();
    tickLivingWorldAfterSim(FORGE, state, pbRegistry, RULES_ON, undefined);
    const bondEvents = (state.recentChanges || []).filter((e) => /盟友と認めた/.test(e.message));
    eq(bondEvents.length, 1, 'player bond milestone fires (trusted_companion)');
    if (state.playerNpcMilestones && (state.playerNpcMilestones.npc_elda || []).includes('trusted_companion')) {
        ok('player milestone persisted');
    } else { fail('player milestone persisted'); }

    // GM 注入に [Your Bonds] + ★(このtickの転機)
    const inj = buildLivingWorldGmLines(FORGE, state, pbRegistry, RULES_ON, undefined, 'elda_shop');
    if (inj.includes('[Living World — Your Bonds]') && inj.includes('★ Elda: sworn ally')) {
        ok('GM Your Bonds block with fresh star');
    } else { fail(`Your Bonds injection (got: ${JSON.stringify(inj)})`); }

    // 再tick: 発火しない
    state.recentChanges = [];
    tickLivingWorldAfterSim(FORGE, state, pbRegistry, RULES_ON, undefined);
    eq((state.recentChanges || []).filter((e) => /盟友と認めた/.test(e.message)).length, 0, 'player bond does not refire');
}

// 15. parseWorldState が playerNpcMilestones を検証付き round-trip
{
    const parsed = parseWorldState({
        worldTurn: 5, factions: {},
        playerNpcMilestones: {
            npc_elda: ['trusted_companion', 'bogus', 'romance'],
        },
    });
    if (parsed && parsed.playerNpcMilestones && parsed.playerNpcMilestones.npc_elda) {
        const kinds = parsed.playerNpcMilestones.npc_elda;
        if (kinds.includes('trusted_companion') && kinds.includes('romance') && !kinds.includes('bogus')) {
            ok('parse keeps valid player bond kinds, drops bogus');
        } else { fail(`player bond kinds (${JSON.stringify(kinds)})`); }
    } else { fail('parse keeps playerNpcMilestones'); }
}

if (failed > 0) { console.error(`\n${failed} failing`); process.exit(1); }
console.log('\nAll npc relationship host tests passed.');
