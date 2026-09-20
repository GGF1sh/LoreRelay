#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const root = path.join(__dirname, '..');
const srcFiles = [path.join(root, 'src', 'parlorBackgroundCore.ts')];
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parlor-bg-'));

function resolveTsc() {
    const local = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
    if (fs.existsSync(local)) { return [process.execPath, [local]]; }
    return ['npx', ['tsc']];
}
const [cmd, baseArgs] = resolveTsc();
const args = baseArgs.concat(srcFiles, '--outDir', outDir, '--module', 'commonjs', '--target', 'ES2020', '--strict', '--skipLibCheck');
const useShell = cmd === 'npx' && process.platform === 'win32';
if (spawnSync(cmd, args, { stdio: 'inherit', shell: useShell }).status !== 0) {
    console.error('FAIL: parlorBackgroundCore compile');
    process.exit(1);
}

const core = require(path.join(outDir, 'parlorBackgroundCore.js'));
const {
    isParlorBackgroundFilename,
    backgroundIdFromFilename,
    listParlorBackgroundEntries,
} = core;

let failed = 0;
function ok(m) { console.log(`OK: ${m}`); }
function fail(m) { console.error(`FAIL: ${m}`); failed++; }

{
    if (isParlorBackgroundFilename('tavern.png') && !isParlorBackgroundFilename('../evil.png')) { ok('filename guard'); }
    else { fail('filename guard'); }
}

{
    const id = backgroundIdFromFilename('Cozy Tavern.png');
    if (id && /^[a-zA-Z0-9_-]+$/.test(id)) { ok('id from filename'); }
    else { fail(`id from filename (${id})`); }
}

{
    const entries = listParlorBackgroundEntries(['a.png', 'b.jpg', 'notes.txt', '../x.png']);
    if (entries.length === 2 && entries[0].filename === 'a.png') { ok('list entries'); }
    else { fail(`list entries (${entries.length})`); }
}

{
    const dup = listParlorBackgroundEntries(['scene.png', 'scene.jpeg']);
    const ids = dup.map((e) => e.id);
    if (ids[0] !== ids[1]) { ok('dedupe ids'); }
    else { fail('dedupe ids'); }
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed`);
    process.exit(1);
}
console.log('\nAll parlorBackgroundCore tests passed');