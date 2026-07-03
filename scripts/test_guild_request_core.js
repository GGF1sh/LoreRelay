#!/usr/bin/env node
'use strict';

const {
    buildRequestQueue,
    resolveRequestRuling,
    computeRequestWeight,
    getRequest,
    isValidGuildRequestId,
    isValidRequestRulingId,
    formatRequestChronicleText,
    resolveQuestDifficulty,
    resolveQuestReward,
    NEGOTIATE_REWARD_DISCOUNT,
    MAX_GUILD_REQUEST_QUEUE,
    DEFAULT_BOARD_SIZE,
} = require('../out/guildRequestCore');
const {
    resolveGuildBoardTier,
    buildRequestBoardPromptLines,
    resolveFocusRequestId,
} = require('../out/guildPromptCore');
const {
    defaultGuildState,
    parseGuildOps,
    applyGuildOps,
    applyWeeklyCommit,
    applyGuildRequest,
    normalizeGuildConfig,
    validateGuild,
} = require('../out/guildCore');
let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

// --- queue is deterministic for identical seed/state ---
{
    const guild = defaultGuildState('tavern_hall');
    const a = buildRequestQueue(guild, 42, 3);
    const b = buildRequestQueue(guild, 42, 3);
    if (a.length !== 3 || b.length !== 3) {
        fail(`queue size expected 3, got ${a.length}/${b.length}`);
    } else if (a.map((r) => r.id).join(',') !== b.map((r) => r.id).join(',')) {
        fail('queue not deterministic for same seed');
    } else {
        ok('request queue deterministic');
    }

    const distinct = new Set(a.map((r) => r.id));
    if (distinct.size !== a.length) {
        fail('queue contains duplicate requests');
    } else {
        ok('request queue has no duplicates');
    }
}

// --- size clamps to [1, MAX] ---
{
    const guild = defaultGuildState('tavern_hall');
    if (buildRequestQueue(guild, 1, 0).length !== 1) {
        fail('size 0 should clamp to 1');
    } else if (buildRequestQueue(guild, 1, 99).length > MAX_GUILD_REQUEST_QUEUE) {
        fail('size should clamp to MAX_GUILD_REQUEST_QUEUE');
    } else {
        ok('request size clamp');
    }
}

// --- weight responds to guild condition ---
{
    const calm = { ...defaultGuildState('tavern_hall'), townFavor: 90 };
    const lowFavor = { ...defaultGuildState('tavern_hall'), townFavor: 20 };
    if (computeRequestWeight('wolf_cull', lowFavor) <= computeRequestWeight('wolf_cull', calm)) {
        fail('low townFavor should raise wolf_cull weight');
    } else {
        ok('request weight responds to stats');
    }
    if (computeRequestWeight('not_a_request', calm) !== 0) {
        fail('unknown request weight should be 0');
    } else {
        ok('unknown request weight 0');
    }
}

// --- ruling deltas resolve; unknown is a no-op ---
{
    const accept = resolveRequestRuling('wolf_cull', 'accept');
    if (accept.renown !== 1 || accept.townFavor !== 1) {
        fail(`wolf_cull accept delta wrong: ${JSON.stringify(accept)}`);
    } else {
        ok('request ruling delta');
    }
    if (Object.keys(resolveRequestRuling('wolf_cull', 'bogus')).length !== 0) {
        fail('bogus ruling should be no-op');
    } else if (Object.keys(resolveRequestRuling('bogus', 'accept')).length !== 0) {
        fail('bogus request should be no-op');
    } else {
        ok('invalid ruling/request no-op');
    }
}

// --- validators ---
{
    if (!isValidGuildRequestId('wolf_cull') || isValidGuildRequestId('nope')) {
        fail('isValidGuildRequestId');
    } else if (!isValidRequestRulingId('negotiate') || isValidRequestRulingId('maybe')) {
        fail('isValidRequestRulingId');
    } else if (!getRequest('escort_caravan') || getRequest('nope')) {
        fail('getRequest');
    } else {
        ok('request validators');
    }
}

