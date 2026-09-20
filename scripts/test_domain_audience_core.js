#!/usr/bin/env node
'use strict';

const {
    buildAudienceQueue,
    resolvePetitionRuling,
    computePetitionWeight,
    getPetition,
    isValidPetitionId,
    isValidPetitionRulingId,
    buildAudiencePromptLines,
    formatAudienceChronicleText,
    MAX_AUDIENCE_QUEUE,
    DEFAULT_AUDIENCE_SIZE,
} = require('../out/domainAudienceCore');
const {
    defaultDomainState,
    parseDomainOps,
    applyDomainOps,
    applyMonthlyCommit,
    normalizeDomainConfig,
    validateDomain,
} = require('../out/domainCore');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

// --- queue is deterministic for identical seed/state ---
{
    const domain = defaultDomainState('riverhold');
    const a = buildAudienceQueue(domain, 42, 3);
    const b = buildAudienceQueue(domain, 42, 3);
    if (a.length !== 3 || b.length !== 3) {
        fail(`queue size expected 3, got ${a.length}/${b.length}`);
    } else if (a.map((p) => p.id).join(',') !== b.map((p) => p.id).join(',')) {
        fail('queue not deterministic for same seed');
    } else {
        ok('audience queue deterministic');
    }

    const distinct = new Set(a.map((p) => p.id));
    if (distinct.size !== a.length) {
        fail('queue contains duplicate petitions');
    } else {
        ok('audience queue has no duplicates');
    }
}

// --- size clamps to [1, MAX] ---
{
    const domain = defaultDomainState('riverhold');
    if (buildAudienceQueue(domain, 1, 0).length !== 1) {
        fail('size 0 should clamp to 1');
    } else if (buildAudienceQueue(domain, 1, 99).length > MAX_AUDIENCE_QUEUE) {
        fail('size should clamp to MAX_AUDIENCE_QUEUE');
    } else {
        ok('audience size clamp');
    }
}

// --- weight responds to domain condition (low order raises bandit_bounty) ---
{
    const calm = { ...defaultDomainState('riverhold'), publicOrder: 90 };
    const unrest = { ...defaultDomainState('riverhold'), publicOrder: 20 };
    if (computePetitionWeight('bandit_bounty', unrest) <= computePetitionWeight('bandit_bounty', calm)) {
        fail('low public order should raise bandit_bounty weight');
    } else {
        ok('petition weight responds to stats');
    }
    if (computePetitionWeight('not_a_petition', calm) !== 0) {
        fail('unknown petition weight should be 0');
    } else {
        ok('unknown petition weight 0');
    }
}

// --- ruling deltas resolve; unknown is a no-op ---
{
    const grant = resolvePetitionRuling('bandit_bounty', 'grant');
    if (grant.publicOrder !== 4 || grant.treasury !== -25) {
        fail(`bandit_bounty grant delta wrong: ${JSON.stringify(grant)}`);
    } else {
        ok('petition ruling delta');
    }
    if (Object.keys(resolvePetitionRuling('bandit_bounty', 'bogus')).length !== 0) {
        fail('bogus ruling should be no-op');
    } else if (Object.keys(resolvePetitionRuling('bogus', 'grant')).length !== 0) {
        fail('bogus petition should be no-op');
    } else {
        ok('invalid ruling/petition no-op');
    }
}

// --- validators ---
{
    if (!isValidPetitionId('water_dispute') || isValidPetitionId('nope')) {
        fail('isValidPetitionId');
    } else if (!isValidPetitionRulingId('compromise') || isValidPetitionRulingId('maybe')) {
        fail('isValidPetitionRulingId');
    } else if (!getPetition('tax_relief') || getPetition('nope')) {
        fail('getPetition');
    } else {
        ok('petition validators');
    }
}

// --- monthly commit with `audience` populates pendingPetitions ---
{
    const domain = defaultDomainState('riverhold');
    const cfg = normalizeDomainConfig({ audienceSize: 3 });
    const result = applyMonthlyCommit(
        domain,
        { kind: 'monthly_commit', actions: ['audience', 'inspect'] },
        cfg,
        7
    );
    if (!result.domain.pendingPetitions || result.domain.pendingPetitions.length !== 3) {
        fail(`audience action should open 3 petitions, got ${JSON.stringify(result.domain.pendingPetitions)}`);
    } else if (!result.domain.pendingPetitions.every(isValidPetitionId)) {
        fail('pendingPetitions must all be valid ids');
    } else {
        ok('audience action opens petitions');
    }

    const noAudience = applyMonthlyCommit(domain, { kind: 'monthly_commit', actions: ['inspect'] }, cfg, 7);
    if (noAudience.domain.pendingPetitions) {
        fail('no audience action should not open petitions');
    } else {
        ok('no petitions without audience action');
    }
}

