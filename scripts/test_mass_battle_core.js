#!/usr/bin/env node
'use strict';

const {
    startBattle,
    resolveEnemyTactic,
    resolveBattleRound,
    applyBattleRoundToState,
    isBattleConcluded,
    concludeBattle,
    parseBattleState,
    isValidBattleTactic,
    isValidBattleOutcomeKind,
    buildBattlePromptLines,
    formatBattleChronicleText,
    clampBattleStat,
    MAX_BATTLE_ROUNDS,
} = require('../out/massBattleCore');
const {
    defaultDomainState,
    appointOfficer,
    parseDomainOps,
    applyDomainOps,
    applyBattleRound,
    applyMonthlyCommit,
    normalizeDomainConfig,
    validateDomain,
} = require('../out/domainCore');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

// --- validators + clamp ---
{
    if (!isValidBattleTactic('assault') || isValidBattleTactic('charge')) {
        fail('isValidBattleTactic');
    } else if (!isValidBattleOutcomeKind('victory') || isValidBattleOutcomeKind('draw')) {
        fail('isValidBattleOutcomeKind');
    } else if (clampBattleStat(150) !== 100 || clampBattleStat(-5) !== 0) {
        fail('clampBattleStat');
    } else {
        ok('battle validators + clamp');
    }
}

// --- startBattle initial state ---
{
    const state = startBattle('borderland', { troops: 200, quality: 50, commanderSkill: 50 }, { troops: 150, quality: 40, commanderSkill: 50 });
    if (state.playerTroopsRemaining !== 200 || state.enemyTroopsRemaining !== 150 || state.rounds.length !== 0) {
        fail('startBattle initial state wrong');
    } else if (state.maxRounds !== MAX_BATTLE_ROUNDS) {
        fail('startBattle should default to MAX_BATTLE_ROUNDS');
    } else {
        ok('startBattle initial state');
    }
}

// --- resolveEnemyTactic deterministic ---
{
    const side = { troops: 150, quality: 40, commanderSkill: 50 };
    const a = resolveEnemyTactic(side, 42, 1);
    const b = resolveEnemyTactic(side, 42, 1);
    if (a !== b || !isValidBattleTactic(a)) {
        fail('resolveEnemyTactic not deterministic or invalid');
    } else {
        ok('resolveEnemyTactic deterministic');
    }
}

// --- resolveBattleRound: favorable tactic matchup should shift outcome in favor of the winner over many seeds ---
{
    const equalSide = { troops: 200, quality: 50, commanderSkill: 50 };
    let playerWinsFavorable = 0;
    let playerWinsUnfavorable = 0;
    const trials = 60;
    for (let s = 0; s < trials; s++) {
        // assault beats hold: player favorable
        const favorable = resolveBattleRound(equalSide, equalSide, 'assault', 'hold', s, 1);
        if (favorable.playerWonRound) { playerWinsFavorable++; }
        // hold beats assault... wait, assault beats hold, so playing 'hold' vs enemy 'assault' is unfavorable for player
        const unfavorable = resolveBattleRound(equalSide, equalSide, 'hold', 'assault', s, 1);
        if (unfavorable.playerWonRound) { playerWinsUnfavorable++; }
    }
    if (playerWinsFavorable <= playerWinsUnfavorable) {
        fail(`favorable tactic matchup should win more often: favorable=${playerWinsFavorable} unfavorable=${playerWinsUnfavorable}`);
    } else {
        ok('favorable tactic matchup wins more often');
    }
}

// --- resolveBattleRound deterministic for identical inputs ---
{
    const side = { troops: 200, quality: 50, commanderSkill: 50 };
    const a = resolveBattleRound(side, side, 'assault', 'hold', 99, 1);
    const b = resolveBattleRound(side, side, 'assault', 'hold', 99, 1);
    if (a.playerWonRound !== b.playerWonRound || a.playerLosses !== b.playerLosses || a.enemyLosses !== b.enemyLosses) {
        fail('resolveBattleRound not deterministic');
    } else if (a.playerLosses <= 0 || a.enemyLosses <= 0) {
        fail('both sides should take at least some losses');
    } else {
        ok('resolveBattleRound deterministic + nonzero losses');
    }
}

// --- applyBattleRoundToState decrements + floors at 0 ---
{
    let state = startBattle('borderland', { troops: 10, quality: 50, commanderSkill: 50 }, { troops: 10, quality: 50, commanderSkill: 50 });
    const round = { round: 1, playerTactic: 'assault', enemyTactic: 'hold', playerLosses: 3, enemyLosses: 20, playerWonRound: true, narrativeHintId: 'x' };
    state = applyBattleRoundToState(state, round);
    if (state.playerTroopsRemaining !== 7) { fail('playerTroopsRemaining should decrement by losses'); }
    else if (state.enemyTroopsRemaining !== 0) { fail('enemyTroopsRemaining should floor at 0, not go negative'); }
    else { ok('applyBattleRoundToState decrements + floors at 0'); }
}

