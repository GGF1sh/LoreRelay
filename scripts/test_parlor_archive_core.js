#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const root = path.join(__dirname, '..');
const srcFiles = [
    path.join(root, 'src', 'characterId.ts'),
    path.join(root, 'src', 'parlorSessionCore.ts'),
    path.join(root, 'src', 'parlorArchiveCore.ts'),
];
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parlor-archive-'));

function resolveTsc() {
    const local = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
    if (fs.existsSync(local)) { return [process.execPath, [local]]; }
    return ['npx', ['tsc']];
}
const [cmd, baseArgs] = resolveTsc();
const args = baseArgs.concat(srcFiles, '--outDir', outDir, '--module', 'commonjs', '--target', 'ES2020', '--strict', '--skipLibCheck');
const useShell = cmd === 'npx' && process.platform === 'win32';
if (spawnSync(cmd, args, { stdio: 'inherit', shell: useShell }).status !== 0) {
    console.error('FAIL: parlorArchiveCore compile');
    process.exit(1);
}

const sessionCore = require(path.join(outDir, 'parlorSessionCore.js'));
const archive = require(path.join(outDir, 'parlorArchiveCore.js'));
const { createEmptyParlorSession, appendParlorMessage, MAX_PARLOR_MESSAGES } = sessionCore;
const {
    extractParlorArchiveBatch,
    mergeParlorSessionSummary,
    parseParlorArchiveLine,
    serializeParlorArchiveRecord,
} = archive;

let failed = 0;
function ok(m) { console.log(`OK: ${m}`); }
function fail(m) { console.error(`FAIL: ${m}`); failed++; }

{
    let session = createEmptyParlorSession('elda');
    session.messages = [];
    for (let i = 0; i < MAX_PARLOR_MESSAGES + 5; i++) {
        session.messages.push({
            id: `m${i}`,
            role: 'user',
            content: `msg-${i}`,
            createdAt: '2026-07-03T00:00:00.000Z',
        });
    }
    const { session: compacted, archived } = extractParlorArchiveBatch(session);
    if (archived.length >= 50 && compacted.messages.length <= MAX_PARLOR_MESSAGES) { ok('archive batch'); }
    else { fail(`archive batch (archived=${archived.length}, kept=${compacted.messages.length})`); }
}

{
    const merged = mergeParlorSessionSummary('old', 'new delta');
    if (merged && merged.includes('old') && merged.includes('new delta')) { ok('merge summary'); }
    else { fail('merge summary'); }
}

{
    const line = serializeParlorArchiveRecord({
        archivedAt: '2026-07-03T00:00:00.000Z',
        activeCharacterId: 'elda',
        messages: [{ id: 'a1', role: 'user', content: 'hi', createdAt: 't' }],
    });
    const parsed = parseParlorArchiveLine(line);
    if (parsed && parsed.messages.length === 1) { ok('archive roundtrip'); }
    else { fail('archive roundtrip'); }
}

if (failed > 0) {
    process.exit(1);
}
console.log('All parlor archive core tests passed.');