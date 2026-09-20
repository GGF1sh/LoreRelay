#!/usr/bin/env node
'use strict';

const path = require('path');
const root = path.join(__dirname, '..');
const journalPath = path.join(root, 'out', 'chronicleJournalCore.js');
const corePath = path.join(root, 'out', 'chronicleCore.js');
const promptPath = path.join(root, 'out', 'gmPromptBuilderCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [journalPath, corePath, promptPath]) {
    if (!require('fs').existsSync(p)) {
        fail(`${p} missing — run npm run compile first`);
        process.exit(1);
    }
}

const {
    parseJournalLine,
    parseJournalNdjsonContent,
} = require(journalPath);
const {
    buildChronicle,
    buildChronicleRecap,
    shouldInjectChronicle,
    resolveChronicleSourceTurn,
    CHAPTER_ELAPSED_JUMP,
} = require(corePath);
const { buildChronicleRecapLine } = require(promptPath);

{
    const bad = parseJournalLine('{not json');
    if (bad !== undefined) {
        fail('invalid json should be undefined');
    } else {
        ok('invalid json skipped');
    }
}

{
    const line = JSON.stringify({
        turnId: 't1',
        resolvedQuests: ['qh_1'],
        elapsedWorldTurns: CHAPTER_ELAPSED_JUMP,
        cartographyReveal: { regions: [{ regionId: 'north_marsh', strength: 'discovered' }] },
        statePatch: [{ op: 'replace', path: '/world/currentLocationId', value: 'inn' }],
        diceLedger: [{ formula: '1d20+3', rolls: [15], modifier: 3, total: 18, reason: 'attack goblin' }]
    });
    const turns = parseJournalNdjsonContent(`${line}\n\n{broken\n${line}`);
    if (turns.length !== 2) {
        fail(`expected 2 valid turns, got ${turns.length}`);
    } else {
        ok('skips blank and broken lines');
    }
}

{
    const chapters = buildChronicle({
        journalTurns: [
            { resolvedQuests: ['qh_1'], statePatch: [{ op: 'replace', path: '/director/scene', value: 'Prologue' }] },
            { elapsedWorldTurns: CHAPTER_ELAPSED_JUMP },
            { statePatch: [{ op: 'replace', path: '/director/scene', value: 'Act II' }] }
        ],
        questHooks: [{ id: 'qh_1', title: 'Find the Key', description: 'd', source: 'event', relatedId: 'ev', status: 'completed', turnGenerated: 1 }],
        recentChanges: [{
            id: 'wce_2_food',
            worldTurn: 2,
            source: 'simulation',
            category: 'resource',
            severity: 'warning',
            message: 'Food reserves are low'
        }],
        regionNames: { north_marsh: 'North Marsh' }
    });
    if (!Array.isArray(chapters) || chapters.length < 2) {
        fail(`expected >=2 chapters, got ${chapters?.length}`);
    } else {
        ok('chapter split on elapsed jump and scene change');
    }
    const questEvent = chapters.flatMap((c) => c.events).find((e) => e.kind === 'quest');
    if (!questEvent || !questEvent.text.includes('Find the Key')) {
        fail('quest title resolved from questHooks');
    } else {
        ok('quest event uses hook title');
    }
}

{
    const recap = buildChronicleRecap(buildChronicle({
        journalTurns: Array.from({ length: 8 }, (_, i) => ({
            statePatch: [{ op: 'replace', path: '/world/currentLocationId', value: `loc_${i}` }]
        }))
    }), 3, 120);
    const lines = recap.split('\n').filter(Boolean);
    if (lines.length > 3) {
        fail(`recap line cap failed: ${lines.length}`);
    } else if (recap.length > 120) {
        fail(`recap char cap failed: ${recap.length}`);
    } else {
        ok('recap respects line and char caps');
    }
}

{
    if (buildChronicleRecap([], 5, 800) !== '') {
        fail('empty chapters => empty recap');
    } else {
        ok('empty chapters => empty recap');
    }
}

{
    const line = buildChronicleRecapLine('Line one\nLine two');
    if (!line.startsWith('[Previously]') || !line.includes('Line one')) {
        fail('buildChronicleRecapLine format');
    } else {
        ok('buildChronicleRecapLine format');
    }
}

{
    if (!shouldInjectChronicle(3, 3, false)) {
        ok('no inject when already acked and not session pending');
    } else {
        fail('should not inject when acked');
    }
    if (!shouldInjectChronicle(3, 3, true)) {
        fail('should inject on session pending');
    } else {
        ok('inject on session pending');
    }
    if (resolveChronicleSourceTurn(4) !== 4) {
        fail('resolveChronicleSourceTurn');
    } else {
        ok('resolveChronicleSourceTurn');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('All chronicle core tests passed.');