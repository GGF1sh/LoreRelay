#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const root = path.join(__dirname, '..');
const srcFiles = [
    path.join(root, 'src', 'connectionProfileCore.ts'),
    path.join(root, 'src', 'archivePrompt.ts'),
];
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conn-profile-'));

function resolveTsc() {
    const local = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
    if (fs.existsSync(local)) { return [process.execPath, [local]]; }
    return ['npx', ['tsc']];
}
const [cmd, baseArgs] = resolveTsc();
const args = baseArgs.concat(srcFiles, '--outDir', outDir, '--module', 'commonjs', '--target', 'ES2020', '--strict', '--skipLibCheck');
const useShell = cmd === 'npx' && process.platform === 'win32';
if (spawnSync(cmd, args, { stdio: 'inherit', shell: useShell }).status !== 0) {
    console.error('FAIL: connectionProfileCore compile');
    process.exit(1);
}

const core = require(path.join(outDir, 'connectionProfileCore.js'));
const {
    parseConnectionProfiles,
    getActiveConnectionProfile,
    setActiveConnectionProfileId,
    DEFAULT_CONNECTION_PROFILES,
} = core;

let failed = 0;
function ok(m) { console.log(`OK: ${m}`); }
function fail(m) { console.error(`FAIL: ${m}`); failed++; }

{
    const file = parseConnectionProfiles(undefined);
    if (file.profiles.length === 3 && file.activeId === 'vscode-lm-default') { ok('defaults'); }
    else { fail('defaults'); }
}

{
    const file = parseConnectionProfiles({
        profiles: [{ id: 'custom', label: 'Custom', provider: 'clipboard' }],
        activeId: 'custom',
    });
    if (file.profiles.length === 1 && file.activeId === 'custom') { ok('parse custom'); }
    else { fail('parse custom'); }
}

{
    const file = parseConnectionProfiles({
        profiles: [{ id: 'bad id', label: 'X', provider: 'clipboard' }],
        activeId: 'bad id',
    });
    if (file.profiles.length === 3) { ok('reject bad id'); }
    else { fail('reject bad id'); }
}

{
    const base = parseConnectionProfiles(undefined);
    const active = getActiveConnectionProfile(base);
    if (active.provider === 'vscode-lm') { ok('active profile'); }
    else { fail('active profile'); }
}

{
    const base = parseConnectionProfiles(undefined);
    const next = setActiveConnectionProfileId(base, 'clipboard-gemini');
    if (next.activeId === 'clipboard-gemini') { ok('set active'); }
    else { fail('set active'); }
}

{
    const base = parseConnectionProfiles(undefined);
    const next = setActiveConnectionProfileId(base, 'nonexistent');
    if (next.activeId === base.activeId) { ok('ignore invalid active'); }
    else { fail('ignore invalid active'); }
}

{
    if (DEFAULT_CONNECTION_PROFILES.profiles.some((p) => p.id === 'grok-build')) { ok('grok preset'); }
    else { fail('grok preset'); }
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed`);
    process.exit(1);
}
console.log('\nAll connectionProfileCore tests passed');