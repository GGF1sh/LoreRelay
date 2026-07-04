#!/usr/bin/env node
'use strict';

/**
 * Replay GM source timeline — excluded GM entries must not shift chapter/dice alignment.
 */

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'replayExportCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!fs.existsSync(corePath)) {
    fail('out/replayExportCore.js missing — run npm run compile first');
    process.exit(1);
}

const { buildReplayMarkdown, buildReplayHtml } = require(corePath);

const entries = [
    { id: 'gm1', role: 'gm', sender: 'GM', content: 'Visible chapter one.' },
    { id: 'gm2', role: 'gm', sender: 'GM', content: 'Hidden middle GM.', excludedFromPrompt: true },
    { id: 'gm3', role: 'gm', sender: 'GM', content: 'Visible chapter three.' },
];

const chapters = [
    { index: 0, title: 'Chapter One', events: [{ worldTurn: 1, gmTurn: 1, kind: 'milestone', text: 'Start' }] },
    { index: 1, title: 'Chapter Two', events: [{ worldTurn: 2, gmTurn: 2, kind: 'milestone', text: 'Middle' }] },
    { index: 2, title: 'Chapter Three', events: [{ worldTurn: 3, gmTurn: 3, kind: 'milestone', text: 'End' }] },
];

const journalTurns = [
    { diceLedger: [{ formula: '1d6', rolls: [1], modifier: 0, total: 1 }] },
    { diceLedger: [{ formula: '1d6', rolls: [2], modifier: 0, total: 2 }] },
    { diceLedger: [{ formula: '1d6', rolls: [3], modifier: 0, total: 3 }] },
];

const baseOptions = {
    format: 'markdown',
    includeImages: false,
    includeGm: true,
    includeDice: true,
};

function assertTimelineAlignment(md, label) {
    const gm1Idx = md.indexOf('Visible chapter one.');
    const gm3Idx = md.indexOf('Visible chapter three.');
    const ch1Idx = md.indexOf('## Chapter One');
    const ch2Idx = md.indexOf('## Chapter Two');
    const ch3Idx = md.indexOf('## Chapter Three');
    const dice1Idx = md.indexOf('1d6 → 1');
    const dice2Idx = md.indexOf('1d6 → 2');
    const dice3Idx = md.indexOf('1d6 → 3');

    if (md.includes('Hidden middle GM.')) {
        fail(`${label}: excluded GM content leaked`);
    } else if (ch2Idx !== -1) {
        fail(`${label}: chapter two from excluded GM turn should not appear`);
    } else if (ch1Idx === -1 || ch3Idx === -1) {
        fail(`${label}: visible chapter headings missing`);
    } else if (ch1Idx > gm1Idx) {
        fail(`${label}: chapter one should precede GM1 content`);
    } else if (ch3Idx > gm3Idx) {
        fail(`${label}: chapter three should precede GM3 content`);
    } else if (dice2Idx !== -1) {
        fail(`${label}: dice from excluded GM turn 2 should not appear`);
    } else if (dice1Idx === -1 || dice3Idx === -1) {
        fail(`${label}: dice blocks for turns 1 and 3 missing`);
    } else if (dice1Idx < gm1Idx || dice1Idx > gm3Idx) {
        fail(`${label}: turn 1 dice should attach near GM1`);
    } else if (dice3Idx < gm3Idx) {
        fail(`${label}: turn 3 dice should attach after GM3 content start`);
    } else {
        ok(`${label}: GM source timeline aligned after excluded GM turn`);
    }
}

{
    const md = buildReplayMarkdown({
        entries,
        chapters,
        journalTurns,
        options: baseOptions,
        title: 'GM Timeline',
    });
    assertTimelineAlignment(md, 'markdown');
}

{
    const html = buildReplayHtml({
        entries,
        chapters,
        journalTurns,
        options: { ...baseOptions, format: 'html' },
        title: 'GM Timeline',
    });
    if (html.includes('Hidden middle GM.')) {
        fail('html: excluded GM content leaked');
    } else if (html.includes('<h2>Chapter Two</h2>')) {
        fail('html: chapter two from excluded GM turn should not appear');
    } else if (!html.includes('<h2>Chapter One</h2>') || !html.includes('<h2>Chapter Three</h2>')) {
        fail('html: visible chapter headings missing');
    } else if (!html.includes('1d6 → 1') || html.includes('1d6 → 2') || !html.includes('1d6 → 3')) {
        fail('html: dice alignment wrong for excluded GM turn');
    } else {
        ok('html: GM source timeline aligned after excluded GM turn');
    }
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed.`);
    process.exit(1);
}
console.log('replay export gm timeline: all tests passed.');