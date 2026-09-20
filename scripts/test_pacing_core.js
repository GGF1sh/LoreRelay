#!/usr/bin/env node
'use strict';

const path = require('path');
const root = path.join(__dirname, '..');
const beatPath = path.join(root, 'out', 'journalBeatCore.js');
const pacingPath = path.join(root, 'out', 'pacingCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [beatPath, pacingPath]) {
    if (!require('fs').existsSync(p)) {
        fail(`${p} missing — run npm run compile first`);
        process.exit(1);
    }
}

const { classifyTurnBeat } = require(beatPath);
const {
    analyzeRecentPacing,
    resolvePacingHint,
    buildPacingHintLine,
    DEFAULT_PACING_DOMINANCE_THRESHOLD,
} = require(pacingPath);

{
    const combat = classifyTurnBeat({
        diceLedger: [{ formula: '1d20', rolls: [12], modifier: 0, total: 12, reason: 'attack goblin' }],
        statePatch: [{ op: 'replace', path: '/status/hp/current', value: 8 }]
    });
    if (combat !== 'combat') {
        fail(`combat beat expected, got ${combat}`);
    } else {
        ok('classify combat');
    }
}

{
    const travel = classifyTurnBeat({
        elapsedWorldTurns: 2,
        statePatch: [{ op: 'replace', path: '/world/currentLocationId', value: 'inn' }]
    });
    if (travel !== 'travel') {
        fail(`travel beat expected, got ${travel}`);
    } else {
        ok('classify travel');
    }
}

{
    const social = classifyTurnBeat({ playerAction: '店員に話しかける' });
    if (social !== 'social') {
        fail(`social beat expected, got ${social}`);
    } else {
        ok('classify social');
    }
}

{
    const turns = Array.from({ length: 5 }, () => ({
        diceLedger: [{ formula: '1d20', rolls: [10], modifier: 0, total: 10, reason: 'attack' }]
    }));
    const window = analyzeRecentPacing(turns, 5);
    if (window.dominant !== 'combat' || window.ratio < 0.99) {
        fail(`combat dominance expected, got ${window.dominant} ${window.ratio}`);
    } else {
        ok('analyze combat dominance');
    }
    const hint = resolvePacingHint(window, DEFAULT_PACING_DOMINANCE_THRESHOLD);
    if (!hint || hint.beat !== 'combat') {
        fail('resolve pacing hint for combat skew');
    } else {
        ok('resolve pacing hint');
    }
}

{
    const mixed = [
        { playerAction: 'rest at camp' },
        { playerAction: 'talk to merchant' },
        { playerAction: 'look around' },
        { playerAction: 'ask about rumors' },
        { playerAction: 'greet the guard' }
    ];
    const window = analyzeRecentPacing(mixed, 5);
    const hint = resolvePacingHint(window, DEFAULT_PACING_DOMINANCE_THRESHOLD);
    if (hint) {
        fail('balanced window should not resolve hint');
    } else {
        ok('threshold suppresses balanced window');
    }
}

{
    const line = buildPacingHintLine(
        analyzeRecentPacing(Array(4).fill({
            diceLedger: [{ formula: '1d20', rolls: [10], modifier: 0, total: 10, reason: 'attack' }]
        }), 4),
        0.75,
        (beat) => `Hint for ${beat}`
    );
    if (!line.startsWith('[Director — Pacing]') || !line.includes('combat')) {
        fail(`buildPacingHintLine format: ${line}`);
    } else {
        ok('buildPacingHintLine');
    }
}

{
    const empty = buildPacingHintLine(analyzeRecentPacing([], 5), 0.8, () => 'x');
    if (empty !== '') {
        fail('empty journal => empty hint line');
    } else {
        ok('empty journal => empty hint');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('All pacing core tests passed.');