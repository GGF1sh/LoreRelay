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
 *   node scripts/run_all_tests.js --simulation
 *   node scripts/run_all_tests.js --list
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SCRIPTS = __dirname;
const DEFAULT_TIMEOUT_MS = 60000;
const { SIMULATION_TEST_FILES } = require('./simulation_test_manifest');
/** Unit scripts owned by run_simulation_tests.js — omit from unit category to avoid double runs. */
const SIMULATION_BATCH_FILES = new Set(SIMULATION_TEST_FILES);

/** @typedef {'validate' | 'unit' | 'smoke' | 'simulation'} TestCategory */

/**
 * Ordered manifest — keep in sync with npm test / CI expectations.
 * validate.js already runs: test_turn_result_pipeline, test_lorebook_python,
 * test_state_patch, test_lorebook (do not list those separately).
 */
const MANIFEST = [
    { category: 'validate', file: 'validate_utf8_docs.js' },
    { category: 'validate', file: 'check_version_consistency.js' },
    { category: 'validate', file: 'check_i18n_keys.js' },
    { category: 'validate', file: 'validate_webview_html_structure.js' },
    { category: 'validate', file: 'validate.js' },
    { category: 'unit', file: 'test_state_manager.js' },
    { category: 'unit', file: 'test_media_paths.js' },
    { category: 'unit', file: 'test_image_gen_circuit_core.js' },
    { category: 'unit', file: 'test_lorebook_save.js' },
    { category: 'unit', file: 'test_lorebook_redos.js' },
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
    { category: 'unit', file: 'test_campaign_kit_core.js' },
    { category: 'unit', file: 'test_mod_system_core.js' },
    { category: 'unit', file: 'test_campaign_resources_core.js' },
    { category: 'unit', file: 'test_settlement_core.js' },
    { category: 'unit', file: 'test_settlement_state_entity_dedupe.js' },
    { category: 'unit', file: 'test_settlement_layout_layer_normalization.js' },
    { category: 'unit', file: 'test_settlement_stock_zero_semantics.js' },
    { category: 'unit', file: 'test_map_overlay_core.js' },
    { category: 'unit', file: 'test_map_overlay_replay_remote.js' },
    { category: 'unit', file: 'test_settlement_event_core.js' },
    { category: 'unit', file: 'test_settlement_view_core.js' },
    { category: 'unit', file: 'test_settlement_m4_cross_ledger_atomicity.js' },
    { category: 'unit', file: 'test_settlement_prompt_bloat_long_session.js' },
    { category: 'unit', file: 'test_settlement_webview_sanitization.js' },
    { category: 'unit', file: 'test_settlement_diorama_core.js' },
    { category: 'unit', file: 'test_settlement_diorama_bridge.js' },
    { category: 'unit', file: 'test_settlement_diorama_revision_z.js' },
    { category: 'unit', file: 'test_map_overlay_context_coherence.js' },
    { category: 'unit', file: 'test_spawn_with_timeout.js', timeoutMs: 15000 },
    { category: 'unit', file: 'test_vehicle_core.js' },
    { category: 'unit', file: 'test_vehicle_state.js' },
    { category: 'unit', file: 'test_vehicle_ops.js' },
    { category: 'unit', file: 'test_world_intent_core.js' },
    { category: 'unit', file: 'test_world_intent_wi2.js' },
    { category: 'unit', file: 'test_world_intent_wi3b.js' },
    { category: 'unit', file: 'test_world_intent_wi4_effect_accounting.js' },
    { category: 'unit', file: 'test_world_intent_wi5_sanity_core.js' },
    { category: 'unit', file: 'test_world_intent_wi5b_sanity_host.js' },
    { category: 'unit', file: 'test_ledger_migration_core.js' },
    { category: 'unit', file: 'test_ledger_migration_host_core.js' },
    { category: 'unit', file: 'test_ledger_migration_writeback_core.js' },
    { category: 'unit', file: 'test_ledger_migration_restore_core.js' },
    { category: 'unit', file: 'test_state_orchestrator_descriptor_core.js' },
    { category: 'unit', file: 'test_state_orchestrator_plan_core.js' },
    { category: 'unit', file: 'test_state_orchestrator_plan_host_core.js' },
    { category: 'unit', file: 'test_vehicle_view_core.js' },
    { category: 'smoke', file: 'test_webview_vehicle_garage.js' },
    { category: 'unit', file: 'test_region_hazard_prompt_core.js' },
    { category: 'unit', file: 'test_vehicle_integration_core.js' },
    { category: 'smoke', file: 'test_webview_vehicle_integration.js' },
    { category: 'unit', file: 'test_mobile_base_core.js' },
    { category: 'unit', file: 'test_mobile_base_bridge.js' },
    { category: 'unit', file: 'test_mobile_base_ops.js' },
    { category: 'unit', file: 'test_mobile_base_move_vehicle_only.js' },
    { category: 'unit', file: 'test_mobile_base_interior_disclosure.js' },
    { category: 'unit', file: 'test_mobile_base_view_core.js' },
    { category: 'smoke', file: 'test_webview_mobile_base_panel.js' },
    { category: 'unit', file: 'test_mobile_base_interior_core.js' },
    { category: 'smoke', file: 'test_webview_mobile_base_interior.js' },
    { category: 'unit', file: 'test_settlement_marker_layer_semantics.js' },
    { category: 'unit', file: 'test_settlement_layer_expansion_core.js' },
    { category: 'unit', file: 'test_settlement_expansion_retry_determinism.js' },
    { category: 'unit', file: 'test_settlement_layout_turn_ops_core.js' },
    { category: 'unit', file: 'test_settlement_layout_turn_ops.js' },
    { category: 'unit', file: 'test_sell_discovery_trade_ops.js' },
    { category: 'unit', file: 'test_turn_artifact_commit_atomicity.js' },
    { category: 'unit', file: 'test_cross_ledger_partial_failure.js' },
    { category: 'unit', file: 'test_turn_ledger_valid_noop.js' },
    { category: 'unit', file: 'test_ledger_sanitization.js' },
    { category: 'unit', file: 'test_campaign_job_board_core.js' },
    { category: 'unit', file: 'test_campaign_job_quest_core.js' },
    { category: 'unit', file: 'test_discovery_appraisal_core.js' },
    { category: 'unit', file: 'test_discovery_ledger_core.js' },
    { category: 'unit', file: 'test_scrapbound_sample_integrity.js' },
    { category: 'unit', file: 'test_discovery_turn_ops_core.js' },
    { category: 'unit', file: 'test_agentic_discovery_ops.js' },
    { category: 'unit', file: 'test_prompt_context_budget.js' },
    { category: 'unit', file: 'test_prompt_budget_eviction.js' },
    { category: 'unit', file: 'test_context_inspector_core.js' },
    { category: 'unit', file: 'test_context_inspector_integration.js' },
    { category: 'unit', file: 'test_prompt_chunk_activation.js' },
    { category: 'unit', file: 'test_webview_handlers_core.js' },
    { category: 'unit', file: 'test_model_scanner.js' },
    { category: 'smoke', file: 'test_webview_bundle.js' },
    { category: 'smoke', file: 'test_webview_world_modules.js' },
    { category: 'smoke', file: 'test_webview_genre_chrome.js' },
    { category: 'unit', file: 'test_world_forge.js' },
    { category: 'unit', file: 'test_game_rules_core.js' },
    { category: 'unit', file: 'test_world_state.js' },
    { category: 'unit', file: 'test_world_state_warning_buffer.js' },

    { category: 'unit', file: 'test_debug_trace_core.js' },
    { category: 'unit', file: 'test_debug_trace_host.js' },
    { category: 'unit', file: 'test_debug_trace_emit_core.js' },
    { category: 'unit', file: 'test_debug_trace_emit_host.js' },
    { category: 'unit', file: 'test_debug_trace_emit_p2.js' },
    { category: 'unit', file: 'test_debug_trace_cross_run_identity.js' },
    { category: 'unit', file: 'test_debug_trace_large_npc_budget.js' },
    { category: 'unit', file: 'test_debug_trace_ring_eviction.js' },
    { category: 'unit', file: 'test_debug_trace_coalesce.js' },
    { category: 'unit', file: 'test_debug_trace_live_run.js' },
    { category: 'unit', file: 'test_narrative_time_passage_core.js' },
    { category: 'unit', file: 'test_chronicle_core.js' },
    { category: 'unit', file: 'test_pacing_core.js' },
    { category: 'unit', file: 'test_faction_reputation_core.js' },
    { category: 'unit', file: 'test_travel_encounter_core.js' },
    { category: 'unit', file: 'test_replay_export_core.js' },
    { category: 'unit', file: 'test_replay_export_gm_timeline.js' },
    { category: 'unit', file: 'test_replay_export_concurrent_mutation.js' },
    { category: 'unit', file: 'test_replay_export_sanitize_core.js' },

    { category: 'unit', file: 'test_living_world_turn_ops.js' },

    { category: 'unit', file: 'test_market_price_multiplier.js' },
    { category: 'unit', file: 'test_faction_market_demand.js' },
    { category: 'unit', file: 'test_living_world_market_debug_core.js' },
    { category: 'unit', file: 'test_living_world_commerce_ui_core.js' },
    { category: 'unit', file: 'test_npc_whereabouts_trust_core.js' },
    { category: 'unit', file: 'test_npc_agency_webview_sanitize.js' },
    { category: 'unit', file: 'test_webview_payload_whitelist.js' },
    { category: 'unit', file: 'test_sync_file_queue_core.js' },
    { category: 'unit', file: 'test_independent_ledger_write_queue.js' },
    { category: 'unit', file: 'test_workspace_state_queue_core.js' },
    { category: 'unit', file: 'test_split_brain_queue_edge_cases.js' },
    { category: 'unit', file: 'test_workspace_write_circuit_breaker.js' },
    { category: 'unit', file: 'test_world_state_quest_accept_observer_race.js' },
    { category: 'unit', file: 'test_commerce_persist_debounce.js' },
    { category: 'unit', file: 'test_state_merge_commerce_race.js' },
    { category: 'unit', file: 'test_state_merge_inventory_race.js' },
    { category: 'unit', file: 'test_commerce_turn_interleave.js' },
    { category: 'unit', file: 'test_commerce_flush_gm_timing.js' },
    { category: 'unit', file: 'test_replay_export_parlor_fields.js' },
    { category: 'unit', file: 'test_world_view_simulation_payload.js' },
    { category: 'unit', file: 'test_living_world_player_role_core.js' },
    { category: 'unit', file: 'test_since_last_visit_host.js' },

    { category: 'unit', file: 'test_npc_relationship_host.js' },
    { category: 'unit', file: 'test_npc_bond_effects_core.js' },
    { category: 'unit', file: 'test_npc_life_events_core.js' },
    { category: 'unit', file: 'test_player_bond_core.js' },
    { category: 'unit', file: 'test_parlor_session_core.js' },
    { category: 'unit', file: 'test_parlor_prompt_builder_core.js' },
    { category: 'unit', file: 'test_in_world_prompt_builder_core.js' },
    { category: 'unit', file: 'test_domain_core.js' },
    { category: 'unit', file: 'test_domain_prompt_core.js' },
    { category: 'unit', file: 'test_domain_turn_ops.js' },
    { category: 'unit', file: 'test_domain_ledger_core.js' },
    { category: 'unit', file: 'test_domain_balance_core.js' },
    { category: 'unit', file: 'test_domain_since_last_visit.js' },
    { category: 'unit', file: 'test_domain_officer_bond_core.js' },
    { category: 'unit', file: 'test_domain_council_core.js' },
    { category: 'unit', file: 'test_domain_audience_core.js' },
    { category: 'unit', file: 'test_rival_lord_core.js' },
    { category: 'unit', file: 'test_domain_mission_core.js' },
    { category: 'unit', file: 'test_mass_battle_core.js' },
    { category: 'unit', file: 'test_domain_turn_merge_conflict.js' },
    { category: 'unit', file: 'test_guild_core.js' },
    { category: 'unit', file: 'test_guild_request_core.js' },
    { category: 'unit', file: 'test_guild_quest_core.js' },
    { category: 'unit', file: 'test_guild_drift_core.js' },
    { category: 'unit', file: 'test_connection_profile_core.js' },
    { category: 'unit', file: 'test_persona_core.js' },
    { category: 'unit', file: 'test_parlor_background_core.js' },
    { category: 'unit', file: 'test_parlor_promote_core.js' },
    { category: 'unit', file: 'test_parlor_archive_core.js' },
    { category: 'unit', file: 'test_parlor_demote_core.js' },
    { category: 'unit', file: 'test_npc_registry.js' },
    { category: 'unit', file: 'test_npc_voice_core.js' },
    { category: 'unit', file: 'test_tts_provider_core.js' },
    { category: 'unit', file: 'test_tts_bridge_core.js' },
    { category: 'unit', file: 'test_world_map_generator.js' },
    { category: 'unit', file: 'test_fog_of_war_core.js' },
    { category: 'unit', file: 'test_cartography_reveal_core.js' },
    { category: 'unit', file: 'test_map_feedback_core.js' },
    { category: 'unit', file: 'test_auto_location_image_core.js' },
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

    { category: 'unit', file: 'test_npc_bridge.js' },
    { category: 'unit', file: 'test_quest_generator.js' },
    { category: 'unit', file: 'test_agentic_gm_core.js' },
    { category: 'unit', file: 'test_visual_memory.js' },
    { category: 'unit', file: 'test_vlm_queue_core.js' },
    { category: 'unit', file: 'test_tavern_card_importer.js' },
    { category: 'unit', file: 'test_protagonist_bootstrap_core.js' },
    { category: 'unit', file: 'test_vscode_lm_turn_result_core.js' },
    { category: 'unit', file: 'test_world_observatory_core.js' },
    { category: 'unit', file: 'test_observer_tick_side_effect_contract.js' },
    {
        category: 'simulation',
        file: 'run_simulation_tests.js',
        timeoutMs: 180000,
        description: 'deterministic world-engine regression batch (simulation_test_manifest.js)',
    },
];

