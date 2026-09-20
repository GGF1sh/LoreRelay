#!/usr/bin/env node
'use strict';

const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'replayExportCore.js');
const pathsPath = path.join(root, 'out', 'replayExportPathsCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [corePath, pathsPath]) {
    if (!require('fs').existsSync(p)) {
        fail(`${p} missing — run npm run compile first`);
        process.exit(1);
    }
}

const {
    buildReplayMarkdown,
    buildReplayHtml,
    buildReplayDocument,
    formatMarkdownImageRef,
} = require(corePath);
const {
    sanitizeReplayExportFilename,
    resolveReplayExportPath,
    relativeImagePathFromExport,
    isPathUnderWorkspaceExports,
} = require(pathsPath);

const sampleEntries = [
    { id: '1', role: 'user', sender: 'Alice', content: 'Hello?' },
    { id: '2', role: 'gm', sender: 'GM', content: 'Welcome to the dungeon.' },
    { id: '3', role: 'user', sender: 'Alice', content: 'secret ooc', excludedFromPrompt: true },
    { id: '4', role: 'gm', sender: 'GM', content: 'A door creaks.', rawImagePath: 'images/scene1.png' },
];

const sampleChapters = [
    {
        index: 0,
        title: 'Prologue',
        events: [{ worldTurn: 1, gmTurn: 1, kind: 'milestone', text: 'Start' }],
    },
    {
        index: 1,
        title: 'Act II',
        events: [{ worldTurn: 5, gmTurn: 2, kind: 'milestone', text: 'Door' }],
    },
];

const baseOptions = {
    format: 'markdown',
    includeImages: true,
    includeGm: true,
    includeDice: false,
};

{
    const md = buildReplayMarkdown({
        entries: sampleEntries,
        chapters: sampleChapters,
        options: baseOptions,
        title: 'Test Replay',
    });
    if (!md.includes('## Prologue')) {
        fail('chapter heading missing for gm turn 1');
    } else if (md.includes('secret ooc')) {
        fail('excludedFromPrompt entry should be omitted');
    } else if (!md.includes('Welcome to the dungeon')) {
        fail('gm content missing');
    } else {
        ok('markdown respects exclusions and chapter headings');
    }
}

{
    const mdNoGm = buildReplayMarkdown({
        entries: sampleEntries,
        chapters: sampleChapters,
        options: { ...baseOptions, includeGm: false },
        title: 'Test Replay',
    });
    if (mdNoGm.includes('Welcome to the dungeon') || mdNoGm.includes('A door creaks')) {
        fail('includeGm:false should drop gm entries');
    } else if (!mdNoGm.includes('Hello?')) {
        fail('user entries should remain when gm off');
    } else {
        ok('includeGm off');
    }
}

{
    const spaced = formatMarkdownImageRef('../images/my scene (1).png');
    if (spaced !== '![Scene](<../images/my scene (1).png>)') {
        fail(`formatMarkdownImageRef spaced: ${spaced}`);
    } else {
        ok('formatMarkdownImageRef angle brackets');
    }
}

{
    const resolveImage = (p) => (p === 'images/scene1.png' ? '../images/scene1.png' : undefined);
    const withImages = buildReplayMarkdown({
        entries: sampleEntries,
        chapters: sampleChapters,
        options: baseOptions,
        resolveRelativeImage: resolveImage,
    });
    const withoutImages = buildReplayMarkdown({
        entries: sampleEntries,
        chapters: sampleChapters,
        options: { ...baseOptions, includeImages: false },
        resolveRelativeImage: resolveImage,
    });
    if (!withImages.includes('![Scene](../images/scene1.png)')) {
        fail('image embed missing when includeImages on');
    } else if (withoutImages.includes('![Scene]')) {
        fail('image embed should be omitted when includeImages off');
    } else {
        ok('includeImages on/off');
    }
}

