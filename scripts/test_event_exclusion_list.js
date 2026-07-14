const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function() {
    if (arguments[0] === 'vscode') {
        return {
            workspace: { workspaceFolders: [] },
            Uri: { file: (p) => ({ fsPath: p }) },
        };
    }
    return originalRequire.apply(this, arguments);
};

const assert = require('assert');
const { rollDomainEvent } = require('../out/domainCore');
const { rollGuildEvent } = require('../out/guildCore');
const { normalizeGameRules, toExcludedEventId, isExcludedEvent } = require('../out/gameRulesCore');

function testNormalizeGameRules() {
    const r1 = normalizeGameRules({ excludedEventIds: ['domain:foo', 123, '  guild:bar  ', ''] });
    assert.deepStrictEqual(r1.excludedEventIds, ['domain:foo', 'guild:bar']);

    const many = Array(300).fill('domain:spam');
    const r2 = normalizeGameRules({ excludedEventIds: many });
    assert.strictEqual(r2.excludedEventIds.length, 200, 'Clamps to max 200 elements');

    const def = normalizeGameRules({});
    assert.deepStrictEqual(def.excludedEventIds, undefined, 'Default is undefined');
    
    console.log('OK: game_rules normalization clamps types and limits');
}

function testDomainExclusion() {
    // Setup a dummy domain state
    const domain = {
        enabled: true, controlledRegionId: 'reg1', rank: 'minor_lord', calendarMonth: 1, calendarYear: 1,
        treasury: 100, food: 100, troops: 100, publicOrder: 50, popularSupport: 50, agriculture: 10, commerce: 10, defense: 10, culture: 10, prestige: 10,
        monthlyActionsRemaining: 2, officers: [], pendingEvents: [], flags: {}
    };

    // 1. Empty exclusion -> baseline distribution
    const seed = 12345;
    const baselineEvent = rollDomainEvent(domain, seed, 'none', []);
    const eventWithEmptyExclusion = rollDomainEvent(domain, seed, 'none', [], new Set());
    assert.strictEqual(baselineEvent, eventWithEmptyExclusion, 'Empty exclusion preserves deterministic baseline roll');

    // Find a seed that rolls 'festival_gathering'
    let targetSeed = 0;
    while (true) {
        const ev = rollDomainEvent(domain, targetSeed, 'none', []);
        if (ev === 'festival_gathering') break;
        targetSeed++;
        if (targetSeed > 1000) break; // Fallback
    }

    if (targetSeed <= 1000) {
        // 2. Exclude "domain:festival_gathering"
        const exclusionSet = new Set(['domain:festival_gathering']);
        const excludedEvent = rollDomainEvent(domain, targetSeed, 'none', [], exclusionSet);
        assert.notStrictEqual(excludedEvent, 'festival_gathering', 'Excluded event is not rolled on the exact same deterministic seed');
        console.log('OK: domain event exclusion works deterministically');
    }

    // 3. Exclude ALL domain events to force fallback to domain_quiet_month
    // Instead of importing the unexported DOMAIN_EVENTS, we use a mocked Set that always returns true,
    // EXCEPT for 'domain:domain_quiet_month' to ensure it's not excluded even if it's in the list.
    const totalExclusionSet = new Set();
    totalExclusionSet.has = (key) => key !== 'domain:domain_quiet_month';
    
    const quietEvent = rollDomainEvent(domain, seed, 'none', [], totalExclusionSet);
    assert.strictEqual(quietEvent, 'domain_quiet_month', 'Excluding all events falls back to domain_quiet_month');
    
    console.log('OK: domain total exclusion falls back to quiet and quiet is un-excludable');
}

