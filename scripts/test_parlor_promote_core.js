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
    path.join(root, 'src', 'migrateGameState.ts'),
    path.join(root, 'src', 'parlorPromoteCore.ts'),
];
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parlor-promote-'));

function resolveTsc() {
    const local = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
    if (fs.existsSync(local)) { return [process.execPath, [local]]; }
    return ['npx', ['tsc']];
}
const [cmd, baseArgs] = resolveTsc();
const args = baseArgs.concat(srcFiles, '--outDir', outDir, '--module', 'commonjs', '--target', 'ES2020', '--strict', '--skipLibCheck');
const useShell = cmd === 'npx' && process.platform === 'win32';
if (spawnSync(cmd, args, { stdio: 'inherit', shell: useShell }).status !== 0) {
    console.error('FAIL: parlorPromoteCore compile');
    process.exit(1);
}

const sessionCore = require(path.join(outDir, 'parlorSessionCore.js'));
const promote = require(path.join(outDir, 'parlorPromoteCore.js'));
const {
    createEmptyParlorSession,
    appendParlorMessage,
} = sessionCore;
const {
    runParlorPromoteCore,
    mapParlorMessagesToGameEntries,
    buildParlorSafeGameRules,
    sanitizePromotedGameState,
} = promote;

let validateGameState;
try {
    const validatePath = path.join(root, 'out', 'validateGameState.js');
    if (fs.existsSync(validatePath)) {
        validateGameState = require(validatePath).validateGameState;
    }
} catch { /* optional */ }

let failed = 0;
function ok(m) { console.log(`OK: ${m}`); }
function fail(m) { console.error(`FAIL: ${m}`); failed++; }

{
    let session = createEmptyParlorSession('elda');
    session = appendParlorMessage(session, { role: 'user', content: 'Hello' });
    session = appendParlorMessage(session, { role: 'assistant', content: 'Hi there!', characterId: 'elda' });
    const out = runParlorPromoteCore({
        session,
        character: { id: 'elda', name: 'Elda', scenario: 'A cozy tavern' },
        options: { campaignTitle: 'Elda Story', includeRecentHistory: true, locale: 'en' },
    });
    const entries = out.gameState.entries;
    if (Array.isArray(entries) && entries.length === 2) { ok('promote maps history'); }
    else { fail(`promote maps history (${entries?.length})`); }
    if (out.gameState.summary && String(out.gameState.summary).includes('Imported from Parlor')) { ok('promote summary'); }
    else { fail('promote summary'); }
    if (out.scenario.meta && out.scenario.meta.title === 'Elda Story') { ok('promote scenario'); }
    else { fail('promote scenario'); }
    if (out.gameRules.enableWorldForge === false && out.gameRules.enableRpgMechanics === false) { ok('safe game rules'); }
    else { fail('safe game rules'); }
}

{
    const rules = buildParlorSafeGameRules({ enableRpgMechanics: true, enableWorldForge: true });
    if (rules.enableRpgMechanics && rules.enableWorldForge && rules.enableCommerce === false) { ok('optional rules'); }
    else { fail('optional rules'); }
}

{
    const minimal = sanitizePromotedGameState({ entries: [{ id: 'ok', role: 'gm', sender: 'GM', content: 'Hi' }] });
    if (minimal.schemaVersion === 2 && Array.isArray(minimal.entries)) { ok('sanitize schemaVersion'); }
    else { fail('sanitize schemaVersion'); }
    if (typeof validateGameState === 'function') {
        const errs = validateGameState(minimal);
        if (errs.length === 0) { ok('validateGameState minimal'); }
        else { fail(`validateGameState minimal (${errs.join('; ')})`); }
    }
}

{
    const entries = mapParlorMessagesToGameEntries([
        { id: 'm1', role: 'user', content: 'A', createdAt: 't' },
        { id: 'm2', role: 'assistant', content: 'B', createdAt: 't' },
    ], 'Elda', 10);
    if (entries[0].role === 'user' && entries[1].role === 'gm') { ok('role mapping'); }
    else { fail('role mapping'); }
}

if (failed > 0) {
    process.exit(1);
}
console.log('All parlor promote core tests passed.');