// --- isBattleConcluded: max rounds or troop depletion ---
{
    let state = startBattle('borderland', { troops: 100, quality: 50, commanderSkill: 50 }, { troops: 100, quality: 50, commanderSkill: 50 });
    if (isBattleConcluded(state)) { fail('fresh battle should not be concluded'); }
    for (let i = 0; i < MAX_BATTLE_ROUNDS; i++) {
        state = applyBattleRoundToState(state, { round: i + 1, playerTactic: 'hold', enemyTactic: 'hold', playerLosses: 1, enemyLosses: 1, playerWonRound: true, narrativeHintId: 'x' });
    }
    if (!isBattleConcluded(state)) { fail('battle should conclude after maxRounds'); } else { ok('isBattleConcluded at maxRounds'); }

    let depleted = startBattle('borderland', { troops: 100, quality: 50, commanderSkill: 50 }, { troops: 5, quality: 50, commanderSkill: 50 });
    depleted = applyBattleRoundToState(depleted, { round: 1, playerTactic: 'assault', enemyTactic: 'hold', playerLosses: 2, enemyLosses: 5, playerWonRound: true, narrativeHintId: 'x' });
    if (!isBattleConcluded(depleted)) { fail('battle should conclude when enemy troops hit 0'); } else { ok('isBattleConcluded on troop depletion'); }
}

// --- concludeBattle classification ---
{
    // decisive victory: enemy wiped out, player largely intact
    let victory = startBattle('borderland', { troops: 200, quality: 50, commanderSkill: 50 }, { troops: 30, quality: 50, commanderSkill: 50 });
    victory = applyBattleRoundToState(victory, { round: 1, playerTactic: 'assault', enemyTactic: 'hold', playerLosses: 10, enemyLosses: 30, playerWonRound: true, narrativeHintId: 'x' });
    const victoryOutcome = concludeBattle(victory);
    if (victoryOutcome.kind !== 'victory') { fail(`expected victory, got ${victoryOutcome.kind}`); } else { ok('concludeBattle: victory'); }

    // rout: player wiped out
    let rout = startBattle('borderland', { troops: 20, quality: 50, commanderSkill: 50 }, { troops: 300, quality: 50, commanderSkill: 50 });
    rout = applyBattleRoundToState(rout, { round: 1, playerTactic: 'assault', enemyTactic: 'hold', playerLosses: 20, enemyLosses: 10, playerWonRound: false, narrativeHintId: 'x' });
    const routOutcome = concludeBattle(rout);
    if (routOutcome.kind !== 'rout') { fail(`expected rout, got ${routOutcome.kind}`); } else { ok('concludeBattle: rout'); }

    // stalemate: 3 rounds, 1-1 split with a tie is impossible at 3 rounds (odd); test 2-round tie instead
    let stalemate = startBattle('borderland', { troops: 200, quality: 50, commanderSkill: 50 }, { troops: 200, quality: 50, commanderSkill: 50 }, 2);
    stalemate = applyBattleRoundToState(stalemate, { round: 1, playerTactic: 'assault', enemyTactic: 'hold', playerLosses: 10, enemyLosses: 30, playerWonRound: true, narrativeHintId: 'x' });
    stalemate = applyBattleRoundToState(stalemate, { round: 2, playerTactic: 'hold', enemyTactic: 'assault', playerLosses: 30, enemyLosses: 10, playerWonRound: false, narrativeHintId: 'x' });
    const stalemateOutcome = concludeBattle(stalemate);
    if (stalemateOutcome.kind !== 'stalemate') { fail(`expected stalemate, got ${stalemateOutcome.kind}`); } else { ok('concludeBattle: stalemate'); }

    // retreat/costly_victory sanity: playerDelta.troops should always be negative-or-zero of total losses
    if ((victoryOutcome.playerDelta.troops ?? 0) > 0) { fail('victory playerDelta.troops should not be positive'); }
    else { ok('playerDelta.troops reflects losses'); }
}

// --- battle prompt lines + chronicle text ---
{
    const state = startBattle('borderland', { troops: 100, quality: 50, commanderSkill: 50 }, { troops: 80, quality: 40, commanderSkill: 50 });
    const lines = buildBattlePromptLines(state);
    const joined = lines.join('\n');
    if (!joined.includes('[Domain — Battle]') || !joined.includes('Round 1/3') || !joined.includes('borderland')) {
        fail(`buildBattlePromptLines missing content: ${joined}`);
    } else {
        ok('buildBattlePromptLines');
    }

    const outcome = concludeBattle(applyBattleRoundToState(state, { round: 1, playerTactic: 'assault', enemyTactic: 'hold', playerLosses: 5, enemyLosses: 80, playerWonRound: true, narrativeHintId: 'x' }));
    const chronicleText = formatBattleChronicleText(outcome, 'borderland', 5, 2);
    if (!chronicleText.includes('borderland') || !chronicleText.includes('Year 2')) {
        fail(`formatBattleChronicleText wrong: ${chronicleText}`);
    } else {
        ok('formatBattleChronicleText');
    }
}

