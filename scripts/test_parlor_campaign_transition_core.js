#!/usr/bin/env node
'use strict';

// PARLOR-CAMPAIGN-CLARITY-001: pure campaign transition + promote path decisions.

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
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parlor-campaign-transition-'));

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

const {
    resolveParlorCampaignTransition,
    decideParlorPromotePath,
} = require(path.join(outDir, 'parlorPromoteCore.js'));

let failed = 0;
function ok(m) { console.log(`OK: ${m}`); }
function fail(m) { console.error(`FAIL: ${m}`); failed++; }

function assertTransition(input, expected, label) {
    const view = resolveParlorCampaignTransition(input);
    for (const [key, value] of Object.entries(expected)) {
        if (view[key] !== value) {
            fail(`${label}: ${key} expected ${value}, got ${view[key]}`);
            return;
        }
    }
    ok(label);
}

function assertPath(input, action, label, extra) {
    const decision = decideParlorPromotePath(input);
    if (decision.action !== action) {
        fail(`${label}: expected ${action}, got ${decision.action}`);
        return;
    }
    if (extra) {
        for (const [key, value] of Object.entries(extra)) {
            if (decision[key] !== value) {
                fail(`${label}: ${key} expected ${value}, got ${decision[key]}`);
                return;
            }
        }
    }
    ok(label);
}

// --- resolveParlorCampaignTransition ---
assertTransition(
    { hasGameState: false, hasFrozenCampaign: false, parlorMessageCount: 3 },
    { hasGameState: false, hasFrozenCampaign: false, parlorMessageCount: 3, canCreateFresh: true, canResumeFrozen: false },
    'no state + non-empty → fresh enabled'
);

assertTransition(
    { hasGameState: false, hasFrozenCampaign: false, parlorMessageCount: 0 },
    { hasGameState: false, hasFrozenCampaign: false, parlorMessageCount: 0, canCreateFresh: false, canResumeFrozen: false },
    'no state + empty → fresh disabled'
);

assertTransition(
    { hasGameState: true, hasFrozenCampaign: true, parlorMessageCount: 0 },
    { hasGameState: true, hasFrozenCampaign: true, parlorMessageCount: 0, canCreateFresh: false, canResumeFrozen: true },
    'frozen + empty → resume only'
);

assertTransition(
    { hasGameState: true, hasFrozenCampaign: true, parlorMessageCount: 5 },
    { hasGameState: true, hasFrozenCampaign: true, parlorMessageCount: 5, canCreateFresh: true, canResumeFrozen: true },
    'frozen + non-empty → resume and fresh'
);

assertTransition(
    { hasGameState: true, hasFrozenCampaign: false, parlorMessageCount: 2 },
    { hasGameState: true, hasFrozenCampaign: false, parlorMessageCount: 2, canCreateFresh: true, canResumeFrozen: false },
    'existing non-frozen + non-empty → fresh enabled'
);

assertTransition(
    { hasGameState: false, hasFrozenCampaign: true, parlorMessageCount: 0 },
    { hasGameState: false, hasFrozenCampaign: false, parlorMessageCount: 0, canCreateFresh: false, canResumeFrozen: false },
    'frozen stamp without game_state is not resumable'
);

// --- decideParlorPromotePath (host ordering) ---
const base = {
    hasWorkspace: true,
    hasCharacter: true,
    hasGameState: true,
    hasFrozenCampaign: true,
    parlorMessageCount: 0,
};

assertPath(
    { ...base, intent: 'auto' },
    'offer_frozen_choice',
    'auto + frozen + empty offers frozen choice (not empty reject)',
    { allowFresh: false }
);

assertPath(
    { ...base, parlorMessageCount: 4, intent: 'auto' },
    'offer_frozen_choice',
    'auto + frozen + messages allows fresh in choice',
    { allowFresh: true }
);

assertPath(
    { ...base, intent: 'resume' },
    'resume',
    'explicit resume ignores empty Parlor session'
);

assertPath(
    { ...base, intent: 'fresh' },
    'reject_empty_session',
    'explicit fresh still rejects empty Parlor'
);

assertPath(
    {
        hasWorkspace: true,
        hasCharacter: true,
        hasGameState: false,
        hasFrozenCampaign: false,
        parlorMessageCount: 0,
        intent: 'auto',
    },
    'reject_empty_session',
    'auto + no frozen + empty rejects'
);

assertPath(
    {
        hasWorkspace: true,
        hasCharacter: true,
        hasGameState: true,
        hasFrozenCampaign: false,
        parlorMessageCount: 2,
        intent: 'fresh',
    },
    'fresh',
    'fresh with messages proceeds (overwrite path remains host-side)'
);

assertPath(
    {
        hasWorkspace: true,
        hasCharacter: true,
        hasGameState: false,
        hasFrozenCampaign: false,
        parlorMessageCount: 0,
        intent: 'resume',
    },
    'reject_no_frozen',
    'resume without frozen is rejected'
);

assertPath(
    {
        hasWorkspace: false,
        hasCharacter: true,
        hasGameState: false,
        hasFrozenCampaign: false,
        parlorMessageCount: 1,
    },
    'reject_no_workspace',
    'workspace required'
);

if (failed > 0) {
    console.error(`parlor campaign transition core: ${failed} failure(s)`);
    process.exit(1);
}
console.log('parlor campaign transition core: all tests passed.');
