#!/usr/bin/env node
'use strict';

const {
    createOfficerMission,
    parseOfficerMission,
    isMissionDue,
    tickMissionMonth,
    resolveMissionOutcome,
    computeMissionGradeWeights,
    isValidMissionKind,
    isValidMissionGrade,
    clampMissionMonths,
    buildActiveMissionPromptLine,
    MAX_ACTIVE_MISSIONS,
    DEFAULT_MAX_ACTIVE_MISSIONS,
} = require('../out/domainMissionCore');
const { PLAYER_TRUST_RIVAL_MAX } = require('../out/domainOfficerBondCore');
const {
    defaultDomainState,
    appointOfficer,
    applyDomainOps,
    applyMonthlyCommit,
    normalizeDomainConfig,
    validateDomain,
    parseDomainOps,
} = require('../out/domainCore');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

// --- validators + clamp ---
{
    if (!isValidMissionKind('espionage') || isValidMissionKind('nope')) {
        fail('isValidMissionKind');
    } else if (!isValidMissionGrade('triumph') || isValidMissionGrade('nope')) {
        fail('isValidMissionGrade');
    } else if (clampMissionMonths(0) !== 1 || clampMissionMonths(99) !== 3 || clampMissionMonths('x') !== 1) {
        fail('clampMissionMonths');
    } else {
        ok('mission validators + clamp');
    }
}

// --- construction ---
{
    const m = createOfficerMission('sayo', 'espionage', 2, 'borderland');
    if (!m || m.officerNpcId !== 'sayo' || m.kind !== 'espionage' || m.monthsRemaining !== 2 || m.targetId !== 'borderland') {
        fail(`createOfficerMission wrong: ${JSON.stringify(m)}`);
    } else {
        ok('createOfficerMission');
    }
    if (createOfficerMission('sayo', 'not_a_kind') !== undefined) {
        fail('createOfficerMission should reject invalid kind');
    } else if (createOfficerMission('', 'espionage') !== undefined) {
        fail('createOfficerMission should reject empty officerNpcId');
    } else {
        ok('createOfficerMission rejects invalid input');
    }
    const untargeted = createOfficerMission('sayo', 'trade_run');
    if (!untargeted || untargeted.targetId !== undefined || untargeted.monthsRemaining !== 1) {
        fail('createOfficerMission default months/targetId wrong');
    } else {
        ok('createOfficerMission defaults');
    }
}

// --- tick + due ---
{
    let m = createOfficerMission('sayo', 'survey', 2);
    if (isMissionDue(m)) { fail('fresh 2-month mission should not be due'); }
    m = tickMissionMonth(m);
    if (m.monthsRemaining !== 1 || isMissionDue(m)) { fail('after 1 tick, 2mo mission should have 1mo left, not due'); }
    m = tickMissionMonth(m);
    if (m.monthsRemaining !== 0 || !isMissionDue(m)) { fail('after 2 ticks, mission should be due'); } else {
        ok('tickMissionMonth + isMissionDue');
    }
    const overTicked = tickMissionMonth(m);
    if (overTicked.monthsRemaining < 0) { fail('monthsRemaining should not go negative'); } else {
        ok('tickMissionMonth floors at 0');
    }
}

// --- grade weights: low trust biases toward disaster, high skill biases toward triumph ---
{
    const lowTrust = computeMissionGradeWeights(50, 20);
    const highTrust = computeMissionGradeWeights(50, 80);
    if (lowTrust.disaster <= highTrust.disaster) {
        fail('low trust should raise disaster weight vs high trust');
    } else {
        ok('low trust raises disaster weight');
    }
    const lowSkill = computeMissionGradeWeights(10, 80);
    const highSkill = computeMissionGradeWeights(90, 80);
    if (highSkill.triumph <= lowSkill.triumph) {
        fail('high skill should raise triumph weight vs low skill');
    } else {
        ok('high skill raises triumph weight');
    }
}

