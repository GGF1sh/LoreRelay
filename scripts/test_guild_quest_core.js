#!/usr/bin/env node
'use strict';

const {
    computeQuestGradeWeights,
    resolveQuestOutcome,
    assignParty,
    advanceActiveQuests,
    tickQuestWeek,
    isQuestDue,
    clampQuestWeeks,
    isValidQuestGrade,
    buildActiveQuestPromptLine,
    DEFAULT_ADVENTURER_SKILL,
    MAX_PARTY_SIZE,
} = require('../out/guildQuestCore');
const { PLAYER_TRUST_RIVAL_MAX } = require('../out/domainOfficerBondCore');
const {
    defaultGuildState,
    parseGuildOps,
    applyGuildOps,
    applyWeeklyCommit,
    applyGuildRequest,
    normalizeGuildConfig,
    recruitAdventurer,
} = require('../out/guildCore');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

function makeAcceptedQuest(id = 'wolf_cull', overrides = {}) {
    return {
        id,
        requestId: id,
        questKind: 'hunt',
        difficulty: 30,
        rewardCoffers: 40,
        status: 'accepted',
        ...overrides,
    };
}

// --- validators + clamp ---
{
    if (!isValidQuestGrade('triumph') || isValidQuestGrade('nope')) {
        fail('isValidQuestGrade');
    } else if (clampQuestWeeks(0) !== 1 || clampQuestWeeks(9) !== 3) {
        fail('clampQuestWeeks');
    } else {
        ok('quest validators + clamp');
    }
}

// --- grade weights: skill, bond, difficulty ---
{
    const lowTrust = computeQuestGradeWeights(50, 20, 30);
    const highTrust = computeQuestGradeWeights(50, 80, 30);
    if (lowTrust.disaster <= highTrust.disaster) {
        fail('low bond should raise disaster weight');
    } else {
        ok('low bond raises disaster weight');
    }

    const lowSkill = computeQuestGradeWeights(10, 80, 30);
    const highSkill = computeQuestGradeWeights(90, 80, 30);
    if (highSkill.triumph <= lowSkill.triumph) {
        fail('high skill should raise triumph weight');
    } else {
        ok('high skill raises triumph weight');
    }

    const easy = computeQuestGradeWeights(60, 60, 20);
    const hard = computeQuestGradeWeights(60, 60, 70);
    if (easy.disaster >= hard.disaster || easy.triumph <= hard.triumph) {
        fail('higher difficulty should shift weights toward disaster');
    } else {
        ok('difficulty shifts weights toward disaster');
    }
}

// --- resolveQuestOutcome deterministic ---
{
    const quest = {
        ...makeAcceptedQuest('wolf_cull'),
        status: 'active',
        partyNpcIds: ['hero_a', 'hero_b'],
        weeksRemaining: 0,
    };
    const skillMap = { hero_a: 60, hero_b: 55 };
    const bondMap = { hero_a: 60, hero_b: 60 };
    const a = resolveQuestOutcome(quest, skillMap, bondMap, 4242);
    const b = resolveQuestOutcome(quest, skillMap, bondMap, 4242);
    if (a.grade !== b.grade || a.reportLine !== b.reportLine) {
        fail('resolveQuestOutcome not deterministic');
    } else if (!isValidQuestGrade(a.grade)) {
        fail('resolveQuestOutcome invalid grade');
    } else if (!a.reportLine.includes('hero_a')) {
        fail('reportLine should reference party');
    } else {
        ok('resolveQuestOutcome deterministic + valid');
    }
}

// --- low trust member raises disaster rate ---
{
    const quest = {
        ...makeAcceptedQuest('escort_caravan'),
        questKind: 'escort',
        status: 'active',
        partyNpcIds: ['rogue_one'],
        weeksRemaining: 0,
        difficulty: 35,
        rewardCoffers: 50,
    };
    let lowTrustDisasters = 0;
    let highTrustDisasters = 0;
    const trials = 120;
    for (let s = 0; s < trials; s++) {
        const low = resolveQuestOutcome(quest, { rogue_one: 50 }, { rogue_one: 20 }, s);
        const high = resolveQuestOutcome(quest, { rogue_one: 50 }, { rogue_one: 80 }, s);
        if (low.grade === 'disaster') { lowTrustDisasters++; }
        if (high.grade === 'disaster') { highTrustDisasters++; }
    }
    if (lowTrustDisasters <= highTrustDisasters) {
        fail(`low trust should yield more disasters: ${lowTrustDisasters} vs ${highTrustDisasters}`);
    } else {
        ok('low trust raises disaster rate');
    }
}

// --- disaster with rival bond can embezzle ---
{
    const quest = {
        ...makeAcceptedQuest('debt_collection'),
        questKind: 'investigate',
        status: 'active',
        partyNpcIds: ['traitor'],
        weeksRemaining: 0,
        rewardCoffers: 55,
        difficulty: 40,
    };
    let found = false;
    for (let s = 0; s < 400 && !found; s++) {
        const out = resolveQuestOutcome(quest, { traitor: 40 }, { traitor: PLAYER_TRUST_RIVAL_MAX }, s);
        if (out.grade === 'disaster' && out.embezzled) {
            found = true;
            if (!out.reportLine.includes('embezzled') || (out.deltas.coffers ?? 0) >= 0) {
                fail('embezzle disaster should reduce coffers');
            }
        }
    }
    if (!found) {
        fail('expected at least one embezzle disaster in sample');
    } else {
        ok('disaster embezzle with low-trust member');
    }
}