// --- audience_ruling op parses and applies, consuming the petition ---
{
    let domain = defaultDomainState('riverhold');
    const cfg = normalizeDomainConfig({ audienceSize: 2 });
    domain = applyMonthlyCommit(domain, { kind: 'monthly_commit', actions: ['audience'] }, cfg, 5).domain;
    const target = domain.pendingPetitions[0];

    const ops = parseDomainOps({ kind: 'audience_ruling', petitionId: target, rulingId: 'compromise' });
    if (!ops || ops.kind !== 'audience_ruling' || ops.petitionId !== target) {
        fail('parseDomainOps audience_ruling');
    } else {
        ok('parse audience_ruling ops');
    }

    const before = domain.pendingPetitions.length;
    const { domain: after, audience } = applyDomainOps(domain, ops, cfg, 5);
    if (!audience || audience.petitionId !== target) {
        fail('applyDomainOps should return audience result');
    } else if (after.pendingPetitions && after.pendingPetitions.includes(target)) {
        fail('ruled petition should be removed from queue');
    } else if ((after.pendingPetitions?.length ?? 0) !== before - 1) {
        fail('exactly one petition should be consumed');
    } else {
        ok('audience_ruling consumes petition and applies delta');
    }

    // ruling a petition not in the queue is a no-op
    const noop = applyDomainOps(after, parseDomainOps({ kind: 'audience_ruling', petitionId: target, rulingId: 'grant' }) || { kind: 'audience_ruling', petitionId: target, rulingId: 'grant' }, cfg, 5);
    if (noop.audience) {
        fail('ruling an already-resolved petition should be a no-op');
    } else {
        ok('ruling absent petition is no-op');
    }
}

// --- invalid audience_ruling ops rejected by parser ---
{
    if (parseDomainOps({ kind: 'audience_ruling', petitionId: 'nope', rulingId: 'grant' })) {
        fail('invalid petitionId should be rejected');
    } else if (parseDomainOps({ kind: 'audience_ruling', petitionId: 'water_dispute', rulingId: 'bad' })) {
        fail('invalid rulingId should be rejected');
    } else if (parseDomainOps({ kind: 'audience_ruling', petitionId: 'water_dispute' })) {
        fail('missing rulingId should be rejected');
    } else {
        ok('invalid audience_ruling rejected');
    }
}

// --- prompt lines + chronicle text ---
{
    const lines = buildAudiencePromptLines(['water_dispute', 'tax_relief']);
    const joined = lines.join('\n');
    if (!joined.includes('[Domain — Audience]') || !joined.includes('water_dispute') || !joined.includes('grant:')) {
        fail('audience prompt lines missing content');
    } else if (buildAudiencePromptLines([]).length !== 0) {
        fail('empty petition list should yield no prompt lines');
    } else if (buildAudiencePromptLines(['nope']).length !== 0) {
        fail('unknown-only petition list should yield no prompt lines');
    } else {
        ok('audience prompt lines');
    }

    const text = formatAudienceChronicleText('water_dispute', 'compromise', 3, 2);
    if (!text.includes('water_dispute') || !text.includes('compromise') || !text.includes('Year 2')) {
        fail(`audience chronicle text wrong: ${text}`);
    } else {
        ok('audience chronicle text');
    }
}

// --- validateDomain round-trips pendingPetitions, drops invalid ---
{
    const domain = defaultDomainState('riverhold');
    domain.pendingPetitions = ['water_dispute', 'nope', 'tax_relief'];
    const validated = validateDomain(JSON.parse(JSON.stringify(domain)));
    if (!validated || !validated.pendingPetitions) {
        fail('validateDomain should keep pendingPetitions');
    } else if (validated.pendingPetitions.length !== 2 || validated.pendingPetitions.includes('nope')) {
        fail(`validateDomain should drop invalid petitions: ${JSON.stringify(validated.pendingPetitions)}`);
    } else {
        ok('validateDomain filters pendingPetitions');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log(`All domain audience core tests passed (default size ${DEFAULT_AUDIENCE_SIZE}).`);
