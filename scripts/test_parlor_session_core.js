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
];
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parlor-session-'));

function resolveTsc() {
    const local = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
    if (fs.existsSync(local)) { return [process.execPath, [local]]; }
    return ['npx', ['tsc']];
}
const [cmd, baseArgs] = resolveTsc();
const args = baseArgs.concat(srcFiles, '--outDir', outDir, '--module', 'commonjs', '--target', 'ES2020', '--strict', '--skipLibCheck');
const useShell = cmd === 'npx' && process.platform === 'win32';
if (spawnSync(cmd, args, { stdio: 'inherit', shell: useShell }).status !== 0) {
    console.error('FAIL: parlorSessionCore compile');
    process.exit(1);
}

const core = require(path.join(outDir, 'parlorSessionCore.js'));
const {
    appendParlorMessage,
    createEmptyParlorSession,
    parseParlorSession,
    MAX_PARLOR_MESSAGES,
    clampParlorContent,
} = core;

let failed = 0;
function ok(m) { console.log(`OK: ${m}`); }
function fail(m) { console.error(`FAIL: ${m}`); failed++; }

{
    const s = createEmptyParlorSession('elda');
    if (s.activeCharacterId === 'elda' && s.messages.length === 0) { ok('empty session'); }
    else { fail('empty session'); }
}

{
    let s = createEmptyParlorSession('elda');
    s = appendParlorMessage(s, { role: 'user', content: 'Hello' });
    if (s.messages.length === 1 && s.messages[0].role === 'user') { ok('append user'); }
    else { fail('append user'); }
}

{
    const long = 'x'.repeat(50_000);
    const clipped = clampParlorContent(long);
    if (clipped.length === 32_000) { ok('content clamp'); }
    else { fail(`content clamp (${clipped.length})`); }
}

{
    let s = createEmptyParlorSession('elda');
    for (let i = 0; i < MAX_PARLOR_MESSAGES + 5; i++) {
        s = appendParlorMessage(s, { role: 'user', content: `m${i}` });
    }
    if (s.messages.length === MAX_PARLOR_MESSAGES) { ok('message cap'); }
    else { fail(`message cap (${s.messages.length})`); }
}

{
    const parsed = parseParlorSession({ activeCharacterId: '../evil', messages: [] }, 'elda');
    if (!parsed) { ok('reject bad character id in file'); }
    else { fail('reject bad character id in file'); }
}

if (failed) {
    process.exit(1);
}
console.log('All parlor session core tests passed.');