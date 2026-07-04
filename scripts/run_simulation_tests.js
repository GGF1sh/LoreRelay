#!/usr/bin/env node
'use strict';

/**
 * LoreRelay game-engine simulation regression batch.
 *
 * This runner intentionally reuses existing deterministic tests instead of
 * creating a second test framework. It is the first slice of
 * docs/DEBUG_SIMULATION_TEST_ARCHITECTURE.md.
 *
 * Usage:
 *   node scripts/run_simulation_tests.js
 *   node scripts/run_simulation_tests.js --list
 *
 * Requires compiled output where the selected tests already require it:
 *   npm run compile
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SCRIPTS = __dirname;
const DEFAULT_TIMEOUT_MS = 90000;

/**
 * Keep this list focused on deterministic world-engine behavior.
 *
 * Do not put long soak/scale tests here. A future opt-in soak runner should
 * have separate limits and scheduling.
 */
const MANIFEST = [
    { file: 'test_world_event_log.js' },
    { file: 'test_emergent_simulator.js' },
    { file: 'test_world_sim_bulk_core.js' },
    { file: 'test_world_sim_bulk_event_loop_yield.js' },
    { file: 'test_debug_scenario_core.js' },
    { file: 'test_living_world_bridge.js' },
    { file: 'test_world_sim_living_world.js' },
    { file: 'test_npc_agency_step_events.js' },
    { file: 'test_npc_relationship_core.js', timeoutMs: 120000 },
];

function printList() {
    console.log('LoreRelay simulation regression batch\n');
    for (const entry of MANIFEST) {
        const timeout = entry.timeoutMs ? ` timeout=${entry.timeoutMs}ms` : '';
        console.log(`  - ${entry.file}${timeout}`);
    }
    console.log(`\nTotal entries: ${MANIFEST.length}`);
}

function runEntry(entry) {
    const scriptPath = path.join(SCRIPTS, entry.file);
    if (!fs.existsSync(scriptPath)) {
        return { ok: false, ms: 0, error: `missing: ${entry.file}` };
    }

    const timeoutMs = Number.isFinite(entry.timeoutMs)
        ? Math.max(1000, Math.floor(entry.timeoutMs))
        : DEFAULT_TIMEOUT_MS;

    const started = Date.now();
    const result = spawnSync(process.execPath, [scriptPath], {
        cwd: ROOT,
        stdio: 'inherit',
        env: process.env,
        timeout: timeoutMs,
    });
    const ms = Date.now() - started;

    if (result.error) {
        if (result.error.code === 'ETIMEDOUT') {
            return { ok: false, ms, error: `timeout after ${timeoutMs}ms` };
        }
        return { ok: false, ms, error: result.error.message };
    }

    const code = result.status ?? 1;
    if (code !== 0) {
        return { ok: false, ms, error: `exit ${code}` };
    }

    return { ok: true, ms };
}

function main() {
    if (process.argv.includes('--list')) {
        printList();
        return;
    }

    console.log('=== LoreRelay Simulation Regression Batch ===');
    console.log(`Scripts: ${MANIFEST.length}`);
    console.log('Scope: deterministic world-engine behavior (not soak/scale)');

    const results = [];
    for (const entry of MANIFEST) {
        console.log(`\n--- [simulation] ${entry.file} ---`);
        const outcome = runEntry(entry);
        if (outcome.ok) {
            console.log(`=> PASS (${outcome.ms}ms)`);
        } else {
            console.log(`=> FAIL (${outcome.ms}ms) — ${outcome.error}`);
        }
        results.push({ entry, ...outcome });
    }

    const passed = results.filter((r) => r.ok).length;
    const failed = results.length - passed;
    const totalMs = results.reduce((sum, r) => sum + r.ms, 0);

    console.log('\n=== Simulation Summary ===');
    console.log(`Passed: ${passed}/${results.length}`);
    if (failed > 0) {
        console.log('Failed:');
        for (const result of results.filter((r) => !r.ok)) {
            console.log(`  - ${result.entry.file}: ${result.error}`);
        }
    }
    console.log(`Duration: ${(totalMs / 1000).toFixed(1)}s`);

    if (failed > 0) {
        process.exit(1);
    }
}

main();
