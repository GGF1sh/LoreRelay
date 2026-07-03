#!/usr/bin/env node
'use strict';

const {
    defaultDomainState,
    validateDomain,
    parseDomainOps,
    resolveMonthlyActionDeltas,
    applyMonthlyCommit,
    applyDomainOps,
    rollDomainEvent,
    getDomainSeason,
    resolveRankFromPrestige,
    appointOfficer,
    normalizeDomainConfig,
    clampDomainStat,
} = require('../out/domainCore');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

{
    const d = defaultDomainState('riverhold');
    if (d.controlledRegionId !== 'riverhold' || d.monthlyActionsRemaining !== 2) {
        fail('defaultDomainState');
    } else {
        ok('defaultDomainState');
    }
}

{
    const raw = defaultDomainState('riverhold');
    raw.treasury = 99999;
    raw.publicOrder = 200;
    const v = validateDomain(raw);
    if (!v || v.treasury !== 9999 || v.publicOrder !== 100) {
        fail('validateDomain clamps');
    } else {
        ok('validateDomain clamps');
    }
}

{
    const ops = parseDomainOps({
        kind: 'monthly_commit',
        actions: ['agriculture', 'public_order'],
        intelligence: 'gather_rumors',
    });
    if (!ops || ops.actions?.length !== 2) {
        fail('parseDomainOps monthly_commit');
    } else {
        ok('parseDomainOps monthly_commit');
    }

    if (parseDomainOps({ kind: 'monthly_commit', actions: [] }) !== undefined) {
        fail('reject empty monthly_commit');
    } else {
        ok('reject empty monthly_commit');
    }
}

{
    const delta = resolveMonthlyActionDeltas(['agriculture', 'fortify']);
    if ((delta.treasury ?? 0) !== -100 || (delta.agriculture ?? 0) !== 2) {
        fail('resolveMonthlyActionDeltas', delta);
    } else {
        ok('resolveMonthlyActionDeltas');
    }
}

{
    const base = defaultDomainState('riverhold');
    base.calendarMonth = 12;
    const cfg = normalizeDomainConfig({ monthlyActions: 2 });
    const ops = { kind: 'monthly_commit', actions: ['festival'], intelligence: 'none' };
    const result = applyMonthlyCommit(base, ops, cfg, 42);
    if (result.domain.calendarMonth !== 1 || result.domain.calendarYear !== 2) {
        fail('calendar advance over year boundary');
    } else if (!result.rolledEventId) {
        fail('rolled event missing');
    } else {
        ok('applyMonthlyCommit calendar + event');
    }

    const e1 = rollDomainEvent(base, 1, 'gather_rumors', ['espionage']);
    const e2 = rollDomainEvent(base, 1, 'gather_rumors', ['espionage']);
    if (e1 !== e2) {
        fail('rollDomainEvent deterministic');
    } else {
        ok('rollDomainEvent deterministic');
    }
}

{
    if (getDomainSeason(4) !== 'spring' || getDomainSeason(1) !== 'winter') {
        fail('getDomainSeason');
    } else {
        ok('getDomainSeason');
    }

    if (resolveRankFromPrestige(65) !== 'count' || resolveRankFromPrestige(5) !== 'minor_lord') {
        fail('resolveRankFromPrestige');
    } else {
        ok('resolveRankFromPrestige');
    }
}

{
    let d = defaultDomainState('riverhold');
    d = appointOfficer(d, { npcId: 'sayo', role: 'steward', skill: 50 });
    if (d.officers.length !== 1 || d.officers[0].npcId !== 'sayo') {
        fail('appointOfficer');
    } else {
        ok('appointOfficer');
    }

    const applied = applyDomainOps(d, {
        kind: 'monthly_commit',
        actions: ['inspect', 'diplomacy'],
    }, normalizeDomainConfig());
    if (!applied.monthly || applied.domain.prestige < d.prestige) {
        fail('applyDomainOps monthly_commit');
    } else {
        ok('applyDomainOps monthly_commit');
    }
}

{
    if (clampDomainStat(150) !== 100) {
        fail('clampDomainStat');
    } else {
        ok('clampDomainStat');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('All domain core tests passed.');