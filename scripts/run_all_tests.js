#!/usr/bin/env node
'use strict';

/**
 * Unified test runner for LoreRelay.
 *
 * Usage:
 *   node scripts/run_all_tests.js           # full suite (same as npm test)
 *   node scripts/run_all_tests.js --validate
 *   node scripts/run_all_tests.js --unit
 *   node scripts/run_all_tests.js --smoke
 *   node scripts/run_all_tests.js --list
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SCRIPTS = __dirname;
const DEFAULT_TIMEOUT_MS = 60000;

/** @typedef {'validate' | 'unit' | 'smoke'} TestCategory */

/**
 * Ordered manifest — keep in sync with npm test / CI expectations.
 * validate.js already runs: test_turn_result_pipeline, test_lorebook_python,
 * test_state_patch, test_lorebook (do not list those separately).
 */
const MANIFEST = [
    { category: 'validate', file: 'validate_utf8_docs.js' },
    { category: 'validate', file: 'check_i18n_keys.js' },
    { category: 'validate', file: 'validate_webview_html_structure.js' },
    { category: 'validate', file: 'validate.js' },
    { category: 'unit', file: 'test_state_manager.js' },
    { category: 'unit', file: 'test_media_paths.js' },
    { category: 'unit', file: 'test_lorebook_save.js' },
    { category: 'unit', file: 'test_scenario_director.js' },
    { category: 'unit', file: 'test_party_director.js' },
    { category: 'smoke', file: 'test_sample_scenarios.js' },
    { category: 'unit', file: 'test_scenario_pack_core.js' },
    { category: 'unit', file: 'test_memory_bank.js' },
    { category: 'unit', file: 'test_migrate_game_state.js' },
    { category: 'unit', file: 'test_remote_media_signature_core.js' },
    { category: 'smoke', file: 'test_remote_play_server.js', timeoutMs: 90000 },
    { category: 'smoke', file: 'test_ws_functionality.js', timeoutMs: 90000 },
    { category: 'unit', file: 'test_validate_game_state.js' },
    { category: 'unit', file: 'test_game_state_sanitize.js' },
    { category: 'unit', file: 'test_dice_roller.js' },
    { category: 'unit', file: 'test_gm_prompt_builder_core.js' },
    { category: 'unit', file: 'test_prompt_context_budget.js' },
    { category: 'unit', file: 'test_webview_handlers_core.js' },
    { category: 'unit', file: 'test_model_scanner.js' },
    { category: 'smoke', file: 'test_webview_bundle.js' },
    { category: 'smoke', file: 'test_webview_world_modules.js' },
    { category: 'unit', file: 'test_world_forge.js' },
    { category: 'unit', file: 'test_world_state.js' },
    { category: 'unit', file: 'test_emergent_simulator.js' },
    { category: 'unit', file: 'test_npc_registry.js' },
    { category: 'unit', file: 'test_npc_voice_core.js' },
    { category: 'unit', file: 'test_tts_provider_core.js' },
    { category: 'unit', file: 'test_tts_bridge_core.js' },
    { category: 'unit', file: 'test_world_map_generator.js' },
    { category: 'unit', file: 'test_cartography_layout_core.js' },
    { category: 'unit', file: 'test_cartography_path_core.js' },
    { category: 'unit', file: 'test_cartography_path_utils.js' },
    { category: 'smoke', file: 'test_cartography_layout_smoke.js' },
    { category: 'unit', file: 'test_tile_overmap_core.js' },
    { category: 'unit', file: 'test_comfyui_cartography_lora.py', runner: 'python' },
    { category: 'unit', file: 'test_cartography_theme_styles_sync.py', runner: 'python' },
    { category: 'unit', file: 'test_cartography_empty_regions.py', runner: 'python' },
    { category: 'validate', file: 'validate_cartography_workflow.js' },
    { category: 'validate', file: 'validate_cartography_workflow_direct.js' },
    { category: 'unit', file: 'test_world_forge_generator.js' },
    { category: 'unit', file: 'test_location_image_builder.js' },
    { category: 'unit', file: 'test_world_event_log.js' },
    { category: 'unit', file: 'test_npc_bridge.js' },
    { category: 'unit', file: 'test_quest_generator.js' },
    { category: 'unit', file: 'test_agentic_gm_core.js' },
    { category: 'unit', file: 'test_visual_memory.js' },
    { category: 'unit', file: 'test_vlm_queue_core.js' },
    { category: 'unit', file: 'test_tavern_card_importer.js' },
    { category: 'unit', file: 'test_protagonist_bootstrap_core.js' },
];