{
    const blocked = buildReplayMarkdown({
        entries: [
            { id: 'b1', role: 'gm', sender: 'GM', content: 'blocked img', rawImagePath: 'images/hidden.png', imageBlocked: true },
        ],
        options: baseOptions,
        resolveRelativeImage: () => '../images/hidden.png',
    });
    if (blocked.includes('![Scene]')) {
        fail('imageBlocked should skip images');
    } else {
        ok('imageBlocked respected');
    }
}

{
    const diceMd = buildReplayMarkdown({
        entries: [
            { id: 'd1', role: 'user', sender: 'P', content: 'roll' },
            { id: 'd2', role: 'gm', sender: 'GM', content: 'result' },
        ],
        journalTurns: [{ diceLedger: [{ formula: '1d20', rolls: [12], modifier: 0, total: 12, dc: 15, success: false }] }],
        options: { ...baseOptions, includeDice: true },
    });
    if (!diceMd.includes('1d20') || !diceMd.includes('Dice')) {
        fail('dice block missing when includeDice on');
    } else {
        ok('includeDice on');
    }
}

{
    const empty = buildReplayMarkdown({
        entries: [],
        options: baseOptions,
        title: 'Empty',
    });
    if (!empty.includes('No exportable entries')) {
        fail('empty log should produce placeholder');
    } else {
        ok('empty log placeholder');
    }
}

{
    const leaked = buildReplayMarkdown({
        entries: [
            {
                id: 'x1',
                role: 'gm',
                sender: 'GM',
                content: 'Leak C:\\Users\\me\\hiddenState.json',
                hiddenState: { agenda: 'do not export' },
            },
        ],
        options: baseOptions,
    });
    if (leaked.includes('C:\\Users') || leaked.includes('do not export')) {
        fail('export pipeline should sanitize narrative content');
    } else if (!leaked.includes('[path redacted]')) {
        fail('export pipeline path redaction marker');
    } else {
        ok('buildReplayMarkdown sanitizes exported content');
    }
}

{
    const html = buildReplayHtml({
        entries: sampleEntries.filter((e) => !e.excludedFromPrompt),
        chapters: sampleChapters,
        options: { ...baseOptions, format: 'html' },
        title: 'HTML Replay',
    });
    if (!html.includes('<!DOCTYPE html>') || !html.includes('<h2>Prologue</h2>')) {
        fail('html export structure');
    } else {
        ok('html self-contained document');
    }
}

{
    const doc = buildReplayDocument({
        entries: sampleEntries,
        options: { ...baseOptions, format: 'html' },
    });
    if (!doc.startsWith('<!DOCTYPE html>')) {
        fail('buildReplayDocument routes html format');
    } else {
        ok('buildReplayDocument format routing');
    }
}

{
    if (sanitizeReplayExportFilename('replay_2026.md') !== 'replay_2026.md') {
        fail('sanitize valid md filename');
    } else if (sanitizeReplayExportFilename('../evil.exe') !== undefined) {
        fail('sanitize rejects traversal');
    } else if (sanitizeReplayExportFilename('bad.txt') !== undefined) {
        fail('sanitize rejects non md/html');
    } else {
        ok('sanitizeReplayExportFilename');
    }
}

{
    const ws = path.join('C:', 'workspace');
    const resolved = resolveReplayExportPath(ws, 'replay_test.html');
    if (!resolved || !resolved.endsWith(path.join('exports', 'replay_test.html'))) {
        fail(`resolveReplayExportPath: ${resolved}`);
    } else if (!isPathUnderWorkspaceExports(resolved, ws)) {
        fail('isPathUnderWorkspaceExports should accept exports path');
    } else {
        ok('export path resolution');
    }
}

{
    const exportFile = path.join(root, 'tmp-replay-test', 'exports', 'replay.md');
    const imageFile = path.join(root, 'tmp-replay-test', 'images', 'a.png');
    const rel = relativeImagePathFromExport(exportFile, imageFile);
    if (rel !== '../images/a.png') {
        fail(`relativeImagePathFromExport: ${rel}`);
    } else {
        ok('relative image path');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('All replay export core tests passed.');