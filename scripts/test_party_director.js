#!/usr/bin/env node
/**
 * Party Director merge/validation tests (v0.7).
 */
const {
    mergePartyDirector,
    parseGameStatePartyDirector,
    parsePartyDirectorTemplate,
    validateGameStatePartyDirector,
    validatePartyDirectorFile
} = require('../out/partyDirectorCore');

let failed = 0;

function fail(msg) {
    console.error(`FAIL: ${msg}`);
    failed++;
}

function ok(msg) {
    console.log(`OK: ${msg}`);
}

const template = parsePartyDirectorTemplate({
    format: 'lorerelay-party-director/1.0',
    global: { npcBanterEnabled: true, combatQuietMode: false },
    members: {
        hero: { verbosity: 40, muted: false, forceSpeak: false, relationships: { ally: 'friend' } }
    }
});

if (!template || template.members.hero.verbosity !== 40) {
    fail('parse template');
} else {
    ok('parse template');
}

const runtime = parseGameStatePartyDirector({
    members: { hero: { verbosity: 80, forceSpeak: true } },
    notes: 'Focus on banter'
});
const merged = mergePartyDirector(template, runtime, ['hero', 'ally']);
if (!merged || merged.members.hero.verbosity !== 80 || !merged.members.hero.forceSpeak) {
    fail('runtime overrides member fields');
} else {
    ok('runtime overrides member fields');
}
if (!merged.hasRuntimeOverrides) {
    fail('detects runtime overrides');
} else {
    ok('detects runtime overrides');
}
if (merged.notes !== 'Focus on banter') {
    fail('runtime notes preserved');
} else {
    ok('runtime notes preserved');
}

const badFile = validatePartyDirectorFile({
    members: { 'bad id!': { verbosity: 50 } }
});
if (badFile.length === 0) {
    fail('reject invalid character id in file');
} else {
    ok('reject invalid character id in file');
}

const badRel = validatePartyDirectorFile({
    members: { hero: { relationships: { ally: 'unknown' } } }
});
if (badRel.length === 0) {
    fail('reject invalid relationship');
} else {
    ok('reject invalid relationship');
}

const badState = validateGameStatePartyDirector({ members: { hero: { verbosity: 200 } } });
if (badState.length === 0) {
    fail('reject out-of-range verbosity in game_state');
} else {
    ok('reject out-of-range verbosity in game_state');
}

if (failed > 0) {
    process.exit(1);
}
console.log('All party director tests passed.');