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
    path.join(root, 'src', 'parlorDemoteCore.ts'),
];
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parlor-demote-'));

function resolveTsc() {
    const local = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
    if (fs.existsSync(local)) { return [process.execPath, [local]]; }
    return ['npx', ['tsc']];
}
const [cmd, baseArgs] = resolveTsc();
const args = baseArgs.concat(srcFiles, '--outDir', outDir, '--module', 'commonjs', '--target', 'ES2020', '--strict', '--skipLibCheck');
const useShell = cmd === 'npx' && process.platform === 'win32';
if (spawnSync(cmd, args, { stdio: 'inherit', shell: useShell }).status !== 0) {
    console.error('FAIL: parlorDemoteCore compile');
    process.exit(1);
}

const demote = require(path.join(outDir, 'parlorDemoteCore.js'));
const { mapCampaignEntriesToParlorMessages, mergeImportedParlorMessages } = demote;

let failed = 0;
function ok(m) { console.log(`OK: ${m}`); }
function fail(m) { console.error(`FAIL: ${m}`); failed++; }

{
    const imported = mapCampaignEntriesToParlorMessages([
        { id: 'u1', role: 'user', content: 'I look around' },
        { id: 'g1', role: 'gm', content: 'The harbor is foggy.' },
        { id: 'x1', role: 'system', content: 'ignored' },
    ], { characterId: 'elda', maxMessages: 10 });
    if (imported.length === 2 && imported[0].role === 'user' && imported[1].role === 'assistant') { ok('demote map'); }
    else { fail(`demote map (${imported.length})`); }
}

{
    const merged = mergeImportedParlorMessages(
        [{ id: 'existing', role: 'user', content: 'a', createdAt: 't' }],
        [{ id: 'existing', role: 'user', content: 'dup', createdAt: 't' }, { id: 'new', role: 'assistant', content: 'b', createdAt: 't' }]
    );
    if (merged.length === 2) { ok('merge dedupe'); }
    else { fail(`merge dedupe (${merged.length})`); }
}

if (failed > 0) {
    process.exit(1);
}
console.log('All parlor demote core tests passed.');