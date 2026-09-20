#!/usr/bin/env node
'use strict';

const { defaultDomainState, appointOfficer, applyMonthlyCommit, normalizeDomainConfig } = require('../out/domainCore');
const {
    buildDomainCouncilLines,
    buildDomainCouncilLine,
    isDomainMonthlyCommitTurn,
    shouldInjectDomainCouncil,
} = require('../out/domainCouncilCore');
const { officerBondToCouncilHint } = require('../out/domainOfficerBondCore');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

{
    let domain = defaultDomainState('riverhold');
    domain.treasury = 100;
    domain.lastMonthlyActions = ['fortify'];
    const lines = buildDomainCouncilLines({
        domain,
        officers: [{ npcId: 'sayo', role: 'steward', name: 'Sayo', personalityTrait: 'cautious' }],
    });
    if (!lines[0]?.includes('Sayo (steward)') || !lines[0]?.includes('fortify last month')) {
        fail('steward council with last action');
    } else if (!lines[0]?.includes('Cautious in temperament')) {
        fail('personality trait in council');
    } else {
        ok('steward council line');
    }
}

{
    const domain = { ...defaultDomainState('riverhold'), defense: 30, troops: 50 };
    const line = buildDomainCouncilLine(
        { npcId: 'marcus', role: 'marshal', name: 'Marcus' },
        { domain, officers: [] }
    );
    if (!line.includes('training troops') || !line.includes('border rumors')) {
        fail('marshal low defense council');
    } else {
        ok('marshal council line');
    }
}

{
    if (!isDomainMonthlyCommitTurn('今月の方針を決める') || !isDomainMonthlyCommitTurn('monthly decree')) {
        fail('isDomainMonthlyCommitTurn');
    } else if (isDomainMonthlyCommitTurn('hello')) {
        fail('reject non-commit action');
    } else {
        ok('isDomainMonthlyCommitTurn');
    }

    const withOfficers = appointOfficer(defaultDomainState('riverhold'), { npcId: 'sayo', role: 'steward' });
    if (!shouldInjectDomainCouncil(withOfficers, true) || shouldInjectDomainCouncil(withOfficers, false)) {
        fail('shouldInjectDomainCouncil');
    } else {
        ok('shouldInjectDomainCouncil');
    }
}

{
    const domain = appointOfficer(defaultDomainState('riverhold'), { npcId: 'sayo', role: 'steward' });
    const result = applyMonthlyCommit(
        domain,
        { kind: 'monthly_commit', actions: ['fortify', 'agriculture'] },
        normalizeDomainConfig(),
        99
    );
    if (!result.councilLines.length || !result.domain.lastMonthlyActions?.includes('fortify')) {
        fail('applyMonthlyCommit council + lastMonthlyActions');
    } else {
        ok('applyMonthlyCommit council');
    }

    const second = applyMonthlyCommit(
        result.domain,
        { kind: 'monthly_commit', actions: ['inspect'] },
        normalizeDomainConfig(),
        100
    );
    const stewardLine = second.councilLines.find((l) => l.includes('sayo') || l.includes('Sayo'));
    if (!stewardLine?.includes('last month')) {
        fail('second commit references prior month actions');
    } else {
        ok('prior month action in council');
    }
}

{
    const hint = officerBondToCouncilHint({
        discontent: true,
        discontentOfficerIds: ['sayo'],
        reasons: [{ npcId: 'sayo', reason: 'low_trust' }],
    });
    const lines = buildDomainCouncilLines({
        domain: defaultDomainState('riverhold'),
        officers: [{ npcId: 'sayo', role: 'steward', name: 'Sayo' }],
        bondHint: hint,
    });
    if (!lines[0]?.includes('unease')) {
        fail('bond hint in council');
    } else {
        ok('bond hint in council');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('All domain council core tests passed.');