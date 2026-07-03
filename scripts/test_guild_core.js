#!/usr/bin/env node
'use strict';

const {
    defaultGuildState,
    validateGuild,
    parseGuildOps,
    resolveWeeklyActionDeltas,
    applyWeeklyCommit,
    applyGuildOps,
    rollGuildEvent,
    getGuildSeason,
    resolveRankFromRenown,
    recruitAdventurer,
    dismissAdventurer,
    normalizeGuildConfig,
    clampGuildStat,
    applyGuildEventEffect,
    computeGuildEventWeight,
    applySeasonalWeeklyEffects,
    WEEKS_PER_YEAR,
} = require('../out/guildCore');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

{
    const g = defaultGuildState('tavern_hall');
    if (g.hallLocationId !== 'tavern_hall' || g.weeklyActionsRemaining !== 2) {
        fail('defaultGuildState');
    } else {
        ok('defaultGuildState');
    }
}

{
    const raw = defaultGuildState('tavern_hall');
    raw.coffers = 99999;
    raw.discipline = 200;
    const v = validateGuild(raw);
    if (!v || v.coffers !== 9999 || v.discipline !== 100) {
        fail('validateGuild clamps');
    } else {
        ok('validateGuild clamps');
    }

    if (validateGuild({ ...raw, hallLocationId: 'bad hall' }) !== undefined) {
        fail('validateGuild rejects unsafe hallLocationId');
    } else {
        ok('validateGuild rejects unsafe hallLocationId');
    }
}

{
    const ops = parseGuildOps({
        kind: 'weekly_commit',
        actions: ['train', 'advertise'],
    });
    if (!ops || ops.actions?.length !== 2) {
        fail('parseGuildOps weekly_commit');
    } else {
        ok('parseGuildOps weekly_commit');
    }

    if (parseGuildOps({ kind: 'weekly_commit', actions: [] }) !== undefined) {
        fail('reject empty weekly_commit');
    } else {
        ok('reject empty weekly_commit');
    }

    const badAdv = parseGuildOps({
        kind: 'recruit_adventurer',
        adventurer: { npcId: 'evil\ninject', klass: 'warrior' },
    });
    if (badAdv !== undefined) {
        fail('reject recruit with unsafe npcId');
    } else {
        ok('reject recruit with unsafe npcId');
    }
}

{
    if (getGuildSeason(1) !== 'spring' || getGuildSeason(13) !== 'summer'
        || getGuildSeason(25) !== 'autumn' || getGuildSeason(40) !== 'winter') {
        fail('getGuildSeason');
    } else {
        ok('getGuildSeason');
    }

    if (resolveRankFromRenown(10) !== 'chartered' || resolveRankFromRenown(35) !== 'reputable'
        || resolveRankFromRenown(70) !== 'renowned') {
        fail('resolveRankFromRenown');
    } else {
        ok('resolveRankFromRenown');
    }
}

{
    const delta = resolveWeeklyActionDeltas(['train', 'maintain_hall']);
    if ((delta.coffers ?? 0) !== -90 || (delta.safety ?? 0) !== 1) {
        fail('resolveWeeklyActionDeltas', delta);
    } else {
        ok('resolveWeeklyActionDeltas');
    }
}

{
    const high = computeGuildEventWeight('wealthy_patron', { ...defaultGuildState('hall'), renown: 50 }, []);
    const low = computeGuildEventWeight('wealthy_patron', { ...defaultGuildState('hall'), renown: 10 }, []);
    if (high <= 0 || low !== 0) {
        fail('computeGuildEventWeight renown gate');
    } else {
        ok('computeGuildEventWeight renown gate');
    }
}

{
    let g = defaultGuildState('hall');
    g = recruitAdventurer(g, { npcId: 'sayo', klass: 'scout', skill: 60 });
    g = dismissAdventurer(g, 'sayo');
    if (g.adventurers.length !== 0) {
        fail('recruit/dismiss adventurer');
    } else {
        ok('recruit/dismiss adventurer');
    }
}

{
    const cfg = normalizeGuildConfig({ weeklyActions: 2 });
    let g = defaultGuildState('riverhold', cfg);
    const ops = { kind: 'weekly_commit', actions: ['maintain_hall'] };
    const a = applyWeeklyCommit(g, ops, cfg, 42);
    const b = applyWeeklyCommit(g, ops, cfg, 42);
    if (JSON.stringify(a.guild) !== JSON.stringify(b.guild)) {
        fail('applyWeeklyCommit determinism');
    } else if (a.guild.calendarWeek !== 2 || a.rolledEventId === undefined) {
        fail('applyWeeklyCommit advances week and rolls event');
    } else {
        ok('applyWeeklyCommit determinism + calendar');
    }
}

{
    const cfg = normalizeGuildConfig();
    const g = defaultGuildState('hall', cfg);
    const eventId = rollGuildEvent(g, 99, ['advertise']);
    const effected = applyGuildEventEffect(g, eventId);
    if (!eventId || effected === g) {
        fail('rollGuildEvent + applyGuildEventEffect should change state for most events');
    } else {
        ok('rollGuildEvent + event effect');
    }
}

{
    let g = defaultGuildState('hall');
    g.calendarWeek = WEEKS_PER_YEAR;
    g = applySeasonalWeeklyEffects(g);
    const winter = defaultGuildState('hall');
    winter.calendarWeek = 40;
    const wintered = applySeasonalWeeklyEffects(winter);
    if (wintered.supplies >= winter.supplies) {
        fail('winter seasonal supplies drain');
    } else {
        ok('seasonal weekly effects');
    }
}

{
    const cfg = normalizeGuildConfig();
    let g = defaultGuildState('hall', cfg);
    const recruitOps = parseGuildOps({
        kind: 'recruit_adventurer',
        adventurer: { npcId: 'marcus', klass: 'warrior', skill: 55 },
    });
    const { guild: recruited } = applyGuildOps(g, recruitOps, cfg, 1);
    if (!recruited.adventurers.some((a) => a.npcId === 'marcus')) {
        fail('applyGuildOps recruit');
    } else {
        ok('applyGuildOps recruit');
    }

    const commitOps = parseGuildOps({ kind: 'weekly_commit', actions: ['court_patrons'] });
    const { guild: committed } = applyGuildOps(recruited, commitOps, cfg, 7);
    if (committed.calendarWeek !== 2) {
        fail('applyGuildOps weekly_commit integration');
    } else {
        ok('applyGuildOps weekly_commit integration');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('All guild core tests passed.');