// --- resolveMissionOutcome: deterministic, valid grade, deltas match kind/grade table ---
{
    const mission = createOfficerMission('sayo', 'trade_run', 1);
    const a = resolveMissionOutcome(mission, 60, 60, 12345);
    const b = resolveMissionOutcome(mission, 60, 60, 12345);
    if (a.grade !== b.grade || a.reportLine !== b.reportLine) {
        fail('resolveMissionOutcome not deterministic for same inputs');
    } else if (!isValidMissionGrade(a.grade)) {
        fail('resolveMissionOutcome grade invalid');
    } else if (!a.reportLine.includes('sayo')) {
        fail('reportLine should reference officer id');
    } else {
        ok('resolveMissionOutcome deterministic + valid');
    }

    // disaster grade should carry meaningfully negative deltas for trade_run
    let foundDisaster = false;
    for (let s = 0; s < 300 && !foundDisaster; s++) {
        const outcome = resolveMissionOutcome(mission, 20, 10, s);
        if (outcome.grade === 'disaster') {
            foundDisaster = true;
            if ((outcome.deltas.treasury ?? 0) >= 0) {
                fail('trade_run disaster should have negative treasury delta');
            } else {
                ok('trade_run disaster has negative treasury delta');
            }
        }
    }
    if (!foundDisaster) { fail('could not find a disaster outcome across 300 seeds at low skill/trust'); }
}

// --- domainOps parse + apply: dispatch_officer ---
{
    let domain = appointOfficer(defaultDomainState('riverhold'), { npcId: 'sayo', role: 'steward', skill: 70 });
    const cfg = normalizeDomainConfig({ maxActiveMissions: 2 });

    const ops = parseDomainOps({
        kind: 'dispatch_officer',
        mission: { npcId: 'sayo', kind: 'espionage', targetId: 'borderland', months: 2 },
    });
    if (!ops || ops.kind !== 'dispatch_officer' || ops.mission.npcId !== 'sayo') {
        fail('parseDomainOps dispatch_officer');
    } else {
        ok('parse dispatch_officer ops');
    }

    const { domain: dispatched } = applyDomainOps(domain, ops, cfg, 1);
    if (!dispatched.activeMissions || dispatched.activeMissions.length !== 1) {
        fail('dispatchOfficer should add one active mission');
    } else if (dispatched.activeMissions[0].officerNpcId !== 'sayo') {
        fail('active mission officer mismatch');
    } else {
        ok('dispatchOfficer adds mission');
    }

    // dispatching the same officer again should be a no-op (already away)
    const { domain: doubleDispatch } = applyDomainOps(dispatched, ops, cfg, 2);
    if (doubleDispatch.activeMissions.length !== 1) {
        fail('dispatching an already-away officer should be a no-op');
    } else {
        ok('cannot dispatch an already-away officer');
    }

    // dispatching an unappointed officer should be a no-op
    const badTarget = parseDomainOps({
        kind: 'dispatch_officer',
        mission: { npcId: 'sayo', kind: 'espionage', targetId: 'evil\ninject', months: 99 },
    });
    if (badTarget?.mission?.targetId !== undefined || badTarget?.mission?.months !== 3) {
        fail('parseDomainOps should sanitize mission targetId/months');
    } else {
        ok('parseDomainOps sanitizes mission targetId/months');
    }

    const badOps = parseDomainOps({
        kind: 'dispatch_officer',
        mission: { npcId: 'ghost', kind: 'espionage' },
    });
    const { domain: noGhost } = applyDomainOps(domain, badOps, cfg, 1);
    if (noGhost.activeMissions) {
        fail('dispatching a non-appointed officer should be a no-op');
    } else {
        ok('cannot dispatch a non-appointed officer');
    }
}