// --- parseBattleState round-trips + rejects invalid ---
{
    const state = startBattle('borderland', { troops: 100, quality: 50, commanderSkill: 50 }, { troops: 80, quality: 40, commanderSkill: 50 });
    const roundTripped = parseBattleState(JSON.parse(JSON.stringify(state)));
    if (!roundTripped || roundTripped.opponentLabel !== 'borderland' || roundTripped.enemySide.troops !== 80) {
        fail('parseBattleState should round-trip a valid state');
    } else {
        ok('parseBattleState round-trip');
    }
    if (parseBattleState(null) !== undefined) { fail('parseBattleState should reject null'); }
    else if (parseBattleState({ opponentLabel: '' }) !== undefined) { fail('parseBattleState should reject empty opponentLabel'); }
    else if (parseBattleState({ opponentLabel: 'bad region', enemySide: { troops: 10, quality: 1, commanderSkill: 1 } }) !== undefined) {
        fail('parseBattleState should reject unsafe opponentLabel');
    } else if (parseBattleState({ opponentLabel: 'x', enemySide: {} }) !== undefined) { fail('parseBattleState should reject missing enemySide.troops'); }
    else { ok('parseBattleState rejects invalid input'); }

    const withBadHint = parseBattleState({
        opponentLabel: 'borderland',
        playerTroopsStart: 100,
        enemyTroopsStart: 80,
        playerTroopsRemaining: 90,
        enemyTroopsRemaining: 70,
        enemySide: { troops: 80, quality: 40, commanderSkill: 50 },
        rounds: [{
            round: 1,
            playerTactic: 'assault',
            enemyTactic: 'hold',
            playerLosses: 10,
            enemyLosses: 10,
            playerWonRound: true,
            narrativeHintId: 'evil\nhint',
        }],
    });
    if (!withBadHint || withBadHint.rounds[0].narrativeHintId !== 'unknown') {
        fail('parseBattleState should sanitize unsafe narrativeHintId');
    } else {
        ok('parseBattleState sanitizes narrativeHintId');
    }
}

// --- domainCore integration: parse + apply battle_round, no-op without activeBattle ---
{
    const domain = defaultDomainState('riverhold');
    const cfg = normalizeDomainConfig();
    const ops = parseDomainOps({ kind: 'battle_round', tactic: 'assault' });
    if (!ops || ops.kind !== 'battle_round' || ops.tactic !== 'assault') {
        fail('parseDomainOps battle_round');
    } else {
        ok('parse battle_round ops');
    }
    if (parseDomainOps({ kind: 'battle_round', tactic: 'charge' }) !== undefined) {
        fail('parseDomainOps should reject invalid tactic');
    } else {
        ok('parseDomainOps rejects invalid tactic');
    }

    const { domain: unchanged, battle } = applyDomainOps(domain, ops, cfg, 1);
    if (unchanged !== domain && JSON.stringify(unchanged) !== JSON.stringify(domain)) {
        fail('battle_round without an activeBattle should be a no-op');
    } else if (battle !== undefined) {
        fail('no battle outcome should be returned without an activeBattle');
    } else {
        ok('battle_round without activeBattle is a no-op');
    }
}

// --- domainCore integration: full battle to conclusion via applyBattleRound ---
{
    let domain = appointOfficer(defaultDomainState('riverhold'), { npcId: 'marcus', role: 'marshal', skill: 70 });
    domain.troops = 500;
    domain.defense = 60;
    domain = {
        ...domain,
        activeBattle: startBattle('borderland', { troops: domain.troops, quality: domain.defense, commanderSkill: 70 }, { troops: 100, quality: 30, commanderSkill: 50 }, 3),
    };

    let round = 0;
    while (domain.activeBattle && round < 5) {
        const result = applyBattleRound(domain, 'assault', 10 + round);
        domain = result.domain;
        round++;
    }

    if (domain.activeBattle) {
        fail('battle should have concluded within maxRounds (3)');
    } else if (round > 3) {
        fail(`battle took more than 3 rounds to conclude: ${round}`);
    } else if (!domain.lastBattleReport) {
        fail('lastBattleReport should be set once battle concludes');
    } else if (domain.troops >= 500) {
        fail('domain.troops should have decreased after battle losses');
    } else {
        ok('full battle resolves within 3 rounds via applyBattleRound, deltas applied');
    }
}

