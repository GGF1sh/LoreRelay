#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'campaignCombatSoakCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }
function check(name, fn) {
    try { fn(); ok(name); }
    catch (err) { fail(`${name}: ${err.message}`); }
}

if (!fs.existsSync(corePath)) {
    fail('out/campaignCombatSoakCore.js missing — run npm run compile');
    process.exit(1);
}

const core = require(corePath);

function baseScenario(overrides = {}) {
    return {
        id: 'ccs_unit',
        version: 1,
        description: 'unit',
        mode: 'quick',
        battles: [{
            id: 'b1',
            fixtureId: 'armor_vs_normal',
            seed: 'unit-seed',
            protagonistEntityId: 'hero',
            partyEntityIds: ['hero'],
            startingHp: 20,
            maxHp: 20,
            sourceCampaignRevision: 0,
        }],
        limits: { timeoutMs: 30000, maxTicks: 3600, stepBatch: 120 },
        invariants: ['terminal_reached', 'hp_in_range'],
        ...overrides,
    };
}

function obs(overrides = {}) {
    return {
        battleId: 'b1',
        fixtureId: 'armor_vs_normal',
        seed: 's',
        lifecycle: 'receipt_pending',
        outcome: 'ALLY_WIN',
        ticksAdvanced: 40,
        commandEventCount: 0,
        pendingBeforeApply: 1,
        appliedOkCount: 1,
        applyStatuses: ['applied'],
        reloadApplyStatuses: ['already_applied'],
        historyLength: 1,
        distinctReceiptHashes: 1,
        hpBefore: 20,
        hpAfter: 11,
        hpMax: 20,
        consequenceFirstAck: 'applied',
        consequenceRepeatAck: 'alreadySatisfied',
        terminalReached: true,
        ...overrides,
    };
}

check('parser accepts a valid spectator soak scenario', () => {
    const parsed = core.parseCampaignCombatSoakScenario(baseScenario());
    assert.ok(parsed.ok, JSON.stringify(parsed.errors));
});
check('parser rejects a forbidden command key', () => {
    const parsed = core.parseCampaignCombatSoakScenario(baseScenario({ command: 'rm -rf /' }));
    assert.ok(!parsed.ok);
});
check('parser rejects an unknown fixture', () => {
    const parsed = core.parseCampaignCombatSoakScenario(baseScenario({
        battles: [{ id: 'b1', fixtureId: 'mixed_arms_showcase', seed: 'x' }],
    }));
    assert.ok(!parsed.ok && parsed.errors.some((e) => e.includes('fixtureId')));
});
check('all invariants pass on a healthy observation', () => {
    const results = core.evaluateCcsInvariants(core.CCS_INVARIANTS, obs());
    assert.ok(results.every((r) => r.ok), JSON.stringify(results.filter((r) => !r.ok)));
});
check('hp_in_range fails when HP is negative', () => {
    const results = core.evaluateCcsInvariants(['hp_in_range'], obs({ hpAfter: -1 }));
    assert.ok(!results[0].ok);
});
check('reload_no_double_apply fails on a second applied status', () => {
    const results = core.evaluateCcsInvariants(['reload_no_double_apply'], obs({ reloadApplyStatuses: ['applied'] }));
    assert.ok(!results[0].ok);
});
check('spectator_no_commands fails when the soak issued orders', () => {
    const results = core.evaluateCcsInvariants(['spectator_no_commands'], obs({ commandEventCount: 2 }));
    assert.ok(!results[0].ok);
});

const shipped = path.join(root, 'scripts', 'campaign_combat_soak_scenarios', 'ccs_quick_story_spectator.json');
check('shipped quick scenario parses', () => {
    const parsed = core.parseCampaignCombatSoakScenario(JSON.parse(fs.readFileSync(shipped, 'utf-8')));
    assert.ok(parsed.ok, JSON.stringify(parsed.errors));
    assert.strictEqual(parsed.scenario.battles.length, 3);
});

check('host soak of armor_vs_normal covers the story-combat vertical', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-unit-'));
    try {
        const scenario = baseScenario({
            id: 'ccs_unit_host',
            invariants: [...core.CCS_INVARIANTS],
        });
        fs.writeFileSync(path.join(dir, 'ccs_unit_host.json'), JSON.stringify(scenario));
        const res = spawnSync(process.execPath, [
            path.join(root, 'scripts', 'run_campaign_combat_soak.js'),
            '--scenario', 'ccs_unit_host',
            '--keep-temp',
        ], {
            cwd: root,
            env: { ...process.env, CCS_SOAK_SCENARIO_DIR: dir },
            encoding: 'utf-8',
            timeout: 60000,
        });
        assert.strictEqual(res.status, 0, `host soak failed:\n${res.stdout}\n${res.stderr}`);
        assert.match(res.stdout, /PASS ccs_unit_host/);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
        fs.rmSync(path.join(root, '.tmp', 'campaign_combat_soak', 'ccs_unit_host'), { recursive: true, force: true });
    }
});

if (failed) {
    console.error(`\n${failed} campaign combat soak core test(s) failed`);
    process.exit(1);
}
console.log('\nAll campaign combat soak core tests passed');