// --- max active missions enforced ---
{
    let domain = appointOfficer(defaultDomainState('riverhold'), { npcId: 'a', role: 'steward' });
    domain = appointOfficer(domain, { npcId: 'b', role: 'marshal' });
    domain = appointOfficer(domain, { npcId: 'c', role: 'diplomat' });
    const cfg = normalizeDomainConfig({ maxActiveMissions: 2 });

    let d = applyDomainOps(domain, parseDomainOps({ kind: 'dispatch_officer', mission: { npcId: 'a', kind: 'survey' } }), cfg, 1).domain;
    d = applyDomainOps(d, parseDomainOps({ kind: 'dispatch_officer', mission: { npcId: 'b', kind: 'survey' } }), cfg, 1).domain;
    const overflow = applyDomainOps(d, parseDomainOps({ kind: 'dispatch_officer', mission: { npcId: 'c', kind: 'survey' } }), cfg, 1).domain;
    if (overflow.activeMissions.length !== 2) {
        fail(`maxActiveMissions=2 should cap active missions, got ${overflow.activeMissions.length}`);
    } else {
        ok('maxActiveMissions cap enforced');
    }
}

// --- integration: monthly_commit ticks + resolves missions, excludes away officers from council ---
{
    let domain = appointOfficer(defaultDomainState('riverhold'), { npcId: 'sayo', role: 'steward', skill: 80 });
    const cfg = normalizeDomainConfig({ maxActiveMissions: 2, officerTrustMap: { sayo: 70 } });

    // dispatch sayo for 1 month
    const dispatchOps = parseDomainOps({ kind: 'dispatch_officer', mission: { npcId: 'sayo', kind: 'trade_run', months: 1 } });
    domain = applyDomainOps(domain, dispatchOps, cfg, 1).domain;
    if (!domain.activeMissions || domain.activeMissions.length !== 1) {
        fail('setup: sayo should be dispatched');
    }

    // commit a month: mission should resolve (1 month), councilLines should exclude sayo (still away this same commit,
    // since resolution happens at month-end after decrement — sayo returns AT this commit, so should be back for council)
    const result = applyMonthlyCommit(domain, { kind: 'monthly_commit', actions: ['inspect'] }, cfg, 5);
    if (result.domain.activeMissions) {
        fail('mission should have resolved and been removed from activeMissions after 1 month');
    } else if (!result.domain.lastMissionReports || result.domain.lastMissionReports.length !== 1) {
        fail(`lastMissionReports should have exactly 1 entry, got ${JSON.stringify(result.domain.lastMissionReports)}`);
    } else if (!result.domain.lastMissionReports[0].includes('sayo')) {
        fail('mission report should reference the officer');
    } else {
        ok('1-month mission resolves on first commit, report generated');
    }
    // sayo just returned this commit, so council SHOULD include them again
    if (!result.councilLines.some((l) => l.includes('sayo') || l.includes('Sayo'))) {
        fail('returning officer should appear in council on the commit they return');
    } else {
        ok('returned officer appears in council immediately');
    }
}

// --- integration: 2-month mission excludes officer from council mid-flight ---
{
    let domain = appointOfficer(defaultDomainState('riverhold'), { npcId: 'sayo', role: 'steward' });
    const cfg = normalizeDomainConfig({ maxActiveMissions: 2 });
    const dispatchOps = parseDomainOps({ kind: 'dispatch_officer', mission: { npcId: 'sayo', kind: 'survey', months: 2 } });
    domain = applyDomainOps(domain, dispatchOps, cfg, 1).domain;

    const midFlight = applyMonthlyCommit(domain, { kind: 'monthly_commit', actions: ['inspect'] }, cfg, 5);
    if (!midFlight.domain.activeMissions || midFlight.domain.activeMissions.length !== 1) {
        fail('2-month mission should still be active after 1 commit');
    } else if (midFlight.domain.activeMissions[0].monthsRemaining !== 1) {
        fail(`expected 1 month remaining, got ${midFlight.domain.activeMissions[0].monthsRemaining}`);
    } else if (midFlight.councilLines.some((l) => l.includes('sayo') || l.includes('Sayo'))) {
        fail('officer still away should be excluded from council');
    } else {
        ok('officer mid-mission excluded from council');
    }

    const returned = applyMonthlyCommit(midFlight.domain, { kind: 'monthly_commit', actions: ['inspect'] }, cfg, 6);
    if (returned.domain.activeMissions) {
        fail('mission should resolve after 2nd month');
    } else {
        ok('2-month mission resolves on schedule');
    }
}