for (const entry of MANIFEST) {
    if (entry.category === 'unit' && SIMULATION_BATCH_FILES.has(entry.file)) {
        throw new Error(`unit manifest must not list simulation-batch script: ${entry.file}`);
    }
}

function parseMode(argv) {
    if (argv.includes('--list')) { return 'list'; }
    if (argv.includes('--validate')) { return 'validate'; }
    if (argv.includes('--unit')) { return 'unit'; }
    if (argv.includes('--smoke')) { return 'smoke'; }
    if (argv.includes('--simulation')) { return 'simulation'; }
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
    const counts = { validate: 0, unit: 0, smoke: 0, simulation: 0 };
    for (const e of MANIFEST) { counts[e.category]++; }
    console.log('LoreRelay test manifest\n');
    for (const cat of ['validate', 'unit', 'smoke', 'simulation']) {
        console.log(`## ${cat} (${counts[cat]})`);
        for (const e of MANIFEST.filter((x) => x.category === cat)) {
            const runner = e.runner === 'python' ? 'python' : 'node';
            const timeout = e.timeoutMs ? ` timeout=${e.timeoutMs}ms` : '';
            const note = e.description ? ` — ${e.description}` : '';
            console.log(`  - [${runner}] ${e.file}${timeout}${note}`);
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
    const label = mode === 'all'
        ? 'all (validate + unit + smoke + simulation)'
        : mode;

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
