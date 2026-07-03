#!/usr/bin/env node
'use strict';

const {
    deriveRivalLord,
    validateRivalLord,
    tickRivalLord,
    resolveRivalDiplomacy,
    discloseRivalInfo,
    computeRivalActionWeight,
    isValidRivalStance,
    isValidRivalActionId,
    clampRivalStat,
    buildRivalPromptLine,
    formatRivalChronicleText,
    RIVAL_RAID_PREP_FLAG,
} = require('../out/rivalLordCore');
const {
    defaultDomainState,
    applyMonthlyCommit,
    normalizeDomainConfig,
    validateDomain,
    computeDomainEventWeight,
} = require('../out/domainCore');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

// --- derivation is deterministic and clamps to input ---
{
    const low = deriveRivalLord('borderland', { dangerLevel: 0 });
    const high = deriveRivalLord('borderland', { dangerLevel: 10 });
    if (low.aggression >= high.aggression) {
        fail('higher danger should raise aggression');
    } else if (low.strength !== 50 || high.strength !== 50) {
        fail('derived strength should start at baseline 50');
    } else if (low.stance !== 'neutral' || high.stance !== 'neutral') {
        fail('derived stance should start neutral');
    } else {
        ok('deriveRivalLord danger scaling');
    }
}

// --- validators ---
{
    if (!isValidRivalStance('wary') || isValidRivalStance('grumpy')) {
        fail('isValidRivalStance');
    } else if (!isValidRivalActionId('raid') || isValidRivalActionId('nope')) {
        fail('isValidRivalActionId');
    } else if (clampRivalStat(150) !== 100 || clampRivalStat(-5) !== 0 || clampRivalStat('x') !== 0) {
        fail('clampRivalStat');
    } else {
        ok('rival validators + clamp');
    }
}

// --- weight function reflects raidPending gating ---
{
    const rival = deriveRivalLord('borderland', { dangerLevel: 8 });
    if (computeRivalActionWeight('raid', rival) !== 0) {
        fail('raid weight should be 0 without raidPending');
    } else if (computeRivalActionWeight('raid_prep', rival) <= 0) {
        fail('raid_prep weight should be positive without raidPending');
    } else {
        ok('raid gated behind raid_prep');
    }
    const prepped = { ...rival, raidPending: true };
    if (computeRivalActionWeight('raid_prep', prepped) !== 0) {
        fail('raid_prep weight should be 0 once already pending');
    } else if (computeRivalActionWeight('raid', prepped) <= 0) {
        fail('raid weight should be positive once pending');
    } else {
        ok('raid weight activates once prepped');
    }
}

// --- tick is deterministic for identical seed/state ---
{
    const rival = deriveRivalLord('borderland', { dangerLevel: 5 });
    const domain = defaultDomainState('riverhold');
    const a = tickRivalLord(rival, domain, 77);
    const b = tickRivalLord(rival, domain, 77);
    if (a.action !== b.action) {
        fail('tickRivalLord not deterministic for same seed');
    } else if (!isValidRivalActionId(a.action)) {
        fail('tick action should be valid RivalActionId');
    } else {
        ok('tickRivalLord deterministic');
    }
}

// --- raid resolution scales with relative strength (no player defense = harsher outcome) ---
{
    const prepped = { ...deriveRivalLord('borderland'), strength: 90, raidPending: true };
    const weakPlayer = { ...defaultDomainState('riverhold'), troops: 10, defense: 5 };
    const strongPlayer = { ...defaultDomainState('riverhold'), troops: 300, defense: 80 };

    // force a raid by finding a seed where action === 'raid'
    let raidSeedWeak;
    for (let s = 0; s < 200; s++) {
        if (tickRivalLord(prepped, weakPlayer, s).action === 'raid') { raidSeedWeak = s; break; }
    }
    if (raidSeedWeak === undefined) {
        fail('could not find a seed producing a raid action (weights may be broken)');
    } else {
        const result = tickRivalLord(prepped, weakPlayer, raidSeedWeak);
        if (!result.playerDelta || result.playerDelta.treasury === undefined) {
            fail('raid against weak player should apply a treasury delta');
        } else if (result.rival.raidPending !== false) {
            fail('raidPending should reset to false after a raid');
        } else {
            ok('raid against overmatched player applies harsh delta');
        }

        const strongResult = tickRivalLord(prepped, strongPlayer, raidSeedWeak);
        if (strongResult.action === 'raid' && strongResult.playerDelta) {
            const weakLoss = Math.abs(result.playerDelta.treasury ?? 0);
            const strongLoss = Math.abs(strongResult.playerDelta.treasury ?? 0);
            if (strongLoss > weakLoss) {
                fail('stronger player should not suffer a worse raid outcome');
            } else {
                ok('raid outcome scales with player defense');
            }
        } else {
            ok('raid outcome scales with player defense (strong player action differed, acceptable)');
        }
    }
}

// --- diplomacy nudges stance friendlier (deterministically, seed-dependent) ---
{
    const hostile = { ...deriveRivalLord('borderland'), stance: 'hostile' };
    let movedAtLeastOnce = false;
    for (let s = 0; s < 100; s++) {
        const next = resolveRivalDiplomacy(hostile, 50, s);
        if (next.stance !== 'hostile') { movedAtLeastOnce = true; break; }
    }
    if (!movedAtLeastOnce) {
        fail('resolveRivalDiplomacy should sometimes shift stance friendlier');
    } else {
        ok('resolveRivalDiplomacy shifts stance');
    }
    // never overshoots past 'friendly'
    const friendly = { ...deriveRivalLord('borderland'), stance: 'friendly' };
    for (let s = 0; s < 20; s++) {
        if (resolveRivalDiplomacy(friendly, 80, s).stance !== 'friendly') {
            fail('friendly stance should not move past friendly');
            break;
        }
    }
}