// --- domainCore integration: rival.strength adjusted only when the concluded battle matches the rival's region ---
{
    let domain = defaultDomainState('riverhold');
    domain.rival = { regionId: 'borderland', strength: 80, aggression: 50, stance: 'hostile' };
    domain.troops = 400;
    domain.defense = 60;
    domain = {
        ...domain,
        activeBattle: startBattle('borderland', { troops: domain.troops, quality: domain.defense, commanderSkill: 50 }, { troops: 240, quality: 50, commanderSkill: 50 }, 3),
    };

    let round = 0;
    while (domain.activeBattle && round < 5) {
        const result = applyBattleRound(domain, 'assault', 20 + round);
        domain = result.domain;
        round++;
    }
    if (domain.rival.strength === 80) {
        fail('rival.strength should change after a battle in its own region concludes');
    } else {
        ok('rival.strength adjusted after battle in its region concludes');
    }
}

// --- validateDomain round-trips activeBattle + lastBattleReport ---
{
    const domain = defaultDomainState('riverhold');
    domain.activeBattle = startBattle('borderland', { troops: 100, quality: 50, commanderSkill: 50 }, { troops: 80, quality: 40, commanderSkill: 50 });
    domain.lastBattleReport = 'Domain forces won a decisive victory over borderland (troops -10).';
    const validated = validateDomain(JSON.parse(JSON.stringify(domain)));
    if (!validated || !validated.activeBattle || validated.activeBattle.opponentLabel !== 'borderland') {
        fail('validateDomain should keep a valid activeBattle');
    } else if (validated.lastBattleReport !== domain.lastBattleReport) {
        fail('validateDomain should keep lastBattleReport');
    } else {
        ok('validateDomain round-trips battle fields');
    }
}

// --- F8/F10 handoff: a rival raid starts a battle (enableMassBattle ON) instead of an instant delta ---
{
    const domain = defaultDomainState('riverhold');
    const cfg = normalizeDomainConfig({ rivalsEnabled: true, rivalRegionId: 'borderland', enableMassBattle: true });

    // establish the rival first (lazy init on first commit)
    let state = applyMonthlyCommit(domain, { kind: 'monthly_commit', actions: ['inspect'] }, cfg, 1).domain;
    const preRaidStrength = state.rival.strength;

    // search for a seed producing a raid this month (rival must have raidPending from a prior raid_prep)
    state = { ...state, rival: { ...state.rival, raidPending: true, strength: 90 } };
    let raidSeed;
    let raidResult;
    for (let s = 0; s < 200; s++) {
        const attempt = applyMonthlyCommit(state, { kind: 'monthly_commit', actions: ['inspect'] }, cfg, s);
        if (attempt.rivalActionId === 'raid') { raidSeed = s; raidResult = attempt; break; }
    }
    if (raidSeed === undefined) {
        fail('could not find a seed producing a raid action for the handoff test');
    } else if (!raidResult.domain.activeBattle) {
        fail('a raid with enableMassBattle ON should start an activeBattle, not apply an instant delta');
    } else if (raidResult.domain.rival.strength !== 90) {
        fail('rival.strength should be unchanged at battle start (F10 applies its own delta on conclusion, not rivalLordCore\'s placeholder)');
    } else if (raidResult.domain.activeBattle.opponentLabel !== 'borderland') {
        fail('activeBattle opponentLabel should match the rival region');
    } else {
        ok('F8 raid starts an F10 battle when enableMassBattle is ON');
    }
}

// --- without enableMassBattle, a raid still applies the old instant delta (backward compatible) ---
{
    const domain = defaultDomainState('riverhold');
    const cfg = normalizeDomainConfig({ rivalsEnabled: true, rivalRegionId: 'borderland' }); // enableMassBattle defaults false
    let state = applyMonthlyCommit(domain, { kind: 'monthly_commit', actions: ['inspect'] }, cfg, 1).domain;
    state = { ...state, rival: { ...state.rival, raidPending: true, strength: 90 } };

    let found = false;
    for (let s = 0; s < 200 && !found; s++) {
        const attempt = applyMonthlyCommit(state, { kind: 'monthly_commit', actions: ['inspect'] }, cfg, s);
        if (attempt.rivalActionId === 'raid') {
            found = true;
            if (attempt.domain.activeBattle) {
                fail('without enableMassBattle, a raid should not start a battle');
            } else {
                ok('without enableMassBattle, raid behavior is unchanged (instant delta, no battle)');
            }
        }
    }
    if (!found) { fail('could not find a raid seed for the backward-compatibility check'); }
}

if (failed > 0) {
    process.exit(1);
}
console.log('All mass battle core tests passed.');
