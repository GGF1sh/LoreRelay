#!/usr/bin/env node
'use strict';

const { defaultDomainState, appointOfficer, computeDomainEventWeight } = require('../out/domainCore');
const {
    assessOfficerBonds,
    syncOfficerDiscontentFlag,
    isOfficerInRegistry,

    buildOfficerBondGmHint,
    registryToOfficerBondContext,
    PLAYER_TRUST_RIVAL_MAX,
} = require('../out/domainOfficerBondCore');
const { applyDomainOpsToGameState } = require('../out/domainTurnOpsCore');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

const bondContext = registryToOfficerBondContext({
    sayo: { name: 'Sayo', disposition: { playerTrust: 20 }, personalityTraits: ['cautious'] },
    marcus: { name: 'Marcus', disposition: { playerTrust: 80 } },
}, {});

{
    const officers = [
        { npcId: 'sayo', role: 'steward' },
        { npcId: 'marcus', role: 'marshal' },
    ];
    const assessment = assessOfficerBonds(officers, bondContext);
    if (!assessment.discontent || !assessment.discontentOfficerIds.includes('sayo')) {
        fail('low trust officer flagged');
    } else if (assessment.discontentOfficerIds.includes('marcus')) {
        fail('high trust officer not flagged');
    } else {
        ok('assessOfficerBonds low trust');
    }

    const nemesisCtx = registryToOfficerBondContext({ sayo: { name: 'Sayo', disposition: { playerTrust: 50 } } }, {
        sayo: ['nemesis'],
    });
    const nemesisAssessment = assessOfficerBonds([{ npcId: 'sayo', role: 'steward' }], nemesisCtx);
    if (!nemesisAssessment.discontent || nemesisAssessment.reasons[0]?.reason !== 'nemesis') {
        fail('nemesis milestone discontent');
    } else {
        ok('nemesis milestone discontent');
    }
}

{
    let domain = appointOfficer(defaultDomainState('riverhold'), { npcId: 'sayo', role: 'steward' });
    const assessment = assessOfficerBonds(domain.officers, bondContext);
    domain = syncOfficerDiscontentFlag(domain, assessment);
    if (domain.flags.officerDiscontent !== true) {
        fail('syncOfficerDiscontentFlag sets flag');
    } else {
        ok('syncOfficerDiscontentFlag');
    }

    const weight = computeDomainEventWeight('officer_discontent', domain);
    const base = computeDomainEventWeight('officer_discontent', {
        ...domain,
        flags: {},
    });
    if (weight <= base) {
        fail('officer_discontent weight boost with flag');
    } else {
        ok('officer_discontent weight boost');
    }
}

{
    const registryIds = new Set(['sayo']);
    if (!isOfficerInRegistry('sayo', registryIds) || isOfficerInRegistry('ghost', registryIds)) {
        fail('isOfficerInRegistry');
    } else {
        ok('isOfficerInRegistry');
    }

    const gs = { domain: defaultDomainState('riverhold') };
    const rejected = applyDomainOpsToGameState(
        { domainOps: { kind: 'appoint_officer', officer: { npcId: 'ghost', role: 'spy' } } },
        gs,
        true,
        {},
        0,
        { registryNpcIds: registryIds, officerBond: bondContext }
    );
    if (rejected.domain?.officers?.length) {
        fail('reject appoint unknown npc');
    } else {
        ok('reject appoint unknown npc');
    }

    const accepted = applyDomainOpsToGameState(
        { domainOps: { kind: 'appoint_officer', officer: { npcId: 'sayo', role: 'steward' } } },
        gs,
        true,
        {},
        0,
        { registryNpcIds: registryIds, officerBond: bondContext }
    );
    if (accepted.domain?.officers?.length !== 1) {
        fail('accept appoint registry npc');
    } else {
        ok('accept appoint registry npc');
    }
}

{
    const hint = buildOfficerBondGmHint(assessOfficerBonds([{ npcId: 'sayo', role: 'steward' }], bondContext));
    if (!hint?.includes('[Domain — Officer Bonds]') || !hint?.includes(String(PLAYER_TRUST_RIVAL_MAX))) {
        fail('buildOfficerBondGmHint');
    } else {
        ok('buildOfficerBondGmHint');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('All domain officer bond core tests passed.');