// --- no missions when maxActiveMissions absent / disabled path is simply unused ---
{
    const domain = defaultDomainState('riverhold');
    const cfg = normalizeDomainConfig();
    const result = applyMonthlyCommit(domain, { kind: 'monthly_commit', actions: ['inspect'] }, cfg, 1);
    if (result.domain.activeMissions || result.domain.lastMissionReports) {
        fail('no missions should appear without any dispatch_officer ops ever applied');
    } else {
        ok('no missions without dispatch');
    }
}

// --- prompt line ---
{
    const line = buildActiveMissionPromptLine([
        { officerNpcId: 'sayo', kind: 'espionage', monthsRemaining: 2 },
    ]);
    if (!line || !line.includes('sayo') || !line.includes('espionage') || !line.includes('2mo')) {
        fail(`buildActiveMissionPromptLine wrong: ${line}`);
    } else {
        ok('buildActiveMissionPromptLine');
    }
    if (buildActiveMissionPromptLine([]) !== undefined) {
        fail('empty mission list should yield no prompt line');
    } else {
        ok('empty mission list yields no prompt line');
    }
}

// --- validateDomain round-trips activeMissions + lastMissionReports, drops invalid ---
{
    const domain = appointOfficer(defaultDomainState('riverhold'), { npcId: 'sayo', role: 'steward' });
    domain.activeMissions = [
        { officerNpcId: 'sayo', kind: 'espionage', monthsRemaining: 2 },
        { officerNpcId: 'bad', kind: 'not_a_kind', monthsRemaining: 1 },
    ];
    domain.lastMissionReports = ['sayo returned triumphant.'];
    const validated = validateDomain(JSON.parse(JSON.stringify(domain)));
    if (!validated) {
        fail('validateDomain should accept a domain with missions');
    } else if (!validated.activeMissions || validated.activeMissions.length !== 1) {
        fail(`validateDomain should drop the invalid-kind mission, got ${JSON.stringify(validated.activeMissions)}`);
    } else if (!validated.lastMissionReports || validated.lastMissionReports.length !== 1) {
        fail('validateDomain should keep lastMissionReports');
    } else {
        ok('validateDomain round-trips missions, drops invalid');
    }
}

// --- parseOfficerMission edge cases ---
{
    if (parseOfficerMission(null) !== undefined) { fail('parseOfficerMission should reject null'); }
    else if (parseOfficerMission({ officerNpcId: 'x', kind: 'not_a_kind' }) !== undefined) {
        fail('parseOfficerMission should reject invalid kind');
    } else if (!parseOfficerMission({ officerNpcId: 'x', kind: 'parley', monthsRemaining: 99 })) {
        fail('parseOfficerMission should accept valid input');
    } else {
        const m = parseOfficerMission({ officerNpcId: 'x', kind: 'parley', monthsRemaining: 99 });
        if (m.monthsRemaining !== MAX_ACTIVE_MISSIONS) {
            // monthsRemaining clamp is to MAX_MISSION_MONTHS (3), not MAX_ACTIVE_MISSIONS; just sanity check it's clamped low
            if (m.monthsRemaining > 3) { fail('parseOfficerMission should clamp monthsRemaining'); }
            else { ok('parseOfficerMission clamps monthsRemaining'); }
        } else {
            ok('parseOfficerMission clamps monthsRemaining');
        }
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log(`All domain mission core tests passed (default max active ${DEFAULT_MAX_ACTIVE_MISSIONS}).`);
