#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const root = path.join(__dirname, '..');
const srcFiles = [path.join(root, 'src', 'personaCore.ts')];
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'persona-core-'));

function resolveTsc() {
    const local = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
    if (fs.existsSync(local)) { return [process.execPath, [local]]; }
    return ['npx', ['tsc']];
}
const [cmd, baseArgs] = resolveTsc();
const args = baseArgs.concat(srcFiles, '--outDir', outDir, '--module', 'commonjs', '--target', 'ES2020', '--strict', '--skipLibCheck');
const useShell = cmd === 'npx' && process.platform === 'win32';
if (spawnSync(cmd, args, { stdio: 'inherit', shell: useShell }).status !== 0) {
    console.error('FAIL: personaCore compile');
    process.exit(1);
}

const core = require(path.join(outDir, 'personaCore.js'));
const {
    parsePlayerPersona,
    buildParlorPersonaContext,
    MAX_PERSONA_FIELD_CHARS,
} = core;

let failed = 0;
function ok(m) { console.log(`OK: ${m}`); }
function fail(m) { console.error(`FAIL: ${m}`); failed++; }

{
    const p = parsePlayerPersona(null);
    if (p.version === 1 && !p.name) { ok('empty persona'); }
    else { fail('empty persona'); }
}

{
    const p = parsePlayerPersona({
        name: '  Alice  ',
        description: 'Traveler',
        speakingStyle: 'Polite',
    });
    if (p.name === 'Alice' && p.description === 'Traveler') { ok('parse fields'); }
    else { fail('parse fields'); }
}

{
    const long = 'x'.repeat(MAX_PERSONA_FIELD_CHARS + 500);
    const p = parsePlayerPersona({ description: long });
    if (p.description && p.description.length === MAX_PERSONA_FIELD_CHARS) { ok('clamp field'); }
    else { fail(`clamp field (${p.description?.length})`); }
}

{
    const ctx = buildParlorPersonaContext({ version: 1, name: 'Bob' }, 'en');
    if (ctx.includes('BEGIN PLAYER PERSONA') && ctx.includes('Name: Bob')) { ok('persona context en'); }
    else { fail('persona context en'); }
}

{
    const ctx = buildParlorPersonaContext({ version: 1 }, 'ja');
    if (ctx === '') { ok('empty context'); }
    else { fail('empty context'); }
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed`);
    process.exit(1);
}
console.log('\nAll personaCore tests passed');