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
    applyDomainEventEffect,
    applyMonthlyDomainIncome,
    resolveDomainPromptTier,
    buildDomainEventGmHint,
    buildSeasonalDomainGmHint,
    resolveSeasonalActionBonus,
    computeDomainEventWeight,
    applySeasonalMonthlyEffects,
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

    const badOfficer = parseDomainOps({
        kind: 'appoint_officer',
        officer: { npcId: 'evil\ninject', role: 'steward' },
    });
    if (badOfficer !== undefined) {
        fail('reject appoint_officer with unsafe npcId');
    } else {
        ok('reject appoint_officer with unsafe npcId');
    }
}

{
    const raw = defaultDomainState('riverhold');
    raw.pendingEvents = ['bandit_activity', 'not_a_real_event', 'evil\nline'];
    raw.lastEventId = 'fake_event';
    const v = validateDomain(raw);
    if (
        !v
        || v.pendingEvents.length !== 1
        || v.pendingEvents[0] !== 'bandit_activity'
        || v.lastEventId !== undefined
    ) {
        fail('validateDomain event allowlist');
    } else {
        ok('validateDomain event allowlist');
    }

    if (validateDomain({ ...raw, controlledRegionId: 'bad region' }) !== undefined) {
        fail('validateDomain rejects unsafe region id');
    } else {
        ok('validateDomain rejects unsafe region id');
    }
}

{
    const delta = resolveMonthlyActionDeltas(['agriculture', 'fortify']);
    if ((delta.treasury ?? 0) !== -100 || (delta.agriculture ?? 0) !== 2) {
        fail('resolveMonthlyActionDeltas', delta);
    } else {
        ok('resolveMonthlyActionDeltas');
    }

    const springAg = resolveMonthlyActionDeltas(['agriculture'], 4);
    if ((springAg.agriculture ?? 0) !== 3) {
        fail('spring agriculture seasonal bonus');
    } else {
        ok('spring agriculture seasonal bonus');
    }

    const winterFest = resolveMonthlyActionDeltas(['festival'], 1);
    if ((winterFest.popularSupport ?? 0) !== 4 || (winterFest.culture ?? 0) !== 2) {
        fail('winter festival seasonal bonus');
    } else {
        ok('winter festival seasonal bonus');
    }

    const springOnly = resolveSeasonalActionBonus(['agriculture'], 4);
    if ((springOnly.agriculture ?? 0) !== 1) {
        fail('resolveSeasonalActionBonus spring');
    } else {
        ok('resolveSeasonalActionBonus');
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

{
    const base = defaultDomainState('riverhold');
    const hit = applyDomainEventEffect(base, 'bandit_activity');
    if (hit.publicOrder >= base.publicOrder || hit.treasury >= base.treasury) {
        fail('applyDomainEventEffect bandit_activity');
    } else {
        ok('applyDomainEventEffect');
    }

    const richer = applyMonthlyDomainIncome(base);
    if (richer.treasury <= base.treasury || richer.food <= base.food) {
        fail('applyMonthlyDomainIncome');
    } else {
        ok('applyMonthlyDomainIncome');
    }

    const hint = buildDomainEventGmHint('merchant_visit');
    if (!hint.includes('merchant_visit')) {
        fail('buildDomainEventGmHint');
    } else {
        ok('buildDomainEventGmHint');
    }

    const minimal = resolveDomainPromptTier(defaultDomainState('riverhold'), false);
    const full = resolveDomainPromptTier(defaultDomainState('riverhold'), true);
    if (minimal !== 'minimal' || full !== 'full') {
        fail('resolveDomainPromptTier');
    } else {
        ok('resolveDomainPromptTier');
    }

    const withPending = { ...defaultDomainState('riverhold'), pendingEvents: ['bandit_activity'] };
    if (resolveDomainPromptTier(withPending, false) !== 'standard') {
        fail('standard tier with pending');
    } else {
        ok('standard tier with pending');
    }

    const withOfficers = {
        ...defaultDomainState('riverhold'),
        officers: [{ npcId: 'sayo', role: 'steward' }],
    };
    if (resolveDomainPromptTier(withOfficers, false) !== 'standard') {
        fail('standard tier with officers');
    } else {
        ok('standard tier with officers');
    }

    const withLastEvent = { ...defaultDomainState('riverhold'), lastEventId: 'merchant_visit' };
    if (resolveDomainPromptTier(withLastEvent, false) !== 'standard') {
        fail('standard tier with lastEventId');
    } else {
        ok('standard tier with lastEventId');
    }
}

{
    const winter = { ...defaultDomainState('riverhold'), calendarMonth: 1 };
    const summer = { ...defaultDomainState('riverhold'), calendarMonth: 7 };
    const festWinter = computeDomainEventWeight('festival_gathering', winter, 'none', []);
    const festSummer = computeDomainEventWeight('festival_gathering', summer, 'none', []);
    if (festWinter <= festSummer) {
        fail('festival_gathering winter weight boost');
    } else {
        ok('festival_gathering winter weight boost');
    }

    const autumn = { ...defaultDomainState('riverhold'), calendarMonth: 10, agriculture: 30 };
    const badAutumn = computeDomainEventWeight('bad_harvest', autumn);
    const badSpring = computeDomainEventWeight('bad_harvest', { ...autumn, calendarMonth: 4 });
    if (badAutumn >= badSpring) {
        fail('bad_harvest autumn weight reduction');
    } else {
        ok('bad_harvest autumn weight reduction');
    }

    const noOfficers = computeDomainEventWeight('officer_discontent', defaultDomainState('riverhold'));
    const withOfficer = computeDomainEventWeight('officer_discontent', {
        ...defaultDomainState('riverhold'),
        officers: [{ npcId: 'sayo', role: 'steward' }],
    });
    const flagged = computeDomainEventWeight('officer_discontent', {
        ...defaultDomainState('riverhold'),
        officers: [{ npcId: 'sayo', role: 'steward' }],
        flags: { officerDiscontent: true },
    });
    if (noOfficers !== 0 || withOfficer <= 0 || flagged <= withOfficer) {
        fail('officer_discontent weight gating');
    } else {
        ok('officer_discontent weight gating');
    }

    const winterDrain = applySeasonalMonthlyEffects({ ...defaultDomainState('riverhold'), calendarMonth: 12 });
    if (winterDrain.food >= defaultDomainState('riverhold').food) {
        fail('winter food drain');
    } else {
        ok('winter food drain');
    }

    const seasonalHint = buildSeasonalDomainGmHint({ ...defaultDomainState('riverhold'), calendarMonth: 1 });
    if (!seasonalHint.includes('[Domain — Season]') || !seasonalHint.includes('winter')) {
        fail('buildSeasonalDomainGmHint');
    } else {
        ok('buildSeasonalDomainGmHint');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('All domain core tests passed.');