function parseMode(argv) {
    if (argv.includes('--list')) { return 'list'; }
    if (argv.includes('--validate')) { return 'validate'; }
    if (argv.includes('--unit')) { return 'unit'; }
    if (argv.includes('--smoke')) { return 'smoke'; }
    return 'all';
}

function resolvePythonCommand() {
    for (const cmd of ['python', 'python3']) {
        const probe = spawnSync(cmd, ['--version'], { encoding: 'utf-8' });
        if (probe.status === 0) { return cmd; }
    }
    return 'python';
}

const PYTHON_CMD = resolvePythonCommand();

function resolveRunner(entry) {
    if (entry.runner === 'python') {
        return PYTHON_CMD;
    }
    return process.execPath;
}

function runEntry(entry) {
    const scriptPath = path.join(SCRIPTS, entry.file);
    if (!fs.existsSync(scriptPath)) {
        return { ok: false, ms: 0, error: `missing: ${entry.file}` };
    }

    const runner = resolveRunner(entry);
    const args = entry.runner === 'python' ? [scriptPath] : [scriptPath];
    const timeoutMs = Number.isFinite(entry.timeoutMs)
        ? Math.max(1000, Math.floor(entry.timeoutMs))
        : DEFAULT_TIMEOUT_MS;
    const started = Date.now();
    const result = spawnSync(runner, args, {
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

function filterManifest(mode) {
    if (mode === 'all') { return MANIFEST; }
    return MANIFEST.filter((e) => e.category === mode);
}

function printList() {
    const counts = { validate: 0, unit: 0, smoke: 0 };
    for (const e of MANIFEST) { counts[e.category]++; }
    console.log('LoreRelay test manifest\n');
    for (const cat of ['validate', 'unit', 'smoke']) {
        console.log(`## ${cat} (${counts[cat]})`);
        for (const e of MANIFEST.filter((x) => x.category === cat)) {
            const runner = e.runner === 'python' ? 'python' : 'node';
            const timeout = e.timeoutMs ? ` timeout=${e.timeoutMs}ms` : '';
            console.log(`  - [${runner}] ${e.file}${timeout}`);
        }
        console.log('');
    }
    console.log(`Total entries: ${MANIFEST.length} (+ nested tests inside validate.js)`);
}

function main() {
    const mode = parseMode(process.argv.slice(2));
    if (mode === 'list') {
        printList();
        return;
    }

    const suite = filterManifest(mode);
    const label = mode === 'all' ? 'all (validate + unit + smoke)' : mode;

    console.log('=== LoreRelay Test Runner ===');
    console.log(`Mode: ${label}`);
    console.log(`Scripts: ${suite.length}`);
    console.log('');

    const results = [];
    for (const entry of suite) {
        const tag = `[${entry.category}]`;
        console.log(`\n--- ${tag} ${entry.file} ---`);
        const outcome = runEntry(entry);
        if (outcome.ok) {
            console.log(`=> PASS (${outcome.ms}ms)`);
            results.push({ entry, ok: true, ms: outcome.ms });
        } else {
            console.log(`=> FAIL (${outcome.ms}ms) — ${outcome.error}`);
            results.push({ entry, ok: false, ms: outcome.ms, error: outcome.error });
        }
    }

    const passed = results.filter((r) => r.ok).length;
    const failed = results.length - passed;
    const totalMs = results.reduce((s, r) => s + r.ms, 0);

    console.log('');
    console.log('=== Summary ===');
    console.log(`Passed: ${passed}/${results.length}`);
    if (failed > 0) {
        console.log('Failed:');
        for (const r of results.filter((x) => !x.ok)) {
            console.log(`  - [${r.entry.category}] ${r.entry.file}: ${r.error}`);
        }
    }
    console.log(`Duration: ${(totalMs / 1000).toFixed(1)}s`);

    if (failed > 0) {
        process.exit(1);
    }
}

main();