// --- disclosure gate: undisclosed rival never leaks true stats ---
{
    const rival = { ...deriveRivalLord('borderland'), strength: 77, stance: 'hostile' };
    const line = buildRivalPromptLine(rival);
    if (!line || line.includes('77') || line.includes('hostile')) {
        fail('undisclosed rival must not leak true strength/stance in prompt line');
    } else {
        ok('undisclosed rival prompt line hides true stats');
    }

    const disclosed = discloseRivalInfo(rival, 4, 2);
    if (disclosed.disclosedStrength !== 77 || disclosed.disclosedStance !== 'hostile') {
        fail('discloseRivalInfo should copy true stats to disclosed fields');
    } else {
        ok('discloseRivalInfo copies true stats');
    }
    const disclosedLine = buildRivalPromptLine(disclosed);
    if (!disclosedLine || !disclosedLine.includes('77') || !disclosedLine.includes('hostile')) {
        fail(`disclosed prompt line should show true stats: ${disclosedLine}`);
    } else {
        ok('disclosed rival prompt line shows stats');
    }
}

// --- validateRivalLord round-trips and rejects garbage ---
{
    const rival = deriveRivalLord('borderland', { dangerLevel: 6 });
    const roundTripped = validateRivalLord(JSON.parse(JSON.stringify(rival)));
    if (!roundTripped || roundTripped.regionId !== 'borderland') {
        fail('validateRivalLord should round-trip a valid rival');
    } else {
        ok('validateRivalLord round-trip');
    }
    if (validateRivalLord({ regionId: '' }) !== undefined) {
        fail('validateRivalLord should reject empty regionId');
    } else if (validateRivalLord(null) !== undefined) {
        fail('validateRivalLord should reject null');
    } else {
        ok('validateRivalLord rejects invalid input');
    }
    const garbageStance = validateRivalLord({ regionId: 'x', stance: 'furious', strength: 999 });
    if (!garbageStance || garbageStance.stance !== 'neutral' || garbageStance.strength !== 100) {
        fail('validateRivalLord should sanitize invalid stance/out-of-range strength');
    } else {
        ok('validateRivalLord sanitizes invalid fields');
    }
}

// --- chronicle text formatting ---
{
    const text = formatRivalChronicleText('raid', 'borderland', 5, 2);
    if (!text.includes('borderland') || !text.includes('raid') || !text.includes('Year 2')) {
        fail(`formatRivalChronicleText wrong: ${text}`);
    } else {
        ok('formatRivalChronicleText');
    }
}

// --- integration: lazy init via applyMonthlyCommit when rivalsEnabled + rivalRegionId ---
{
    const domain = defaultDomainState('riverhold');
    const cfg = normalizeDomainConfig({ rivalsEnabled: true, rivalRegionId: 'borderland' });
    const result = applyMonthlyCommit(domain, { kind: 'monthly_commit', actions: ['inspect'] }, cfg, 3);
    if (!result.domain.rival || result.domain.rival.regionId !== 'borderland') {
        fail('rival should be lazily created on first commit when rivalsEnabled');
    } else if (!result.rivalActionId) {
        fail('rivalActionId should be set once a rival exists');
    } else {
        ok('rival lazy init + tick via applyMonthlyCommit');
    }

    const noRivalDomain = defaultDomainState('riverhold');
    const offCfg = normalizeDomainConfig();
    const offResult = applyMonthlyCommit(noRivalDomain, { kind: 'monthly_commit', actions: ['inspect'] }, offCfg, 3);
    if (offResult.domain.rival || offResult.rivalActionId) {
        fail('no rival should appear when rivalsEnabled is not set');
    } else {
        ok('no rival without rivalsEnabled config');
    }
}

// --- integration: espionage/gather_rumors discloses via monthly_commit ---
{
    const domain = defaultDomainState('riverhold');
    const cfg = normalizeDomainConfig({ rivalsEnabled: true, rivalRegionId: 'borderland' });
    const first = applyMonthlyCommit(domain, { kind: 'monthly_commit', actions: ['inspect'] }, cfg, 3);
    if (first.domain.rival.disclosedStrength !== undefined) {
        fail('rival should not be disclosed without espionage/gather_rumors');
    } else {
        ok('rival undisclosed without espionage');
    }
    const second = applyMonthlyCommit(
        first.domain,
        { kind: 'monthly_commit', actions: ['espionage'], intelligence: 'gather_rumors' },
        cfg,
        4
    );
    if (second.domain.rival.disclosedStrength === undefined || second.domain.rival.disclosedStance === undefined) {
        fail('espionage action should disclose rival info');
    } else {
        ok('espionage action discloses rival info');
    }
}

// --- integration: neighbor_militarize event weight rises when rivalRaidPrep flag set ---
{
    const calm = defaultDomainState('riverhold');
    const prepped = { ...calm, flags: { ...calm.flags, [RIVAL_RAID_PREP_FLAG]: true } };
    if (computeDomainEventWeight('neighbor_militarize', prepped) <= computeDomainEventWeight('neighbor_militarize', calm)) {
        fail('rivalRaidPrep flag should raise neighbor_militarize weight');
    } else {
        ok('rivalRaidPrep flag raises neighbor_militarize weight');
    }
}

// --- validateDomain round-trips domain.rival ---
{
    const domain = defaultDomainState('riverhold');
    domain.rival = deriveRivalLord('borderland', { dangerLevel: 7 });
    const validated = validateDomain(JSON.parse(JSON.stringify(domain)));
    if (!validated || !validated.rival || validated.rival.regionId !== 'borderland') {
        fail('validateDomain should keep a valid rival');
    } else {
        ok('validateDomain round-trips rival');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('All rival lord core tests passed.');