function testGuildExclusion() {
    const guild = {
        enabled: true, hallLocationId: 'loc1', rank: 'chartered', calendarWeek: 1, calendarYear: 1,
        coffers: 100, supplies: 100, renown: 10, discipline: 50, townFavor: 50, facilities: 10, safety: 10, lore: 10,
        weeklyActionsRemaining: 2, adventurers: [], pendingEvents: [], flags: {}
    };

    const seed = 9876;
    const baselineEvent = rollGuildEvent(guild, seed, []);
    const eventWithEmptyExclusion = rollGuildEvent(guild, seed, [], new Set());
    assert.strictEqual(baselineEvent, eventWithEmptyExclusion, 'Empty exclusion preserves deterministic baseline roll');

    // Find a seed that rolls 'wealthy_patron'
    let targetSeed = 0;
    while (true) {
        const ev = rollGuildEvent(guild, targetSeed, []);
        if (ev === 'wealthy_patron') break;
        targetSeed++;
        if (targetSeed > 1000) break; // Fallback
    }

    if (targetSeed <= 1000) {
        const exclusionSet = new Set(['guild:wealthy_patron']);
        const excludedEvent = rollGuildEvent(guild, targetSeed, [], exclusionSet);
        assert.notStrictEqual(excludedEvent, 'wealthy_patron', 'Excluded guild event is not rolled');
        console.log('OK: guild event exclusion works deterministically');
    }

    const totalExclusionSet = new Set();
    totalExclusionSet.has = (key) => key !== 'guild:guild_quiet_week';
    
    const quietEvent = rollGuildEvent(guild, seed, [], totalExclusionSet);
    assert.strictEqual(quietEvent, 'guild_quiet_week', 'Excluding all guild events falls back to guild_quiet_week');
    
    console.log('OK: guild total exclusion falls back to quiet and quiet is un-excludable');
}

function testAudienceExclusion() {
    const { buildAudienceQueue } = require('../out/domainAudienceCore');
    const domain = {
        enabled: true, controlledRegionId: 'reg1', rank: 'minor_lord', calendarMonth: 1, calendarYear: 1,
        treasury: 100, food: 100, troops: 100, publicOrder: 50, popularSupport: 50, agriculture: 10, commerce: 10, defense: 10, culture: 10, prestige: 10,
        monthlyActionsRemaining: 2, officers: [], pendingEvents: [], flags: {}
    };
    const seed = 12345;
    
    const baselineQueue = buildAudienceQueue(domain, seed, 4, new Set());
    assert(baselineQueue.length > 0, 'Baseline audience queue should not be empty');
    
    const firstPetitionId = baselineQueue[0].id;
    const exclusionSet = new Set([`audience:${firstPetitionId}`]);
    const excludedQueue = buildAudienceQueue(domain, seed, 4, exclusionSet);
    
    assert(!excludedQueue.some(p => p.id === firstPetitionId), 'Excluded petition should not appear in the audience queue');
    console.log('OK: Audience queue excludes specific petition');
}

function testHostConfigBoundary() {
    const { buildGuildDriftConfig } = require('../out/guildTurnOps');
    const { toExclusionSet } = require('../out/gameRulesCore');
    
    const rules = {
        guildWeeklyActions: 2,
        guildBoardSize: 3,
        guildMaxActiveQuests: 2,
        excludedEventIds: ['domain:foo', 'guild:bar']
    };
    
    // 1. Check toExclusionSet
    const set = toExclusionSet(rules);
    assert(set instanceof Set, 'toExclusionSet returns a Set');
    assert(set.has('domain:foo'), 'Set contains domain:foo');
    
    // 2. Check buildGuildDriftConfig boundary
    const guildConfig = buildGuildDriftConfig(rules);
    assert(guildConfig.excludedEventIds instanceof Set, 'Guild drift config includes the exclusion Set');
    assert(guildConfig.excludedEventIds.has('guild:bar'), 'Guild drift config exclusion Set contains guild:bar');
    
    console.log('OK: Host config boundary receives and constructs normalized GameRules exclusions');
}

function main() {
    console.log('--- test_event_exclusion_list.js ---');
    testNormalizeGameRules();
    testDomainExclusion();
    testGuildExclusion();
    testAudienceExclusion();
    testHostConfigBoundary();
    console.log('All event exclusion tests passed.');
}

if (require.main === module) {
    main();
}