// --- tick + due ---
{
    let q = { ...makeAcceptedQuest(), status: 'active', partyNpcIds: ['a'], weeksRemaining: 2 };
    if (isQuestDue(q)) { fail('2-week quest should not be due'); }
    q = tickQuestWeek(q);
    if (q.weeksRemaining !== 1 || isQuestDue(q)) { fail('after 1 tick should have 1 week left'); }
    q = tickQuestWeek(q);
    if (!isQuestDue(q)) { fail('after 2 ticks quest should be due'); } else {
        ok('tickQuestWeek + isQuestDue');
    }
}

// --- assignParty guards ---
{
    let guild = defaultGuildState('tavern_hall');
    guild = recruitAdventurer(guild, { npcId: 'hero_a', klass: 'warrior', skill: 60 });
    guild = recruitAdventurer(guild, { npcId: 'hero_b', klass: 'scout', skill: 55 });
    guild = recruitAdventurer(guild, { npcId: 'hero_c', klass: 'mage', skill: 50 });
    guild.quests = [makeAcceptedQuest('wolf_cull')];
    const cfg = normalizeGuildConfig({ maxActiveQuests: 2, partiesEnabled: true });

    const assigned = assignParty(guild, 'wolf_cull', ['hero_a', 'hero_b'], cfg.maxActiveQuests, 2);
    const active = assigned.quests?.find((q) => q.id === 'wolf_cull');
    if (!active || active.status !== 'active' || active.weeksRemaining !== 2) {
        fail(`assignParty should activate quest: ${JSON.stringify(active)}`);
    } else if ((active.partyNpcIds || []).join(',') !== 'hero_a,hero_b') {
        fail('assignParty party mismatch');
    } else {
        ok('assignParty success');
    }

    guild.quests = [makeAcceptedQuest('escort_caravan'), active];
    const duplicate = assignParty(guild, 'escort_caravan', ['hero_a'], cfg.maxActiveQuests, 1);
    if (duplicate.quests?.find((q) => q.id === 'escort_caravan')?.status === 'active') {
        fail('busy adventurer should block second assign');
    } else {
        ok('assignParty rejects busy adventurer');
    }

    if (assignParty(guild, 'nope', ['hero_c'], cfg.maxActiveQuests, 1).quests?.length !== 2) {
        fail('unknown quest should no-op');
    } else if (assignParty(guild, 'escort_caravan', ['nope_npc'], cfg.maxActiveQuests, 1) === guild) {
        ok('assignParty rejects non-roster npc');
    } else {
        ok('assignParty guards unknown quest/npc');
    }

    guild.quests = [active, { ...makeAcceptedQuest('monster_nest'), status: 'active', partyNpcIds: ['hero_c'], weeksRemaining: 1 }];
    const atCap = assignParty(
        { ...guild, quests: [...guild.quests, makeAcceptedQuest('rare_herb')] },
        'rare_herb',
        ['hero_c'],
        1,
        1
    );
    if (atCap.quests?.find((q) => q.id === 'rare_herb')?.status === 'active') {
        fail('maxActiveQuests cap should block assign');
    } else {
        ok('assignParty respects maxActiveQuests');
    }

    if (assignParty(guild, 'wolf_cull', [], cfg.maxActiveQuests, 1) === guild) {
        ok('assignParty rejects empty party');
    } else {
        fail('empty party should no-op');
    }

    const dupNpc = parseGuildOps({
        kind: 'assign_party',
        quest: { questId: 'wolf_cull', npcIds: ['hero_a', 'hero_a', 'hero_b'] },
    });
    if (!dupNpc?.quest || dupNpc.quest.npcIds.length !== 2 || dupNpc.quest.npcIds[0] !== 'hero_a') {
        fail('parseGuildOps should dedupe party npcIds');
    } else {
        ok('parseGuildOps dedupes party npcIds');
    }

    const tooMany = assignParty(guild, 'wolf_cull', ['hero_a', 'hero_b', 'hero_c', 'hero_a'], cfg.maxActiveQuests, 1);
    if ((tooMany.quests?.find((q) => q.id === 'wolf_cull')?.partyNpcIds || []).length > MAX_PARTY_SIZE) {
        fail('party should cap at MAX_PARTY_SIZE');
    } else {
        ok('assignParty caps party size');
    }
}

// --- parse + apply assign_party ops ---
{
    const ops = parseGuildOps({
        kind: 'assign_party',
        quest: { questId: 'wolf_cull', npcIds: ['hero_a'], weeks: 2 },
    });
    if (!ops || ops.kind !== 'assign_party' || ops.quest?.questId !== 'wolf_cull') {
        fail('parseGuildOps assign_party');
    } else {
        ok('parse assign_party ops');
    }

    if (parseGuildOps({ kind: 'assign_party', quest: { questId: 'bad id', npcIds: ['hero_a'] } })) {
        fail('invalid questId rejected');
    } else if (parseGuildOps({ kind: 'assign_party', quest: { questId: 'wolf_cull', npcIds: [] } })) {
        fail('empty npcIds rejected');
    } else {
        ok('invalid assign_party rejected');
    }
}

