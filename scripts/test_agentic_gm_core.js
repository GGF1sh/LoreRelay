#!/usr/bin/env node
/**
 * Unit tests for agenticGmCore.ts (Phase 9A split-role GM).
 */
'use strict';

const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'agenticGmCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!require('fs').existsSync(corePath)) {
    fail('out/agenticGmCore.js missing — run npm run compile first');
    process.exit(1);
}

const {
    parseRefereeResultJson,
    parseNarratorResultJson,
    mergeAgenticTurnResult,
    mergeAgenticMedia,
    buildFallbackNarration,
} = require(corePath);

const { MAX_ENTRY_CONTENT_LEN } = require(path.join(root, 'out', 'gameStateSanitize.js'));

const refereeJson = {
    turnId: 'turn-9',
    playerAction: 'Search the ruins',
    statePatch: [{ op: 'replace', path: '/mood', value: 'tense' }],
    resolvedQuests: ['quest_event_wce_1_region_r1'],
    media: { bgm: 'dungeon_theme' },
    refereeNotes: 'The ruins feel unstable.',
};

const narratorJson = {
    narration: 'Dust swirls as you step into the broken hall.',
    gmEntry: { imagePrompt: 'ruined stone hall' },
    media: { mood: 'ominous', sfx: ['wind'] },
    triggeredLore: ['lore:ruins'],
    statePatch: [{ op: 'replace', path: '/status/hp/current', value: 0 }],
    diceLedger: [{ formula: '1d20', rolls: [1], modifier: 0, total: 1 }],
    resolvedQuests: ['quest_should_not_apply'],
};

{
    const referee = parseRefereeResultJson(JSON.stringify(refereeJson));
    if (!referee || referee.turnId !== 'turn-9') {
        fail('parse referee JSON');
    } else {
        ok('parse referee JSON');
    }

    const narrator = parseNarratorResultJson(JSON.stringify(narratorJson));
    if (!narrator || !narrator.narration.includes('broken hall')) {
        fail('parse narrator JSON');
    } else {
        ok('parse narrator JSON');
    }

    const merged = mergeAgenticTurnResult({
        playerAction: 'Search the ruins',
        referee: referee,
        narrator,
        fallbackNarration: 'fallback',
    });
    if (!merged.ok || !merged.result) {
        fail('merge success path');
    } else {
        ok('merge success path');
    }

    const result = merged.result;
    if (result.statePatch?.[0]?.path !== '/mood') {
        fail('statePatch comes from referee');
    } else {
        ok('statePatch comes from referee');
    }

    if (result.resolvedQuests?.[0] !== 'quest_event_wce_1_region_r1') {
        fail('resolvedQuests comes from referee');
    } else {
        ok('resolvedQuests comes from referee');
    }

    if (result.narration !== narrator.narration) {
        fail('narration comes from narrator');
    } else {
        ok('narration comes from narrator');
    }

    if (result.media?.bgm !== 'dungeon_theme' || result.media?.mood !== 'ominous') {
        fail('media merge preserves referee and overlays narrator');
    } else {
        ok('media merge preserves referee and overlays narrator');
    }
}

{
    const referee = parseRefereeResultJson(JSON.stringify(refereeJson));
    const merged = mergeAgenticTurnResult({
        playerAction: 'act',
        referee: referee,
        narrator: null,
        fallbackNarration: buildFallbackNarration(referee),
    });
    if (!merged.ok || !merged.result?.narration.includes('unstable')) {
        fail('narrator failure uses fallback narration');
    } else {
        ok('narrator failure uses fallback narration');
    }
    if (!merged.result.agentic?.refereeOk || merged.result.agentic?.narratorOk) {
        fail('agentic metadata flags narrator failure');
    } else {
        ok('agentic metadata flags narrator failure');
    }
}

{
    const bad = parseRefereeResultJson(JSON.stringify({ turnId: 'bad id' }));
    if (bad !== null) {
        fail('reject invalid referee turnId');
    } else {
        ok('reject invalid referee turnId');
    }

    const mergeBad = mergeAgenticTurnResult({
        playerAction: 'x',
        referee: { turnId: 'bad id' },
        narrator: null,
        fallbackNarration: 'fallback',
    });
    if (mergeBad.ok) {
        fail('merge rejects invalid referee turnId');
    } else {
        ok('merge rejects invalid referee turnId');
    }
}

{
    const longNarration = 'x'.repeat(MAX_ENTRY_CONTENT_LEN + 500);
    const narrator = parseNarratorResultJson(JSON.stringify({ narration: longNarration }));
    if (!narrator || narrator.narration.length !== MAX_ENTRY_CONTENT_LEN) {
        fail('oversized narrator text is clamped');
    } else {
        ok('oversized narrator text is clamped');
    }
}

{
    const media = mergeAgenticMedia({ bgm: 'keep_me' }, { mood: 'dark' });
    if (media?.bgm !== 'keep_me' || media?.mood !== 'dark') {
        fail('mergeAgenticMedia keeps referee media');
    } else {
        ok('mergeAgenticMedia keeps referee media');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('agenticGmCore: all tests passed.');