// --- weekly commit with open_board populates pendingRequests when requestsEnabled ---
{
    const guild = defaultGuildState('tavern_hall');
    const cfg = normalizeGuildConfig({ boardSize: 3, requestsEnabled: true });
    const result = applyWeeklyCommit(
        guild,
        { kind: 'weekly_commit', actions: ['open_board', 'advertise'] },
        cfg,
        7
    );
    if (!result.guild.pendingRequests || result.guild.pendingRequests.length !== 3) {
        fail(`open_board should open 3 requests, got ${JSON.stringify(result.guild.pendingRequests)}`);
    } else if (!result.guild.pendingRequests.every(isValidGuildRequestId)) {
        fail('pendingRequests must all be valid ids');
    } else {
        ok('open_board action opens requests');
    }

    const noBoard = applyWeeklyCommit(
        guild,
        { kind: 'weekly_commit', actions: ['advertise'] },
        cfg,
        7
    );
    if (noBoard.guild.pendingRequests) {
        fail('no open_board action should not open requests');
    } else {
        ok('no requests without open_board action');
    }

    const disabled = applyWeeklyCommit(
        guild,
        { kind: 'weekly_commit', actions: ['open_board'] },
        normalizeGuildConfig({ requestsEnabled: false }),
        7
    );
    if (disabled.guild.pendingRequests) {
        fail('requestsEnabled false should not open board');
    } else {
        ok('requests disabled skips board generation');
    }
}

// --- resolve_request op parses and applies ---
{
    let guild = defaultGuildState('tavern_hall');
    const cfg = normalizeGuildConfig({ boardSize: 2, requestsEnabled: true });
    guild = applyWeeklyCommit(guild, { kind: 'weekly_commit', actions: ['open_board'] }, cfg, 5).guild;
    const target = guild.pendingRequests[0];

    const ops = parseGuildOps({ kind: 'resolve_request', requestId: target, rulingId: 'negotiate' });
    if (!ops || ops.kind !== 'resolve_request' || ops.requestId !== target) {
        fail('parseGuildOps resolve_request');
    } else {
        ok('parse resolve_request ops');
    }

    const before = guild.pendingRequests.length;
    const { guild: after, request } = applyGuildOps(guild, ops, cfg, 5);
    if (!request || request.requestId !== target) {
        fail('applyGuildOps should return request result');
    } else if (after.pendingRequests && after.pendingRequests.includes(target)) {
        fail('ruled request should be removed from queue');
    } else if ((after.pendingRequests?.length ?? 0) !== before - 1) {
        fail('exactly one request should be consumed');
    } else if (!after.quests || after.quests.length !== 1 || after.quests[0].status !== 'accepted') {
        fail('negotiate should promote to accepted quest');
    } else {
        const def = getRequest(target);
        const expectedReward = resolveQuestReward(def.baseReward, true);
        if (after.quests[0].rewardCoffers !== expectedReward) {
            fail(`negotiate reward wrong: ${after.quests[0].rewardCoffers} vs ${expectedReward}`);
        } else {
            ok('resolve_request negotiate consumes request and creates quest');
        }
    }

    const noop = applyGuildOps(
        after,
        parseGuildOps({ kind: 'resolve_request', requestId: target, rulingId: 'accept' }) || {
            kind: 'resolve_request', requestId: target, rulingId: 'accept',
        },
        cfg,
        5
    );
    if (noop.request) {
        fail('ruling an already-resolved request should be a no-op');
    } else {
        ok('ruling absent request is no-op');
    }
}

// --- accept promotes quest with difficulty from renown ---
{
    let guild = defaultGuildState('tavern_hall');
    guild.renown = 45;
    const cfg = normalizeGuildConfig({ requestsEnabled: true });
    guild = applyWeeklyCommit(guild, { kind: 'weekly_commit', actions: ['open_board'] }, cfg, 3).guild;
    const target = guild.pendingRequests[0];
    const { guild: after } = applyGuildRequest(guild, target, 'accept');
    const def = getRequest(target);
    const expectedDiff = resolveQuestDifficulty(def.baseDifficulty, 45);
    if (!after.quests || after.quests[0].difficulty !== expectedDiff) {
        fail(`accept difficulty wrong: ${after.quests?.[0]?.difficulty} vs ${expectedDiff}`);
    } else if (after.quests[0].rewardCoffers !== def.baseReward) {
        fail('accept should use full baseReward');
    } else {
        ok('accept quest promotion');
    }
}