// --- weekly commit ticks active quests when partiesEnabled ---
{
    let guild = defaultGuildState('tavern_hall');
    guild = recruitAdventurer(guild, { npcId: 'hero_a', klass: 'warrior', skill: 60 });
    guild.quests = [{
        ...makeAcceptedQuest('wolf_cull'),
        status: 'active',
        partyNpcIds: ['hero_a'],
        weeksRemaining: 1,
    }];
    const cfg = normalizeGuildConfig({ partiesEnabled: true, requestsEnabled: false });
    const result = applyWeeklyCommit(guild, { kind: 'weekly_commit', actions: ['train'] }, cfg, 99);
    if (result.guild.quests && result.guild.quests.length > 0) {
        fail('due quest should be removed after weekly commit');
    } else if (!result.guild.lastQuestReports || result.guild.lastQuestReports.length === 0) {
        fail('weekly commit should set lastQuestReports');
    } else {
        ok('weekly commit resolves due quests');
    }

    const noParties = applyWeeklyCommit(guild, { kind: 'weekly_commit', actions: ['train'] }, normalizeGuildConfig({ partiesEnabled: false }), 99);
    if (!noParties.guild.quests || noParties.guild.quests[0].weeksRemaining !== 1) {
        fail('parties disabled should not tick quests');
    } else {
        ok('parties disabled skips quest tick');
    }
}

// --- advanceActiveQuests integration ---
{
    const guild = {
        ...defaultGuildState('tavern_hall'),
        quests: [{
            ...makeAcceptedQuest('wolf_cull'),
            status: 'active',
            partyNpcIds: ['hero_a'],
            weeksRemaining: 0,
        }],
    };
    const batch = advanceActiveQuests(guild, { hero_a: 60 }, { hero_a: 70 }, 7);
    if (!batch.reports.length || !batch.outcomeDeltas.length) {
        fail('advanceActiveQuests should produce reports and deltas');
    } else if (batch.quests) {
        fail('completed quest should be removed');
    } else {
        ok('advanceActiveQuests resolves due quest');
    }
}

// --- applyGuildOps assign_party ---
{
    let guild = defaultGuildState('tavern_hall');
    guild = recruitAdventurer(guild, { npcId: 'hero_a', klass: 'warrior' });
    guild.quests = [makeAcceptedQuest('wolf_cull')];
    const cfg = normalizeGuildConfig({ partiesEnabled: true, maxActiveQuests: 2 });
    const { guild: after } = applyGuildOps(
        guild,
        parseGuildOps({ kind: 'assign_party', quest: { questId: 'wolf_cull', npcIds: ['hero_a'], weeks: 1 } }),
        cfg,
        0
    );
    if (after.quests?.[0]?.status !== 'active') {
        fail('applyGuildOps assign_party');
    } else {
        ok('applyGuildOps assign_party');
    }

    const blocked = applyGuildOps(
        guild,
        parseGuildOps({ kind: 'assign_party', quest: { questId: 'wolf_cull', npcIds: ['hero_a'] } }),
        normalizeGuildConfig({ partiesEnabled: false }),
        0
    );
    if (blocked.guild.quests?.[0]?.status === 'active') {
        fail('partiesEnabled false should block assign');
    } else {
        ok('partiesEnabled gate on assign_party');
    }
}

// --- prompt line ---
{
    const line = buildActiveQuestPromptLine([
        { id: 'wolf_cull', requestId: 'wolf_cull', questKind: 'hunt', status: 'active', partyNpcIds: ['a'], weeksRemaining: 2, difficulty: 30, rewardCoffers: 40 },
    ]);
    if (!line || !line.includes('[Guild — Quests]') || !line.includes('wolf_cull')) {
        fail('buildActiveQuestPromptLine');
    } else {
        ok('buildActiveQuestPromptLine');
    }
}

// --- accept then assign flow ---
{
    let guild = defaultGuildState('tavern_hall');
    const cfg = normalizeGuildConfig({ boardSize: 1, requestsEnabled: true, partiesEnabled: true, maxActiveQuests: 2 });
    guild = applyWeeklyCommit(guild, { kind: 'weekly_commit', actions: ['open_board'] }, cfg, 3).guild;
    guild = recruitAdventurer(guild, { npcId: 'hero_a', klass: 'warrior', skill: DEFAULT_ADVENTURER_SKILL });
    const target = guild.pendingRequests[0];
    guild = applyGuildRequest(guild, target, 'accept').guild;
    guild = assignParty(guild, target, ['hero_a'], cfg.maxActiveQuests, 1);
    if (guild.quests?.[0]?.status !== 'active') {
        fail('accept → assign flow');
    } else {
        ok('accept then assign flow');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('All guild quest core tests passed.');