// --- decline removes without quest ---
{
    let guild = defaultGuildState('tavern_hall');
    const cfg = normalizeGuildConfig({ requestsEnabled: true });
    guild = applyWeeklyCommit(guild, { kind: 'weekly_commit', actions: ['open_board'] }, cfg, 11).guild;
    const target = guild.pendingRequests[0];
    const { guild: after } = applyGuildRequest(guild, target, 'decline');
    if (after.quests?.length) {
        fail('decline should not create quest');
    } else if (after.pendingRequests?.includes(target)) {
        fail('decline should remove from queue');
    } else {
        ok('decline removes request only');
    }
}

// --- invalid resolve_request ops rejected by parser ---
{
    if (parseGuildOps({ kind: 'resolve_request', requestId: 'nope', rulingId: 'accept' })) {
        fail('invalid requestId should be rejected');
    } else if (parseGuildOps({ kind: 'resolve_request', requestId: 'wolf_cull', rulingId: 'bad' })) {
        fail('invalid rulingId should be rejected');
    } else if (parseGuildOps({ kind: 'resolve_request', requestId: 'wolf_cull' })) {
        fail('missing rulingId should be rejected');
    } else if (parseGuildOps({
        kind: 'resolve_request',
        requestId: 'evil\ninject',
        rulingId: 'accept',
    })) {
        fail('unsafe requestId should be rejected');
    } else {
        ok('invalid resolve_request rejected');
    }
}

// --- board tier bulk vs full ---
{
    const guild = {
        ...defaultGuildState('tavern_hall'),
        pendingRequests: ['wolf_cull', 'escort_caravan'],
    };
    if (resolveGuildBoardTier(guild) !== 'bulk') {
        fail('default tier should be bulk');
    } else if (resolveGuildBoardTier(guild, 'wolf_cull') !== 'full') {
        fail('valid focusRequestId should be full');
    } else if (resolveGuildBoardTier(guild, 'nope') !== 'bulk') {
        fail('invalid focusRequestId should be bulk');
    } else {
        ok('resolveGuildBoardTier bulk/full');
    }

    const bulkLines = buildRequestBoardPromptLines(guild);
    if (!bulkLines.join('\n').includes('[Guild — Board]') || !bulkLines.join('\n').includes('wolf_cull')) {
        fail('bulk prompt lines missing content');
    } else {
        ok('bulk board prompt lines');
    }

    const fullLines = buildRequestBoardPromptLines(guild, 'wolf_cull');
    if (!fullLines.join('\n').includes('[Guild — Parley]') || fullLines.join('\n').includes('escort_caravan')) {
        fail('full parley prompt should focus one request');
    } else {
        ok('full parley prompt lines');
    }
}

// --- focusRequestId from player action ---
{
    const guild = {
        ...defaultGuildState('tavern_hall'),
        pendingRequests: ['wolf_cull', 'monster_nest'],
    };
    const focus = resolveFocusRequestId(guild, 'Private audience with wolf_cull client');
    if (focus !== 'wolf_cull') {
        fail(`resolveFocusRequestId expected wolf_cull, got ${focus}`);
    } else if (resolveFocusRequestId(guild, 'just chatting')) {
        fail('unrelated action should not resolve focus');
    } else {
        ok('resolveFocusRequestId');
    }
}

// --- chronicle + negotiate discount constant ---
{
    const text = formatRequestChronicleText('wolf_cull', 'accept', 5, 2);
    if (!text.includes('wolf_cull') || !text.includes('accept') || !text.includes('Year 2')) {
        fail(`request chronicle text wrong: ${text}`);
    } else if (Math.abs(NEGOTIATE_REWARD_DISCOUNT - 0.8) > 0.001) {
        fail('NEGOTIATE_REWARD_DISCOUNT should be 0.8');
    } else {
        ok('chronicle text and negotiate discount');
    }
}

// --- validateGuild round-trips pendingRequests, drops invalid ---
{
    const guild = defaultGuildState('tavern_hall');
    guild.pendingRequests = ['wolf_cull', 'nope', 'escort_caravan'];
    const validated = validateGuild(JSON.parse(JSON.stringify(guild)));
    if (!validated || !validated.pendingRequests) {
        fail('validateGuild should keep pendingRequests');
    } else if (validated.pendingRequests.length !== 2 || validated.pendingRequests.includes('nope')) {
        fail(`validateGuild should drop invalid requests: ${JSON.stringify(validated.pendingRequests)}`);
    } else {
        ok('validateGuild filters pendingRequests');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log(`All guild request core tests passed (default board size ${DEFAULT_BOARD_SIZE}).`);